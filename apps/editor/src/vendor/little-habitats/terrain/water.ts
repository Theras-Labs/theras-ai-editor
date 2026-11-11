// Island kit terrain: water surface (shore foam, ponds, ice, glitter) and lake bed (bundle 18777-19083).
import * as THREE from 'three';
import { CONFIG } from '../core/config';
import { PALETTE } from '../core/palette';
import { UNIFORMS, patchWorldMaterial } from '../fx/pokefx';
import type { ShoreField } from './shoreField';

/** GLSL: sample and decode the ShoreField texture (needs uShore, uShoreXf). */
const SHORE_GLSL = `
  vec4 shoreSample(vec2 p) {
    vec2 uv = (p - uShoreXf.xy) * uShoreXf.zw;
    return texture2D(uShore, clamp(uv, vec2(0.0), vec2(1.0)));
  }
  float shoreDecode(vec4 s, vec2 p) {
    vec2 uv = (p - uShoreXf.xy) * uShoreXf.zw;
    float outside = max(max(-uv.x, uv.x - 1.0), max(-uv.y, uv.y - 1.0));
    float dFine = s.g * 2.0 - 0.5;
    float dCoarse = s.r * 9.0 - 1.0;
    float d = dCoarse < 1.3 ? dFine : dCoarse;
    return d + max(outside, 0.0) / uShoreXf.z;
  }
`; // pc (18777)

const colorUniform = (color: THREE.ColorRepresentation) => ({ value: new THREE.Color(color) }); // mc (18791)

/** GLSL: value noise for the water surface. */
const WATER_NOISE_GLSL = `
  float w_hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float w_noise(vec2 p) {
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(w_hash(i), w_hash(i + vec2(1.0, 0.0)), u.x), mix(w_hash(i + vec2(0.0, 1.0)), w_hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
`; // hc (18792)

export interface WaterSet {
  water: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  bed: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  /** Copies the fog (or background) color into the water's sky reflection color. */
  update(scene: THREE.Scene): void;
}

