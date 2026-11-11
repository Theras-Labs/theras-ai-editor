// The "Player start" marker: the place and direction where game mode puts the player.
// A flat ring on the ground, an arrow that points the facing direction (local -z = yaw 0), and
// a thin post with a small flag, about 1.8 m tall. Unlit emerald, so it reads in any light.
// It never collides, and it is hidden while the user plays (shown in the editor and the tools view).
import * as THREE from "three";
import { gameControlsActive, PLAYER_START_RESOURCE } from "@/lib/game/game-store";
import type { ResourceEntry, ResourceInstance } from "../types";

const EMERALD = "#10d98a";

let materials: { solid: THREE.MeshBasicMaterial; soft: THREE.MeshBasicMaterial } | null = null;

/** Shared by every marker (never disposed). */
function markerMaterials() {
  if (!materials) {
    materials = {
      solid: new THREE.MeshBasicMaterial({ color: EMERALD, side: THREE.DoubleSide, toneMapped: false }),
      soft: new THREE.MeshBasicMaterial({ color: EMERALD, side: THREE.DoubleSide, toneMapped: false, transparent: true, opacity: 0.55, depthWrite: false })
    };
  }
  return materials;
}

/** A flat arrow in the ground plane, pointing toward local -z. */
function arrowGeometry() {
  const shape = new THREE.Shape();
  // Shape y becomes world -z after rotateX(-PI/2).
  shape.moveTo(-0.05, 0.08);
  shape.lineTo(0.05, 0.08);
  shape.lineTo(0.05, 0.5);
  shape.lineTo(0.18, 0.5);
  shape.lineTo(0, 0.8);
  shape.lineTo(-0.18, 0.5);
  shape.lineTo(-0.05, 0.5);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

/** A small triangle flag at the top of the post, pointing toward local -z. */
function flagGeometry() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.78, 0, 0, 1.52, 0, 0, 1.65, -0.32], 3));
  geometry.computeVertexNormals();
  return geometry;
}

function createMarker(): ResourceInstance {
  const { solid, soft } = markerMaterials();
  const object = new THREE.Group();
  object.name = "Player start";
  const geometries: THREE.BufferGeometry[] = [];
  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, y = 0) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.y = y;
    mesh.userData.noCollide = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    object.add(mesh);
    return mesh;
  };

  const ring = new THREE.RingGeometry(0.38, 0.45, 48);
  ring.rotateX(-Math.PI / 2);
  add(ring, solid, 0.02);
  const disc = new THREE.CircleGeometry(0.38, 48);
  disc.rotateX(-Math.PI / 2);
  add(disc, soft, 0.015);
  add(arrowGeometry(), solid, 0.03);
  add(new THREE.CylinderGeometry(0.02, 0.02, 1.8, 8), solid, 0.9);
  add(new THREE.SphereGeometry(0.045, 12, 8), solid, 1.8);
  add(flagGeometry(), solid);

  return {
    object,
    update: () => {
      object.visible = !gameControlsActive();
    },
    dispose: () => {
      for (const geometry of geometries) geometry.dispose();
    }
  };
}

export const GAME_MARKER_ENTRIES: ResourceEntry[] = [
  {
    id: PLAYER_START_RESOURCE,
    name: "Player start",
    kind: "feature",
    source: "local",
    origin: "Theras",
    category: "Game",
    license: "Theras built-in (made in code)",
    tags: ["player", "start", "spawn", "spawn point", "game", "marker"],
    description: "Where game mode puts the player, and the direction the player faces (the arrow). Hidden while playing.",
    footprint: 0.5,
    create: () => createMarker()
  }
];
