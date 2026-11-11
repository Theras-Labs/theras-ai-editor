// Island kit island terrain inside Theras: the corner grid, the world state, the
// terrain mesher with its pop animation and the water. The world state is saved in the
// terrain node's metadata (World.serialize), so save, load and undo work.
import * as THREE from "three";
import { levelY } from "@/vendor/little-habitats/core/config";
import { Events } from "@/vendor/little-habitats/core/events";
import { buildGrid, type Grid } from "@/vendor/little-habitats/core/grid";
import { World, type Tool } from "@/vendor/little-habitats/core/world";
import { UNIFORMS } from "@/vendor/little-habitats/fx/pokefx";
import type { Game } from "@/vendor/little-habitats/game/types";
import { createTerrain, type Terrain } from "@/vendor/little-habitats/terrain";
import { lhClock } from "./runtime";

export type IslandTerrain = {
  /** The land (terrain chunks). */
  object: THREE.Group;
  /** The lake: water surface and lake bed, in the same local space as the land. */
  water: THREE.Group;
  grid: Grid;
  world: World;
  terrain: Terrain;
  /**
   * Applies a tool at a point in the terrain's local space. radius 0 = the nearest corner
   * (Island kit' own tool); a larger radius (meters) changes every corner inside it,
   * for wide hills instead of pillars. Returns true when the world changed.
   */
  apply: (tool: Tool, x: number, z: number, alt: boolean, radius?: number) => boolean;
  /** Meshes that a terrain tool should hit (land and lake), ignoring objects on top. */
  pickables: THREE.Object3D[];
  serialize: () => string;
  load: (state: string) => boolean;
  heightAt: (x: number, z: number) => number;
  update: (dt: number) => void;
  dispose: () => void;
};

function hash(x: number, z: number, seed: number) {
  const s = Math.sin(x * 127.1 + z * 311.7 + seed * 74.7) * 43758.5453;
  return s - Math.floor(s);
}

function noise(x: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const fx = x - x0;
  const fz = z - z0;
  const u = fx * fx * (3 - 2 * fx);
  const v = fz * fz * (3 - 2 * fz);
  const a = hash(x0, z0, seed);
  const b = hash(x0 + 1, z0, seed);
  const c = hash(x0, z0 + 1, seed);
  const d = hash(x0 + 1, z0 + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Shapes a starter island: a noisy coast, a hill in the middle, stone outcrops. */
/** Starter shapes: "island" has a coast, a hill and stone outcrops; "meadow" is a wide, flat plain. */
export type StarterShape = "island" | "meadow";

function shapeStarterIsland(grid: Grid, world: World, seed: number, size: number, shape: StarterShape = "island") {
  const changed: number[] = [];
  const meadow = shape === "meadow";
  const radius = meadow ? Math.max(size, grid.radius - 2.5) : size;
  for (const corner of grid.corners) {
    if (corner.boundary) continue;
    const d = Math.hypot(corner.x, corner.z);
    const coast = radius * (meadow ? 0.9 + 0.15 * noise(corner.x * 0.12, corner.z * 0.12, seed) : 0.75 + 0.5 * noise(corner.x * 0.18, corner.z * 0.18, seed));
    if (d > coast) continue;
    let height = 1;
    if (!meadow) {
      if (d < coast * 0.55 && noise(corner.x * 0.25 + 9, corner.z * 0.25 + 9, seed) > 0.42) height++;
      if (d < coast * 0.3 && noise(corner.x * 0.3 + 21, corner.z * 0.3 + 21, seed) > 0.5) height++;
    } else if (noise(corner.x * 0.2 + 5, corner.z * 0.2 + 5, seed) > 0.78) height++;
    const stone = noise(corner.x * 0.35 + 40, corner.z * 0.35 + 40, seed) > (meadow ? 0.9 : 0.8);
    world.set(corner.id, { height, material: stone ? "stone" : "soil", sown: false });
    changed.push(corner.id);
  }
  return changed;
}

/** Land corners of a starter island, computed without building meshes (for templates). */
export function starterIslandSurface(seed: number, shape: StarterShape = "island", size = 8) {
  const grid = buildGrid(seed);
  const world = new World(grid, new Events());
  shapeStarterIsland(grid, world, seed, size, shape);
  const land = grid.corners
    .filter((c) => world.get(c.id).height > 0)
    .map((c) => ({ x: c.x, z: c.z, level: world.get(c.id).height, stone: world.get(c.id).material === "stone", d: Math.hypot(c.x, c.z) }));
  return { land, top: (level: number) => levelY(level) };
}

export function createIslandTerrain(seed: number, state: string | undefined, starterSize = 8, shape: StarterShape = "island"): IslandTerrain {
  const events = new Events();
  const grid = buildGrid(seed);
  const world = new World(grid, events);
  const loaded = state ? world.deserialize(state) : false;
  if (!loaded) shapeStarterIsland(grid, world, seed, starterSize, shape);

  const object = new THREE.Group();
  object.name = "little-habitats-island";
  // The terrain only needs these game fields (see vendor/little-habitats/game/types.ts).
  const host = {
    scene: object,
    clock: lhClock,
    params: new URLSearchParams(loaded ? "reveal=0" : "reveal=1"),
    events,
    grid,
    world,
    seed,
    uniforms: UNIFORMS
  } as unknown as Game;
  const terrain = createTerrain(host);
  // Island kit builds the water inside the terrain root; move it to its own group
  // so the editor can show and hide land and lake separately.
  const water = new THREE.Group();
  water.name = "little-habitats-lake";
  object.traverse((o) => {
    if (o.name === "water" || o.name === "lakebed") water.userData.parts = [...(water.userData.parts ?? []), o];
    // The flat lake surface is water, not floor: stylized water leaves it out of its depth pass.
    if (o.name === "water") o.traverse((child) => (child.userData.waterSurface = true));
  });
  for (const part of (water.userData.parts ?? []) as THREE.Object3D[]) water.add(part);

  return {
    object,
    water,
    grid,
    world,
    terrain,
    apply(tool, x, z, alt, radius = 0) {
      const center = grid.nearestCorner(x, z);
      if (center < 0) return false;
      if (radius <= 0) return world.apply(tool, center, alt) !== "none";
      let changed = false;
      for (const corner of grid.corners) {
        if (Math.hypot(corner.x - x, corner.z - z) <= radius && world.apply(tool, corner.id, alt) !== "none") changed = true;
      }
      return changed;
    },
    pickables: terrain.pickables,
    serialize: () => world.serialize(),
    load(next) {
      if (!world.deserialize(next)) return false;
      world.commit(grid.corners.map((c) => c.id));
      return true;
    },
    heightAt: (x, z) => terrain.heightAt(x, z),
    update(dt) {
      terrain.update(dt, lhClock.state);
    },
    dispose() {
      for (const root of [object, water])
        root.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) mesh.geometry.dispose();
        });
    }
  };
}
