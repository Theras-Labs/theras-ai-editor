// Post processing for one viewport: ink lines (edge filter), glow, exposure and a color grade
// with vignette and grain. Values: sceneSettings.world.postFx (see lib/post-fx.ts).
//
// Mounted only when an effect is on. While mounted it draws the frame itself (useFrame priority
// 1 stops R3F's own render): scene -> ink lines -> glow -> tone mapping and sRGB (OutputPass) ->
// grade. The scene is drawn into a 4x multisampled half-float target with a depth texture,
// so edges stay smooth and the ink pass can read depth. In VR (WebXR presenting) the composer
// is skipped and the frame is drawn as usual: post passes do not work per eye.
import { useFrame, useThree } from "@react-three/fiber";
import type { ScenePostFx, SceneSettings } from "@theras/shared";
import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { FullScreenQuad, Pass } from "three/examples/jsm/postprocessing/Pass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { useSnapshot } from "valtio";
import { postFxActive, postFxStore } from "@/lib/post-fx";

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/**
 * Ink lines. Silhouettes: the Laplacian of 1/depth (zero on any flat surface at any angle, so
 * a wide ground seen from low does not fill with lines), relative to the pixel's own depth.
 * Inner lines: a Sobel filter on brightness. Lines fade out with distance.
 */
const INK_FRAGMENT = /* glsl */ `
#include <packing>
uniform sampler2D tDiffuse;
uniform sampler2D tDepth;
uniform vec2 resolution;
uniform float cameraNear;
uniform float cameraFar;
uniform bool ortho;
uniform float strength;
uniform float width;
uniform vec3 inkColor;
varying vec2 vUv;

float viewDepth(vec2 uv) {
  float d = texture2D(tDepth, uv).x;
  float z = ortho ? orthographicDepthToViewZ(d, cameraNear, cameraFar) : perspectiveDepthToViewZ(d, cameraNear, cameraFar);
  return max(-z, 1e-4);
}
float luma(vec2 uv) {
  vec3 c = texture2D(tDiffuse, uv).rgb;
  return dot(c / (1.0 + c), vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec4 base = texture2D(tDiffuse, vUv);
  vec2 px = width / resolution;
  float c = viewDepth(vUv);
  float wc = 1.0 / c;
  float wl = 1.0 / viewDepth(vUv + vec2(-px.x, 0.0));
  float wr = 1.0 / viewDepth(vUv + vec2(px.x, 0.0));
  float wt = 1.0 / viewDepth(vUv + vec2(0.0, px.y));
  float wb = 1.0 / viewDepth(vUv + vec2(0.0, -px.y));
  float lap = abs(wl + wr + wt + wb - 4.0 * wc) / wc;
  float silhouette = smoothstep(0.015, 0.06, lap);

  float tl = luma(vUv + vec2(-px.x, px.y));
  float t = luma(vUv + vec2(0.0, px.y));
  float tr = luma(vUv + vec2(px.x, px.y));
  float l = luma(vUv + vec2(-px.x, 0.0));
  float r = luma(vUv + vec2(px.x, 0.0));
  float bl = luma(vUv + vec2(-px.x, -px.y));
  float b = luma(vUv + vec2(0.0, -px.y));
  float br = luma(vUv + vec2(px.x, -px.y));
  float gx = (tr + 2.0 * r + br) - (tl + 2.0 * l + bl);
  float gy = (tl + 2.0 * t + tr) - (bl + 2.0 * b + br);
  float inner = smoothstep(0.18, 0.42, sqrt(gx * gx + gy * gy)) * 0.6;

  float fade = 1.0 - smoothstep(cameraFar * 0.12, cameraFar * 0.35, c);
  float edge = max(silhouette, inner) * fade * strength;
  gl_FragColor = vec4(mix(base.rgb, inkColor, clamp(edge, 0.0, 1.0)), base.a);
}`;

/** Display-space grade, after tone mapping: warmth, saturation, contrast, vignette, grain. */
const GRADE_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 resolution;
uniform float contrast;
uniform float saturation;
uniform float warmth;
uniform float vignette;
uniform float grain;
uniform float time;
varying vec2 vUv;

