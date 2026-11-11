// Build reveal: a node that the AI just created grows from the bottom up with a glowing
// edge band. Method adapted from folio-2025 (MIT, Bruno Simon), Game/Materials/MeshDefaultMaterial.js:
// discard past a moving front and paint a thin band at the front in a bright color.
// That version is WebGPU TSL; this one patches WebGL MeshStandardMaterial with onBeforeCompile.
//
// Client-only effect. No network, no server, no timers: the animation runs in useFrame
// only while a reveal is active.

import { useFrame } from "@react-three/fiber";
import { Box3, Color, type Material, type Object3D, type Mesh } from "three";

/** Reveal length. Override for demos or debugging: localStorage "theras:revealMs" (100 to 20000). */
export const BUILD_REVEAL_DURATION_MS = readRevealMs(900);

function readRevealMs(fallback: number): number {
  try {
    const v = Number(localStorage.getItem("theras:revealMs"));
    return v >= 100 && v <= 20000 ? v : fallback;
  } catch {
    return fallback;
  }
}
const EDGE_COLOR = new Color("#5cf2b0");

type RevealUniforms = {
  uRevealProgress: { value: number };
  uRevealMinY: { value: number };
  uRevealMaxY: { value: number };
  uRevealColor: { value: Color };
};

type RevealEntry = { start: number; minY: number; maxY: number; boundsReady: boolean };

const entries = new Map<string, RevealEntry>();
const debug = (() => {
  try {
    return localStorage.getItem("theras:revealDebug") === "1";
  } catch {
    return false;
  }
})();

/** Start a reveal for nodes that were just created. delayMs keeps a node hidden that long first. */
export function markBuildReveal(nodeIds: Iterable<string>, delayMs = 0) {
  const start = performance.now() + delayMs;
  for (const id of nodeIds) {
    entries.set(id, { start, minY: 0, maxY: 1, boundsReady: false });
    if (debug) console.debug("[build-reveal] mark", id);
  }
}

/** True while a node waits for or plays its reveal. */
export function hasPendingReveal(nodeId: string) {
  return entries.has(nodeId);
}

/** performance.now() time at which a node's reveal starts (it may be in the future). */
export function revealStartOf(nodeId: string): number | undefined {
  return entries.get(nodeId)?.start;
}

/** Each material gets its own uniforms, kept in userData, so a material can be revealed again later. */
function ensurePatched(material: Material): RevealUniforms {
  const existing = material.userData.therasReveal as RevealUniforms | undefined;
  if (existing) return existing;

  const uniforms: RevealUniforms = {
    uRevealProgress: { value: 0 },
    uRevealMinY: { value: 0 },
    uRevealMaxY: { value: 1 },
    uRevealColor: { value: EDGE_COLOR.clone() }
  };
  material.userData.therasReveal = uniforms;

  const baseOnBeforeCompile = material.onBeforeCompile;
  const baseCacheKey = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${baseCacheKey?.() ?? ""}|theras-build-reveal`;
  material.onBeforeCompile = (shader, renderer) => {
    baseOnBeforeCompile.call(material, shader, renderer);
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vRevealWorld;")
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvRevealWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;"
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vRevealWorld;
uniform float uRevealProgress;
uniform float uRevealMinY;
uniform float uRevealMaxY;
uniform vec3 uRevealColor;
float revealFront;
float revealH;`
      )
      .replace(
        "#include <clipping_planes_fragment>",
        `#include <clipping_planes_fragment>
revealH = (vRevealWorld.y - uRevealMinY) / max(uRevealMaxY - uRevealMinY, 0.001);
revealH += (fract(sin(dot(floor(vRevealWorld.xz * 8.0), vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.08;
revealFront = uRevealProgress * 1.2 - 0.1;
if (revealH > revealFront) discard;`
      )
      .replace(
        "#include <opaque_fragment>",
        `#include <opaque_fragment>
float revealEdge = 1.0 - smoothstep(0.0, 0.08, revealFront - revealH);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uRevealColor * 2.5, revealEdge * step(uRevealProgress, 0.999));`
      );
    if (debug) console.debug("[build-reveal] shader patched", material.uuid);
  };
  material.needsUpdate = true;
  return uniforms;
}

const box = new Box3();

function forEachMaterial(object: Object3D, fn: (material: Material) => void) {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) if (material) fn(material);
  });
}

/**
 * Animates the reveal of one node's rendered object. It checks the reveal list every
 * frame (one Map lookup, and nothing at all while no reveal is active), so it does not
 * depend on whether React rendered the node before or after markBuildReveal ran.
 * Use only for objects whose materials are not shared with other nodes.
 */
export function useBuildReveal(nodeId: string, object: Object3D | null) {
  useFrame(() => {
    if (entries.size === 0 || !object) return;
    const entry = entries.get(nodeId);
    if (!entry) return;

    if (!entry.boundsReady) {
      object.updateWorldMatrix(true, true);
      box.setFromObject(object);
      if (box.isEmpty()) return;
      entry.minY = box.min.y;
      entry.maxY = box.max.y;
      entry.boundsReady = true;
    }

    const t = Math.max(0, Math.min(1, (performance.now() - entry.start) / BUILD_REVEAL_DURATION_MS));
    const progress = t >= 1 ? 2 : 1 - Math.pow(1 - t, 3); // easeOutCubic; 2 = fully shown

    forEachMaterial(object, (material) => {
      const u = ensurePatched(material);
      u.uRevealProgress.value = progress;
      u.uRevealMinY.value = entry.minY;
      u.uRevealMaxY.value = entry.maxY;
    });

    if (t >= 1) {
      entries.delete(nodeId);
      if (debug) console.debug("[build-reveal] done", nodeId);
    }
  });
}
