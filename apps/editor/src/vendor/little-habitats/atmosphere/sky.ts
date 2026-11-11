// Ports index-BwioI7A7.js lines 16537-16804: the sky dome (gradient, sun glow, stars, moon, sun disc, clouds,
// rainbow, shooting star) and its ENV_MODE copy that is rendered into a cube map for the scene environment.
import * as THREE from 'three';
import type { AtmosphereState } from './state';

export const SKY_VERTEX = `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = gl_Position.w; // sit exactly on the far plane
}`; // as (16537)

export const SKY_FRAGMENT = `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uFog;
uniform vec3 uGlow;
uniform vec3 uSunColor;
uniform vec3 uMoonColor;
uniform vec3 uCloudLit;
uniform vec3 uCloudShade;
uniform vec3 uGround;
uniform vec3 uSunPos;   // true sun direction (may be below the horizon)
uniform vec3 uMoonPos;
uniform float uSunDisc;
uniform float uGlowI;
uniform float uMoonI;
uniform float uStars;
uniform float uTime;
uniform float uCloudCover;
uniform float uCloudStyle; // Theras: 0 = Island kit wisps, 1 = stylized cumulus
uniform vec2 uCloudOffset;
uniform float uRainbow;
uniform vec4 uShootHead;  // xyz direction, w brightness
uniform vec3 uShootTail;
varying vec3 vDir;

float h13(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float h12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h12(i), h12(i + vec2(1.0, 0.0)), u.x), mix(h12(i + vec2(0.0, 1.0)), h12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + vec2(17.1, 3.7); a *= 0.5; }
  return s;
}

void main() {
  vec3 dir = normalize(vDir);
  float h = dir.y;
  float hp = max(h, 0.0);

  // ---- gradient: horizon band rises quickly into the zenith colour ----
  // horizon colour only in the lowest few degrees, then a quick climb into the zenith colour.
  float g = 1.0 - exp(-hp * 5.5);
  g = smoothstep(0.0, 1.0, g);
  vec3 sky = mix(uHorizon, uZenith, g);
  // a soft brighter haze line hugging the horizon
  sky += uHorizon * 0.1 * exp(-hp * 22.0);

  // ---- sun glow ----
  float cs = dot(dir, uSunPos);
  float csp = max(cs, 0.0);
  float sunVis = smoothstep(-0.28, 0.02, uSunPos.y);
  float low = 1.0 - smoothstep(0.05, 0.6, uSunPos.y);
  vec2 dh = normalize(dir.xz + vec2(1e-5));
  vec2 sh = normalize(uSunPos.xz + vec2(1e-5));
  float az = max(dot(dh, sh), 0.0);
  float horizonGlow = pow(az, 3.0) * exp(-hp * 4.5) * low;
  float mie = pow(csp, 10.0) * 0.55 + pow(csp, 90.0) * 0.9;
  float aboveMask = smoothstep(-0.04, 0.05, h);
  sky += uGlow * (mie + horizonGlow * 0.9) * uGlowI * sunVis * aboveMask;

#ifndef ENV_MODE
  // ---- stars ----
  if (uStars > 0.001 && h > 0.0) {
    vec3 sp = dir * 170.0;
    vec3 cell = floor(sp);
    float r = h13(cell);
    if (r > 0.94) {
      vec3 jit = vec3(h13(cell + 11.3), h13(cell + 23.7), h13(cell + 37.1));
      float d = length(fract(sp) - 0.2 - jit * 0.6);
      float tw = 0.55 + 0.45 * sin(uTime * (1.2 + r * 3.0) + r * 91.0);
      float big = smoothstep(0.985, 1.0, r);
      float star = smoothstep(0.2 + big * 0.12, 0.0, d) * tw * (0.5 + big * 3.0);
      vec3 sc = mix(vec3(0.85, 0.9, 1.0), vec3(1.0, 0.9, 0.75), h13(cell + 5.0));
      sky += sc * star * uStars * smoothstep(0.0, 0.25, h) * 1.4;
    }
  }
#endif

  // ---- moon ----
  float cm = dot(dir, uMoonPos);
  float cmp = max(cm, 0.0);
  sky += uMoonColor * (pow(cmp, 60.0) * 0.25 + pow(cmp, 600.0) * 0.4) * uMoonI * aboveMask;
#ifndef ENV_MODE
  float moonR = 0.045;
  float md = acos(clamp(cm, -1.0, 1.0));
  if (md < moonR * 1.5 && uMoonI > 0.0) {
    vec3 mt = normalize(cross(uMoonPos, vec3(0.0, 1.0, 0.0)) + vec3(1e-4));
    vec3 mb = cross(mt, uMoonPos);
    vec2 mp = vec2(dot(dir, mt), dot(dir, mb)) / moonR;
    float disc = smoothstep(1.0, 0.92, length(mp));
    float craters = vnoise(mp * 3.0 + 4.0) * 0.6 + vnoise(mp * 7.0) * 0.4;
    vec3 mc = vec3(1.0, 0.97, 0.9) * (0.82 + 0.18 * craters);
    sky = mix(sky, mc * 2.4, disc * uMoonI * aboveMask);
  }

  // ---- sun disc ----
  float disc = smoothstep(0.99955, 0.99975, cs);
  sky += uSunColor * disc * uSunDisc * smoothstep(-0.02, 0.02, h);
#endif

  // ---- clouds ----
  // Theras: stylized cumulus. Domain-warped noise gives puffy shapes with crisp edges; the light
  // is cel-banded (shaded underside, lit top) with a bright rim on thin edges near the sun.
  if (uCloudStyle > 0.5 && h > 0.0 && uCloudCover > 0.01) {
    vec2 uv = dir.xz / (h + 0.12) * 0.62 + uCloudOffset * 0.7;
    vec2 warp = vec2(fbm(uv * 1.6 + 3.1), fbm(uv * 1.6 + 7.9)) - 0.5;
    vec2 p = uv + warp * 0.6;
    float n = fbm(p) * 0.8 + fbm(p * 3.1 + 11.0) * 0.3 - 0.05;
    float edge = 0.55 - uCloudCover * 0.32;
    float dens = smoothstep(edge, edge + 0.05, n);
    if (dens > 0.001) {
      vec2 toLight = normalize(uSunPos.xz + vec2(1e-4)) * 0.08;
      vec2 pl = p + toLight;
      float nl = fbm(pl) * 0.8 + fbm(pl * 3.1 + 11.0) * 0.3 - 0.05;
      float light = clamp((n - nl) * 7.0 + 0.55, 0.0, 1.0);
      float band = smoothstep(0.38, 0.46, light) * 0.65 + smoothstep(0.7, 0.78, light) * 0.35;
      vec3 shade = mix(uCloudShade, uZenith, 0.22);
      vec3 cc = mix(shade, uCloudLit * 1.06 + vec3(0.03), band);
      float rim = 1.0 - smoothstep(edge, edge + 0.07, n);
      cc += uGlow * rim * (0.2 + 1.1 * pow(csp, 5.0)) * uGlowI;
      cc = mix(cc, uHorizon, (1.0 - smoothstep(0.02, 0.4, h)) * 0.5);
      sky = mix(sky, cc, dens * smoothstep(0.0, 0.07, h));
    }
  } else if (h > 0.0 && uCloudCover > 0.01) {
    vec2 uv = dir.xz / (h + 0.18) * 1.35 + uCloudOffset;
    float n = fbm(uv);
    float edge = 0.47 + (0.5 - uCloudCover) * 0.42;
    float dens = smoothstep(edge, edge + 0.12, n);
    if (dens > 0.001) {
      vec2 toLight = normalize(uSunPos.xz + vec2(1e-4)) * 0.16;
      float n2 = fbm(uv + toLight);
      float lit = clamp(0.62 + (n - n2) * 3.2, 0.0, 1.0);
      float thick = smoothstep(edge, edge + 0.3, n);
      vec3 cc = mix(uCloudShade, uCloudLit, lit * (1.0 - thick * 0.35));
      // silver lining when near the sun
      cc += uGlow * pow(csp, 6.0) * (1.0 - thick) * 0.9 * uGlowI;
      float fade = smoothstep(0.015, 0.22, h);
      sky = mix(sky, cc, dens * fade * 0.92);
    }
  }

  // ---- rainbow (after a shower, opposite the sun) ----
  if (uRainbow > 0.001 && h > 0.0) {
    float ang = acos(clamp(dot(dir, -uSunPos), -1.0, 1.0));
    float x = (ang - 0.695) / 0.045;            // 0 = inner (violet) … 1 = outer (red)
    float band = smoothstep(-0.1, 0.2, x) * smoothstep(1.1, 0.8, x);
    vec3 hue = clamp(abs(fract((1.0 - clamp(x, 0.0, 1.0)) * 0.78 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    vec3 bow = mix(vec3(1.0), hue, 0.62);
    // faint secondary bow, colours reversed
    float x2 = (ang - 0.885) / 0.06;
    float band2 = smoothstep(-0.1, 0.2, x2) * smoothstep(1.1, 0.8, x2) * 0.35;
    vec3 hue2 = clamp(abs(fract(clamp(x2, 0.0, 1.0) * 0.78 + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0);
    float inside = smoothstep(0.72, 0.4, ang) * 0.06;  // brighter sky inside the primary bow
    float vis = uRainbow * smoothstep(0.0, 0.12, h);
    sky += (bow * band * 0.32 + mix(vec3(1.0), hue2, 0.6) * band2 * 0.3 + inside) * vis * (0.4 + 0.6 * dot(sky, vec3(0.33)));
  }

#ifndef ENV_MODE
  // ---- shooting star ----
  if (uShootHead.w > 0.001) {
    vec3 a = uShootTail, b = uShootHead.xyz;
    vec3 ab = b - a;
    float tt = clamp(dot(dir - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    float d = length(dir - (a + ab * tt));
    float streak = smoothstep(0.0035, 0.0, d) * tt * tt;
    sky += vec3(1.0, 0.96, 0.9) * streak * uShootHead.w * 4.0;
  }
#endif

  // ---- below the horizon: melt into the fog colour (the lake fades into this) ----
#ifdef ENV_MODE
  vec3 below = mix(uFog, uGround, smoothstep(0.0, -0.35, h));
#else
  vec3 below = uFog;
#endif
  sky = mix(below, sky, smoothstep(-0.025, 0.035, h));

  gl_FragColor = vec4(sky, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`; // os (16545)

