// Default slots. Original Theras recipes built from editor primitives.
import type { BuildSlot, RecipeMaterial } from "./types";

export const TILE = 1;
/** Height of one soil or stone layer. */
export const LAYER = 0.6;

const M = {
  dirt: { key: "dirt", name: "Island Dirt", color: "#8a5a3b", roughness: 0.95 },
  grass: { key: "grass", name: "Island Grass", color: "#7cc36b", roughness: 0.9 },
  stone: { key: "stone", name: "Island Stone", color: "#a7a39b", roughness: 0.85 },
  stoneDark: { key: "stoneDark", name: "Island Stone Dark", color: "#86827a", roughness: 0.9 },
  water: { key: "water", name: "Island Water", color: "#4fb3d9", roughness: 0.15, metalness: 0.1 },
  bark: { key: "bark", name: "Island Bark", color: "#7a5236", roughness: 0.9 },
  leaf: { key: "leaf", name: "Island Leaf", color: "#5fae5a", roughness: 0.8 },
  wood: { key: "wood", name: "Island Wood", color: "#a8744a", roughness: 0.85 },
  red: { key: "red", name: "Island Gate Red", color: "#d2513f", roughness: 0.7 }
} satisfies Record<string, RecipeMaterial>;

export const ISLAND_MATERIALS = M;

/** Theras primitive tree, kept as a library block. */
export const THERAS_TREE_SLOT: BuildSlot = {
    id: "tree",
    label: "Block tree",
    icon: "seeds",
    kind: "recipe",
    recipe: {
      materials: [M.bark, M.leaf],
      parts: [
        { shape: "cylinder", x: 0, y: 0.35, z: 0, sizeX: 0.16, sizeY: 0.7, sizeZ: 0.16, material: "bark", segments: 6, name: "Trunk" },
        { shape: "cone", x: 0, y: 1.0, z: 0, sizeX: 0.8, sizeY: 0.9, sizeZ: 0.8, material: "leaf", segments: 7, name: "Leaves" },
        { shape: "cone", x: 0, y: 1.45, z: 0, sizeX: 0.55, sizeY: 0.65, sizeZ: 0.55, material: "leaf", segments: 7, name: "Leaves Top" }
      ]
    }
  };

export const DEFAULT_SLOTS: BuildSlot[] = [
  {
    id: "soil",
    label: "Soil",
    icon: "soil",
    kind: "recipe",
    terrainTool: "soil",
    recipe: {
      materials: [M.dirt, M.grass],
      parts: [
        { shape: "cube", x: 0, y: (LAYER - 0.12) / 2, z: 0, sizeX: TILE, sizeY: LAYER - 0.12, sizeZ: TILE, material: "dirt", name: "Soil" },
        { shape: "cube", x: 0, y: LAYER - 0.06, z: 0, sizeX: TILE, sizeY: 0.12, sizeZ: TILE, material: "grass", name: "Grass" }
      ]
    }
  },
  {
    id: "stone",
    label: "Stone",
    icon: "stone",
    kind: "recipe",
    terrainTool: "stone",
    recipe: {
      materials: [M.stone, M.stoneDark],
      parts: [
        { shape: "cube", x: 0, y: LAYER / 2, z: 0, sizeX: TILE, sizeY: LAYER, sizeZ: TILE, material: "stone", name: "Stone" },
        { shape: "sphere", x: 0.18, y: LAYER + 0.08, z: -0.12, sizeX: 0.42, sizeY: 0.26, sizeZ: 0.36, material: "stoneDark", segments: 7, name: "Pebble" }
      ]
    }
  },
  {
    id: "water",
    label: "Water",
    icon: "water",
    kind: "recipe",
    terrainTool: "water",
    recipe: {
      materials: [M.water],
      parts: [{ shape: "cube", x: 0, y: 0.12, z: 0, sizeX: TILE, sizeY: 0.24, sizeZ: TILE, material: "water", name: "Water" }]
    }
  },
  { id: "seeds", label: "Seeds", icon: "seeds", kind: "resource", resourceId: "lh:plant:seed_mix" },
  { id: "bridge", label: "Bridge", icon: "bridge", kind: "resource", resourceId: "lh:feature:bridge" },
  { id: "lantern", label: "Lantern", icon: "lantern", kind: "resource", resourceId: "lh:feature:lantern" },
  {
    id: "gate",
    label: "Gate",
    icon: "gate",
    kind: "recipe",
    recipe: {
      materials: [M.red, M.bark],
      parts: [
        { shape: "cylinder", x: -0.7, y: 0.9, z: 0, sizeX: 0.16, sizeY: 1.8, sizeZ: 0.16, material: "red", segments: 8, name: "Gate Post" },
        { shape: "cylinder", x: 0.7, y: 0.9, z: 0, sizeX: 0.16, sizeY: 1.8, sizeZ: 0.16, material: "red", segments: 8, name: "Gate Post" },
        { shape: "cube", x: 0, y: 1.55, z: 0, sizeX: 1.7, sizeY: 0.12, sizeZ: 0.16, material: "red", name: "Gate Beam" },
        { shape: "cube", x: 0, y: 1.86, z: 0, sizeX: 2.1, sizeY: 0.14, sizeZ: 0.24, material: "bark", name: "Gate Top" }
      ]
    }
  },
  { id: "erase", label: "Erase", icon: "erase", kind: "erase" }
];
