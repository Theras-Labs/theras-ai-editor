// Stylized water for the WebGL editor: a GLSL port of three-stylized-water
// (MIT: (c) 2025 MatrixRex, Uber Stylized Water; (c) 2026 norio, three.js TSL port).
//
// Layers, in the source's composition order: depth-based deep/shallow color, screen-space
// refraction, caustics, intersection foam, animated shoreline, wave crest color, surface foam,
// planar reflection with Fresnel, and stylized specular. Two Gerstner waves move the surface.
//
// The depth and refraction layers need the scene behind the water. Before the water draws, it
// renders the scene once without itself (color + depth) and once mirrored for the reflection
// (at half size). Editor helpers (grid lines, gizmos) and the island's own flat lake surface
// are hidden in those passes, so they do not count as sea floor.
import * as THREE from "three";
import type { ResourceEntry, ResourceInstance } from "../types";
import { WATER_PRESETS, type WaterPreset, type WaterPresetId } from "./presets";

const TEX_BASE = `${import.meta.env.BASE_URL}library/textures/water`;
const textureLoader = new THREE.TextureLoader();
const textures = new Map<string, THREE.Texture>();

export function waterTexture(file: string): THREE.Texture {
  let texture = textures.get(file);
  if (!texture) {
    texture = textureLoader.load(`${TEX_BASE}/${file}.png`);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.NoColorSpace; // masks, noise and normals are linear data
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.anisotropy = 8;
    textures.set(file, texture);
  }
  return texture;
}

