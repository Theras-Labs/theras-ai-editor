// The port yard: the whole place of the original scene, built by the original factories. A container
// yard with three lanes, a steel shed, a quay with a crane and a ship, a far skyline, a wet
// apron with puddles that mirror the scene, and rain. All of it is made by code.
//
// What the adapter does: it gives the factories the state that the original code's boot code gave them
// (see PortContext), and it stands in for the original code's render module in two places:
//   - the mirror for the puddles: the ground asks for a picture of the scene from below the
//     ground, one time each frame. The original scene drew it before its main pass; here the ground
//     mesh draws it when the editor is about to draw that mesh (onBeforeRender).
//   - the sky, the sun and the screen effects: the editor's own (see sky.ts and the template).
//
// Credit: this code was written by Claude Fable 5.2 (a public claude.ai artifact,
// https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA).
import * as THREE from "three";
import type { PortContext } from "@/vendor/port/game.js";
import { registerPlaceGround } from "../place-ground";
import type { ResourceFrame, ResourceInstance } from "../types";
import { portKit, type PortKit } from "./kit";

/** The apron (ground quad) of the yard in its own space, meters. East of quayX is the sea. */
export const YARD_GROUND = { x0: -160, x1: 30, z0: -160, z1: 160 };
/** The fenced land with the stacks, the shed and the quay. */
export const YARD_PLAY = { x0: -40, x1: 40, z0: -30, z1: 30 };
/** Where the original scene starts: at the gate, looking down the main lane toward the low sun. */
export const YARD_START = { position: { x: -32, y: 1.7, z: 6 }, target: { x: 0, y: 2.4, z: 6.4 } };

type PrePass = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void;

/** A collision box of the original code's physics, in the space of the yard. */
type GameBox = { min: THREE.Vector3; max: THREE.Vector3; bulletOnly?: boolean };

/**
 * One mesh of all collision boxes plus the land slab. It is never drawn (its material is not
 * visible), but game mode reads its triangles: 12 for each box.
 */
function collisionMesh(boxes: GameBox[]): THREE.Mesh {
  const land: GameBox = {
    min: new THREE.Vector3(YARD_GROUND.x0, -1, YARD_GROUND.z0),
    max: new THREE.Vector3(YARD_GROUND.x1, 0, YARD_GROUND.z1)
  };
  // A box that stops only bullets (a fence mesh, a thin sign) does not stop a walker.
  const list = [land, ...boxes.filter((b) => !b.bulletOnly)];
  const positions = new Float32Array(list.length * 8 * 3);
  const index = new Uint32Array(list.length * 36);
  // Corner i: bit 0 = x, bit 1 = y, bit 2 = z. Two triangles for each face, outward.
  const faces = [0, 2, 1, 1, 2, 3, 4, 5, 6, 5, 7, 6, 0, 1, 4, 1, 5, 4, 2, 6, 3, 3, 6, 7, 0, 4, 2, 2, 4, 6, 1, 3, 5, 3, 7, 5];
  list.forEach((box, b) => {
    for (let c = 0; c < 8; c++) {
      positions[(b * 8 + c) * 3] = c & 1 ? box.max.x : box.min.x;
      positions[(b * 8 + c) * 3 + 1] = c & 2 ? box.max.y : box.min.y;
      positions[(b * 8 + c) * 3 + 2] = c & 4 ? box.max.z : box.min.z;
    }
    for (let k = 0; k < 36; k++) index[b * 36 + k] = b * 8 + faces[k]!;
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ visible: false }));
  mesh.name = "port-yard-colliders";
  mesh.userData.collisionBoxes = list.length;
  return mesh;
}

type Yard = {
  update(frame: ResourceFrame): void;
  dispose(): void;
};

/** Rain strength of a node: metadata.params.rain, 0 (dry air) to 1 (downpour). The original code's default is 0.6. */
function rainOf(params: Record<string, unknown> | undefined): number | undefined {
  const v = Number(params?.rain);
  return params?.rain !== undefined && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : undefined;
}

