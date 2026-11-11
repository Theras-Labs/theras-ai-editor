// Ports bundle lines 19357-19623: flora uniforms (bc), the vertex patch GLSL (xc header, Sc body), the flora material
// (wc) and its shadow depth material (Tc).
// Bundle 19624-19869 are three.js addon copies and are not included: Ec mergeGeometries + Dc mergeAttributes (used only by
// p_ outside flora) and Oc mergeVertices (imported in ./geometry.ts) from 'three/addons/utils/BufferGeometryUtils.js'.
import * as THREE from 'three';
import { UNIFORMS, patchWorldMaterial } from '../fx/pokefx';

/** Per-species uniforms of the flora material (one set per species batch). */
export function createFloraUniforms() { // bc (19357)
  return {
    uAmtA: { value: new THREE.Vector4(1, 0, 0, 0) },
    uAmtB: { value: new THREE.Vector4(0, 0, 0, 1) },
    uWind: { value: new THREE.Vector4(1, 0, 0, 0) },
    uForm: { value: new THREE.Vector4(0, 0, 0, 0) },
    uTintA: { value: new THREE.Color(1, 1, 1) },
    uTintB: { value: new THREE.Color(1, 1, 1) },
    uTintP: { value: new THREE.Vector4(0, 0.2, 0.2, 0) },
    uVar0: { value: new THREE.Color(1, 1, 1) },
    uVar1: { value: new THREE.Color(1, 1, 1) },
    uVar2: { value: new THREE.Color(1, 1, 1) },
    uVar3: { value: new THREE.Color(1, 1, 1) },
    uVarOn: { value: 0 },
    uBudCol: { value: new THREE.Color(0.3, 0.5, 0.2) },
    uSeedCol: { value: new THREE.Color(0.4, 0.3, 0.2) },
    uPivot: { value: new THREE.Vector3() },
  };
}

export type FloraUniforms = ReturnType<typeof createFloraUniforms>;

/** Attributes, uniforms and helpers of the flora vertex patch. */
export const FLORA_VERTEX_HEADER = `
attribute vec4 aPart;
attribute vec2 aFx;
attribute vec4 aI0;
attribute vec2 aI1;
uniform vec4 uAmtA;
uniform vec4 uAmtB;
uniform vec4 uWind;
uniform vec4 uForm;
uniform vec3 uTintA;
uniform vec3 uTintB;
uniform vec4 uTintP;
uniform vec3 uVar0;
uniform vec3 uVar1;
uniform vec3 uVar2;
uniform vec3 uVar3;
uniform float uVarOn;
uniform vec3 uBudCol;
uniform vec3 uSeedCol;
uniform vec3 uPivot;
#ifndef FL_DEPTH
varying float vFlRim;
#endif
float fl_back(float x, float s) { x = x - 1.0; return 1.0 + (s + 1.0) * x * x * x + s * x * x; }
vec3 fl_rotY(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(c * v.x + s * v.z, v.y, -s * v.x + c * v.z); }
vec3 fl_rotX(vec3 v, float a) { float c = cos(a), s = sin(a); return vec3(v.x, c * v.y - s * v.z, s * v.y + c * v.z); }
`; // xc (19376)

/**
 * Flora vertex patch, after begin_vertex: seasonal presence per part kind, water lily opening, sunflower tracking,
 * sapling form, wind, floating bob, growth / pop-in / shrink-out, and (colour pass only) seasonal tints.
 */
