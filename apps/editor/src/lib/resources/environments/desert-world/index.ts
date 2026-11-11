// "Desert of the giants": a 480 x 480 m crop of a code-built desert world, built from the
// author's own game (credit in `origin`). The crop is centred on the salt pan (source world
// x 300, z 215) and holds the landing site, the giant's hand, the giant's reach, the qanat
// wells, the stair ruin, a stranded boat, the field-stone, the pilgrims' cairns, the riders'
// red strips and the rock pieces of the world scatter that stand in it (the scatter runs its
// whole random sequence, so each piece is where the game puts it). An apron of coarser ground
// continues the dunes 210 m past the crop.
// Gameplay (player, foes, characters, physics, audio, interface) is not part of the entry.
import * as THREE from "three";
import { registerPlaceGround } from "../../place-ground";
import type { ResourceEntry, ResourceInstance } from "../../types";
import { desertHeight } from "./height";
import { Batch } from "./kit";
import { createHaze, desertGlowMaterial, desertMaterial, desertOutlineMaterial, trackViewport } from "./materials";
import { buildPieces } from "./pieces";
import { scatterDesert, scrubGeometry, type InstanceSet } from "./scatter";
import { START } from "./sites";
import { buildTerrainGeometry, type CropSpec } from "./terrain";

/** The crop, in the source world's coordinates: centre, half-size, ground cell and apron rings. */
const CROP: CropSpec = { cx: 300, cz: 215, half: 240, step: 2, apron: [6, 14, 26, 44, 70, 105, 150, 210] };
/** Pieces this far outside the crop still show (they stand in the apron as a backdrop). */
const CROP_MARGIN = 24;

function baseAt(x: number, z: number, r: number) {
  let h = desertHeight(x, z);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    h = Math.min(h, desertHeight(x + Math.cos(a) * r, z + Math.sin(a) * r));
  }
  return h;
}

/**
 * Ground height in the place's own coordinates, exactly as the ground mesh draws it: the same
 * 2 m grid and the same triangle split (see buildTerrainGeometry). Null outside the crop, where
 * only the coarse apron is.
 */
function groundHeightAt(origin: THREE.Vector3, lx: number, lz: number): number | null {
  if (Math.abs(lx) > CROP.half || Math.abs(lz) > CROP.half) return null;
  const n = Math.round((CROP.half * 2) / CROP.step);
  const gx = Math.min(n - 1e-6, Math.max(0, (lx + CROP.half) / CROP.step));
  const gz = Math.min(n - 1e-6, Math.max(0, (lz + CROP.half) / CROP.step));
  const col = Math.floor(gx);
  const row = Math.floor(gz);
  const fx = gx - col;
  const fz = gz - row;
  const at = (c: number, r: number) => desertHeight(CROP.cx - CROP.half + c * CROP.step, CROP.cz - CROP.half + r * CROP.step) - origin.y;
  const hb = at(col + 1, row);
  const hc = at(col, row + 1);
  if (fx + fz <= 1) {
    const ha = at(col, row);
    return ha + fx * (hb - ha) + fz * (hc - ha);
  }
  const hd = at(col + 1, row + 1);
  return hd + (1 - fx) * (hc - hd) + (1 - fz) * (hb - hd);
}

/** Distance from (x, z) to the crop square (0 inside). */
function cropDistance(x: number, z: number) {
  const dx = Math.max(Math.abs(x - CROP.cx) - CROP.half, 0);
  const dz = Math.max(Math.abs(z - CROP.cz) - CROP.half, 0);
  return Math.hypot(dx, dz);
}

type Built = {
  origin: THREE.Vector3;
  geometries: Record<string, THREE.BufferGeometry | null>;
  instances: { rocks: InstanceSet; spikes: InstanceSet; scrub: InstanceSet };
  stats: { triangles: number };
};

let built: Built | null = null;
let users = 0;

/** Builds the crop's geometry once; every placement shares it. */
function build(): Built {
  if (built) return built;
  const originY = Math.round(desertHeight(CROP.cx, CROP.cz) * 100) / 100;
  const origin = new THREE.Vector3(CROP.cx, originY, CROP.cz);
  const ground = { heightAt: desertHeight, baseAt };
  const inCrop = (x: number, z: number, r: number) => cropDistance(x, z) < r + CROP_MARGIN;
  const batch = new Batch();
  const scatter = scatterDesert(ground, inCrop, batch);
  buildPieces(ground, inCrop, batch);
  const geometries: Built["geometries"] = {
    terrain: buildTerrainGeometry(CROP, desertHeight, originY),
    solid: batch.flush("solid", origin),
    cloth: batch.flush("cloth", origin),
    salt: batch.flush("salt", origin),
    sand: batch.flush("sand", origin),
    glow: batch.flush("glow", origin)
  };
  // decals lie on the ground: their normals point up whatever their winding
  const salt = geometries.salt;
  if (salt) {
    const n = salt.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, 0, 1, 0);
  }
  const local = (set: InstanceSet): InstanceSet => ({
    matrices: set.matrices.map((m) => m.clone().premultiply(new THREE.Matrix4().makeTranslation(-origin.x, -origin.y, -origin.z))),
    colors: set.colors
  });
  const instances = { rocks: local(scatter.rocks), spikes: local(scatter.spikes), scrub: local(scatter.scrub) };
  let triangles = 0;
  for (const g of Object.values(geometries)) if (g) triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
  triangles += instances.rocks.matrices.length * 20 + instances.spikes.matrices.length * 10 + instances.scrub.matrices.length * 180;
  built = { origin, geometries, instances, stats: { triangles } };
  return built;
}