async function buildYard(kit: PortKit, holder: THREE.Group, params: Record<string, unknown> | undefined): Promise<Yard> {
  const { game } = kit;
  const renderer = kit.ctx.renderer;
  const passes: PrePass[] = [];
  /** The scene of the frame that is being drawn (the mirror picture shows this scene). */
  let liveScene: THREE.Scene | null = null;

  const ctx: PortContext = {
    ...kit.ctx,
    // The level and the ground fork this generator in the same order as the original did, so the
    // yard is the same on every load.
    rng: game.createRng(4207),
    events: game.createEvents(),
    time: { t: 0, dt: 0, frame: 0, real: 0 },
    scene: holder,
    render: {
      addPrePass: (pass: PrePass) => passes.push(pass),
      /** Draws the scene with the given camera into the target, in linear light. */
      renderWorld(camera: THREE.Camera, target: THREE.WebGLRenderTarget) {
        if (!liveScene) return;
        const before = {
          target: renderer.getRenderTarget(),
          tone: renderer.toneMapping,
          exposure: renderer.toneMappingExposure,
          xr: renderer.xr.enabled,
          shadows: renderer.shadowMap.autoUpdate
        };
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false;
        renderer.toneMapping = THREE.NoToneMapping;
        renderer.toneMappingExposure = 1;
        try {
          renderer.setRenderTarget(target);
          renderer.clear();
          renderer.render(liveScene, camera);
        } finally {
          renderer.setRenderTarget(before.target);
          renderer.toneMapping = before.tone;
          renderer.toneMappingExposure = before.exposure;
          renderer.xr.enabled = before.xr;
          renderer.shadowMap.autoUpdate = before.shadows;
        }
      }
    }
  };

  ctx.physics = game.createPhysics(ctx);
  ctx.level = await game.createLevel(ctx);
  try {
    ctx.backdrop = await game.createBackdrop(ctx);
  } catch (error) {
    console.warn("[port] the backdrop (crane, ship, skyline) could not be built:", error);
    ctx.backdrop = game.stubs.backdrop();
  }
  ctx.ground = await game.createGround(ctx);
  ctx.physics.build();

  const rain = rainOf(params);
  if (rain !== undefined) ctx.ground.setRain?.(rain);
  // It rains here: every Port surface in the scene is wet while the yard is alive.
  const releaseWet = kit.holdWet();

  // The mirror picture: one time each frame, for the perspective view of this renderer.
  let mirrorFrame = -1;
  let inMirror = false;
  const apron = ctx.ground.apron as THREE.Mesh | undefined;
  if (apron) {
    apron.onBeforeRender = (r, scene, camera) => {
      if (inMirror || r !== renderer || mirrorFrame === ctx.time.frame) return;
      // A pass that draws every object with one material (outlines, depth) is not the view.
      if ((scene as THREE.Scene).overrideMaterial) return;
      if (!(camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
        if (ctx.ground.uniforms?.uReflOn) ctx.ground.uniforms.uReflOn.value = 0;
        return;
      }
      mirrorFrame = ctx.time.frame;
      liveScene = scene as THREE.Scene;
      inMirror = true;
      try {
        for (const pass of passes) pass(r, liveScene, camera);
      } catch (error) {
        console.warn("[port] the puddle mirror failed; reflections are off:", error);
        passes.length = 0;
        if (ctx.ground.uniforms?.uReflOn) ctx.ground.uniforms.uReflOn.value = 0;
      } finally {
        inMirror = false;
      }
    };
  }

  // Game mode makes one solid from the meshes of a node, and a node with very many triangles
  // becomes one box. The yard has its own collision boxes (the original code's physics made them for
  // each container, wall, stair and prop): they are the solid, and no drawn mesh is.
  holder.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.userData.noCollide = true;
  });
  const solid = collisionMesh(ctx.physics.boxes as GameBox[]);
  holder.add(solid);

  return {
    update(frame) {
      const dt = Math.min(frame.dt, 0.05);
      ctx.time.dt = dt;
      ctx.time.t += dt;
      ctx.time.real = performance.now() / 1000;
      ctx.time.frame++;
      kit.tick(dt);
      for (const part of [ctx.ground, ctx.level, ctx.backdrop]) {
        try {
          part?.update?.(dt);
        } catch (error) {
          if (!part.__warned) console.warn("[port] a yard part could not update:", error);
          part.__warned = true;
        }
      }
    },
    dispose() {
      releaseWet();
      if (apron) apron.onBeforeRender = () => {};
      ctx.ground?.reflectionTarget?.dispose?.();
      const seen = new Set<THREE.BufferGeometry>();
      holder.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.geometry && !seen.has(mesh.geometry)) {
          seen.add(mesh.geometry);
          mesh.geometry.dispose();
        }
      });
      holder.clear();
    }
  };
}

export function createPortYard(_seed: number, opts?: { appear?: boolean; params?: Record<string, unknown>; renderer?: THREE.WebGLRenderer }): ResourceInstance {
  const holder = new THREE.Group();
  holder.name = "port-yard";
  const renderer = opts?.renderer;
  let disposed = false;
  let yard: Yard | null = null;
  const ready = renderer
    ? portKit(renderer)
        .then((kit) => buildYard(kit, holder, opts?.params))
        .then((built) => {
          if (disposed) built.dispose();
          else yard = built;
        })
    : Promise.resolve();
  ready.catch((error) => console.warn("[library] could not build the port yard:", error));
  // The apron is flat at y 0. East of the quay edge is the sea: no ground there.
  const unregisterGround = registerPlaceGround(holder, (x, z) =>
    x >= YARD_GROUND.x0 && x <= YARD_GROUND.x1 && z >= YARD_GROUND.z0 && z <= YARD_GROUND.z1 ? 0 : null
  );
  return {
    object: holder,
    ready: ready.catch(() => undefined),
    update(frame: ResourceFrame) {
      yard?.update(frame);
    },
    dispose() {
      disposed = true;
      unregisterGround();
      yard?.dispose();
      yard = null;
    }
  };
}