export const FLORA_VERTEX = `
{
  float fl_kr = aPart.w;
  float fl_turn = step(9.5, fl_kr);
  int fl_kind = int(fl_kr - fl_turn * 10.0 + 0.5);
  vec3 fl_anchor = aPart.xyz;
  float fl_var = aI0.x;
  float fl_isTree = uForm.x;
  float fl_special = uForm.y;

  // growth (smoothly animated between syncs)
  float fl_gk = clamp((uTime - aI0.w) / 1.2, 0.0, 1.0);
  float fl_g = mix(aI1.x, aI1.y, 1.0 - (1.0 - fl_gk) * (1.0 - fl_gk));
  float fl_mature = smoothstep(0.4, 0.85, fl_g);
  float fl_ph = fract(sin(dot(fl_anchor, vec3(12.9898, 78.233, 37.719)) + fl_var * 91.7) * 43758.5453);

  // seasonal presence of this part (0..1)
  float fl_dorm = uAmtB.z;
  float fl_pres = 1.0;
  if (fl_kind == 1) fl_pres = uAmtA.x;
  else if (fl_kind == 3) fl_pres = uAmtA.y * fl_mature;
  else if (fl_kind == 4) fl_pres = uAmtA.z * fl_mature;
  else if (fl_kind == 5) fl_pres = uAmtA.w * fl_mature;
  else if (fl_kind == 6) fl_pres = max(uAmtA.w, max(uAmtB.x * 0.85, uAmtB.y)) * fl_mature;
  else if (fl_kind == 7) fl_pres = uAmtB.x * fl_mature;
  else if (fl_kind == 8 || fl_kind == 9) fl_pres = 1.0 - fl_dorm;
  // stagger transitions per part & instance so things change one by one
  if (fl_pres > 0.0005 && fl_pres < 0.9995) fl_pres = clamp((fl_pres - fl_ph * 0.45) / 0.55, 0.0, 1.0);
  // optional sub-parts (tuft variety)
  if (uForm.z > 0.0 && aFx.y < 0.5 && fract(aFx.y * 14.26 + fl_var * 3.71) < uForm.z) fl_pres = 0.0;
  float fl_s = fl_pres <= 0.0 ? 0.0 : fl_back(fl_pres, 1.3);
  if (fl_kind == 8) fl_s = mix(0.28, 1.0, fl_s);

  vec3 fl_p = transformed;
  fl_p = fl_anchor + (fl_p - fl_anchor) * fl_s;
  if (fl_kind == 1) fl_p.y -= (1.0 - fl_s) * 0.35 * (0.3 + fl_ph);

  #ifndef FL_DEPTH
  vec3 fl_n = objectNormal;
  #endif

  // water lily petals open by day, close at night
  if (fl_special > 1.5 && fl_special < 2.5 && (fl_kind == 5)) {
    float o = mix(0.28, 1.0, smoothstep(0.15, 0.65, uDaylight));
    vec3 d = fl_p - fl_anchor;
    d.xz *= o;
    d.y *= mix(1.7, 1.0, o);
    fl_p = fl_anchor + d;
  }

  // sunflower head follows the sun (loosely) and bows when seeding
  if (fl_turn > 0.5) {
    vec3 sd = transpose(mat3(sc_model)) * uSunDir;
    float yaw = atan(sd.x, sd.z + 1e-6) * 0.75;
    float tilt = mix(-0.12, 0.75, uAmtB.y) + 0.35 * (1.0 - smoothstep(0.0, 0.3, uDaylight));
    vec3 d = fl_p - uPivot;
    d = fl_rotY(fl_rotX(d, tilt), yaw);
    fl_p = uPivot + d;
    #ifndef FL_DEPTH
    fl_n = fl_rotY(fl_rotX(fl_n, tilt), yaw);
    #endif
  }

  // saplings: thin trunk, compact canopy
  if (fl_isTree > 0.5) {
    if (fl_kind == 0) {
      fl_p.xz *= mix(0.42, 1.0, fl_g);
    } else {
      vec3 cc = vec3(0.0, uForm.w, 0.0);
      vec3 a2 = cc + (fl_anchor - cc) * mix(0.45, 1.0, fl_g);
      fl_p = a2 + (fl_p - fl_anchor) * mix(0.72, 1.0, fl_g);
    }
  }

  // wind: height sway + flex sway (hanging strands, blades) + flutter
  {
    float h = max(0.0, fl_p.y) / uWind.x;
    vec3 wd = transpose(mat3(sc_model)) * vec3(uWindDir.x, 0.0, uWindDir.y);
    wd = normalize(wd + vec3(1e-5));
    float ph = dot(sc_origin.xz, vec2(0.37, 0.53)) + uTime * 1.7;
    float gust = sin(ph) * 0.55 + sin(ph * 2.31 + 1.7) * 0.25 + 0.45;
    float fx = aFx.x;
    fl_p += wd * gust * uWindStrength * (uWind.y * h * h + uWind.z * fx * fx);
    if (uWind.w > 0.0 && fx > 0.0) {
      float t2 = uTime * 2.6 + aFx.y * 6.2831 + fl_var * 23.0;
      fl_p += vec3(sin(t2), sin(t2 * 1.37 + 1.3) * 0.45, cos(t2 * 0.83 + 0.4)) * uWind.w * fx * (0.35 + uWindStrength);
    }
  }

  // floating: bob & tilt on the water
  if (fl_special > 1.5) {
    float t3 = uTime * 1.1 + fl_var * 40.0;
    fl_p.y += sin(t3) * 0.012 + (fl_p.x * sin(t3 * 0.7) + fl_p.z * cos(t3 * 0.9)) * 0.03;
  }

  // growth, pop-in (easeOutBack + squash & stretch), shrink-out
  float fl_gs = fl_isTree > 0.5 ? mix(0.14, 1.0, fl_g) : mix(0.25, 1.0, fl_g);
  float fl_kb = clamp((uTime - aI0.y) / 0.6, 0.0, 1.0);
  float fl_pop = fl_kb <= 0.0 ? 0.0 : fl_back(fl_kb, 1.9);
  float fl_sq = sin(fl_kb * 3.14159) * (1.0 - fl_kb) * 0.6;
  float fl_kd = clamp((uTime - aI0.z) / 0.35, 0.0, 1.0);
  float fl_die = 1.0 - fl_kd * fl_kd * (3.0 - 2.0 * fl_kd);
  float fl_S = fl_gs * uAmtB.w * fl_die;
  fl_p *= vec3(fl_pop * (1.0 - fl_sq * 0.35), fl_pop * (1.0 + fl_sq), fl_pop * (1.0 - fl_sq * 0.35)) * fl_S;
  transformed = fl_p;

  #ifndef FL_DEPTH
  if (fl_turn > 0.5) {
    objectNormal = fl_n;
    vec3 tn = fl_n;
    #ifdef USE_INSTANCING
      mat3 fl_im = mat3(instanceMatrix);
      tn /= vec3(dot(fl_im[0], fl_im[0]), dot(fl_im[1], fl_im[1]), dot(fl_im[2], fl_im[2]));
      tn = fl_im * tn;
    #endif
    transformedNormal = normalMatrix * tn;
    #ifndef FLAT_SHADED
      vNormal = normalize(transformedNormal);
    #endif
  }

  vFlRim = (fl_kind == 0 || fl_kind == 4) ? 0.25 : 1.0;

  #ifdef USE_COLOR
  {
    vec3 c = vColor.rgb;
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    // seasonal tint of foliage (luminance preserving, blob-by-blob)
    if ((fl_kind == 1 || fl_kind == 2 || fl_kind == 8 || fl_kind == 9) && uTintP.x > 0.001) {
      vec3 tc = mix(uTintA, uTintB, fract(fl_ph * 5.31));
      float ta = clamp(uTintP.x * 1.35 - fl_ph * 0.35, 0.0, 1.0);
      c = mix(c, tc * (lum / uTintP.y), ta);
    }
    if (fl_kind == 1 || fl_kind == 2) c *= 0.94 + fl_ph * 0.12;
    // per-variant petal colours (tulips, roses, hydrangea …)
    if (uVarOn > 0.5 && (fl_kind == 5 || (fl_kind == 6 && uVarOn > 1.5))) {
      float vi = floor(fract(fl_var * 3.17) * 4.0);
      vec3 vc = vi < 0.5 ? uVar0 : vi < 1.5 ? uVar1 : vi < 2.5 ? uVar2 : uVar3;
      c *= vc;
    }
    // heads: bud colour before, seed colour after the bloom
    if (fl_kind == 6) {
      vec3 off = uAmtB.y >= uAmtB.x ? uSeedCol : uBudCol;
      c = mix(off * clamp(lum / uTintP.z, 0.55, 1.5), c, clamp(uAmtA.w * 1.5, 0.0, 1.0));
    }
    // frosty tips on blades in winter
    c = mix(c, vec3(0.82, 0.87, 0.95), uSnow * uTintP.w * smoothstep(0.35, 1.0, aFx.x));
    // per-instance hue / lightness jitter
    float j1 = fract(fl_var * 13.37) - 0.5;
    float j2 = fract(fl_var * 7.77) - 0.5;
    c *= 1.0 + j1 * 0.16;
    c.r *= 1.0 + j2 * 0.1;
    c.b *= 1.0 - j2 * 0.1;
    vColor.rgb = c;
  }
  #endif
  #endif
}
`; // Sc (19403)