export function createWater(shore: ShoreField): WaterSet { // gc (18800)
  const sky = new THREE.Color(`#cfe8ef`),
    uniforms = {
      uTime: UNIFORMS.uTime,
      uSunDir: UNIFORMS.uSunDir,
      uDaylight: UNIFORMS.uDaylight,
      uSnow: UNIFORMS.uSnow,
      uWindDir: UNIFORMS.uWindDir,
      uShore: { value: shore.texture },
      uShoreXf: { value: shore.xf },
      uShallow: colorUniform(`#62d0c6`),
      uMid: colorUniform(`#45b8bd`),
      uDeep: colorUniform(PALETTE.waterDeep),
      uDeepFar: colorUniform(`#3a86a0`),
      uFoam: colorUniform(PALETTE.waterFoam),
      uIce: colorUniform(PALETTE.ice),
      uSand: colorUniform(PALETTE.sand),
      uSky: { value: sky },
    },
    material = new THREE.MeshStandardMaterial({ color: `#ffffff`, roughness: 0.18, metalness: 0, transparent: true, depthWrite: false });
  material.name = `terrain-water`;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        `#include <common>`,
        `#include <common>
varying vec3 vWPos;`,
      )
      .replace(
        `#include <project_vertex>`,
        `#include <project_vertex>
vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        `#include <common>`,
        `#include <common>
        varying vec3 vWPos;
        uniform float uTime; uniform vec3 uSunDir; uniform float uDaylight; uniform float uSnow; uniform vec2 uWindDir;
        uniform sampler2D uShore; uniform vec4 uShoreXf;
        uniform vec3 uShallow; uniform vec3 uMid; uniform vec3 uDeep; uniform vec3 uDeepFar; uniform vec3 uFoam; uniform vec3 uIce; uniform vec3 uSand; uniform vec3 uSky;
        ${WATER_NOISE_GLSL}
        ${SHORE_GLSL}
        float waveH(vec2 p, float t) {
          return w_noise(p * 0.9 + vec2(t * 0.21, t * 0.13)) * 0.5
               + w_noise(p * 1.9 + vec2(-t * 0.17, t * 0.27)) * 0.3
               + w_noise(p * 4.3 + vec2(t * 0.36, -t * 0.29)) * 0.2;
        }
        vec3 wN; vec3 wCol; float wFoam; float wD; float wFar; float wPond; float wIce;
        // x = distance to cell border (≈ F2 - F1), y = cell id
        vec2 w_vor(vec2 p) {
          vec2 i = floor(p); vec2 f = fract(p);
          float d1 = 8.0; float d2 = 8.0; float id = 0.0;
          for (int y = -1; y <= 1; y++) {
            for (int x = -1; x <= 1; x++) {
              vec2 g = vec2(float(x), float(y));
              vec2 o = vec2(w_hash(i + g), w_hash(i + g + 19.1)) * 0.8 + 0.1;
              vec2 r = g + o - f;
              float dd = dot(r, r);
              if (dd < d1) { d2 = d1; d1 = dd; id = w_hash(i + g + 3.3); } else if (dd < d2) { d2 = dd; }
            }
          }
          return vec2(sqrt(d2) - sqrt(d1), id);
        }
        `,
      )
      .replace(
        `#include <color_fragment>`,
        `#include <color_fragment>
        {
          vec2 p = vWPos.xz;
          float t = uTime;
          vec4 ss = shoreSample(p);
          wIce = 0.0;
          float d = shoreDecode(ss, p);
          wD = d;
          wPond = ss.b;
          // ponds are small: let them read deeper (darker, richer) much sooner than the open lake
          float dd = d * (1.0 + 1.8 * wPond);
          float r = length(p);
          wFar = smoothstep(22.0, 70.0, r);
          float calm = 1.0 - 0.8 * uSnow;

          // wave normal (finite differences of layered noise), fades with distance to keep the horizon clean
          float e = 0.06;
          float h0 = waveH(p, t);
          float hx = waveH(p + vec2(e, 0.0), t);
          float hz = waveH(p + vec2(0.0, e), t);
          float amp = 0.55 * calm * (1.0 - 0.7 * wFar);
          wN = normalize(vec3(-(hx - h0) / e * amp * 0.12, 1.0, -(hz - h0) / e * amp * 0.12));

          // depth tint
          float dk = smoothstep(0.0, 3.2, d);
          vec3 c = mix(uShallow, uMid, smoothstep(0.05, 1.2, dd));
          c = mix(c, uDeep, smoothstep(1.0, 5.0, dd));
          wCol = c;
          c = mix(c, uDeepFar, wFar);
          c *= 0.95 + 0.1 * w_noise(p * 0.12 + t * 0.015);
          // ponds: a touch greener and clearer
          c = mix(c, c * vec3(0.9, 1.02, 0.94), wPond * 0.7);
          // night: deeper and less saturated, otherwise the cool moonlight turns the teal electric blue
          float wLum = dot(c, vec3(0.299, 0.587, 0.114));
          c = mix(c, mix(vec3(wLum), c, 0.5) * vec3(0.72, 0.86, 0.9), (1.0 - uDaylight) * 0.75);
          // winter: pale icy tint everywhere, ponds freeze over, an ice shelf hugs the shores
          c = mix(c, mix(uIce, uDeep, 0.25), uSnow * 0.55);
          float iceZone = max(wPond * smoothstep(-0.2, 0.05, d), (1.0 - smoothstep(0.35, 1.5, d + (w_noise(p * 0.9) - 0.5) * 0.9)) * smoothstep(-0.2, 0.05, d));
          wIce = smoothstep(0.35, 0.9, uSnow) * iceZone;
          if (wIce > 0.001) {
            vec2 vc = w_vor(p * 1.7);
            float crack = 1.0 - smoothstep(0.0, 0.045, vc.x);
            vec3 iceCol = mix(uIce, vec3(0.86, 0.93, 0.97), vc.y * 0.5);
            iceCol = mix(iceCol, uDeep * 1.1, crack * 0.35);
            iceCol = mix(iceCol, vec3(0.97, 0.98, 1.0), smoothstep(0.55, 0.9, w_noise(p * 3.0)) * 0.4);
            c = mix(c, iceCol, wIce);
            wN = normalize(mix(wN, vec3(0.0, 1.0, 0.0), wIce));
          }

          // foam: contact rim + rings drifting away from the shore
          float wob = w_noise(p * 2.7 + t * 0.35) - 0.5;
          float wob2 = w_noise(p * 7.0 - t * 0.5) - 0.5;
          float rimW = 0.085 + 0.03 * wob + 0.07 * uSnow;
          float contact = (1.0 - smoothstep(rimW * 0.55, rimW, d + wob2 * 0.025)) * smoothstep(-0.3, -0.12, d);
          float ph = d * 3.4 - t * 0.32 * calm + wob * 0.5;
          float band = fract(ph);
          float ring = smoothstep(0.0, 0.08, band) * (1.0 - smoothstep(0.1, 0.24, band));
          ring *= (1.0 - smoothstep(0.1, 0.62, d)) * smoothstep(0.03, 0.12, d);
          ring *= smoothstep(0.35, 0.6, w_noise(p * 1.6 + vec2(t * 0.05, 0.0)) + 0.25);
          float foam = max(contact, ring * 0.75 * calm);
          // frosty edges in winter
          foam = max(foam, uSnow * (1.0 - smoothstep(0.05, 0.35 + 0.1 * wob, d)) * smoothstep(-0.3, -0.12, d) * 0.8);
          wFoam = foam;

          float alpha = mix(0.6, 0.94, smoothstep(0.0, 2.2, dd));
          alpha = min(alpha, mix(1.0, 0.8, wPond)); // keep koi visible
          alpha = mix(alpha, 1.0, smoothstep(0.35, 1.0, wFar));
          alpha = mix(alpha, min(1.0, alpha + 0.2), uSnow);
          alpha = mix(alpha, 0.9, wIce);
          diffuseColor.rgb = mix(c, uFoam, foam);
          diffuseColor.a = max(alpha, foam * 0.95);
        }
        `,
      )
      .replace(
        `#include <normal_fragment_maps>`,
        `#include <normal_fragment_maps>
        normal = normalize((viewMatrix * vec4(wN, 0.0)).xyz);
        `,
      )
      .replace(
        `#include <emissivemap_fragment>`,
        `#include <emissivemap_fragment>
        totalEmissiveRadiance += uFoam * wFoam * mix(0.18, 0.06, uDaylight);
        // a little inner glow so the lagoon stays luminous in shade
        totalEmissiveRadiance += wCol * (1.0 - wFoam) * (1.0 - wFar) * 0.12 * (0.4 + 0.6 * uDaylight);
        `,
      )
      .replace(
        `#include <opaque_fragment>`,
        `
        {
          vec3 V = normalize(cameraPosition - vWPos);
          float nv = clamp(dot(wN, V), 0.0, 1.0);
          float fres = pow(1.0 - nv, 4.0);
          vec3 sky = uSky;
          outgoingLight = mix(outgoingLight, sky * mix(0.55, 0.9, uDaylight), fres * 0.55 * (1.0 - wFoam));
          // sun glitter
          vec3 Rf = reflect(-V, wN);
          float sd = max(dot(Rf, normalize(uSunDir)), 0.0);
          float sparkle = step(0.72, w_noise(vWPos.xz * 7.0 + vec2(uTime * 0.9, -uTime * 0.6)));
          float glint = pow(sd, 900.0) * sparkle * 18.0 + pow(sd, 90.0) * 0.18;
          glint *= (1.0 - wFoam) * (1.0 - 0.7 * uSnow) * smoothstep(0.0, 0.25, uSunDir.y);
          outgoingLight += vec3(1.0, 0.95, 0.85) * glint * mix(0.25, 1.0, uDaylight);
        }
        #include <opaque_fragment>`,
      );
  };
  material.customProgramCacheKey = () => `scaper-water-v1`;
  const water = new THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>(
    new THREE.CircleGeometry(400, 128).rotateX(-Math.PI / 2),
    material,
  );
  water.name = `water`;
  water.position.y = CONFIG.WATER_Y;
  water.receiveShadow = true;
  water.renderOrder = 1;
  const bedMaterial = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0, flatShading: true });
  bedMaterial.name = `terrain-bed`;
  patchWorldMaterial(bedMaterial, {
    uniforms: {
      uShore: { value: shore.texture },
      uShoreXf: { value: shore.xf },
      uSand: colorUniform(PALETTE.sand),
      uPebble: colorUniform(PALETTE.pebble),
      uBedDeep: colorUniform(`#4f9c9c`),
      uBedMid: colorUniform(`#86bfa9`),
    },
    vertexHeader: `
      uniform sampler2D uShore; uniform vec4 uShoreXf;
      varying float vBedD;
      ${SHORE_GLSL}
    `,
    vertex: `
      {
        vec2 bp = transformed.xz;
        vec4 bs = shoreSample(bp);
        float bd = shoreDecode(bs, bp) * (1.0 + 1.8 * bs.b);
        vBedD = bd;
        float by = mix(-0.34, ${CONFIG.LAKE_BED_Y.toFixed(3)}, smoothstep(0.0, 1.9, bd));
        by -= smoothstep(18.0, 40.0, length(bp)) * 1.6;
        transformed.y = by;
      }
    `,
    fragmentHeader: `
      uniform vec3 uSand; uniform vec3 uPebble; uniform vec3 uBedDeep; uniform vec3 uBedMid;
      varying float vBedD;
      float caust(vec2 p, float t) {
        vec2 i = floor(p); vec2 f = fract(p);
        float d1 = 8.0; float d2 = 8.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 h = vec2(sc_hash(i + g), sc_hash(i + g + 9.7));
            vec2 o = 0.5 + 0.38 * sin(t * 0.8 + 6.2831 * h);
            vec2 r = g + o - f;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
          }
        }
        return 1.0 - smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));
      }
    `,
    fragment: `
      {
        vec3 P = vScWorldPos;
        float d = vBedD;
        float n = sc_noise(P.xz * 1.3);
        vec3 c = mix(uSand * vec3(0.86, 0.9, 0.84), uBedMid, smoothstep(0.1, 1.2, d + (n - 0.5) * 0.5));
        c = mix(c, uBedDeep, smoothstep(1.2, 4.5, d));
        c = mix(c, uPebble, step(0.88, sc_hash(floor(P.xz * 9.0))) * (1.0 - smoothstep(0.3, 1.5, d)) * 0.6);
        float k = caust(P.xz * 1.35, uTime) * 0.6 + caust(P.xz * 2.1 + 3.3, uTime * 1.3) * 0.4;
        float shallow = 1.0 - smoothstep(0.2, 3.0, d);
        c += vec3(0.95, 1.0, 0.92) * k * shallow * 0.24 * (0.35 + 0.65 * uDaylight) * (1.0 - uSnow * 0.7);
        diffuseColor.rgb = c;
      }
    `,
  });
  const bed = new THREE.Mesh(createLakeBedGeometry(shore.min, -shore.min), bedMaterial);
  bed.name = `lakebed`;
  bed.receiveShadow = true;
  bed.frustumCulled = false;
  return {
    water,
    bed,
    update(scene: THREE.Scene): void {
      const fog = scene.fog;
      if (fog && fog.color) sky.copy(fog.color);
      else if (scene.background instanceof THREE.Color) sky.copy(scene.background);
    },
  };
}