function release() {
  users = Math.max(0, users - 1);
  if (users > 0 || !built) return;
  for (const g of Object.values(built.geometries)) g?.dispose();
  built = null;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, set: InstanceSet, name: string) {
  const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, set.matrices.length));
  set.matrices.forEach((m, i) => {
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, set.colors[i]);
  });
  mesh.count = set.matrices.length;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.name = name;
  return mesh;
}

function createDesert(): ResourceInstance {
  const world = build();
  users++;
  const { origin, geometries: g, instances } = world;
  const object = new THREE.Group();
  object.name = "Desert of the giants";
  const owned: { dispose(): void }[] = [];
  const material = <T extends { dispose(): void }>(m: T) => {
    owned.push(m);
    return m;
  };
  const add = (geometry: THREE.BufferGeometry | null, m: THREE.Material, name: string, shadows: { cast: boolean; receive: boolean }) => {
    if (!geometry) return null;
    const mesh = new THREE.Mesh(geometry, m);
    mesh.name = name;
    mesh.castShadow = shadows.cast;
    mesh.receiveShadow = shadows.receive;
    object.add(mesh);
    return mesh;
  };
  const haze = createHaze();
  const outline = material(desertOutlineMaterial(haze, 1.35));
  const addOutline = (geometry: THREE.BufferGeometry | null, name: string) => {
    if (!geometry) return;
    const hull = new THREE.Mesh(geometry, outline);
    hull.name = name;
    hull.castShadow = false;
    hull.receiveShadow = false;
    hull.userData.noCollide = true;
    hull.raycast = () => {};
    trackViewport(hull, outline);
    object.add(hull);
  };

  add(g.terrain, material(desertMaterial({ kind: "ground", origin, haze })), "Ground", { cast: false, receive: true });
  add(g.sand, material(desertMaterial({ kind: "ground", origin, haze })), "Dune mounds", { cast: true, receive: true });
  const decals = add(g.salt, material(desertMaterial({ kind: "decal", origin, haze })), "Salt crust and sand rivers", { cast: false, receive: true });
  if (decals) decals.userData.noCollide = true;
  add(g.solid, material(desertMaterial({ kind: "solid", origin, haze })), "Landmarks and rocks", { cast: true, receive: true });
  addOutline(g.solid, "Landmark ink lines");
  const cloth = add(g.cloth, material(desertMaterial({ kind: "cloth", origin, haze })), "Cloth strips", { cast: true, receive: true });
  if (cloth) cloth.userData.noCollide = true;
  const glow = add(g.glow, material(desertGlowMaterial()), "Brazier flames", { cast: false, receive: false });
  if (glow) glow.userData.noCollide = true;

  const instancedMaterial = material(desertMaterial({ kind: "instanced", origin, haze }));
  const rockGeo = new THREE.IcosahedronGeometry(1, 0);
  const spikeGeo = new THREE.ConeGeometry(0.25, 2.4, 5).translate(0, 1.2, 0);
  const scrubGeo = scrubGeometry();
  owned.push(rockGeo, spikeGeo, scrubGeo);
  if (instances.rocks.matrices.length) {
    const rocks = instanced(rockGeo, instancedMaterial, instances.rocks, "Rocks");
    rocks.castShadow = rocks.receiveShadow = true;
    object.add(rocks);
    const hull = instanced(rockGeo, outline, instances.rocks, "Rock ink lines");
    hull.userData.noCollide = true;
    hull.raycast = () => {};
    trackViewport(hull, outline);
    object.add(hull);
  }
  if (instances.spikes.matrices.length) {
    const spikes = instanced(spikeGeo, instancedMaterial, instances.spikes, "Desert spikes");
    spikes.castShadow = spikes.receiveShadow = true;
    spikes.userData.noCollide = true;
    object.add(spikes);
  }
  if (instances.scrub.matrices.length) {
    const scrub = instanced(scrubGeo, instancedMaterial, instances.scrub, "Scrub");
    scrub.castShadow = scrub.receiveShadow = true;
    scrub.userData.noCollide = true;
    object.add(scrub);
  }
  object.userData.start = {
    position: [START.x - origin.x, desertHeight(START.x, START.z) - origin.y, START.z - origin.z],
    heading: START.heading
  };
  // Placement (water, puddles, props) stands on this ground, not on a fixed level.
  const unregisterGround = registerPlaceGround(object, (x, z) => groundHeightAt(origin, x, z));
  return {
    object,
    update() {
      haze.update(object);
    },
    dispose() {
      unregisterGround();
      for (const o of owned) o.dispose();
      release();
    }
  };
}

export const DESERT_WORLD_ENTRIES: ResourceEntry[] = [
  {
    id: "env:desert-ruins",
    name: "Desert of the giants",
    kind: "environment",
    source: "local",
    origin: "Desert",
    category: "Places: worlds",
    license: "Owned by the Theras AI author",
    tags: ["desert", "dunes", "sand", "giant", "bones", "salt pan", "ruins", "wells", "mesa", "world", "moebius", "environment"],
    description:
      "A 480 x 480 m desert in a hand-inked print style (more dunes continue past it to the horizon): rose and golden dunes, a white salt pan, a giant's bone hand rising 40 m from the sand, a giant's arm and open hand on a dune's lip, a line of five qanat wells, a stair ruin beside its dune, a boat stranded in a dry wash, cairns, red rider strips, rock pillars, a terraced violet mesa, a banded mesa and a floating rock. Ground at y 0 in the centre (the salt pan); the landing site is at about (-155, -14, 37).",
    footprint: 340,
    environment: { dayFrac: 0.4, yearFrac: 0.4, clouds: 0.25 },
    create: () => createDesert()
  }
];