export const FLORA_CACHE_KEY = `scaper-flora-v1`; // Cc (19562)

/** Vertex-coloured standard material patched with the world uniforms, the flora vertex patch and a soft rim light. */
export function createFloraMaterial(uniforms: FloraUniforms, doubleSide: boolean): THREE.MeshStandardMaterial { // wc (19563)
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.88,
    metalness: 0,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  patchWorldMaterial(material, {
    snow: 1,
    uniforms,
    vertexHeader: FLORA_VERTEX_HEADER,
    vertex: FLORA_VERTEX,
    fragmentHeader: `varying float vFlRim;`,
  });
  const patched = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    patched.call(material, shader, renderer);
    let fragment = shader.fragmentShader;
    if (doubleSide)
      fragment = fragment.replace(
        `#include <normal_fragment_begin>`,
        `#include <normal_fragment_begin>
  normal = normalize(vNormal);
  nonPerturbedNormal = normal;`,
      );
    fragment = fragment.replace(
      `#include <emissivemap_fragment>`,
      `#include <emissivemap_fragment>
  {
    float flRim = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.5);
    vec3 flSunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
    float flBack = pow(clamp(dot(normalize(-vViewPosition), flSunV), 0.0, 1.0), 3.0);
    totalEmissiveRadiance += diffuseColor.rgb * vFlRim * (flRim * 0.22 + flBack * flRim * 0.35) * (0.35 + 0.65 * uDaylight);
  }`,
    );
    shader.fragmentShader = fragment;
  };
  material.customProgramCacheKey = () => FLORA_CACHE_KEY + (doubleSide ? `-ds` : ``);
  return material;
}

/** Shadow depth material that runs the same vertex patch (FL_DEPTH skips normals and colours). */
export function createFloraDepthMaterial(uniforms: FloraUniforms): THREE.MeshDepthMaterial { // Tc (19594)
  const material = new THREE.MeshDepthMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, UNIFORMS, uniforms);
    shader.vertexShader =
      `#define FL_DEPTH
uniform float uTime;
uniform vec2 uWindDir;
uniform float uWindStrength;
uniform float uDaylight;
uniform vec3 uSunDir;
` +
      FLORA_VERTEX_HEADER +
      shader.vertexShader.replace(
        `#include <begin_vertex>`,
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 sc_model = modelMatrix * instanceMatrix;
#else
  mat4 sc_model = modelMatrix;
#endif
  vec3 sc_origin = (sc_model * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
${FLORA_VERTEX}`,
      );
  };
  material.customProgramCacheKey = () => `scaper-flora-v1-depth`;
  return material;
}