/**
 * Flat lake-bed grid: 111 even steps across [min, max] plus coarse outer rings out to 72 units.
 * The bed material's vertex shader shapes it from the ShoreField.
 */
function createLakeBedGeometry(min: number, max: number): THREE.BufferGeometry { // _c (19056)
  const coords: number[] = [],
    outer = [-72, -58, -46, -37, -30, -25];
  for (const c of outer) if (c < min - 1) coords.push(c);
  for (let k = 0; k <= 110; k++) coords.push(min + ((max - min) * k) / 110);
  for (const c of outer.slice().reverse()) if (-c > max + 1) coords.push(-c);
  const n = coords.length,
    positions = new Float32Array(n * n * 3);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const o = (row * n + col) * 3;
      positions[o] = coords[col];
      positions[o + 1] = CONFIG.LAKE_BED_Y;
      positions[o + 2] = coords[row];
    }
  const index: number[] = [];
  for (let row = 0; row < n - 1; row++)
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col,
        b = a + 1,
        c = a + n,
        d = c + 1;
      index.push(a, c, b, b, c, d);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(`position`, new THREE.BufferAttribute(positions, 3));
  const normals = new Float32Array(n * n * 3);
  for (let k = 0; k < n * n; k++) normals[k * 3 + 1] = 1;
  geometry.setAttribute(`normal`, new THREE.BufferAttribute(normals, 3));
  geometry.setIndex(index);
  return geometry;
}
