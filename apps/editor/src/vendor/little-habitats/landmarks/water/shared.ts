// Ports bundle lines 33561-33815: shared helpers for the water landmarks (fountain, island shrine, lighthouse,
// water wheel, wishing well). Splash ring, coin mesh, the water-fx kit and its material, the lighthouse beam
// material, the lantern light pool material, spacing helpers and the tube / curve stream builders.
import * as THREE from 'three';
import { easeOutCubic, smoothstep } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit } from '../../ecology/meshKit';
import { sharedNoise } from '../../ecology/noise';
import { patchWorldMaterial } from '../../fx/pokefx';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDetectContext } from '../types';

let ringGeometry: THREE.RingGeometry | null = null; // Pg (33561)

/** Expanding ring on the water surface that fades out. */
export class SplashRing { // Fg (33562)
  mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  mat: THREE.MeshBasicMaterial;
  t = Infinity;
  dur = 1;
  r0 = 0.05;
  r1 = 0.3;
  peak = 0.8;
  constructor(color: THREE.ColorRepresentation = '#f2fbf8') {
    ringGeometry ??= new THREE.RingGeometry(0.82, 1, 28, 1).rotateX(-Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    this.mesh = new THREE.Mesh(ringGeometry, this.mat);
    this.mesh.visible = false;
    this.mesh.renderOrder = 4;
    this.mesh.raycast = () => undefined;
  }
  start(x: number, y: number, z: number, r0: number, r1: number, dur = 0.9, peak = 0.8): void {
    this.mesh.position.set(x, y, z);
    this.r0 = r0;
    this.r1 = r1;
    this.dur = dur;
    this.peak = peak;
    this.t = 0;
    this.mesh.visible = true;
    this.mesh.scale.setScalar(r0);
    this.mat.opacity = peak;
  }
  update(dt: number): void {
    if (this.t === Infinity) return;
    this.t += dt;
    const k = this.t / this.dur;
    if (k >= 1) {
      this.t = Infinity;
      this.mesh.visible = false;
      return;
    }
    this.mesh.scale.setScalar(this.r0 + (this.r1 - this.r0) * easeOutCubic(k));
    const n = 1 - k;
    this.mat.opacity = this.peak * n * n;
  }
  dispose(): void {
    this.mat.dispose();
  }
}

/** Small gold coin mesh (hidden, not pickable). */
export function makeCoinMesh(r = 0.06): THREE.Mesh { // Ig (33605)
  const kit = new MeshKit(new Rng(7));
  kit.cyl(r, r, r * 0.22, 9, 0, -r * 0.11, 0, PALETTE.autumnGold, { ao: false, grad: 0, jitter: 0 });
  kit.cyl(r * 0.72, r * 0.72, r * 0.26, 9, 0, -r * 0.13, 0, `#f6d372`, { ao: false, grad: 0, jitter: 0 });
  const mesh = landmarkMesh(kit.build(), landmarkMaterials().base, false);
  mesh.visible = false;
  mesh.raycast = () => undefined;
  return mesh;
}

export const v3 = (x: number, y: number, z: number): THREE.Vector3 => new THREE.Vector3(x, y, z); // Lg (33612)

/** Values of the aFx.x attribute: how the water-fx shader moves and shades a part. */
export const WATER_FX = { STILL: 0, RIPPLE: 1, BUBBLE: 2, HOP: 3, FALL: 4, COIN: 5 } as const; // Rg (33613)
export type WaterFxKind = (typeof WATER_FX)[keyof typeof WATER_FX];

/** 1 at night, 0 in daylight. */
export const nightAmount = (daylight: number): number => 1 - smoothstep(0.08, 0.6, daylight); // zg (33614)

/** MeshKit that also writes the per-vertex aFx = (kind, phase) attribute for waterFxMaterial. */
export class WaterFxKit { // Bg (33615)
  g: MeshKit;
  fx: number[] = [];
  constructor(rng: Rng) {
    this.g = new MeshKit(rng);
  }
  part(kind: WaterFxKind, phase: number, add: (kit: MeshKit) => unknown): this {
    this.pad();
    add(this.g);
    const n = this.g.vertexCount;
    while (this.fx.length / 2 < n) this.fx.push(kind, phase);
    return this;
  }
  pad(): void {
    const n = this.g.vertexCount;
    while (this.fx.length / 2 < n) this.fx.push(0, 0);
  }
  build(): THREE.BufferGeometry {
    this.pad();
    const geo = this.g.build();
    geo.setAttribute(`aFx`, new THREE.Float32BufferAttribute(this.fx, 2));
    if (!geo.getAttribute(`aCenter`)) geo.setAttribute(`aCenter`, geo.getAttribute(`position`).clone());
    return geo;
  }
}

let waterFxMat: THREE.MeshStandardMaterial | null = null; // Vg (33641)

/** Shared material for WaterFxKit geometry: still water sparkle, ripples, bubbles, hops, falls and coins. */
export function waterFxMaterial(): THREE.MeshStandardMaterial { // Hg (33642)
  if (waterFxMat) return waterFxMat;
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 1,
    roughness: 0.14,
    metalness: 0,
    emissive: new THREE.Color(`#2f8f93`),
    emissiveIntensity: 0.3,
    depthWrite: false,
  });
  waterFxMat = patchWorldMaterial(mat, {
    vertexHeader: `
      attribute vec2 aFx;
      attribute vec3 aCenter;
      varying float vFxKind;
      varying float vFxPhase;
      varying float vFxT;`,
    vertex: `
      vFxKind = aFx.x;
      vFxPhase = aFx.y;
      vFxT = 0.0;
      if (aFx.x > 0.5 && aFx.x < 1.5) {
        float t = fract(uTime * 0.38 + aFx.y);
        vec2 d = transformed.xz - aCenter.xz;
        transformed.xz = aCenter.xz + d * (0.2 + t * 1.15);
        transformed.y -= t * t * 0.045;
        vFxT = t;
      } else if (aFx.x > 1.5 && aFx.x < 2.5) {
        float s = sin(uTime * 6.3 + aFx.y * 6.283) * 0.6 + sin(uTime * 9.7 + aFx.y * 3.1) * 0.4;
        vec3 d = transformed - aCenter;
        transformed = aCenter + d * vec3(1.0 + 0.13 * s, 1.0 + 0.32 * s, 1.0 + 0.13 * s);
      } else if (aFx.x > 2.5 && aFx.x < 3.5) {
        float t = fract(uTime * 1.25 + aFx.y);
        vec3 d = transformed - aCenter;
        transformed = aCenter + d * (1.0 - 0.55 * t) + vec3(0.0, 4.0 * t * (1.0 - t) * 0.16 - 0.03, 0.0);
        vFxT = t;
      }`,
    fragmentHeader: `
      varying float vFxKind;
      varying float vFxPhase;
      varying float vFxT;`,
    fragment: `
      float fxA = 0.84;
      if (vFxKind < 0.5) {
        float n = sc_noise(vScWorldPos.xz * 7.0 + vec2(uTime * 0.6, -uTime * 0.45));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.98, 0.97), smoothstep(0.62, 0.92, n) * 0.55);
      } else if (vFxKind < 1.5) {
        fxA = 0.9 * (1.0 - vFxT);
      } else if (vFxKind < 3.5) {
        fxA = vFxKind > 2.5 ? 0.9 * (1.0 - vFxT * vFxT) : 0.9;
      } else if (vFxKind < 4.5) {
        float n = sc_noise(vec2(dot(vScWorldPos.xz, vec2(9.0)), vScWorldPos.y * 6.0 + uTime * 5.5));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.95, 0.99, 0.98), smoothstep(0.5, 0.85, n) * 0.75);
        fxA = 0.86;
      } else {
        fxA = 1.0;
        float g = pow(max(0.0, sin(uTime * 1.6 + vFxPhase * 41.0)), 40.0);
        totalEmissiveRadiance = vec3(1.0, 0.78, 0.4) * (0.12 + g * 3.2);
      }
      diffuseColor.a = fxA;`,
    cacheKey: `lm-water-fx`,
  });
  return waterFxMat;
}

