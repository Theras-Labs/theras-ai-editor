// The base trees of the library: trees and bushes with soft, round leaf clusters.
//
// Source: the tree kit of folio-2025 by Bruno Simon (MIT, see folio-tree-data.ts), which is also
// the author's tree kit. This file uses its trunk meshes, its leaf
// cluster layout, its leaf texture and its two-tone leaf shading.
//
// One thing is different. folio draws a cluster as 80 parallel cards that are turned to its
// fixed camera. The editor camera is free, so here each card turns to the camera in the vertex
// shader. A cluster then reads as a round mass from every side, also from above. The normals
// point out of the cluster center, so a cluster is shaded like one soft ball.
//
// Scale: 1 unit = 1 m. Each tree stands on y = 0 with its origin at the trunk base.
// Geometry and materials are cached by species and variant for the life of the page; an
// instance owns nothing, so there is nothing to release.
import * as THREE from "three";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../types";
import { FOLIAGE_SDF_PNG, FOLIO_TREE_MODELS } from "./folio-tree-data";

const ORIGIN = "folio-2025 by Bruno Simon";
const LICENSE = "MIT";
const TAU = Math.PI * 2;

/** Cards for a cluster of radius scale 1, and the card size, at folio's own values. */
const CLUSTER_CARDS = 80;
const CARD_SIZE = 0.8;
/** Shape variants and color variants that are built for one species. */
const SHAPE_VARIANTS = 6;
const TINT_VARIANTS = 5;

// ---------------------------------------------------------------------------------------------
// Random numbers
// ---------------------------------------------------------------------------------------------

