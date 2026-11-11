// Library entry: the cobbled alley arena, built in code.
//
// The set is built once per asset folder and shared: each placement clones the
// template (new Object3D nodes and lights, shared geometry, materials and
// textures). The shared kit is disposed a short time after its last placement
// goes, so an undo and redo does not draw all the art again.
import * as THREE from "three";
import { LIBRARY_BASE } from "../../models/gltf-model";
import { clockState } from "../../little-habitats/runtime";
import { registerPlaceGround } from "../../place-ground";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../../types";
import * as Art from "./art";
import { buildAlleyKit, instantiateAlley, nightFactor, type AlleyKit } from "./build";
import { A } from "./layout";

/** The default folder of the set's pictures (signs, posters, doors, crate, barrel, cheese, keg). */
export const ALLEY_ARENA_ASSET_BASE = `${LIBRARY_BASE}/environments/alley-arena`;

/** Time (ms) that an unused kit stays in memory before it is disposed. */
const KIT_LINGER_MS = 15000;

type KitSlot = { job: Promise<AlleyKit>; kit?: AlleyKit; refs: number; timer?: ReturnType<typeof setTimeout> };
const KITS = new Map<string, KitSlot>();

function acquireKit(base: string): KitSlot {
  let slot = KITS.get(base);
  if (!slot) {
    const job = Art.loadArt(base).then((pictures) => {
      Art.useArt(pictures);
      const kit = buildAlleyKit();
      Art.useArt(new Map());
      return kit;
    });
    const created: KitSlot = { job, refs: 0 };
    job.then(
      (kit) => (created.kit = kit),
      () => KITS.delete(base)
    );
    KITS.set(base, created);
    slot = created;
  }
  if (slot.timer) clearTimeout(slot.timer);
  slot.timer = undefined;
  slot.refs++;
  return slot;
}

function releaseKit(base: string, slot: KitSlot) {
  slot.refs--;
  if (slot.refs > 0) return;
  slot.timer = setTimeout(() => {
    if (slot.refs > 0 || KITS.get(base) !== slot) return;
    KITS.delete(base);
    void slot.job.then((kit) => kit.dispose()).catch(() => undefined);
  }, KIT_LINGER_MS);
}

function createAlleyArena(_seed: number, opts?: { appear?: boolean; params?: Record<string, unknown> }): ResourceInstance {
  const raw = opts?.params?.assetBase;
  const base = typeof raw === "string" && raw.trim() ? raw.trim().replace(/\/+$/, "") : ALLEY_ARENA_ASSET_BASE;
  const holder = new THREE.Group();
  holder.name = "alley-arena";
  const slot = acquireKit(base);
  let disposed = false;
  let copy: ReturnType<typeof instantiateAlley> | null = null;
  let lastNf = -1;

  const ready = slot.job.then((kit) => {
    if (disposed) return;
    copy = instantiateAlley(kit);
    holder.add(copy.object);
    lastNf = -1;
  });
  ready.catch((error) => console.warn("[library] could not build the alley arena:", error));
  // The street and the sidewalks are flush at y 0 inside the square (kerb stones are 0.1 m).
  const unregisterGround = registerPlaceGround(holder, (x, z) => (Math.abs(x) <= A && Math.abs(z) <= A ? 0 : null));

  return {
    object: holder,
    ready: ready.catch(() => undefined),
    update(frame: ResourceFrame) {
      const kit = slot.kit;
      if (!kit || !copy) return;
      kit.swayTime.value = frame.time;
      // The editor's time of day (the sky's clock); frame.night is used when it is larger.
      const nf = nightFactor(Math.max(frame.night, 1 - clockState().daylight));
      if (Math.abs(nf - lastNf) < 1e-3) return;
      lastNf = nf;
      kit.setNight(nf);
      for (const { light, base: strength } of copy.lights) light.intensity = strength * nf;
      for (const mesh of copy.nightMeshes) mesh.visible = nf > 0.002;
    },
    dispose() {
      unregisterGround();
      disposed = true;
      if (copy) holder.remove(copy.object);
      copy = null;
      releaseKit(base, slot);
    }
  };
}

export const ALLEY_ARENA_ENTRIES: ResourceEntry[] = [
  {
    id: "env:alley-arena",
    name: "Cobbled alley arena",
    kind: "environment",
    source: "local",
    origin: "Alley arena",
    category: "Places: arenas",
    license: "Owned by the Theras AI author",
    tags: ["alley", "arena", "street", "cobbles", "town", "city", "saloon", "speakeasy", "hotel", "tenement", "night", "noir", "lamps", "crates", "barrels", "kegs", "black-and-white"],
    description: `A black-and-white night street, ${2 * A} m square, closed in by three- to five-storey tenements (about ${2 * (A + 9)} m across in all). Cobbles, sidewalks, shop fronts, a speakeasy and a hotel, fire escapes, street lamps, crates, barrels, powder kegs, wanted posters and a cheese monument at the centre. The lamps and glows come on at night.`,
    footprint: A,
    create: createAlleyArena
  }
];
