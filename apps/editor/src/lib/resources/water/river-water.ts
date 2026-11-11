// Flowing river water: the stylized water of three-stylized-water on a ribbon along a river
// course, with a flow direction.
//   (MIT: (c) 2025 MatrixRex, Uber Stylized Water; (c) 2026 norio, three.js TSL port.
//    The GLSL layers below are adapted from stylized-water.ts, the editor's port of that code.)
//
// Differences from the lake/sea water (stylized-water.ts):
// - One pass, no render targets: depth comes from the ribbon (aDepth = water depth in meters,
//   aEdge = meters to the nearest bank), not from a scene depth pass. So deep/shallow color,
//   caustics and shoreline lines follow the river's cross-section.
// - Flow: normal map, surface foam and bank foam are read in river coordinates (across, along)
//   and move downstream (+uv.y), faster in the middle than at the banks. The shear of that
//   speed profile is reset with the two-phase flow-map method (two samples half a cycle apart,
//   cross-faded), so the pattern never stretches.
// - Foam lines along both banks and around stepping stones; a soft alpha edge at the banks.
// - Reflection: sky color with Fresnel (no reflection pass).
import * as THREE from "three";
import { FLAT_WATER_Y, ISLAND_WATER_Y, flatBanks, flatBed, revealIndexCount, waterRibbon, type SweepMesh } from "@/lib/generators/river/ribbon";
import { buildSteppingStones } from "@/vendor/little-habitats/ecology/models";
import { samplesFromParams, type RiverNodeParams } from "@/lib/generators/river/params";
import type { ResourceInstance } from "../types";
import { WATER_PRESETS, type WaterPreset, type WaterPresetId } from "./presets";
import { waterTexture } from "./stylized-water";

/** River water styles: water entry slugs (the library's lakes and seas) and their preset. */
export const RIVER_STYLES: Record<string, { preset: WaterPresetId; name: string; flow: number }> = {
  lagoon: { preset: "genshin", name: "Anime lagoon", flow: 1 },
  "clear-lake": { preset: "clear", name: "Clear lake", flow: 1 },
  "toon-sea": { preset: "wavy", name: "Toon sea", flow: 1.1 },
  anime: { preset: "anime", name: "Anime water", flow: 1 },
  "murky-pond": { preset: "murky", name: "Murky pond", flow: 0.6 },
  ocean: { preset: "tropical", name: "Tropical sea", flow: 1 },
  retro: { preset: "oldschool", name: "Retro water", flow: 1 },
  "wavy-sea": { preset: "wavy2", name: "Wavy sea", flow: 1.2 }
};

/** Water style slug for a style text: a slug, a preset id or a water entry id ("water:lagoon"). */
export function riverStyleSlug(style: string | undefined): string | null {
  if (!style) return null;
  const key = style.trim().toLowerCase().replace(/^water:/, "");
  if (RIVER_STYLES[key]) return key;
  const byPreset = Object.entries(RIVER_STYLES).find(([, v]) => v.preset === key);
  return byPreset ? byPreset[0] : null;
}

