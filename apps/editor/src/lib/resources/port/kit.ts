// The port kit: the surfaces and the prop builders of the port scene, ready to use in the
// editor. The scene makes every asset in code (no image, model or sound file): its surfaces are
// drawn by shaders into textures on the graphics card, so a kit belongs to ONE renderer. Each
// viewport (and the thumbnail renderer) gets its own kit; the original code itself loads one time.
//
// Credit: this code was written by Claude Fable 5.2 (a public claude.ai artifact,
// https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA). The original code is src/vendor/port/game.js.
import * as THREE from "three";
import type { PortContext, PortMaterials, PortProps } from "@/vendor/port/game.js";

type Game = typeof import("@/vendor/port/game.js");

export type PortKit = {
  game: Game;
  ctx: PortContext & { mats: PortMaterials; props: PortProps };
  /** A new prop. The caller owns its geometry (disposeProp); the materials stay with the kit. */
  buildProp(name: string, opts?: Record<string, unknown>): THREE.Group;
  /** Call once a frame from any live instance: frees the texture generator when it is idle. */
  tick(dt: number): void;
  /**
   * Rain in the scene: every surface of the kit gets wet (darker, shinier, with beads) while
   * one user or more holds it. Call the returned function when the rain is gone.
   */
  holdWet(): () => void;
};

let gameJob: Promise<Game> | null = null;
/** Loads the original code (about 1 MB of source, in its own chunk) one time. */
export function loadPort(): Promise<Game> {
  return (gameJob ??= import("@/vendor/port/game.js"));
}

/** Size of a full texture set. 1024 is the original code's "high"; 2048 is "ultra" for hero surfaces. */
export const PORT_TEXTURE_SIZE = 1024;

const kits = new WeakMap<THREE.WebGLRenderer, Promise<PortKit>>();
const textureSizes = new WeakMap<THREE.WebGLRenderer, number>();

/**
 * Sets the texture size of the kit of one renderer (256, 512, 1024 or 2048). Call it before the
 * first portKit(renderer). A renderer for small pictures (library thumbnails) needs only 256:
 * a full set at 1024 is 16 times the memory.
 */
export function setPortTextureSize(renderer: THREE.WebGLRenderer, size: number) {
  textureSizes.set(renderer, Math.min(2048, Math.max(64, Math.round(size))));
}

/** The kit of a renderer. The first call makes it (the surfaces are drawn when first used). */
export function portKit(renderer: THREE.WebGLRenderer): Promise<PortKit> {
  let job = kits.get(renderer);
  if (!job) {
    job = loadPort().then((game) => makeKit(game, renderer));
    kits.set(renderer, job);
    job.catch(() => kits.delete(renderer));
  }
  return job;
}

function makeKit(game: Game, renderer: THREE.WebGLRenderer): PortKit {
  const ctx = {
    THREE,
    params: {},
    events: game.createEvents(),
    rng: game.createRng(4207),
    time: { t: 0, dt: 0, frame: 0, real: 0 },
    quality: { ...game.QUALITY.high, tex: textureSizes.get(renderer) ?? PORT_TEXTURE_SIZE },
    renderer,
    // The factories add showcase objects here; the adapter never shows this group.
    scene: new THREE.Group()
  } as PortContext;
  ctx.mats = game.createMaterials(ctx);
  ctx.props = game.createProps(ctx);
  const full = ctx as PortKit["ctx"];
  // The original scene is always in the rain (wet = 1). In the editor a prop stands in any scene, so the
  // surfaces are dry until a rain place asks for wet.
  full.mats.uniforms.wet.value = 0;
  let wetHolders = 0;
  let lastTick = 0;
  return {
    game,
    ctx: full,
    holdWet() {
      wetHolders++;
      full.mats.uniforms.wet.value = 1;
      let held = true;
      return () => {
        if (!held) return;
        held = false;
        wetHolders--;
        if (wetHolders <= 0) full.mats.uniforms.wet.value = 0;
      };
    },
    buildProp: (name, opts) => full.props.build(name, opts),
    tick(dt) {
      const now = performance.now();
      if (now - lastTick < 500) return;
      lastTick = now;
      full.time.t += dt;
      full.mats.update(dt);
    }
  };
}

/** Frees the geometry of a prop. Materials and textures belong to the kit and stay. */
export function disposeProp(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}