export function createSky() { // ss (16707)
  const uniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uFog: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() },
    uSunColor: { value: new THREE.Color() },
    uMoonColor: { value: new THREE.Color() },
    uCloudLit: { value: new THREE.Color() },
    uCloudShade: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunPos: { value: new THREE.Vector3(0, 1, 0) },
    uMoonPos: { value: new THREE.Vector3(0, -1, 0) },
    uSunDisc: { value: 0 },
    uGlowI: { value: 1 },
    uMoonI: { value: 0 },
    uStars: { value: 0 },
    uTime: { value: 0 },
    uCloudCover: { value: 0.3 },
    uCloudStyle: { value: 0 },
    uCloudOffset: { value: new THREE.Vector2() },
    uRainbow: { value: 0 },
    uShootHead: { value: new THREE.Vector4(0, 1, 0, 0) },
    uShootTail: { value: new THREE.Vector3(0, 1, 0) },
  };
  const material = new THREE.ShaderMaterial({
    name: 'ScaperSky',
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const geometry = new THREE.SphereGeometry(1, 48, 24);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = 1e4;
  mesh.scale.setScalar(400);
  mesh.matrixAutoUpdate = true;

  const envMaterial = new THREE.ShaderMaterial({
    name: 'ScaperSkyEnv',
    uniforms,
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    defines: { ENV_MODE: '' },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const envMesh = new THREE.Mesh(geometry, envMaterial);
  envMesh.frustumCulled = false;
  envMesh.scale.setScalar(10);
  const envScene = new THREE.Scene();
  envScene.add(envMesh);
  let cubeTarget: THREE.WebGLCubeRenderTarget | null = null;
  let cubeCamera: THREE.CubeCamera | null = null;
  let pmrem: THREE.PMREMGenerator | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;

  return {
    mesh,
    uniforms,
    update(
      look: AtmosphereState,
      sunPos: THREE.Vector3,
      moonPos: THREE.Vector3,
      cloudOffset: THREE.Vector2,
      time: number,
      camera: THREE.PerspectiveCamera,
    ) {
      uniforms.uZenith.value.copy(look.zenith);
      uniforms.uHorizon.value.copy(look.horizon);
      uniforms.uFog.value.copy(look.fog);
      uniforms.uGlow.value.copy(look.glow);
      uniforms.uSunColor.value.copy(look.sunColor);
      uniforms.uMoonColor.value.copy(look.moonColor);
      uniforms.uCloudLit.value.copy(look.cloudLit);
      uniforms.uCloudShade.value.copy(look.cloudShade);
      uniforms.uGround.value.copy(look.hemiGround).multiplyScalar(0.5);
      uniforms.uSunPos.value.copy(sunPos);
      uniforms.uMoonPos.value.copy(moonPos);
      uniforms.uSunDisc.value = 14 * (1 - look.rain * 0.9);
      uniforms.uGlowI.value = look.glowI;
      uniforms.uMoonI.value = look.stars * (1 - look.rain);
      uniforms.uStars.value = look.stars;
      uniforms.uTime.value = time;
      uniforms.uCloudCover.value = look.cloudCover;
      uniforms.uCloudOffset.value.copy(cloudOffset);
      mesh.position.copy(camera.position);
      const far = camera.far ?? 600;
      mesh.scale.setScalar(Math.min(400, far * 0.8));
    },
    /** Renders the ENV_MODE sky into a cube map and returns its PMREM texture (null on failure). */
    updateEnv(renderer: THREE.WebGLRenderer): THREE.Texture | null {
      try {
        if (!cubeTarget) {
          cubeTarget = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType, generateMipmaps: false });
          cubeCamera = new THREE.CubeCamera(0.1, 50, cubeTarget);
          pmrem = new THREE.PMREMGenerator(renderer);
        }
        const toneMapping = renderer.toneMapping;
        renderer.toneMapping = THREE.NoToneMapping;
        cubeCamera!.update(renderer, envScene);
        renderer.toneMapping = toneMapping;
        envTarget = pmrem!.fromCubemap(cubeTarget.texture, envTarget);
        return envTarget.texture;
      } catch (e) {
        console.warn('[atmosphere] env map failed', e);
        return null;
      }
    },
    setToneMapped(toneMapped: boolean) {
      material.toneMapped = toneMapped;
      material.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      envMaterial.dispose();
      cubeTarget?.dispose();
      envTarget?.dispose();
      pmrem?.dispose();
    },
  };
}
export type Sky = ReturnType<typeof createSky>;