const vertexShader = /* glsl */ `
attribute float aEdge;
attribute float aDepth;
attribute float aHalf;
attribute vec2 aAlong;
varying vec2 vUv;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vEdge;
varying float vDepth;
varying float vHalf;
varying vec3 vAlongW;
#include <fog_pars_vertex>

void main() {
  vUv = uv;
  vEdge = aEdge;
  vDepth = aDepth;
  vHalf = aHalf;
  vLocal = position.xz;
  vAlongW = normalize((modelMatrix * vec4(aAlong.x, 0.0, aAlong.y, 0.0)).xyz + vec3(1e-6, 0.0, 0.0));
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  vec4 mvPosition = viewMatrix * world;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const fragmentShader = /* glsl */ `
uniform float uTime;
uniform float uLight;
uniform vec3 uSky;
uniform vec3 uSunDir;
// colors (rgb linear, a = layer weight)
uniform vec4 uDeep;
uniform vec4 uShallow;
uniform vec4 uFoamColor;
uniform vec4 uBankFoamColor;
uniform vec4 uSLColor;
uniform vec3 uSpecColor;
uniform float uWaterDepth;
uniform float uDistStart;
uniform float uDistFade;
// normals
uniform sampler2D tNormal;
uniform float uNormalOn;
uniform float uNormalScale;
uniform float uNormalStrength;
uniform float uNormalFar;
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
// bank foam (the intersection foam of the lake water)
uniform sampler2D tInter;
uniform float uInterScale;
uniform float uInterInvert;
uniform float uInterDissolve;
// shoreline lines
uniform sampler2D tSL;
uniform float uSLOn;
uniform float uSLDepth;
uniform float uSLThickness;
uniform float uSLSpeed;
uniform float uSLAmount;
uniform float uSLDissolve;
uniform float uSLMaskScale;
uniform vec2 uSLMaskPan;
// surface foam
uniform sampler2D tFoam;
uniform float uFoamOn;
uniform float uFoamScale;
uniform float uFoamEdge;
uniform float uFoamSmooth;
uniform float uFoamInvert;
uniform float uFoamAlphaBlend;
// reflection and specular
uniform float uReflStrength;
uniform float uFresnel;
uniform float uSpecSize;
uniform float uSpecHardness;
uniform float uSpecSpread;
// flow (river only)
uniform float uFlowSpeed;
uniform float uFlowEdge;
uniform float uFlowCycle;
uniform float uBankFoam;
uniform float uBankFoamWidth;
uniform float uEdgeSoft;
uniform float uLength;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform float uReveal;
uniform vec3 uStones[8];
uniform int uStoneCount;

varying vec2 vUv;
varying vec3 vWorld;
varying vec2 vLocal;
varying float vEdge;
varying float vDepth;
varying float vHalf;
varying vec3 vAlongW;
#include <fog_pars_fragment>

vec4 layer(vec4 base, vec4 l, float mask) { return mix(base, l, mask * l.a); }
float screenBlend(float base, float blend, float opacity) { return mix(base, 1.0 - (1.0 - blend) * (1.0 - base), opacity); }