void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  c *= vec3(1.0 + warmth * 0.09, 1.0 + warmth * 0.015, 1.0 - warmth * 0.1);
  float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(lum), c, 1.0 + saturation);
  c = (c - 0.5) * (1.0 + contrast) + 0.5;
  vec2 d = vUv - 0.5;
  d.x *= resolution.x / resolution.y;
  c *= mix(1.0, smoothstep(0.95, 0.25, length(d)), vignette);
  float n = fract(sin(dot(floor(vUv * resolution) + fract(time) * 91.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  c += n * grain;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

class ShaderStep extends Pass {
  readonly material: THREE.ShaderMaterial;
  private readonly quad: FullScreenQuad;
  private readonly useDepth: boolean;

  constructor(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, useDepth: boolean) {
    super();
    this.useDepth = useDepth;
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, resolution: { value: new THREE.Vector2(1, 1) }, ...uniforms },
      vertexShader: QUAD_VERTEX,
      fragmentShader,
      depthTest: false,
      depthWrite: false
    });
    this.quad = new FullScreenQuad(this.material);
  }

  render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    const u = this.material.uniforms;
    u.tDiffuse!.value = readBuffer.texture;
    if (this.useDepth) u.tDepth!.value = readBuffer.depthTexture;
    (u.resolution!.value as THREE.Vector2).set(readBuffer.width, readBuffer.height);
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.material.dispose();
    this.quad.dispose();
  }
}

/** Draws the viewport with the scene's post effects, when any is on. */
export function PostFx({ sceneSettings }: { sceneSettings: SceneSettings }) {
  const snap = useSnapshot(postFxStore);
  const fx = (snap.live as ScenePostFx | null) ?? sceneSettings.world.postFx;
  return postFxActive(fx) ? <PostFxComposer fx={fx} /> : null;
}

function PostFxComposer({ fx }: { fx: ScenePostFx }) {
  const gl = useThree((s) => s.gl);
  const size = useThree((s) => s.size);

  const chain = useMemo(() => {
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    target.depthTexture = new THREE.DepthTexture(1, 1);
    const composer = new EffectComposer(gl, target);
    const render = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    const ink = new ShaderStep(
      INK_FRAGMENT,
      {
        cameraNear: { value: 0.1 },
        cameraFar: { value: 1000 },
        ortho: { value: false },
        strength: { value: 0 },
        width: { value: 1 },
        inkColor: { value: new THREE.Color() }
      },
      true
    );
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0, 0.4, 0.85);
    const output = new OutputPass();
    const grade = new ShaderStep(
      GRADE_FRAGMENT,
      {
        contrast: { value: 0 },
        saturation: { value: 0 },
        warmth: { value: 0 },
        vignette: { value: 0 },
        grain: { value: 0 },
        time: { value: 0 }
      },
      false
    );
    composer.addPass(render);
    composer.addPass(ink);
    composer.addPass(bloom);
    composer.addPass(output);
    composer.addPass(grade);
    return { composer, render, ink, bloom, grade };
  }, [gl]);

  useEffect(() => {
    chain.composer.setPixelRatio(Math.min(gl.getPixelRatio(), 2));
    chain.composer.setSize(Math.max(1, size.width), Math.max(1, size.height));
  }, [chain, gl, size.width, size.height]);

  useEffect(
    () => () => {
      chain.ink.dispose();
      chain.grade.dispose();
      chain.bloom.dispose();
      chain.composer.dispose();
    },
    [chain]
  );

  useFrame((state, delta) => {
    const { scene, camera } = state;
    if (gl.xr.isPresenting) {
      gl.render(scene, camera);
      return;
    }
    const { composer, render, ink, bloom, grade } = chain;
    render.scene = scene;
    render.camera = camera;

    ink.enabled = fx.outline > 0.001;
    if (ink.enabled) {
      const u = ink.material.uniforms;
      const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
      u.cameraNear!.value = cam.near;
      u.cameraFar!.value = cam.far;
      u.ortho!.value = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;
      u.strength!.value = fx.outline;
      u.width!.value = fx.outlineWidth;
      (u.inkColor!.value as THREE.Color).set(fx.outlineColor);
    }

    bloom.enabled = fx.bloom > 0.001;
    bloom.strength = fx.bloom;
    bloom.radius = fx.bloomRadius;
    bloom.threshold = fx.bloomThreshold;

    grade.enabled = Math.abs(fx.contrast) + Math.abs(fx.saturation) + Math.abs(fx.warmth) + fx.vignette + fx.grain > 0.001;
    if (grade.enabled) {
      const u = grade.material.uniforms;
      u.contrast!.value = fx.contrast;
      u.saturation!.value = fx.saturation;
      u.warmth!.value = fx.warmth;
      u.vignette!.value = fx.vignette;
      u.grain!.value = fx.grain;
      u.time!.value = state.clock.elapsedTime;
    }

    // Other code sets the exposure each frame (the island sky sets 1): scale it for this draw only.
    const exposure = gl.toneMappingExposure;
    gl.toneMappingExposure = exposure * fx.exposure;
    composer.render(delta);
    gl.toneMappingExposure = exposure;
  }, 1);

  return null;
}
