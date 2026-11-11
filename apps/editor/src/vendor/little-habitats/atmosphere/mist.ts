// Ports index-BwioI7A7.js lines 16418-16536: low mist rings over the water, streaked along the wind.
import * as THREE from 'three';
import { UNIFORMS } from '../fx/pokefx';

export const MIST_VERTEX = `
#include <common>
#include <fog_pars_vertex>
attribute float aLayer;
varying vec3 vWorld;
varying float vLayer;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vLayer = aLayer;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`; // ns (16418)

export const MIST_FRAGMENT = `
#include <common>
#include <fog_pars_fragment>
uniform float uAmount;
uniform vec3 uColor;
uniform vec3 uGlow;
uniform vec3 uSunDir;
uniform vec2 uDrift;
uniform vec2 uWindDir;
uniform float uTime;
varying vec3 vWorld;
varying float vLayer;
float mh(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float mn(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(mh(i), mh(i + vec2(1.0, 0.0)), u.x), mix(mh(i + vec2(0.0, 1.0)), mh(i + vec2(1.0, 1.0)), u.x), u.y);
}
void main() {
  float sc = 0.06 + vLayer * 0.03;
  // stretch the noise along the wind so the mist lies in soft streaks
  vec2 wd = normalize(uWindDir + vec2(1e-4));
  vec2 q = vec2(dot(vWorld.xz, wd) * 0.45, dot(vWorld.xz, vec2(-wd.y, wd.x)) * 1.25);
  vec2 dq = vec2(dot(uDrift, wd), dot(uDrift, vec2(-wd.y, wd.x)));
  vec2 p = (q - dq * (0.9 + vLayer * 0.4)) * sc + vec2(vLayer * 17.3, uTime * 0.004);
  float n = mn(p) * 0.55 + mn(p * 2.1 + 3.7) * 0.3 + mn(p * 4.3 - 1.1) * 0.15;
  float r = length(vWorld.xz);
  float a = smoothstep(0.42, 0.8, n) * smoothstep(7.0, 17.0, r) * (1.0 - smoothstep(60.0, 90.0, r));
  a *= uAmount * (1.0 - vLayer * 0.35);
  if (a < 0.003) discard;
  // forward scattering: glows where it sits between the eye and a low sun
  vec3 view = normalize(vWorld - cameraPosition);
  float fs = pow(max(dot(view, normalize(vec3(uSunDir.x, max(uSunDir.y, 0.0) * 0.4, uSunDir.z))), 0.0), 6.0);
  vec3 col = uColor + uGlow * fs * 0.8;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`; // rs (16432)

export function createMist() { // is (16470)
  const layerHeights = [0.16, 0.5];
  const positions: number[] = [];
  const layers: number[] = [];
  const index: number[] = [];
  const radii = [6, 14, 24, 40, 64, 95];
  let base = 0;
  layerHeights.forEach((height, layer) => {
    for (let ring = 0; ring < radii.length; ring++)
      for (let seg = 0; seg < 72; seg++) {
        const a = (seg / 72) * Math.PI * 2;
        positions.push(Math.cos(a) * radii[ring], height, Math.sin(a) * radii[ring]);
        layers.push(layer);
      }
    for (let ring = 0; ring < radii.length - 1; ring++)
      for (let seg = 0; seg < 72; seg++) {
        const i0 = base + ring * 72 + seg;
        const i1 = base + ring * 72 + ((seg + 1) % 72);
        const i2 = i0 + 72;
        const i3 = i1 + 72;
        index.push(i0, i2, i1, i1, i2, i3);
      }
    base += radii.length * 72;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aLayer', new THREE.Float32BufferAttribute(layers, 1));
  geometry.setIndex(index);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uAmount: { value: 0 },
    uColor: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uDrift: { value: new THREE.Vector2() },
    uTime: { value: 0 },
    uWindDir: UNIFORMS.uWindDir, // shared uniform object, not a copy
  };
  const material = new THREE.ShaderMaterial({
    name: 'ScaperMist',
    uniforms,
    vertexShader: MIST_VERTEX,
    fragmentShader: MIST_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'mist';
  mesh.renderOrder = 5;
  mesh.frustumCulled = false;
  return {
    mesh,
    update(amount: number, color: THREE.Color, glow: THREE.Color, sunDir: THREE.Vector3, drift: THREE.Vector2, time: number) {
      uniforms.uAmount.value = amount;
      mesh.visible = amount > 0.02;
      uniforms.uColor.value.copy(color);
      uniforms.uGlow.value.copy(glow);
      uniforms.uSunDir.value.copy(sunDir);
      uniforms.uDrift.value.copy(drift);
      uniforms.uTime.value = time % 1e4;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
export type Mist = ReturnType<typeof createMist>;
