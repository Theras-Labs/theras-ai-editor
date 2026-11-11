// The desert's look in WebGL: a flat "print" shading (lit faces keep one flat color, shade is the
// same color times a blue-violet tint, the edge between them is hard), strata bands on rock,
// the ground's sand palettes and pen marks, and ink outlines. It approximates the
// deferred ink renderer with forward materials (MeshLambertMaterial patched in onBeforeCompile),
// so the editor's own lights and shadows still apply. The distance haze is the desert's own.
import * as THREE from "three";
import { STRATA_PALETTES } from "./kit";

/** The desert day's light and shade tints and the pen ink (the day sky script). */
const LIGHT_TINT = new THREE.Color("#fff9ee");
const SHADOW_TINT = new THREE.Color("#a3a3d6");
const INK = new THREE.Color("#2b211f");

const GLSL_NOISE = /* glsl */ `
float dwHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float dwNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dwHash(i), dwHash(i + vec2(1.0, 0.0)), u.x), mix(dwHash(i + vec2(0.0, 1.0)), dwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// a pen line of half-width hw (in the units of u) on parallel lines one period apart
float dwLines(float u, float hw, float mask, float maskMean) {
  float g = max(length(vec2(dFdx(u), dFdy(u))), 1e-6);
  float res = smoothstep(2.5, 5.0, 1.0 / g);
  float hwPx = hw / g;
  float hwD = clamp(hwPx, 0.55, 1.2);
  float d = abs(fract(u + 0.5) - 0.5) / g;
  float line = (1.0 - smoothstep(hwD - 0.6, hwD + 0.6, d)) * min(hwPx / hwD, 1.0) * mask;
  return mix(2.0 * hw * maskMean, line, res);
}
`;

/** Flat print shading: replaces the summed light with one lit color and one shade color. */
const GLSL_TOON = /* glsl */ `
{
  vec3 dwBrdf = max(diffuseColor.rgb * RECIPROCAL_PI, vec3(1e-4));
  vec3 dwIndirect = reflectedLight.indirectDiffuse / dwBrdf;
  vec3 dwDirect = reflectedLight.directDiffuse / dwBrdf;
  vec3 dwSun = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
  for (int i = 0; i < NUM_DIR_LIGHTS; i++) dwSun += directionalLights[i].color;
  #endif
  float dwSunL = dot(dwSun, vec3(0.3, 0.55, 0.15));
  float dwLit = dwSunL > 1e-4 ? clamp(dot(dwDirect, vec3(0.3, 0.55, 0.15)) / dwSunL, 0.0, 1.0) : 1.0;
  dwLit = smoothstep(0.32, 0.6, dwLit);
  dwLitShare = dwLit;
  float dwNdl = 1.0;
  #if NUM_DIR_LIGHTS > 0
  dwNdl = saturate(dot(normal, directionalLights[0].direction));
  #endif
  // the print keeps its own values: the scene's light gives only the hue and the day/night level
  vec3 dwFull = dwSun + dwIndirect;
  float dwLevel = dot(dwFull, vec3(0.3, 0.55, 0.15));
  float dwDay = clamp(dwLevel / 1.4, 0.0, 1.0);
  vec3 dwHue = mix(vec3(1.0), dwFull / max(max(dwFull.r, max(dwFull.g, dwFull.b)), 1e-4), 0.45);
  float dwGrad = mix(uDwFlat, 1.0, dwNdl);
  vec3 dwColor = diffuseColor.rgb * dwHue * mix(uDwShadowTint, uDwLightTint * dwGrad, dwLit) * mix(0.22, 1.0, dwDay) * uDwExposure;
  reflectedLight.directDiffuse = dwColor;
  reflectedLight.indirectDiffuse = vec3(0.0);
}
`;

/** The Lambert direct term with a hard terminator and nearly flat lit faces. */
function lambertToonChunk() {
  return THREE.ShaderChunk.lights_lambert_pars_fragment.replace(
    "vec3 irradiance = dotNL * directLight.color;",
    "vec3 irradiance = smoothstep(0.0, 0.08, dotNL) * mix(0.82, 1.0, dotNL) * directLight.color;"
  );
}

export type DesertMaterialKind = "solid" | "cloth" | "decal" | "ground" | "instanced";

export type DesertMaterialOptions = {
  kind: DesertMaterialKind;
  /** World offset of the crop: object position + origin = source coordinates. */
  origin: THREE.Vector3;
  /** The shared haze color and amount (see createHaze). */
  haze: Haze;
};