void main() {
  vec3 V = normalize(cameraPosition - vWorld);
  float dist = length(cameraPosition - vWorld);
  vec3 up = vec3(0.0, 1.0, 0.0);

  // River coordinates in meters: x across (0 = center line), y along (downstream +).
  float across = (vUv.x - 0.5) * 2.0 * vHalf;
  vec2 riverUV = vec2(across, vUv.y) * 0.1;

  // Flow: faster in the middle. Two phases half a cycle apart, cross-faded (flow-map method).
  float centerness = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0);
  float speed = uFlowSpeed * mix(uFlowEdge, 1.0, centerness);
  float ph0 = fract(uTime / uFlowCycle);
  float ph1 = fract(uTime / uFlowCycle + 0.5);
  float w0 = 1.0 - abs(ph0 * 2.0 - 1.0);
  float w1 = 1.0 - w0;
  vec2 f0 = riverUV - vec2(0.0, speed * ph0 * uFlowCycle * 0.1);
  vec2 f1 = riverUV - vec2(0.0, speed * ph1 * uFlowCycle * 0.1) + vec2(0.37, 0.21);

  // Normal map along the flow.
  vec3 n0 = texture2D(tNormal, f0 * uNormalScale).rgb * 2.0 - 1.0;
  vec3 n1 = texture2D(tNormal, f1 * uNormalScale * 0.83).rgb * 2.0 - 1.0;
  vec3 nBlend = n0 * w0 + n1 * w1;
  float distMask = clamp((dist - uDistStart) / max(uDistFade, 1e-4), 0.0, 1.0);
  float strength = mix(uNormalStrength, uNormalFar, distMask);
  vec3 nTS = vec3(nBlend.xy * strength, mix(1.0, nBlend.z, clamp(strength, 0.0, 1.0)));
  nTS = mix(vec3(0.0, 0.0, 1.0), nTS, uNormalOn);
  vec3 B = normalize(vec3(vAlongW.x, 0.0, vAlongW.z) + vec3(1e-6, 0.0, 0.0));
  vec3 T = vec3(-B.z, 0.0, B.x);
  vec3 N = normalize(T * nTS.x + B * nTS.y + up * nTS.z);

  // Depth from the cross-section: shallow at the banks, deep in the middle and in the pool.
  float ws = clamp(exp(-vDepth / max(uWaterDepth, 1e-4)), 0.0, 1.0);
  vec4 c = mix(uDeep, uShallow, ws);
  c.rgb *= uLight;

  // Caustics on the shallow bed (they drift slowly, they do not flow with the water).
  float dR = texture2D(tCausticDist, riverUV * uCDistScale + vec2(-uCPan, 0.0) * 0.1 * uTime).r * 2.0 - 1.0;
  vec2 cDist = vec2(dR * 0.01, dR * 2.0) * uCDistStrength * 0.01;
  vec2 cA = riverUV * uCScale + vec2(uCPan) * 0.1 * uTime + cDist;
  vec2 cB = riverUV * uCScale * 1.3 - vec2(uCPan) * 0.1 * uTime + cDist;
  float caustic = min(texture2D(tCaustic, cA).r, texture2D(tCaustic, cB).r) * uCStrength;
  float cFade = 1.0 - clamp((dist - uCStart) / max(uCFade, 1e-4), 0.0, 1.0);
  float cMask = caustic * ws * cFade * uCOn;
  c = layer(c, vec4(vec3(4.0 * uLight), 1.0), cMask);

  // Foam lines along both banks and around stepping stones, carried by the flow.
  // Stones get a thin foam ring only: with the full bank width, the rings of a group of
  // stepping stones joined into one white patch.
  float edgeDist = vEdge;
  float stoneDist = 1e3;
  for (int i = 0; i < 8; i++) {
    if (i >= uStoneCount) break;
    stoneDist = min(stoneDist, length(vLocal - uStones[i].xy) - uStones[i].z);
  }
  float band = max(1.0 - smoothstep(0.0, uBankFoamWidth, edgeDist), (1.0 - smoothstep(0.0, 0.16, stoneDist)) * 0.7);
  float ir = texture2D(tInter, f0 * uInterScale).r * w0 + texture2D(tInter, f1 * uInterScale).r * w1;
  float im = mix(1.0 - ir, ir, uInterInvert);
  float fx = band * (band + (1.0 - im * clamp(uInterDissolve, 0.5, 2.5)));
  float interMask = smoothstep(0.3, 0.45, fx) * uBankFoam;
  c = layer(c, uBankFoamColor, interMask);

  // Shoreline lines that run along the banks.
  float slDepth = clamp(exp(-edgeDist / max(uSLDepth * 3.0, 1e-4)), 0.0, 1.0);
  float thick = uSLThickness * -0.5;
  float sx = (slDepth - uSLSpeed * 0.1 * uTime) * uSLAmount;
  float lines = min(smoothstep(thick, 1.0, fract(-sx)), smoothstep(thick, 1.0, fract(sx)));
  float dTex = texture2D(tSL, riverUV * uSLMaskScale + uSLMaskPan * 0.1 * uTime).r;
  float stepped = step(lines * (1.0 - dTex * uSLDissolve), 0.5);
  float slMask = clamp(smoothstep(0.5, 0.8, slDepth) - (1.0 - stepped), 0.0, 1.0) * uSLOn;
  c = layer(c, uSLColor, slMask);

  // Surface foam, carried by the flow.
  float fr = texture2D(tFoam, f0 * uFoamScale).r * w0 + texture2D(tFoam, f1 * uFoamScale).r * w1;
  float foam = smoothstep(uFoamEdge, uFoamEdge + max(uFoamSmooth, 1e-4), fr);
  foam = mix(foam, 1.0 - foam, uFoamInvert) * uFoamOn;
  c = layer(c, uFoamColor, foam);

  float a = c.a;
  a = screenBlend(a, uBankFoamColor.a, interMask);
  a = screenBlend(a, uSLColor.a, slMask);
  a = mix(screenBlend(a, uFoamColor.a, foam), a, uFoamAlphaBlend);
  a = clamp(a, 0.0, 1.0);

  // Sky reflection with Fresnel. As alpha blending: out = (1 - F) (a C + (1 - a) behind) + F R.
  float fres = clamp(pow(max(1.0 - clamp(dot(up, V), 0.0, 1.0), 1e-5), uFresnel) * uReflStrength, 0.0, 1.0);
  float A = 1.0 - (1.0 - fres) * (1.0 - a);
  vec3 rgb = ((1.0 - fres) * a * c.rgb + fres * uSky * uLight) / max(A, 1e-4);

  // Stylized specular, added on top.
  float exponent = exp2((1.0 - uSpecSpread) * 10.0 + 1.0);
  float spec = pow(clamp(dot(reflect(-normalize(uSunDir), N), V), 0.0, 1.0), exponent);
  float lo = 1.0 - uSpecSize;
  float specular = mix(spec, smoothstep(lo, lo + 0.15, spec), uSpecHardness);
  vec3 S = uSpecColor * specular * max(uLight, 0.3);
  float sA = clamp(A + dot(S, vec3(0.3333)), 0.0, 1.0);
  rgb = (rgb * A + S) / max(sA, 1e-4);

  // Soft bank edge, faded ends, reveal from the source.
  float alpha = sA * smoothstep(0.0, uEdgeSoft, vEdge);
  if (uFadeStart > 0.0) alpha *= smoothstep(0.0, uFadeStart, vUv.y);
  if (uFadeEnd > 0.0) alpha *= smoothstep(0.0, uFadeEnd, uLength - vUv.y);
  alpha *= 1.0 - smoothstep(uReveal - 1.5, uReveal, vUv.y);

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