/** Small seeded generator (mulberry32). */
function rng(seed: number): () => number {
  let a = (seed >>> 0) + 0x6d2b79f5;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// ---------------------------------------------------------------------------------------------
// Species
// ---------------------------------------------------------------------------------------------

type Leaf = [x: number, y: number, z: number, scale: number];

type Shape = {
  /** Trunk mesh of a folio model, or a straight tapered trunk, or no trunk (a bush). */
  trunk: { model: keyof typeof FOLIO_TREE_MODELS } | { height: number; base: number; top: number } | null;
  leaves: Leaf[];
};

type Species = {
  shape: Shape;
  /** Leaf color away from the light, and toward the light. */
  shade: string;
  lit: string;
  bark: string;
};

/** A conifer: a straight trunk with clusters that get smaller toward the top. */
const FIR_SHAPE: Shape = {
  trunk: { height: 7.6, base: 0.26, top: 0.06 },
  leaves: [
    [0.0, 2.15, 0.0, 1.22],
    [0.12, 3.25, -0.1, 1.08],
    [-0.1, 4.3, 0.08, 0.92],
    [0.06, 5.3, 0.06, 0.76],
    [-0.04, 6.25, -0.04, 0.6],
    [0.0, 7.1, 0.0, 0.44],
    [0.0, 7.8, 0.0, 0.27]
  ]
};

const BUSH_SHAPE: Shape = {
  trunk: null,
  leaves: [
    [0.0, 0.62, 0.0, 0.66],
    [0.62, 0.42, 0.18, 0.46],
    [-0.55, 0.4, -0.2, 0.44],
    [0.08, 0.36, -0.6, 0.4],
    [-0.1, 0.38, 0.58, 0.42]
  ]
};

const folioShape = (model: keyof typeof FOLIO_TREE_MODELS): Shape => ({ trunk: { model }, leaves: FOLIO_TREE_MODELS[model].leaves });

const SPECIES = {
  oak: { shape: folioShape("oak"), shade: "#3f8f3f", lit: "#a9d653", bark: "#9a5a2c" },
  "oak-golden": { shape: folioShape("oak"), shade: "#b4b536", lit: "#d8cf3b", bark: "#b76b31" },
  maple: { shape: folioShape("oak"), shade: "#c9402b", lit: "#f58a3c", bark: "#8a4f2a" },
  birch: { shape: folioShape("birch"), shade: "#67a843", lit: "#cbe86c", bark: "#f3e3d2" },
  "birch-autumn": { shape: folioShape("birch"), shade: "#ff4f2b", lit: "#ff903f", bark: "#ffe9d7" },
  cherry: { shape: folioShape("cherry"), shade: "#f0708f", lit: "#ffb9c6", bark: "#8f5234" },
  fir: { shape: FIR_SHAPE, shade: "#1f6a43", lit: "#62a858", bark: "#6e4a30" },
  bush: { shape: BUSH_SHAPE, shade: "#3f8f3f", lit: "#a9d653", bark: "#9a5a2c" }
} satisfies Record<string, Species>;

type SpeciesId = keyof typeof SPECIES;

// ---------------------------------------------------------------------------------------------
// Shared texture, uniforms and shader patches
// ---------------------------------------------------------------------------------------------

/** Time and wind for every leaf material. update() of each instance writes the time. */
const SHARED = {
  uFolTime: { value: 0 },
  /** x, y = wind direction on the ground (world x, z); z = strength (0 = still). */
  uFolWind: { value: new THREE.Vector3(0.8, 0.6, 1) }
};

let leafTexture: THREE.Texture | null = null;

function leafAlpha(): THREE.Texture {
  if (leafTexture) return leafTexture;
  const texture = new THREE.TextureLoader().load(FOLIAGE_SDF_PNG);
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  leafTexture = texture;
  return texture;
}

const VERT_PARS = /* glsl */ `
attribute vec3 aCenter;
attribute vec4 aCard;
uniform float uFolTime;
uniform vec3 uFolWind;
varying float vFolTint;
float folPhase() { return dot(modelMatrix[3].xz, vec2(0.37, 0.61)); }
// The card's turn about the view axis: its own fixed angle, plus a small flutter in the wind.
float folRoll() { return aCard.z + sin(uFolTime * 1.7 + aCard.z * 5.0 + folPhase()) * 0.13 * uFolWind.z; }
vec2 folRot(vec2 v, float a) { float c = cos(a); float s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y); }
`;

/** Replaces begin_vertex: the vertex starts at the card center, and the crown sways a little. */
const VERT_BEGIN = /* glsl */ `
vec3 transformed = aCenter;
{
  float folH = clamp(aCenter.y / 7.0, 0.0, 1.0);
  float folT = uFolTime + folPhase();
  float folS = sin(folT * 1.05) * 0.6 + sin(folT * 2.3 + aCard.z) * 0.4;
  transformed.xz += uFolWind.xy * folS * 0.07 * folH * folH * uFolWind.z;
}
vFolTint = aCard.w;
`;

/** Replaces project_vertex: the corner offset is added in view space, so the card faces the camera. */
const VERT_PROJECT = /* glsl */ `
vec4 mvPosition = modelViewMatrix * vec4( transformed, 1.0 );
{
  float folScale = length( modelMatrix[0].xyz );
  mvPosition.xy += folRot( aCard.xy * folScale, folRoll() );
}
gl_Position = projectionMatrix * mvPosition;
`;

/** After defaultnormal_vertex: each card bulges a little, so its edge catches light like a leaf tuft. */
const VERT_NORMAL = /* glsl */ `
transformedNormal = normalize( transformedNormal + vec3( folRot( uv - 0.5, folRoll() ), 0.0 ) * 0.7 );
`;

/** After alphamap_fragment: a round mask, so a far card is a soft disc and never a square. */
const FRAG_ALPHA = /* glsl */ `
diffuseColor.a *= smoothstep( 0.5, 0.38, length( vAlphaMapUv - 0.5 ) ) * 1.25;
`;

/**
 * folio's leaf color: a mix of two tones by the light direction. Here it is done for each light
 * of the scene (shadows included), and the side away from the light keeps a part of the light.
 */
const FRAG_LIGHT = /* glsl */ `
uniform vec3 uFolShade;
uniform vec3 uFolLit;
varying float vFolTint;
void RE_Direct_Fol( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
  float ndl = dot( geometryNormal, directLight.direction );
  float lit = smoothstep( -0.3, 0.85, ndl );
  vec3 tone = mix( uFolShade, uFolLit, lit ) * vFolTint;
  reflectedLight.directDiffuse += directLight.color * tone * ( 0.34 + 0.66 * lit ) * RECIPROCAL_PI;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Fol
`;

function patchVertex(source: string, withNormal: boolean): string {
  let vs = source
    .replace("#include <common>", `#include <common>\n${VERT_PARS}`)
    .replace("#include <begin_vertex>", VERT_BEGIN)
    .replace("#include <project_vertex>", VERT_PROJECT);
  if (withNormal) vs = vs.replace("#include <defaultnormal_vertex>", `#include <defaultnormal_vertex>\n${VERT_NORMAL}`);
  return vs;
}

const ALPHA_TEST = 0.36;

let depthMaterial: THREE.MeshDepthMaterial | null = null;

/** Shadow pass: the same cards, turned to the light. */
function leafDepthMaterial(): THREE.MeshDepthMaterial {
  if (depthMaterial) return depthMaterial;
  const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, alphaMap: leafAlpha(), alphaTest: ALPHA_TEST });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED);
    shader.vertexShader = patchVertex(shader.vertexShader, false);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vFolTint;")
      .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\n${FRAG_ALPHA}`);
  };
  m.customProgramCacheKey = () => "folio-leaf-depth";
  depthMaterial = m;
  return m;
}

/** Moves a color a little in hue, saturation and lightness. */
function jitter(hex: string, random: () => number, amount: number): THREE.Color {
  const color = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  color.getHSL(hsl);
  color.setHSL((hsl.h + (random() - 0.5) * 0.05 * amount + 1) % 1, THREE.MathUtils.clamp(hsl.s * (1 + (random() - 0.5) * 0.16 * amount), 0, 1), THREE.MathUtils.clamp(hsl.l * (1 + (random() - 0.5) * 0.14 * amount), 0, 1));
  return color;
}

const leafMaterials = new Map<string, THREE.MeshLambertMaterial>();

function leafMaterial(id: SpeciesId, tint: number): THREE.MeshLambertMaterial {
  const key = `${id}:${tint}`;
  const cached = leafMaterials.get(key);
  if (cached) return cached;
  const species: Species = SPECIES[id];
  const random = rng(hashText(key));
  // Tint 0 is the species' own color.
  const amount = tint === 0 ? 0 : 1;
  const shade = jitter(species.shade, random, amount);
  const lit = jitter(species.lit, random, amount);
  const m = new THREE.MeshLambertMaterial({
    // Sky and ground light use this color: between the two tones, nearer to the dark one.
    color: shade.clone().lerp(lit, 0.42),
    alphaMap: leafAlpha(),
    alphaTest: ALPHA_TEST
  });
  const uniforms = { uFolShade: { value: shade }, uFolLit: { value: lit } };
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, SHARED, uniforms);
    shader.vertexShader = patchVertex(shader.vertexShader, true);
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <lights_lambert_pars_fragment>", `#include <lights_lambert_pars_fragment>\n${FRAG_LIGHT}`)
      .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.rgb *= vFolTint;")
      .replace("#include <alphamap_fragment>", `#include <alphamap_fragment>\n${FRAG_ALPHA}`);
  };
  m.customProgramCacheKey = () => "folio-leaf";
  leafMaterials.set(key, m);
  return m;
}