/**
 * The desert's own distance haze. The scene fog of the island skies ends at about 140 m, which
 * hides a 480 m crop, so the desert materials do not use the scene fog. They fade to the scene's
 * fog color (or background color) over their own, longer distances (the game's haze layers
 * start at 250 m).
 */
export type Haze = { color: { value: THREE.Color }; amount: { value: number }; update(object: THREE.Object3D): void };

export function createHaze(): Haze {
  const color = { value: new THREE.Color("#e9dcc4") };
  const amount = { value: 0.85 };
  const linear = new THREE.Color();
  return {
    color,
    amount,
    update(object) {
      let root: THREE.Object3D = object;
      while (root.parent) root = root.parent;
      const scene = root as THREE.Scene;
      const fog = scene.fog as THREE.Fog | THREE.FogExp2 | null | undefined;
      const background = scene.background as THREE.Color | null | undefined;
      if (fog?.color) linear.copy(fog.color);
      else if (background && (background as THREE.Color).isColor) linear.copy(background);
      else linear.set("#e9dcc4");
      // the haze is mixed after the output conversion, as three.js mixes its fog
      color.value.copy(linear).convertLinearToSRGB();
    }
  };
}

const GLSL_HAZE = /* glsl */ `
{
  float dwD = length(vViewPosition);
  // less haze looking down through the thin layer of air than along the ground
  vec3 dwRay = inverseTransformDirection(normalize(-vViewPosition), viewMatrix);
  float dwSteep = smoothstep(0.25, 0.9, abs(dwRay.y));
  float dwHazeK = (1.0 - exp(-pow(max(dwD - 140.0, 0.0) / 900.0, 1.5))) * uDwHazeAmount * (1.0 - 0.8 * dwSteep);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, uDwHaze, dwHazeK);
}
`;

/** A desert surface material (MeshLambertMaterial with the print shading). */
export function desertMaterial({ kind, origin, haze }: DesertMaterialOptions): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    fog: false,
    // the print's colors are final: no tone mapping (the ink composite has none)
    toneMapped: false,
    vertexColors: kind !== "ground" && kind !== "instanced",
    side: kind === "cloth" || kind === "decal" ? THREE.DoubleSide : THREE.FrontSide
  });
  if (kind === "decal") {
    m.polygonOffset = true;
    m.polygonOffsetFactor = -2;
    m.polygonOffsetUnits = -4;
  }
  const strata = kind === "solid";
  const ground = kind === "ground";
  const palette: THREE.Vector3[] = [];
  for (const p of STRATA_PALETTES) for (const c of p) {
    const col = new THREE.Color(c);
    palette.push(new THREE.Vector3(col.r, col.g, col.b));
  }
  const uniforms = {
    uDwOrigin: { value: origin.clone() },
    uDwLightTint: { value: LIGHT_TINT.clone() },
    uDwShadowTint: { value: SHADOW_TINT.clone() },
    uDwInk: { value: INK.clone() },
    uDwPalette: { value: palette },
    // how dark a lit face turned from the sun gets (1 = flat print), and the print's exposure
    uDwFlat: { value: ground ? 0.6 : kind === "cloth" ? 0.85 : 0.78 },
    uDwExposure: { value: 1.0 },
    uDwHaze: haze.color,
    uDwHazeAmount: haze.amount
  };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uDwOrigin;