function riverUniforms(styleSlug: string, width: number, length: number): Record<string, THREE.IUniform> {
  const style = RIVER_STYLES[styleSlug] ?? RIVER_STYLES.lagoon!;
  const p: WaterPreset = WATER_PRESETS[style.preset];
  const f = (k: string, d = 0) => p.f[k] ?? d;
  const v2 = (k: string) => new THREE.Vector2(p.v[k]?.[0] ?? 0, p.v[k]?.[1] ?? 0);
  const spec = linear(p.c.Specular_Color);
  const inter = linear(p.c.InterSec_Color);
  // Bank foam: the preset's intersection color, at least 75 % visible, a little whiter.
  const bankFoam = new THREE.Vector4(inter.x * 0.7 + 0.3, inter.y * 0.7 + 0.3, inter.z * 0.7 + 0.3, Math.max(inter.w, 0.75));
  return {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uTime: { value: 0 },
    uLight: { value: 1 },
    uSky: { value: new THREE.Color("#bfe3f2") },
    uSunDir: { value: new THREE.Vector3(0.4, 0.8, 0.3) },
    uDeep: { value: linear(p.c.Color_Deep) },
    // A river needs some body at its banks: shallow alpha at least 0.12.
    uShallow: { value: (() => { const s = linear(p.c.Color_Shallow); s.w = Math.max(s.w, 0.12); return s; })() },
    uFoamColor: { value: linear(p.c.SurfFoam_Color) },
    uBankFoamColor: { value: bankFoam },
    uSLColor: { value: linear(p.c.SL_Color) },
    uSpecColor: { value: new THREE.Vector3(Math.min(spec.x, 3), Math.min(spec.y, 3), Math.min(spec.z, 3)) },
    uWaterDepth: { value: f("Water_Depth", 0.3) },
    uDistStart: { value: f("DistanceMask_Start", 5) },
    uDistFade: { value: f("DistanceMask_Fade", 10) },
    tNormal: { value: waterTexture(p.t.Normal_Map!) },
    uNormalOn: { value: f("ENABLENORMAL") },
    uNormalScale: { value: f("Normal_Scale", 3) },
    uNormalStrength: { value: f("Normal_Strength", 0.7) },
    uNormalFar: { value: f("Normal_DistanceStrength", 0.2) },
    tCaustic: { value: waterTexture(p.t.Caustics_Map!) },
    tCausticDist: { value: waterTexture(p.t.Caustics_Distortion_Map!) },
    uCOn: { value: f("ENABLECAUSTICS") },
    uCScale: { value: f("Caustics_Scale", 2) },
    uCPan: { value: f("Caustics_Pan", 1) * 0.5 },
    uCDistScale: { value: f("Caustics_Distortion_Scale", 2) },
    uCDistStrength: { value: f("Caustics_Distortion_Strength", 1) },
    uCStrength: { value: f("Caustics_Strength", 0.5) },
    uCStart: { value: f("Caustics_Start", 2) },
    uCFade: { value: f("Caustics_Fade", 5) },
    tInter: { value: waterTexture(p.t.InterSec_Foam_Mask!) },
    uInterScale: { value: f("InterSec_Foam_Scale", 4) },
    uInterInvert: { value: f("InterSec_Foam_Invert") },
    uInterDissolve: { value: f("InterSec_Dissolve", 1.6) },
    tSL: { value: waterTexture(p.t.SL_Dissolve_Mask!) },
    uSLOn: { value: f("ENABLESHORELINE") },
    uSLDepth: { value: f("SL_WaterDepth", 0.5) },
    uSLThickness: { value: f("SL_Thickness", 0.3) },
    uSLSpeed: { value: f("SL_Speed", -0.5) },
    uSLAmount: { value: f("SL_Ammount", 5) },
    uSLDissolve: { value: f("SL_Dissolve", 1) },
    uSLMaskScale: { value: f("SL_MaskScale", 1) * (p.v.SL_MaskTile?.[0] ?? 1) },
    uSLMaskPan: { value: v2("SL_MaskPan") },
    tFoam: { value: waterTexture(p.t.SurfFoam_Map!) },
    uFoamOn: { value: f("Enable_SurfaceFoam") },
    uFoamScale: { value: f("SurfFoam_Scale", 3) * (p.v.SurfFoam_Tile?.[0] ?? 1) },
    uFoamEdge: { value: f("SurfFoam_Edge", 0.1) },
    uFoamSmooth: { value: f("SurfFoam_EdgeSmooth", 0.2) },
    uFoamInvert: { value: f("Invert_SurfFoam") },
    uFoamAlphaBlend: { value: f("SurfFoam_AlphaBlend") },
    uReflStrength: { value: f("Reflection_Strength", 0.8) },
    uFresnel: { value: f("Reflection_Fresnel", 5) },
    uSpecSize: { value: f("Specular_Size", 0.4) },
    uSpecHardness: { value: f("Specular_Hardness", 1) },
    uSpecSpread: { value: f("Specular_Spread") },
    // Flow: about 1 m/s in the middle of a narrow stream, slower when wide; banks at 30 %.
    uFlowSpeed: { value: Math.min(1.2, Math.max(0.45, 1.25 - width * 0.09)) * style.flow },
    uFlowEdge: { value: 0.3 },
    uFlowCycle: { value: 4 },
    uBankFoam: { value: 1 },
    uBankFoamWidth: { value: Math.min(0.7, 0.25 + width * 0.06) },
    uEdgeSoft: { value: 0.3 },
    uLength: { value: length },
    uFadeStart: { value: 0 },
    uFadeEnd: { value: 0 },
    uReveal: { value: 1e6 },
    uStones: { value: Array.from({ length: 8 }, () => new THREE.Vector3(0, 0, 0)) },
    uStoneCount: { value: 0 }
  };
}