const barkMaterials = new Map<string, THREE.MeshLambertMaterial>();

function barkMaterial(hex: string): THREE.MeshLambertMaterial {
  let m = barkMaterials.get(hex);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color: hex, vertexColors: true });
    barkMaterials.set(hex, m);
  }
  return m;
}

// ---------------------------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------------------------

/**
 * The leaf cards of a whole crown as one geometry.
 * position = a real quad (for picking and bounds), aCenter = the card center the shader draws
 * from, aCard = corner x, corner y, roll angle, brightness.
 */
function crownGeometry(leaves: Leaf[], random: () => number): THREE.BufferGeometry {
  const positions: number[] = [];
  const centers: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const cards: number[] = [];
  const index: number[] = [];

  // The middle of the crown: a part of each normal points away from it, so the clusters of one
  // tree are shaded as one crown and not as separate balls.
  const mid = new THREE.Vector3();
  let weight = 0;
  for (const [x, y, z, s] of leaves) {
    mid.add(new THREE.Vector3(x, y, z).multiplyScalar(s));
    weight += s;
  }
  mid.multiplyScalar(1 / Math.max(weight, 1e-6));

  const center = new THREE.Vector3();
  const out = new THREE.Vector3();
  const fromMid = new THREE.Vector3();
  const corner = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const CORNERS: [number, number][] = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]];

  for (const [lx, ly, lz, scale] of leaves) {
    const count = Math.round(CLUSTER_CARDS * THREE.MathUtils.clamp(0.35 + 0.65 * scale, 0.5, 1.1));
    const size = CARD_SIZE * scale;
    for (let i = 0; i < count; i++) {
      // folio's distribution: most cards near the surface of the ball.
      const radius = 1 - Math.pow(random(), 3);
      const theta = TAU * random();
      const phi = Math.acos(1 - 2 * random());
      out.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta));
      center.set(lx, ly, lz).addScaledVector(out, radius * scale);
      fromMid.copy(center).sub(mid).normalize();
      const normal = out.clone().lerp(fromMid, 0.3).normalize();
      const roll = random() * TAU;
      // Cards deep in the ball are darker, and each card has its own small brightness step.
      const brightness = (0.74 + 0.26 * THREE.MathUtils.smoothstep(radius, 0.25, 0.95)) * (0.94 + 0.12 * random());
      quat.setFromEuler(euler.set(random() * TAU, random() * TAU, random() * TAU));
      const base = positions.length / 3;
      for (const [cx, cy] of CORNERS) {
        corner.set(cx * size, cy * size, 0).applyQuaternion(quat).add(center);
        positions.push(corner.x, corner.y, corner.z);
        centers.push(center.x, center.y, center.z);
        normals.push(normal.x, normal.y, normal.z);
        uvs.push(cx + 0.5, cy + 0.5);
        cards.push(cx * size, cy * size, roll, brightness);
      }
      index.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute("aCenter", new THREE.Float32BufferAttribute(centers, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  g.setAttribute("aCard", new THREE.Float32BufferAttribute(cards, 4));
  g.setIndex(index);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  // A card turned to the camera can reach a little past the quad stored in position.
  g.boundingBox?.expandByScalar(CARD_SIZE * 0.25);
  if (g.boundingSphere) g.boundingSphere.radius += CARD_SIZE * 0.25;
  return g;
}

/** Adds vertex colors to a trunk: darker at the base, the bark color at the top. */
function shadeTrunk(g: THREE.BufferGeometry, height: number): THREE.BufferGeometry {
  const position = g.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = THREE.MathUtils.clamp(position.getY(i) / Math.max(height, 1e-6), 0, 1);
    const v = 0.7 + 0.3 * THREE.MathUtils.smoothstep(t, 0, 0.55);
    colors[i * 3] = colors[i * 3 + 1] = colors[i * 3 + 2] = v;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

const trunkGeometries = new Map<string, THREE.BufferGeometry>();

function trunkGeometry(shape: Shape): THREE.BufferGeometry | null {
  const trunk = shape.trunk;
  if (!trunk) return null;
  const key = "model" in trunk ? trunk.model : `straight:${trunk.height}:${trunk.base}:${trunk.top}`;
  const cached = trunkGeometries.get(key);
  if (cached) return cached;
  let g: THREE.BufferGeometry;
  let height: number;
  if ("model" in trunk) {
    const model = FOLIO_TREE_MODELS[trunk.model];
    g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(model.trunk.position, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(model.trunk.normal, 3));
    g.setIndex(model.trunk.index);
    height = model.height;
  } else {
    g = new THREE.CylinderGeometry(trunk.top, trunk.base, trunk.height, 7, 3);
    g.translate(0, trunk.height / 2, 0);
    height = trunk.height;
  }
  shadeTrunk(g, height);
  g.computeBoundingBox();
  g.computeBoundingSphere();
  trunkGeometries.set(key, g);
  return g;
}

const crownGeometries = new Map<string, THREE.BufferGeometry>();

function crownFor(id: SpeciesId, variant: number): THREE.BufferGeometry {
  const key = `${id}:${variant}`;
  const cached = crownGeometries.get(key);
  if (cached) return cached;
  const species: Species = SPECIES[id];
  const random = rng(hashText(`crown:${key}`));
  // A model trunk has branches that end in its clusters, so those clusters move only a little.
  const loose = species.shape.trunk && "model" in species.shape.trunk ? 0.12 : 0.2;
  const leaves = species.shape.leaves.map(([x, y, z, s]): Leaf => {
    if (variant === 0) return [x, y, z, s];
    return [x + (random() - 0.5) * loose * 2, y + (random() - 0.5) * loose, z + (random() - 0.5) * loose * 2, s * (0.92 + random() * 0.18)];
  });
  const g = crownGeometry(leaves, random);
  crownGeometries.set(key, g);
  return g;
}

// ---------------------------------------------------------------------------------------------
// Instances
// ---------------------------------------------------------------------------------------------

function tick(frame: ResourceFrame): void {
  SHARED.uFolTime.value = frame.time;
}

function treeInstance(id: SpeciesId, seed: number): ResourceInstance {
  const species: Species = SPECIES[id];
  const s = Math.abs(Math.floor(Number.isFinite(seed) ? seed : 0));
  const random = rng(hashText(`${id}:${s}`));
  const root = new THREE.Group();
  // The tree turns and changes size inside its node, so two neighbors never look the same.
  const body = new THREE.Group();
  body.rotation.y = random() * TAU;
  body.scale.setScalar(0.9 + random() * 0.24);
  root.add(body);

  const trunk = trunkGeometry(species.shape);
  if (trunk) {
    const mesh = new THREE.Mesh(trunk, barkMaterial(species.bark));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }

  const crown = new THREE.Mesh(crownFor(id, s % SHAPE_VARIANTS), leafMaterial(id, Math.floor(s / SHAPE_VARIANTS) % TINT_VARIANTS));
  crown.customDepthMaterial = leafDepthMaterial();
  crown.castShadow = true;
  crown.receiveShadow = true;
  body.add(crown);

  return { object: root, update: tick };
}

// ---------------------------------------------------------------------------------------------
// Library entries
// ---------------------------------------------------------------------------------------------

type EntryBase = Pick<ResourceEntry, "id" | "name" | "tags" | "description" | "footprint">;

function entry(species: SpeciesId, e: EntryBase): ResourceEntry {
  return { kind: "plant", source: "local", origin: ORIGIN, license: LICENSE, ...e, create: (seed) => treeInstance(species, seed) };
}

/** The tag "basic" puts these first when the user asks for "a tree" with no type. */
export const FOLIO_TREE_ENTRIES: ResourceEntry[] = [
  entry("oak", {
    id: "nature:tree:oak-round",
    name: "Oak tree",
    tags: ["tree", "basic", "oak", "broadleaf", "deciduous", "green", "summer", "street", "park", "forest", "shade"],
    description: "A full green oak: a brown trunk with branches and six soft, round leaf clusters, lighter on the sun side. About 8 m tall and 4.5 m across. The standard tree for streets, parks and forests.",
    footprint: 2.3
  }),
  entry("birch", {
    id: "nature:tree:birch",
    name: "Birch tree",
    tags: ["tree", "basic", "birch", "broadleaf", "deciduous", "light green", "white bark", "slender", "forest", "park"],
    description: "A tall birch with a pale trunk and soft, light green leaf clusters. About 9 m tall and 4.5 m across.",
    footprint: 2.3
  }),
  entry("cherry", {
    id: "nature:tree:cherry-blossom",
    name: "Cherry blossom tree",
    tags: ["tree", "basic", "cherry", "sakura", "blossom", "pink", "spring", "japan", "japanese", "garden", "shrine"],
    description: "A leaning cherry tree in full pink blossom, with soft, round blossom clusters. About 6 m tall; the crown reaches 4 m to one side of the trunk.",
    footprint: 3.4
  }),
  entry("fir", {
    id: "nature:tree:fir",
    name: "Fir tree",
    tags: ["tree", "basic", "fir", "pine", "conifer", "evergreen", "dark green", "forest", "mountain", "winter", "nordic"],
    description: "A slim, dark green conifer: a straight trunk with soft clusters that get smaller toward the top. About 8 m tall and 2.5 m across.",
    footprint: 1.5
  }),
  entry("maple", {
    id: "nature:tree:maple-autumn",
    name: "Red maple tree",
    tags: ["tree", "maple", "autumn", "fall", "red", "orange", "broadleaf", "deciduous", "japan", "park"],
    description: "A maple in autumn color: red leaf clusters that turn orange on the sun side. About 8 m tall and 4.5 m across.",
    footprint: 2.3
  }),
  entry("birch-autumn", {
    id: "nature:tree:birch-autumn",
    name: "Autumn birch tree",
    tags: ["tree", "birch", "autumn", "fall", "orange", "white bark", "slender", "forest"],
    description: "A tall birch in autumn color: a pale trunk and bright orange leaf clusters. About 9 m tall and 4.5 m across.",
    footprint: 2.3
  }),
  entry("oak-golden", {
    id: "nature:tree:oak-golden",
    name: "Golden oak tree",
    tags: ["tree", "oak", "golden", "yellow", "late summer", "autumn", "broadleaf", "savanna", "park"],
    description: "An oak with yellow-green leaf clusters, as in late summer. About 8 m tall and 4.5 m across.",
    footprint: 2.3
  }),
  entry("bush", {
    id: "nature:bush:round",
    name: "Round bush",
    tags: ["bush", "basic", "shrub", "hedge", "green", "garden", "park", "undergrowth"],
    description: "A low green bush of five soft, round leaf clusters, in the same style as the oak. About 1.3 m tall and 2.2 m across.",
    footprint: 1.2
  })
];