varying vec3 vDwPos;
varying vec3 vDwNormal;
${strata ? "attribute vec2 strata;\nvarying vec2 vDwStrata;" : ""}`
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vDwPos = position + uDwOrigin;
vDwNormal = normal;
${strata ? "vDwStrata = strata;" : ""}`
      );
    const strataColor = /* glsl */ `
      if (vDwStrata.x >= 0.0) {
        float size = vDwStrata.y;
        float t = (vDwPos.y + (dwNoise(vDwPos.xz * 0.04) - 0.5) * size * 0.9) / size;
        float gt = max(length(vec2(dFdx(t), dFdy(t))), 1e-6);
        float band = floor(t);
        float h = fract(sin(band * 12.9898) * 43758.5453);
        int p = int(vDwStrata.x + 0.5) * 3;
        vec3 c1 = uDwPalette[p];
        vec3 c2 = uDwPalette[p + 1];
        vec3 c3 = uDwPalette[p + 2];
        vec3 c = h < 0.4 ? c1 : (h < 0.75 ? c2 : c3);
        vec3 mean = c1 * 0.4 + c2 * 0.35 + c3 * 0.25;
        float near = smoothstep(2.5, 5.0, 1.0 / gt);
        diffuseColor.rgb = mix(mean, c, near);
        float hb = fract(sin((band - 1.0) * 12.9898) * 43758.5453);
        float changes = step(0.001, abs((h < 0.4 ? 0.0 : (h < 0.75 ? 1.0 : 2.0)) - (hb < 0.4 ? 0.0 : (hb < 0.75 ? 1.0 : 2.0))));
        float e = fract(t) / gt;
        dwInkAmount = max(dwInkAmount, (1.0 - smoothstep(0.6, 1.6, e)) * changes * near * 0.75);
      }`;
    const groundColor = /* glsl */ `
      {
        vec2 gp = vDwPos.xz;
        float f = sin(gp.x * 0.0021) * cos(gp.y * 0.0017 - 0.7) + 0.5 * sin((gp.x + gp.y) * 0.0011);
        vec2 bw = vec2(smoothstep(0.3, 0.6, f), 1.0 - smoothstep(-0.6, -0.3, f));
        vec3 c1 = mix(mix(vec3(0.933, 0.753, 0.486), vec3(0.918, 0.718, 0.620), bw.x), vec3(0.922, 0.902, 0.847), bw.y);
        vec3 c2 = mix(mix(vec3(0.957, 0.839, 0.635), vec3(0.953, 0.804, 0.722), bw.x), vec3(0.965, 0.949, 0.910), bw.y);
        vec3 c3 = mix(mix(vec3(0.851, 0.584, 0.369), vec3(0.788, 0.514, 0.435), bw.x), vec3(0.725, 0.714, 0.776), bw.y);
        float slope = 1.0 - normalize(vDwNormal).y;
        float patches = dwNoise(gp * 0.011) * 0.65 + dwNoise(gp * 0.045) * 0.35;
        vec3 albedo = patches > 0.6 ? c2 : c1;
        if (slope > 0.42) albedo = c3;
        else if (slope > 0.30 && patches < 0.45) albedo = mix(c1, c3, 0.5);
        // the palette is in sRGB; the shading works in linear light
        diffuseColor.rgb = pow(albedo, vec3(2.2));
        // the patch edges, inked as the game's color-edge lines are
        float pw = max(fwidth(patches), 1e-5);
        float edge = 1.0 - smoothstep(0.5, 1.5, abs(patches - 0.6) / pw);
        float sw = max(fwidth(slope), 1e-5);
        edge = max(edge, 1.0 - smoothstep(0.5, 1.5, abs(slope - 0.42) / sw));
        float depthFade = 1.0 - smoothstep(120.0, 600.0, length(vViewPosition));
        dwInkAmount = max(dwInkAmount, edge * 0.55 * depthFade);
        // wind ripples (1.6 m, in broken patches) and long wind lines over the dunes (9 m)
        vec2 across = vec2(0.82, 0.57);
        float along = dot(gp, vec2(-across.y, across.x));
        float u = dot(gp, across) / 1.6 + (dwNoise(gp * 0.11) - 0.5) * 2.4 + (dwNoise(gp * 0.5) - 0.5) * 0.25;
        float patchN = dwNoise(gp * 0.025 + 3.0);
        float patchMask = smoothstep(0.66, 0.78, patchN);
        float broken = smoothstep(0.42, 0.62, dwNoise(vec2(along * 0.35, floor(u) * 7.1)));
        float rip = dwLines(u, 0.01875, broken, 0.5) * patchMask * (1.0 - smoothstep(0.1, 0.25, slope));
        float w = dot(gp, across) / 9.0 + (dwNoise(gp * 0.018 + 5.0) - 0.5) * 3.0;
        float keep = step(0.62, dwHash(vec2(floor(w), 4.7))) * smoothstep(0.3, 0.5, dwNoise(vec2(along * 0.025, floor(w) * 3.1)));
        float wind = dwLines(w, 0.00889, keep, 0.25) * (1.0 - smoothstep(0.2, 0.38, slope)) * (1.0 - smoothstep(0.6, 0.8, patchN));
        dwInkAmount = max(dwInkAmount, max(rip, wind * 0.85) * (1.0 - bw.y) * depthFade);
        // small darker spots on the sand
        vec2 cell = gp / 11.0;
        vec2 id = floor(cell);
        vec2 hc = vec2(dwHash(id + 41.0), dwHash(id + 77.0));
        float r = 1.3 / 11.0 * (0.55 + 0.9 * hc.y);
        vec2 cc = 0.5 + (hc - 0.5) * (0.9 - 2.0 * r);
        float bd = length((fract(cell) - cc) * vec2(1.0, 1.0 + 0.8 * hc.x)) + (dwNoise(gp / 1.3 * 1.4 + 41.0) - 0.5) * r * 0.9;
        float aa = max(fwidth(cell.x), 1e-5);
        float blob = (1.0 - smoothstep(r - aa, r + aa, bd)) * step(dwHash(id + 44.1), 0.35);
        diffuseColor.rgb *= mix(vec3(1.0), vec3(0.93, 0.915, 0.95), blob);
        dwGroundSlope = slope;
      }`;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 uDwLightTint;