function toGeometry(mesh: SweepMesh): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(mesh.positions, 3));
  for (const [name, data] of Object.entries(mesh.attrs)) {
    const size = data.length / (mesh.positions.length / 3);
    g.setAttribute(name, new THREE.BufferAttribute(data, size));
  }
  g.setIndex(new THREE.BufferAttribute(mesh.indices, 1));
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Builds a river from its node params: water ribbon, and on flat ground a bed and grass banks.
 * appear = play the build reveal: bed, then the water flows in from the source, then banks.
 */
export function createRiver(params: RiverNodeParams, appear: boolean): ResourceInstance {
  const samples = samplesFromParams(params);
  const length = samples[samples.length - 1]?.s ?? 0;
  const meanWidth = (samples.reduce((s, p) => s + p.hw, 0) / Math.max(1, samples.length)) * 2;
  const flat = params.mode === "flat";
  const group = new THREE.Group();
  group.name = "River";
  const disposables: { dispose: () => void }[] = [];

  // Bed and banks (flat ground only; an island has its own carved banks).
  type Part = { geometry: THREE.BufferGeometry; sweep: SweepMesh; from: number; to: number };
  const parts: Part[] = [];
  if (flat) {
    const bedSweep = flatBed(samples);
    const bed = toGeometry(bedSweep);
    bed.computeVertexNormals();
    const bedMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
    const bedMesh = new THREE.Mesh(bed, bedMat);
    bedMesh.name = "River bed";
    bedMesh.receiveShadow = true;
    group.add(bedMesh);
    const bankSweep = flatBanks(samples, meanWidth, params.seed);
    const banks = toGeometry(bankSweep);
    banks.computeVertexNormals();
    // RGBA vertex colors: the outer grass fades into the ground.
    const bankMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, transparent: true, depthWrite: true });
    const bankMesh = new THREE.Mesh(banks, bankMat);
    bankMesh.name = "River banks";
    bankMesh.receiveShadow = true;
    bankMesh.renderOrder = 1;
    group.add(bankMesh);
    disposables.push(bed, bedMat, banks, bankMat);
    parts.push({ geometry: bed, sweep: bedSweep, from: 0, to: 1.1 }, { geometry: banks, sweep: bankSweep, from: 1.0, to: 2.1 });
  }

  // Water.
  const waterY = flat ? FLAT_WATER_Y : ISLAND_WATER_Y;
  const waterSweep = waterRibbon(samples, waterY, { start: params.capStart, end: params.capEnd });
  const water = toGeometry(waterSweep);
  const slug = RIVER_STYLES[params.style] ? params.style : (riverStyleSlug(params.style) ?? "lagoon");
  const uniforms = riverUniforms(slug, meanWidth, length);
  uniforms.uFadeStart!.value = params.fadeStart;
  uniforms.uFadeEnd!.value = params.fadeEnd;
  const stones = params.stones ?? [];
  const stoneCount = Math.min(8, Math.floor(stones.length / 3));
  for (let i = 0; i < stoneCount; i++) (uniforms.uStones!.value as THREE.Vector3[])[i]!.set(stones[i * 3]!, stones[i * 3 + 1]!, stones[i * 3 + 2]! + 0.05);
  uniforms.uStoneCount!.value = stoneCount;
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms, transparent: true, depthWrite: false, fog: true, side: THREE.FrontSide });
  const waterMesh = new THREE.Mesh(water, material);
  waterMesh.name = "River water";
  waterMesh.renderOrder = 3;
  waterMesh.frustumCulled = false;
  // Not sea floor for the lake/sea water passes (stylized-water.ts hides water surfaces there).
  waterMesh.userData.waterSurface = true;
  group.add(waterMesh);
  disposables.push(water, material);
  parts.push({ geometry: water, sweep: waterSweep, from: 0.35, to: 2.2 });

  // Stepping stones (Island kit model), their tops just above the water.
  let stoneMesh: THREE.Mesh | null = null;
  if (stoneCount > 0) {
    const spots = Array.from({ length: Math.floor(stones.length / 3) }, (_, i) => ({ x: stones[i * 3]!, z: stones[i * 3 + 1]!, r: stones[i * 3 + 2]! }));
    const model = buildSteppingStones(params.seed, spots);
    const stoneMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    stoneMesh = new THREE.Mesh(model.geometry, stoneMat);
    stoneMesh.name = "Stepping stones";
    stoneMesh.position.y = waterY + 0.02;
    stoneMesh.castShadow = true;
    stoneMesh.receiveShadow = true;
    group.add(stoneMesh);
    disposables.push(model.geometry, stoneMat);
  }

  // Sun direction and sky color, looked up once a second (as the lake water does).
  let lastLookup = -10;
  const sunWorld = new THREE.Vector3();
  const sunTarget = new THREE.Vector3();
  waterMesh.onBeforeRender = (_renderer, scene) => {
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
    const luma = sky.r * 0.2126 + sky.g * 0.7152 + sky.b * 0.0722;
    uniforms.uLight!.value = Math.min(1, Math.max(0.22, luma * 1.8));
  };

  // Build reveal: each part grows from the source to the mouth (draw range), the water with a
  // soft front (uReveal). Times in seconds after the node appears.
  const start = performance.now();
  let revealing = appear;
  const applyReveal = (seconds: number) => {
    for (const part of parts) {
      const t = easeOut((seconds - part.from) / (part.to - part.from));
      const s = t >= 1 ? 1e9 : -2 + t * (length + 4);
      part.geometry.setDrawRange(0, t <= 0 ? 0 : t >= 1 ? Infinity : revealIndexCount(part.sweep, s));
      if (part.geometry === water) uniforms.uReveal!.value = t >= 1 ? 1e6 : s + 1.5;
    }
    if (stoneMesh) stoneMesh.visible = seconds >= 1.9;
  };
  if (appear) applyReveal(0);

  return {
    object: group,
    update: (frame) => {
      uniforms.uTime!.value = frame.time;
      if (revealing) {
        const seconds = (performance.now() - start) / 1000;
        applyReveal(seconds);
        if (seconds > 2.3) revealing = false;
      }
    },
    dispose: () => {
      for (const d of disposables) d.dispose();
    }
  };
}