let beamMat: THREE.ShaderMaterial | null = null; // Ug (33710)

/** Additive light-beam material for the lighthouse cones (fades by aFade and view angle). */
export function beamMaterial(): THREE.ShaderMaterial { // Wg (33711)
  return (
    beamMat ||
    (beamMat = new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0 }, uColor: { value: new THREE.Color(`#ffe0a0`) } },
      vertexShader: `
      attribute float aFade;
      varying float vFade;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vFade = aFade;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vV = -mv.xyz;
        vN = normalMatrix * normal;
        gl_Position = projectionMatrix * mv;
      }`,
      fragmentShader: `
      uniform float uOpacity;
      uniform vec3 uColor;
      varying float vFade;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        float a = vFade * pow(f, 1.6) * uOpacity;
        gl_FragColor = vec4(uColor, a);
      }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    }))
  );
}

let lightPoolMat: THREE.MeshBasicMaterial | null = null; // Gg (33748)

/** Additive warm light pool on the ground and water under a lantern. */
export function lightPoolMaterial(): THREE.MeshBasicMaterial { // Kg (33749)
  return (
    lightPoolMat ||
    (lightPoolMat = new THREE.MeshBasicMaterial({
      map: sharedNoise(),
      color: new THREE.Color(PALETTE.lanternGlow),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    }))
  );
}

/** Distance from (x, z) to the nearest habitat feature. */
export function nearestFeatureDistance(ctx: LandmarkDetectContext, x: number, z: number): number { // qg (33764)
  let d = Infinity;
  for (const f of ctx.habitat.features) d = Math.min(d, Math.hypot(f.x - x, f.z - z));
  return d;
}

/** Scale that keeps a landmark of the given size clear of the nearest feature, in steps of 0.05. */
export function fitScale(dist: number, size: number, max: number, min = 0.72): number { // Jg (33769)
  const s = Math.max(min, Math.min(max, (dist - 0.3) / size));
  return Math.round(s * 20) / 20;
}

const IDENTITY = new THREE.Matrix4(); // Yg (33773)

/** Adds a smooth tube through the points (CatmullRom) to the kit. */
export function addTube( // Xg (33774)
  kit: MeshKit,
  points: THREE.Vector3[],
  radius: number,
  color: THREE.ColorRepresentation,
  segments = 10,
): void {
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), segments, radius, 6, false).toNonIndexed();
  kit.addRaw(geo.attributes.position.array, geo.attributes.normal.array, IDENTITY, color, {
    smooth: true,
    ao: false,
    grad: 0,
    jitter: 0.02,
  });
  geo.dispose();
}

/** Adds a quadratic Bezier stream p0 -> p2 (control p1) as beams, width w0 -> w1, depth h. */
export function addCurveStream( // Zg (33784)
  kit: MeshKit,
  p0: THREE.Vector3,
  p1: THREE.Vector3,
  p2: THREE.Vector3,
  w0: number,
  w1: number,
  h: number,
  color: THREE.ColorRepresentation,
  steps = 7,
): void {
  let prev = p0.clone();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps,
      u = 1 - t,
      p = new THREE.Vector3(
        u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
        u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
        u * u * p0.z + 2 * u * t * p1.z + t * t * p2.z,
      ),
      w = w0 + (w1 - w0) * t;
    kit.beam(prev, p, w, h, color, {
      ao: false,
      grad: 0,
      jitter: 0.02,
      extend: h * 0.6,
      bevel: Math.min(w, h) * 0.35,
      up: { x: 0, y: 0, z: 1 },
    });
    prev = p;
  }
}

export const FOUNTAIN_WATER = `#9fdcd6`; // Qg (33806)
export const FOUNTAIN_FOAM = `#eef9f6`; // $g (33807)
export const FOUNTAIN_ICE = `#dcecf2`; // e_ (33808)

/** Adds one arcing water stream at an angle: from (r0, y0) over (r1, y1) down to (r2, y2). */
export function addArcStream( // t_ (33809)
  kit: MeshKit,
  angle: number,
  r0: number,
  y0: number,
  r1: number,
  y1: number,
  r2: number,
  y2: number,
  radius: number,
): void {
  const c = Math.cos(angle),
    s = Math.sin(angle),
    at = (r: number, y: number) => v3(c * r, y, s * r),
    mid = at(r0 + (r1 - r0) * 0.55, y0 + (y1 - y0) * 0.9);
  addTube(kit, [at(r0, y0), mid, at(r1, y1), at(r2 + (r1 - r2) * 0.3, y2 + (y1 - y2) * 0.35), at(r2, y2)], radius, FOUNTAIN_WATER, 10);
}