uniform vec3 uDwShadowTint;
uniform vec3 uDwInk;
uniform vec3 uDwPalette[${palette.length}];
uniform float uDwFlat;
uniform float uDwExposure;
uniform vec3 uDwHaze;
uniform float uDwHazeAmount;
varying vec3 vDwPos;
varying vec3 vDwNormal;
${strata ? "varying vec2 vDwStrata;" : ""}
float dwInkAmount = 0.0;
float dwLitShare = 1.0;
float dwGroundSlope = 0.0;
${GLSL_NOISE}`
      )
      .replace("#include <lights_lambert_pars_fragment>", lambertToonChunk())
      .replace("#include <dithering_fragment>", `#include <dithering_fragment>\n${GLSL_HAZE}`)
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
${strata ? strataColor : ""}
${ground ? groundColor : ""}`
      )
      .replace(
        "#include <aomap_fragment>",
        `#include <aomap_fragment>
${GLSL_TOON}
{
  vec3 dwOut = reflectedLight.directDiffuse;
  ${
    ground
      ? `// pen hatching in the shade of the ground, laid from above
  float hs = dot(vDwPos.xz, vec2(0.7071, 0.7071)) / 0.55;
  float hatch = dwLines(hs, 0.09, 1.0, 0.5) * (1.0 - dwLitShare) * (1.0 - smoothstep(60.0, 260.0, length(vViewPosition)));
  dwOut = mix(dwOut, dwOut * uDwShadowTint * 0.72, hatch * 0.55);`
      : ""
  }
  vec3 inkC = mix(uDwInk, dwOut * 0.45, 0.35);
  dwOut = mix(dwOut, inkC, clamp(dwInkAmount, 0.0, 1.0));
  reflectedLight.directDiffuse = dwOut;
}`
      );
  };
  m.customProgramCacheKey = () => `desert-world-${kind}`;
  return m;
}

/** Glowing parts (flames, a gem): flat color, no shading. */
export function desertGlowMaterial() {
  return new THREE.MeshBasicMaterial({ color: 0xffffff, vertexColors: true, fog: false, toneMapped: false });
}

/**
 * Ink outlines (inverted hull): back faces pushed out along their normals by a fixed number of
 * screen pixels, drawn in ink. Shares the geometry of the mesh it outlines.
 */
export function desertOutlineMaterial(haze: Haze, widthPx = 1.4): THREE.ShaderMaterial {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uWidth: { value: widthPx },
      uViewport: { value: new THREE.Vector2(1920, 1080) },
      uInk: { value: INK.clone() },
      uDwHaze: haze.color,
      uDwHazeAmount: haze.amount
    },
    vertexShader: /* glsl */ `
      #include <common>
      uniform float uWidth;
      varying vec3 vViewPosition;
      uniform vec2 uViewport;
      void main() {
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
        p = instanceMatrix * p;
        n = mat3(instanceMatrix) * n;
        #endif
        vec4 mvPosition = modelViewMatrix * p;
        vec3 nv = normalize(normalMatrix * n);
        vec4 clip = projectionMatrix * mvPosition;
        vec2 dir = (projectionMatrix * vec4(nv, 0.0)).xy;
        float l = length(dir);
        dir = l > 1e-5 ? dir / l : vec2(0.0);
        clip.xy += dir * uWidth * 2.0 / uViewport * clip.w;
        gl_Position = clip;
        vViewPosition = -mvPosition.xyz;
      }`,
    fragmentShader: /* glsl */ `
      #include <common>
      uniform vec3 uInk;
      uniform vec3 uDwHaze;
      uniform float uDwHazeAmount;
      varying vec3 vViewPosition;
      void main() {
        gl_FragColor = vec4(uInk, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${GLSL_HAZE}
      }`,
    side: THREE.BackSide,
    toneMapped: false
  });
  return m;
}

const viewport = new THREE.Vector2();
/** Keep an outline mesh's pixel width right for the canvas it draws into. */
export function trackViewport(mesh: THREE.Mesh, material: THREE.ShaderMaterial) {
  mesh.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(viewport);
    (material.uniforms.uViewport.value as THREE.Vector2).copy(viewport);
  };
}
