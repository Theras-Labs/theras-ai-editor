// Puddles: small, thin water patches that lie on the ground and follow its shape (the desert
// dunes, the island slopes, a flat street). A water surface (water:lagoon, water:murky-pond)
// is a flat disk tens of meters wide that needs a hollow; a puddle needs none.
//
// The mesh is a polar grid with an uneven rim (seeded). Each vertex is put on the ground under
// it (island terrain or a library place), 1.2 cm above it, again when the object moves and
// once a second (a terrain edit can change the ground). Reflection comes from the scene
// environment (the sky), so a puddle costs one draw call and no extra render pass.
import * as THREE from "three";
import { sceneGroundAt } from "../layout";
import type { ResourceEntry, ResourceInstance } from "../types";

const RINGS = 7;
const SEGMENTS = 40;
const LIFT = 0.012;
const REDRAPE_MS = 1000;

type PuddleLook = { radius: number; color: string; opacity: number; roughness: number; rim: string };

function seeded(seed: number) {
  let t = seed >>> 0 || 1;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function puddleGeometry(radius: number, seed: number): THREE.BufferGeometry {
  const rand = seeded(seed);
  // Rim radius by angle: a few soft lobes, so no two puddles have the same outline.
  const lobes = Array.from({ length: 4 }, (_, i) => ({ k: i + 2, a: 0.05 + rand() * (0.16 / (i + 1)), p: rand() * Math.PI * 2 }));
  const rimAt = (angle: number) => 1 + lobes.reduce((s, l) => s + l.a * Math.sin(l.k * angle + l.p), 0);
  const count = 1 + RINGS * SEGMENTS;
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 4);
  const uv = new Float32Array(count * 2);
  col.set([1, 1, 1, 1], 0);
  uv.set([0.5, 0.5], 0);
  for (let ring = 1; ring <= RINGS; ring++) {
    const t = ring / RINGS;
    for (let s = 0; s < SEGMENTS; s++) {
      const angle = (s / SEGMENTS) * Math.PI * 2;
      const r = radius * t * rimAt(angle);
      const i = 1 + (ring - 1) * SEGMENTS + s;
      pos[i * 3] = Math.cos(angle) * r;
      pos[i * 3 + 2] = Math.sin(angle) * r;
      // The edge fades out: wet sand, not a cut-out disk.
      const alpha = ring === RINGS ? 0 : ring === RINGS - 1 ? 0.55 : 1;
      col.set([1, 1, 1, alpha], i * 4);
      uv.set([0.5 + (pos[i * 3] / radius) * 0.5, 0.5 + (pos[i * 3 + 2] / radius) * 0.5], i * 2);
    }
  }
  const index: number[] = [];
  for (let s = 0; s < SEGMENTS; s++) index.push(0, 1 + ((s + 1) % SEGMENTS), 1 + s);
  for (let ring = 1; ring < RINGS; ring++) {
    const a0 = 1 + (ring - 1) * SEGMENTS;
    const b0 = 1 + ring * SEGMENTS;
    for (let s = 0; s < SEGMENTS; s++) {
      const s1 = (s + 1) % SEGMENTS;
      index.push(a0 + s, a0 + s1, b0 + s, a0 + s1, b0 + s1, b0 + s);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(col, 4));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function createPuddle(seed: number, look: PuddleLook): ResourceInstance {
  const geometry = puddleGeometry(look.radius, seed || 1);
  const material = new THREE.MeshStandardMaterial({
    color: look.color,
    roughness: look.roughness,
    metalness: 0.15,
    envMapIntensity: 1.6,
    transparent: true,
    opacity: look.opacity,
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  // Sky reflection without a reflection pass: the reflected ray picks a sky color between the
  // horizon (the scene fog color, which the sky sets) and the zenith, weighted by Fresnel, plus
  // a sun glint. A still puddle is flat, so the reflection uses the up vector, not the slope.
  const sky = {
    uHorizon: { value: new THREE.Color("#cfe3f2") },
    uZenith: { value: new THREE.Color("#5f97d2") },
    uSunDir: { value: new THREE.Vector3(0.3, 0.8, 0.2).normalize() },
    uSun: { value: 1 }
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, sky);
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vPuddleWorld;")
      .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvPuddleWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vPuddleWorld;\nuniform vec3 uHorizon;\nuniform vec3 uZenith;\nuniform vec3 uSunDir;\nuniform float uSun;"
      )
      .replace(
        "#include <fog_fragment>",
        `{
  vec3 V = normalize(vPuddleWorld - cameraPosition);
  vec3 R = reflect(V, vec3(0.0, 1.0, 0.0));
  vec3 skyColor = mix(uHorizon, uZenith, pow(clamp(R.y, 0.0, 1.0), 0.6));
  float fresnel = 0.04 + 0.96 * pow(1.0 - clamp(-V.y, 0.0, 1.0), 5.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, skyColor, mix(0.45, 0.95, fresnel));
  gl_FragColor.rgb += vec3(1.0, 0.96, 0.88) * pow(max(dot(R, uSunDir), 0.0), 600.0) * 3.0 * uSun;
}
#include <fog_fragment>`
      );
  };
  material.customProgramCacheKey = () => "theras-puddle";
  // A darker damp ring under the water, wider than it: the wet ground at the edge.
  const rimGeometry = geometry.clone();
  rimGeometry.scale(1.18, 1, 1.18);
  const rimMaterial = new THREE.MeshBasicMaterial({
    color: look.rim,
    transparent: true,
    opacity: 0.28,
    vertexColors: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1
  });
  const water = new THREE.Mesh(geometry, material);
  water.name = "Puddle water";
  water.renderOrder = 2;
  const rim = new THREE.Mesh(rimGeometry, rimMaterial);
  rim.name = "Wet ground";
  rim.renderOrder = 1;
  const object = new THREE.Group();
  object.name = "Puddle";
  object.add(rim, water);
  for (const mesh of [water, rim]) {
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    // Game mode: a puddle is not a step to walk over.
    mesh.userData.noCollide = true;
  }

  const lastMatrix = new THREE.Matrix4();
  let lastDrape = -Infinity;
  const v = new THREE.Vector3();
  const drape = (target: THREE.Mesh) => {
    const ground = sceneGroundAt();
    const attr = target.geometry.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < attr.count; i++) {
      v.set(attr.getX(i), 0, attr.getZ(i));
      object.localToWorld(v);
      const h = ground?.(v.x, v.z) ?? null;
      if (h === null) {
        attr.setY(i, 0);
        continue;
      }
      v.y = h + LIFT;
      object.worldToLocal(v);
      attr.setY(i, v.y);
    }
    attr.needsUpdate = true;
    target.geometry.computeVertexNormals();
    target.geometry.computeBoundingSphere();
  };
  // Runs only when the puddle is drawn; most frames it compares one matrix and returns.
  water.onBeforeRender = (_renderer, scene) => {
    const now = performance.now();
    object.updateWorldMatrix(true, false);
    if (lastMatrix.equals(object.matrixWorld) && now - lastDrape < REDRAPE_MS) return;
    lastMatrix.copy(object.matrixWorld);
    lastDrape = now;
    drape(water);
    drape(rim);
    // The sky changes slowly (time of day): its colors and the sun are read once a second.
    const fog = scene.fog as THREE.Fog | THREE.FogExp2 | null;
    if (fog?.color) {
      sky.uHorizon.value.copy(fog.color);
      sky.uZenith.value.copy(fog.color).multiply(new THREE.Color(0.55, 0.78, 1.1));
    }
    let sun: THREE.DirectionalLight | null = null;
    scene.traverseVisible((o) => {
      if (!sun && (o as THREE.DirectionalLight).isDirectionalLight) sun = o as THREE.DirectionalLight;
    });
    const light = sun as THREE.DirectionalLight | null;
    if (light) {
      light.updateWorldMatrix(true, false);
      light.target.updateWorldMatrix(true, false);
      sky.uSunDir.value.setFromMatrixPosition(light.matrixWorld).sub(v.setFromMatrixPosition(light.target.matrixWorld)).normalize();
      sky.uSun.value = Math.min(1, light.intensity);
    } else {
      sky.uSun.value = 0;
    }
  };
  // The bounding sphere is for the flat shape until the first drape: never cull it before then.
  water.frustumCulled = false;
  rim.frustumCulled = false;

  return {
    object,
    dispose() {
      geometry.dispose();
      rimGeometry.dispose();
      material.dispose();
      rimMaterial.dispose();
    }
  };
}

const PUDDLES: { slug: string; name: string; look: PuddleLook; tags: string[]; description: string }[] = [
  {
    slug: "puddle",
    name: "Rain puddle",
    look: { radius: 1.2, color: "#3b4650", opacity: 0.82, roughness: 0.03, rim: "#1c1712" },
    tags: ["puddle", "rain", "wet", "small", "street", "reflection", "after rain"],
    description: "A small rain puddle, about 2.4 m across, that lies on the ground and follows its shape (dunes, slopes, streets). It mirrors the sky. Scale it for a bigger or smaller one."
  },
  {
    slug: "puddle-muddy",
    name: "Muddy puddle",
    look: { radius: 1.5, color: "#5a4632", opacity: 0.9, roughness: 0.12, rim: "#2a1d12" },
    tags: ["puddle", "mud", "muddy", "wet", "small", "path", "farm"],
    description: "A brown muddy puddle, about 3 m across, that lies on the ground and follows its shape. Scale it for a bigger or smaller one."
  }
];

export const PUDDLE_ENTRIES: ResourceEntry[] = PUDDLES.map((p) => ({
  id: `water:${p.slug}`,
  name: p.name,
  kind: "water",
  source: "local",
  origin: "Theras",
  license: "MIT",
  tags: ["water", ...p.tags],
  description: p.description,
  footprint: p.look.radius,
  create: (seed) => createPuddle(seed, p.look)
}));