const vertexShader = /* glsl */ `
uniform float uTime;
uniform vec4 uWave1; // length, height, speed, sharpness
uniform vec4 uWave2;
uniform vec2 uDir1;
uniform vec2 uDir2;
uniform float uWaveOn;
uniform mat4 uReflMatrix;
varying vec3 vWorld;
varying vec3 vWaveNormal;
varying float vHeight;
varying float vEye;
varying vec2 vCenter;
varying vec4 vReflUv;
#include <fog_pars_vertex>

void gerstner(vec4 wave, vec2 dir, vec3 P, inout vec3 disp, inout vec3 nrm) {
  vec2 D = normalize(vec2(dir.x, -dir.y) + 1e-6); // Unity -> three flips z once
  float k = 6.283185 / max(abs(wave.x), 1e-4);
  float w = sqrt(9.8 * k);
  float phase = dot(P.xz, D * k) - w * uTime * wave.z;
  float c = cos(phase);
  float s = sin(phase);
  float kA = max(k * wave.y, 1e-6);
  float Q = wave.w / kA;
  disp += vec3(0.0, c * wave.y, 0.0) - vec3(D.x, 0.0, D.y) * (s * Q * wave.y);
  nrm += vec3(D.x * s * kA, 1.0 - Q * c * kA, D.y * s * kA);
}

void main() {
  vec3 P = (modelMatrix * vec4(position, 1.0)).xyz;
  vec3 disp = vec3(0.0);
  vec3 nrm = vec3(0.0);
  gerstner(uWave1, uDir1, P, disp, nrm);
  gerstner(uWave2, uDir2, P, disp, nrm);
  disp *= uWaveOn;
  // Shallow troughs: the ground grid sits at y = 0, just under the water.
  if (disp.y < 0.0) disp.y *= 0.15;
  vWaveNormal = normalize(mix(vec3(0.0, 1.0, 0.0), normalize(nrm), uWaveOn));
  vHeight = disp.y;
  vec3 world = P + disp;
  vWorld = world;
  vCenter = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xz;
  vReflUv = uReflMatrix * vec4(world, 1.0);
  vec4 mvPosition = viewMatrix * vec4(world, 1.0);
  vEye = -mvPosition.z;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uWaveTotal;
uniform float uRadius;
uniform float uLight;
uniform vec3 uSky;
uniform vec3 uSunDir;
// scene passes
uniform sampler2D tScene;
uniform sampler2D tDepth;
uniform sampler2D tRefl;
uniform float uHasScene;
uniform float uHasRefl;
uniform vec4 uViewport;
uniform mat4 uProjInv;
uniform mat4 uViewInv;
// colors (rgb linear, a = layer weight)
uniform vec4 uDeep;
uniform vec4 uShallow;
uniform vec4 uCrest;
uniform vec4 uFoamColor;
uniform vec4 uInterColor;
uniform vec4 uSLColor;
uniform vec3 uSpecColor;
// depth
uniform float uWaterDepth;
uniform float uShoreFade;
uniform float uShoreSmooth;
uniform float uDistStart;
uniform float uDistFade;
// normals
uniform sampler2D tNormal;
uniform float uNormalOn;
uniform float uNormalScale;
uniform float uNormalPan;
uniform float uNormalStrength;
uniform float uNormalFar;
// refraction
uniform float uRefrOn;
uniform float uRefrStrength;
uniform float uRefrFar;
uniform float uRefrFade;
// caustics
uniform sampler2D tCaustic;
uniform sampler2D tCausticDist;
uniform float uCOn;
uniform float uCScale;
uniform float uCPan;
uniform float uCDistScale;
uniform float uCDistStrength;
uniform float uCStrength;
uniform float uCStart;
uniform float uCFade;
uniform float uCDepth;
// intersection foam
uniform sampler2D tInter;
uniform float uInterOn;
uniform float uInterWidth;
uniform float uInterGrad;
uniform float uInterScale;
uniform float uInterInvert;
uniform float uInterDissolve;
uniform float uInterSmooth;
uniform float uInterEdgeFade;
uniform vec2 uInterPan;
// shoreline
uniform sampler2D tSL;
uniform float uSLOn;
uniform float uSLDepth;
uniform float uSLCenter;
uniform float uSLCenterFade;
uniform float uSLThickness;
uniform float uSLSpeed;
uniform float uSLAmount;
uniform float uSLDissolve;
uniform float uSLGradient;
uniform float uSLMaskScale;
uniform vec2 uSLMaskPan;
uniform float uSLTrail;
uniform float uSLTrailFade;
// surface foam
uniform sampler2D tFoam;
uniform float uFoamOn;
uniform float uFoamScale;
uniform float uFoamEdge;
uniform float uFoamSmooth;
uniform float uFoamInvert;
uniform float uFoamAlphaBlend;
uniform vec2 uFoamPan;
// reflection and specular
uniform float uReflStrength;
uniform float uFresnel;
uniform float uReflDistortion;
uniform float uSpecSize;
uniform float uSpecHardness;
uniform float uSpecSpread;

varying vec3 vWorld;
varying vec3 vWaveNormal;
varying float vHeight;
varying float vEye;
varying vec2 vCenter;
varying vec4 vReflUv;
#include <fog_pars_fragment>

vec4 layer(vec4 base, vec4 l, float mask) { return mix(base, l, mask * l.a); }
float screenBlend(float base, float blend, float opacity) { return mix(base, 1.0 - (1.0 - blend) * (1.0 - base), opacity); }

// Scene point behind a screen UV: world position and positive eye depth.
vec3 scenePoint(vec2 uv, out float eye) {
  if (uHasScene < 0.5) { eye = 1e6; return vWorld - vec3(0.0, 1e3, 0.0); }
  float d = texture2D(tDepth, uv).r;
  vec4 view = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
  view /= view.w;
  eye = -view.z;
  return (uViewInv * view).xyz;
}

float shallowMask(vec3 sceneP, float depthScale) {
  return clamp(exp(-(vWorld.y - sceneP.y) / max(depthScale, 1e-4)), 0.0, 1.0);
}

void main() {
  vec2 suv = (gl_FragCoord.xy - uViewport.xy) / uViewport.zw;
  vec2 worldUV = vec2(vWorld.x, -vWorld.z) * 0.1;
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 Ngeo = normalize(vWaveNormal);

  // Normal maps: two panning samples, averaged; strength fades with distance.
  vec2 uvA = worldUV * (uNormalScale * 0.5) + vec2(uNormalPan * -0.05 * uTime);
  vec2 uvB = worldUV * uNormalScale + vec2(uNormalPan * 0.1 * uTime);
  vec3 nBlend = mix(texture2D(tNormal, uvA).rgb * 2.0 - 1.0, texture2D(tNormal, uvB).rgb * 2.0 - 1.0, 0.5);
  float distMask = clamp((dist - uDistStart) / max(uDistFade, 1e-4), 0.0, 1.0);
  float strength = mix(uNormalStrength, uNormalFar, distMask);
  vec3 nTS = vec3(nBlend.xy * strength, mix(1.0, nBlend.z, clamp(strength, 0.0, 1.0)));
  nTS = mix(vec3(0.0, 0.0, 1.0), nTS, uNormalOn);
  vec3 T = vec3(-1.0, 0.0, 0.0);
  vec3 B = cross(Ngeo, T);
  vec3 N = normalize(T * nTS.x + B * nTS.y + Ngeo * nTS.z);

  // Depth (screen UV variant).
  float sceneEye;
  vec3 sceneP = scenePoint(suv, sceneEye);
  float ws = shallowMask(sceneP, uWaterDepth);
  float shoreFadeMask = smoothstep(uShoreFade - 1.0, uShoreFade - 1.0 + uShoreSmooth, 1.0 - ws);

  // Refraction: offset the scene lookup by the normal map; keep it only where the scene is behind.
  float far01 = clamp((dist - uRefrFade) / 5.0, 0.0, 1.0);
  float refrStrength = mix(shoreFadeMask * uRefrStrength, uRefrFar, far01);
  vec2 offset = nBlend.xy * refrStrength * 0.1;
  float offEye;
  scenePoint(suv + offset, offEye);
  float keep = step(vEye - offEye, 0.0);
  vec2 ruv = suv + offset * keep * uRefrOn;
  vec3 sceneColor = texture2D(tScene, ruv).rgb;
  float rEye;
  vec3 sceneR = scenePoint(ruv, rEye);
  float wsR = shallowMask(sceneR, uWaterDepth);

  vec4 c = mix(uDeep, uShallow, wsR);
  c.rgb *= uLight;

  // Caustics, with a little parallax so they sit on the floor.
  vec3 viewTS = vec3(-V.x, V.z, V.y);
  float pDepth = (1.0 - ws) * uCDepth * 0.1 * -0.5;
  vec2 pUV = worldUV + viewTS.xy / (viewTS.z + 0.42) * pDepth;
  float dR = texture2D(tCausticDist, pUV * uCDistScale + vec2(-uCPan, 0.0) * 0.1 * uTime).r * 2.0 - 1.0;
  vec2 cDist = vec2(dR * 0.01, dR * 2.0) * uCDistStrength * 0.01;
  vec2 cA = pUV * uCScale + vec2(uCPan) * 0.1 * uTime + cDist;
  vec2 cB = pUV * uCScale * 1.3 - vec2(uCPan) * 0.1 * uTime + cDist;
  float caustic = min(texture2D(tCaustic, cA).r, texture2D(tCaustic, cB).r) * uCStrength;
  float cFade = 1.0 - clamp((dist - uCStart) / max(uCFade, 1e-4), 0.0, 1.0);
  float cMask = caustic * ws * cFade * uCOn;
  c = layer(c, vec4(vec3(4.0 * uLight), 1.0), cMask);

  // Intersection foam: a broken band where the water meets objects and the shore.
  float g = mix(0.1, 1.0, uInterGrad);
  float iw = uInterWidth * mix(0.7, 1.0, g);
  float iEdge = 1.0 - iw;
  float band = smoothstep(iEdge, iEdge + g, ws);
  float ir = texture2D(tInter, worldUV * uInterScale + uInterPan * 0.1 * uTime).r;
  float im = mix(1.0 - ir, ir, uInterInvert);
  float x = band * (band + (1.0 - im * uInterDissolve * mix(2.5, 1.0, g)));
  float iFoam = smoothstep(0.1, 0.1 + max(uInterSmooth, 1e-6), x);
  float wide = smoothstep(iEdge, 1.0, ws);
  float interMask = clamp(mix(iFoam, wide * iFoam, uInterEdgeFade), 0.0, 1.0) * uInterOn;
  c = layer(c, uInterColor, interMask);

  // Animated shoreline lines.
  float slDepth = clamp(exp(-(vWorld.y - sceneP.y) / max(uSLDepth, 1e-6)), 0.0, 1.0);
  float center = smoothstep(uSLCenter, uSLCenter + uSLCenterFade, slDepth);
  float thick = uSLThickness * -0.5;
  float sx = (slDepth - uSLSpeed * 0.1 * uTime) * uSLAmount;
  float fracNeg = fract(-sx);
  float fracPos = fract(sx);
  float smA = smoothstep(thick, 1.0, fracNeg);
  float smB = smoothstep(thick, 1.0, fracPos);
  float speedPos = uSLSpeed > 0.0 ? 1.0 : 0.0;
  float lines = mix(min(smA, smB), mix(smB, smA, speedPos), uSLTrail);
  float dTex = texture2D(tSL, worldUV * uSLMaskScale + uSLMaskPan * 0.1 * uTime).r;
  float expanded = mix(lines * (1.0 - dTex * uSLDissolve), lines, slDepth * uSLGradient);
  float stepped = step(expanded, 0.5);
  float trailed = mix(stepped, mix(fracNeg, fracPos, speedPos) * stepped, uSLTrailFade);
  float slMask = clamp(center - (1.0 - trailed), 0.0, 1.0) * uSLOn;
  c = layer(c, uSLColor, slMask);

  // Crest color on wave tops.
  // Only the tops of the waves, softly, and dimmed with the light (the source used it unscaled
  // on tiny Unity waves; on larger waves it would paint whole bands).
  float crest = smoothstep(0.45, 1.0, vHeight / max(uWaveTotal, 1e-4)) * (1.0 - distMask * 0.7);
  c = layer(c, vec4(uCrest.rgb * uLight, uCrest.a), crest * 0.45);

  // Surface foam.
  float fr = texture2D(tFoam, worldUV * uFoamScale + uFoamPan * 0.1 * uTime).r;
  float foam = smoothstep(uFoamEdge, uFoamEdge + max(uFoamSmooth, 1e-4), fr);
  foam = mix(foam, 1.0 - foam, uFoamInvert) * uFoamOn;
  c = layer(c, uFoamColor, foam);

  float a = c.a;
  a = screenBlend(a, uInterColor.a, interMask);
  a = screenBlend(a, uSLColor.a, slMask);
  a = mix(screenBlend(a, uFoamColor.a, foam), a, uFoamAlphaBlend);
  // Deep water is opaque. Open water with no floor at all would otherwise show the sky behind it.
  a = max(a, smoothstep(1.5, 10.0, vWorld.y - sceneR.y));

  vec3 rgb = mix(c.rgb, mix(sceneColor, c.rgb, a), uRefrOn * uHasScene);

  // Planar reflection (sky color when there is no reflection pass), Fresnel on the wave normal.
  vec2 reflOff = nTS.xy * uReflDistortion * 0.1;
  vec3 refl = uHasRefl > 0.5 ? texture2D(tRefl, vReflUv.xy / vReflUv.w + vec2(-reflOff.x, reflOff.y) * 0.1).rgb : uSky;
  float fres = pow(max(1.0 - clamp(dot(Ngeo, V), 0.0, 1.0), 1e-5), uFresnel);
  rgb = mix(rgb, refl, clamp(fres * uReflStrength, 0.0, 1.0));

  // Stylized specular.
  float exponent = exp2((1.0 - uSpecSpread) * 10.0 + 1.0);
  float spec = pow(clamp(dot(reflect(-normalize(uSunDir), N), V), 0.0, 1.0), exponent);
  float lo = 1.0 - uSpecSize;
  float specular = mix(spec, smoothstep(lo, lo + 0.15, spec), uSpecHardness);
  rgb += uSpecColor * specular * max(uLight, 0.3);

  float alpha = uHasScene > 0.5 && uRefrOn > 0.5 ? shoreFadeMask : shoreFadeMask * a;
  if (uHasScene < 0.5) alpha = max(a, 0.9);
  float r = length(vWorld.xz - vCenter);
  alpha *= 1.0 - smoothstep(uRadius * 0.82, uRadius, r);

  gl_FragColor = vec4(rgb, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

function linear(rgba: number[] | undefined, fallback = [1, 1, 1, 1]) {
  const v = rgba ?? fallback;
  const color = new THREE.Color().setRGB(v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, THREE.SRGBColorSpace);
  return new THREE.Vector4(color.r, color.g, color.b, v[3] ?? 1);
}

export type WaterLook = {
  preset: WaterPresetId;
  /** Wave height in meters (0 = flat). */
  waveHeight: number;
  /** Wave length multiplier on the preset lengths. */
  waveLength?: number;
  /** Half the width of the water surface, in meters. */
  radius?: number;
};

// ── Scene passes ────────────────────────────────────────────────────────────

let inPass = false;
const hidden: THREE.Object3D[] = [];
let helperCache: { at: number; list: THREE.Object3D[] } = { at: -1, list: [] };

/** Objects that must not count as sea floor or show in the reflection. */
function passHidden(scene: THREE.Scene) {
  const now = performance.now();
  if (now - helperCache.at > 500) {
    const list: THREE.Object3D[] = [];
    scene.traverse((o) => {
      const any = o as THREE.Object3D & { isLine?: boolean; isPoints?: boolean; isSprite?: boolean };
      if (any.isLine || any.isPoints || any.isSprite || o.userData.waterSurface || o.userData.noWaterPass) list.push(o);
    });
    helperCache = { at: now, list };
  }
  return helperCache.list;
}

function hideForPass(scene: THREE.Scene, self: THREE.Object3D) {
  hidden.length = 0;
  for (const o of [self, ...passHidden(scene)]) {
    if (o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  }
}

function restoreAfterPass() {
  for (const o of hidden) o.visible = true;
  hidden.length = 0;
}

const _size = new THREE.Vector4();
const _reflPos = new THREE.Vector3();
const _camPos = new THREE.Vector3();
const _rot = new THREE.Matrix4();
const _normal = new THREE.Vector3(0, 1, 0);
const _view = new THREE.Vector3();
const _look = new THREE.Vector3();
const _target = new THREE.Vector3();
const _plane = new THREE.Plane();
const _clip = new THREE.Vector4();
const _q = new THREE.Vector4();

export function createStylizedWater(look: WaterLook): ResourceInstance {
  const p: WaterPreset = WATER_PRESETS[look.preset];
  const f = (k: string, d = 0) => p.f[k] ?? d;
  const radius = look.radius ?? 48;
  const lengthScale = look.waveLength ?? 1.6;
  const rawTotal = Math.max(1e-4, f("1st_Wave_Height") + f("2nd_Wave_Height"));
  const heightScale = look.waveHeight / rawTotal;
  const wave = (n: "1st" | "2nd") =>
    new THREE.Vector4(f(`${n}_Wave_Length`, 3) * lengthScale, f(`${n}_Wave_Height`) * heightScale, f(`${n}_Wave_Speed`, 1), Math.min(0.85, f(`${n}_Wave_Sharpness`)));
  const dir = (k: string) => new THREE.Vector2(p.v[k]?.[0] ?? 1, p.v[k]?.[1] ?? 0);
  const v2 = (k: string) => new THREE.Vector2(p.v[k]?.[0] ?? 0, p.v[k]?.[1] ?? 0);
  const spec = linear(p.c.Specular_Color);

  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
  const reflTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  const reflCamera = new THREE.PerspectiveCamera();
  const reflMatrix = new THREE.Matrix4();

  const uniforms: Record<string, THREE.IUniform> = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uWave1: { value: wave("1st") },
    uWave2: { value: wave("2nd") },
    uDir1: { value: dir("1st_Wave_Direction") },
    uDir2: { value: dir("2nd_Wave_Direction") },
    uWaveOn: { value: look.waveHeight > 0 ? 1 : 0 },
    uWaveTotal: { value: Math.max(1e-4, look.waveHeight) },
    uReflMatrix: { value: reflMatrix },
    uRadius: { value: radius },
    uLight: { value: 1 },
    uSky: { value: new THREE.Color("#bfe3f2") },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    tScene: { value: sceneTarget.texture },
    tDepth: { value: sceneTarget.depthTexture },
    tRefl: { value: reflTarget.texture },
    uHasScene: { value: 0 },
    uHasRefl: { value: 0 },
    uViewport: { value: new THREE.Vector4(0, 0, 1, 1) },
    uProjInv: { value: new THREE.Matrix4() },
    uViewInv: { value: new THREE.Matrix4() },
    uDeep: { value: linear(p.c.Color_Deep) },
    uShallow: { value: linear(p.c.Color_Shallow) },
    uCrest: { value: linear(p.c.Wave_Top_Color) },
    uFoamColor: { value: linear(p.c.SurfFoam_Color) },
    uInterColor: { value: linear(p.c.InterSec_Color) },
    uSLColor: { value: linear(p.c.SL_Color) },
    // The source specular is HDR (up to ~70); keep the shape, cap the brightness.
    uSpecColor: { value: new THREE.Vector3(Math.min(spec.x, 3), Math.min(spec.y, 3), Math.min(spec.z, 3)) },
    uWaterDepth: { value: f("Water_Depth", 0.3) },
    uShoreFade: { value: f("ShoreFade", 1) },
    uShoreSmooth: { value: f("ShoreFade_Smoothness", 0.2) },
    uDistStart: { value: f("DistanceMask_Start", 5) },
    uDistFade: { value: f("DistanceMask_Fade", 10) },
    tNormal: { value: waterTexture(p.t.Normal_Map!) },
    uNormalOn: { value: f("ENABLENORMAL") },
    uNormalScale: { value: f("Normal_Scale", 3) },
    uNormalPan: { value: f("Normal_Pan", 1) },
    uNormalStrength: { value: f("Normal_Strength", 0.7) },
    uNormalFar: { value: f("Normal_DistanceStrength", 0.2) },
    uRefrOn: { value: f("ENABLEREFRACTION") },
    uRefrStrength: { value: f("Refraction_Strength", 0.5) },
    uRefrFar: { value: f("Refraction_Distance_Strength", 0.1) },
    uRefrFade: { value: f("Refraction_Distance_Fade", 0.5) },
    tCaustic: { value: waterTexture(p.t.Caustics_Map!) },
    tCausticDist: { value: waterTexture(p.t.Caustics_Distortion_Map!) },
    uCOn: { value: f("ENABLECAUSTICS") },
    uCScale: { value: f("Caustics_Scale", 2) },
    uCPan: { value: f("Caustics_Pan", 1) },
    uCDistScale: { value: f("Caustics_Distortion_Scale", 2) },
    uCDistStrength: { value: f("Caustics_Distortion_Strength", 1) },
    uCStrength: { value: f("Caustics_Strength", 0.5) },
    uCStart: { value: f("Caustics_Start", 2) },
    uCFade: { value: f("Caustics_Fade", 5) },
    uCDepth: { value: f("Caustics_Depth", -4) },
    tInter: { value: waterTexture(p.t.InterSec_Foam_Mask!) },
    uInterOn: { value: f("Enable_Intersection") },
    uInterWidth: { value: f("InterSec_Width", 0.5) },
    uInterGrad: { value: f("InterSec_GradientDissolve") },
    uInterScale: { value: f("InterSec_Foam_Scale", 4) },
    uInterInvert: { value: f("InterSec_Foam_Invert") },
    uInterDissolve: { value: f("InterSec_Dissolve", 1.6) },
    uInterSmooth: { value: f("InterSec_Foam_Smooth", 0.01) },
    uInterEdgeFade: { value: f("InterSec_Edge_Fade") },
    uInterPan: { value: v2("InterSec_Foam_Pan") },
    tSL: { value: waterTexture(p.t.SL_Dissolve_Mask!) },
    uSLOn: { value: f("ENABLESHORELINE") },
    uSLDepth: { value: f("SL_WaterDepth", 0.5) },
    uSLCenter: { value: f("SL_CenterMask", 0.5) },
    uSLCenterFade: { value: f("SL_CenterMaskFade", 0.3) },
    uSLThickness: { value: f("SL_Thickness", 0.3) },
    uSLSpeed: { value: f("SL_Speed", -0.5) },
    uSLAmount: { value: f("SL_Ammount", 5) },
    uSLDissolve: { value: f("SL_Dissolve", 1) },
    uSLGradient: { value: f("SL_GradientDissolve") },
    uSLMaskScale: { value: f("SL_MaskScale", 1) * (p.v.SL_MaskTile?.[0] ?? 1) },
    uSLMaskPan: { value: v2("SL_MaskPan") },
    uSLTrail: { value: f("SL_EnableTrail") },
    uSLTrailFade: { value: f("SL_Trail_Fade") },
    tFoam: { value: waterTexture(p.t.SurfFoam_Map!) },
    uFoamOn: { value: f("Enable_SurfaceFoam") },
    uFoamScale: { value: f("SurfFoam_Scale", 3) * (p.v.SurfFoam_Tile?.[0] ?? 1) },
    uFoamEdge: { value: f("SurfFoam_Edge", 0.1) },
    uFoamSmooth: { value: f("SurfFoam_EdgeSmooth", 0.2) },
    uFoamInvert: { value: f("Invert_SurfFoam") },
    uFoamAlphaBlend: { value: f("SurfFoam_AlphaBlend") },
    uFoamPan: { value: v2("SurfFoam_Pan") },
    uReflStrength: { value: f("Reflection_Strength", 0.8) },
    uFresnel: { value: f("Reflection_Fresnel", 5) },
    uReflDistortion: { value: f("Reflection_Distortion", 1) },
    uSpecSize: { value: f("Specular_Size", 0.4) },
    uSpecHardness: { value: f("Specular_Hardness", 1) },
    uSpecSpread: { value: f("Specular_Spread") }
  };

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.FrontSide
  });

  const segments = Math.min(320, Math.round(radius * 4));
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "Stylized water";
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  mesh.userData.waterSurface = true;
  // Just above y = 0: above the ground grid and the island's own lake surface.
  mesh.position.y = 0.05;

  let lastLookup = -10;
  const sunWorld = new THREE.Vector3();
  const sunTarget = new THREE.Vector3();

  const lookupSceneLight = (scene: THREE.Scene) => {
    const now = performance.now() / 1000;
    if (now - lastLookup < 1) return;
    lastLookup = now;
    let sun: THREE.DirectionalLight | null = null;
    scene.traverse((o) => {
      if (!sun && (o as THREE.DirectionalLight).isDirectionalLight && o.visible) sun = o as THREE.DirectionalLight;
    });
    const light = sun as THREE.DirectionalLight | null;
    if (light) {
      light.getWorldPosition(sunWorld);
      light.target.getWorldPosition(sunTarget);
      (uniforms.uSunDir!.value as THREE.Vector3).copy(sunWorld.sub(sunTarget).normalize());
    }
    const sky = uniforms.uSky!.value as THREE.Color;
    const fog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (fog) sky.copy(fog.color);
    else if (scene.background instanceof THREE.Color) sky.copy(scene.background);
    // The base colors are unlit: follow the sky brightness so night water is dark.
    const luma = sky.r * 0.2126 + sky.g * 0.7152 + sky.b * 0.0722;
    uniforms.uLight!.value = Math.min(1, Math.max(0.22, luma * 1.8));
  };

  const renderReflection = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.PerspectiveCamera) => {
    // Mirror the camera across the water plane (three.js Reflector, MIT).
    _reflPos.setFromMatrixPosition(mesh.matrixWorld);
    _camPos.setFromMatrixPosition(camera.matrixWorld);
    _view.subVectors(_reflPos, _camPos);
    if (_view.dot(_normal) > 0) return false; // camera under the water
    _view.reflect(_normal).negate().add(_reflPos);
    _rot.extractRotation(camera.matrixWorld);
    _look.set(0, 0, -1).applyMatrix4(_rot).add(_camPos);
    _target.subVectors(_reflPos, _look).reflect(_normal).negate().add(_reflPos);
    reflCamera.position.copy(_view);
    reflCamera.up.set(0, 1, 0).applyMatrix4(_rot).reflect(_normal);
    reflCamera.lookAt(_target);
    reflCamera.far = camera.far;
    reflCamera.updateMatrixWorld();
    reflCamera.projectionMatrix.copy(camera.projectionMatrix);
    reflMatrix.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    reflMatrix.multiply(reflCamera.projectionMatrix).multiply(reflCamera.matrixWorldInverse);
    // Oblique near plane at the water surface.
    _plane.setFromNormalAndCoplanarPoint(_normal, _reflPos).applyMatrix4(reflCamera.matrixWorldInverse);
    _clip.set(_plane.normal.x, _plane.normal.y, _plane.normal.z, _plane.constant);
    const proj = reflCamera.projectionMatrix;
    _q.x = (Math.sign(_clip.x) + proj.elements[8]!) / proj.elements[0]!;
    _q.y = (Math.sign(_clip.y) + proj.elements[9]!) / proj.elements[5]!;
    _q.z = -1;
    _q.w = (1 + proj.elements[10]!) / proj.elements[14]!;
    _clip.multiplyScalar(2 / _clip.dot(_q));
    proj.elements[2] = _clip.x;
    proj.elements[6] = _clip.y;
    proj.elements[10] = _clip.z + 1 - 0.003;
    proj.elements[14] = _clip.w;
    reflCamera.projectionMatrixInverse.copy(proj).invert();
    renderer.setRenderTarget(reflTarget);
    renderer.state.buffers.depth.setMask(true);
    renderer.clear();
    renderer.render(scene, reflCamera);
    return true;
  };

  mesh.onBeforeRender = (renderer, scene, camera) => {
    if (inPass) return;
    lookupSceneLight(scene);
    const cam = camera as THREE.PerspectiveCamera;
    renderer.getCurrentViewport(_size);
    const w = Math.max(1, Math.floor(_size.z));
    const h = Math.max(1, Math.floor(_size.w));
    (uniforms.uViewport!.value as THREE.Vector4).copy(_size);
    if (sceneTarget.width !== w || sceneTarget.height !== h) sceneTarget.setSize(w, h);
    const rw = Math.max(1, Math.floor(w / 2));
    const rh = Math.max(1, Math.floor(h / 2));
    if (reflTarget.width !== rw || reflTarget.height !== rh) reflTarget.setSize(rw, rh);

    inPass = true;
    const previousTarget = renderer.getRenderTarget();
    const shadowAuto = renderer.shadowMap.autoUpdate;
    const xr = renderer.xr.enabled;
    renderer.shadowMap.autoUpdate = false;
    renderer.xr.enabled = false;
    hideForPass(scene, mesh);
    try {
      // Scene behind the water: color for refraction, depth for shallow color and foam.
      renderer.setRenderTarget(sceneTarget);
      renderer.state.buffers.depth.setMask(true);
      renderer.clear();
      renderer.render(scene, cam);
      uniforms.uHasScene!.value = 1;
      (uniforms.uProjInv!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
      (uniforms.uViewInv!.value as THREE.Matrix4).copy(cam.matrixWorld);
      uniforms.uHasRefl!.value = cam.isPerspectiveCamera && renderReflection(renderer, scene, cam) ? 1 : 0;
    } finally {
      restoreAfterPass();
      renderer.setRenderTarget(previousTarget);
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.xr.enabled = xr;
      const viewport = (camera as THREE.Camera & { viewport?: THREE.Vector4 }).viewport;
      if (viewport) renderer.state.viewport(viewport);
      inPass = false;
    }
  };

  return {
    object: mesh,
    update: (frame) => {
      uniforms.uTime!.value = frame.time;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      sceneTarget.depthTexture?.dispose();
      sceneTarget.dispose();
      reflTarget.dispose();
    }
  };
}

type WaterSpec = { slug: string; name: string; look: WaterLook; tags: string[]; description: string };

const WATERS: WaterSpec[] = [
  { slug: "lagoon", name: "Anime lagoon", look: { preset: "genshin", waveHeight: 0.04 }, tags: ["lagoon", "lake", "calm", "teal", "anime", "genshin", "clear"], description: "Clear teal water: shallow near the shore, deep blue further out, with caustics, shoreline lines and reflections." },
  { slug: "ocean", name: "Tropical sea", look: { preset: "tropical", waveHeight: 0.12 }, tags: ["ocean", "sea", "waves", "tropical", "beach"], description: "Tropical sea with foam at the shore, caustics and rolling waves." },
  { slug: "wavy-sea", name: "Wavy sea", look: { preset: "wavy2", waveHeight: 0.3, waveLength: 2 }, tags: ["sea", "waves", "rough", "storm", "foam"], description: "Big rolling waves with light crests and foam." },
  { slug: "toon-sea", name: "Toon sea", look: { preset: "wavy", waveHeight: 0.22 }, tags: ["sea", "waves", "toon", "green", "foam"], description: "Cartoon green-blue sea with foam patterns." },
  { slug: "anime", name: "Anime water", look: { preset: "anime", waveHeight: 0.05 }, tags: ["anime", "lake", "foam", "bright"], description: "Bright cyan water with white foam patterns and a foam edge." },
  { slug: "clear-lake", name: "Clear lake", look: { preset: "clear", waveHeight: 0.03 }, tags: ["lake", "clear", "calm", "pond"], description: "Clear, calm lake water." },
  { slug: "murky-pond", name: "Murky pond", look: { preset: "murky", waveHeight: 0, radius: 16 }, tags: ["pond", "swamp", "mud", "murky"], description: "Brown murky pond water with scum." },
  { slug: "retro", name: "Retro water", look: { preset: "oldschool", waveHeight: 0.04 }, tags: ["retro", "oldschool", "blue", "pixel"], description: "Old-school blue water with foam lines." }
];

export const WATER_ENTRIES: ResourceEntry[] = WATERS.map((w) => ({
  id: `water:${w.slug}`,
  name: w.name,
  kind: "water",
  source: "local",
  origin: "Stylized Water",
  license: "MIT (MatrixRex, norio)",
  tags: ["water", "stylized", ...w.tags],
  description: `${w.description} A ${Math.round((w.look.radius ?? 48) * 2)} m water surface; waves move while Animate is on.`,
  footprint: w.look.radius ?? 48,
  selfAnimates: true,
  create: () => createStylizedWater(w.look)
}));
