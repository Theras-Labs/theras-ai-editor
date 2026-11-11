// Slot dock state. The slot list is a per-viewer preference, so it lives in localStorage.
import { proxy, subscribe } from "valtio";
import { DEFAULT_SLOTS } from "./presets";
import { isSlotIcon, type BuildSlot } from "./types";

// v4: Island kit bridge, lantern and seed mix; Soil, Stone and Water shape island terrain.
const STORAGE_KEY = "theras:build-slots:v4";
const MAX_SLOTS = 12;

type BuildSlotState = {
  slots: BuildSlot[];
  /** Index of the active slot. null = normal editor selection (no build). */
  activeIndex: number | null;
  /** Quarter turns (0..3) applied to placed recipes. */
  rotation: number;
  /** Touch mode: bigger dock, a tap places, long press erases. */
  touchMode: boolean;
};

function loadSlots(): BuildSlot[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as BuildSlot[]) : null;
    if (Array.isArray(parsed) && parsed.length > 0 && parsed.every((s) => s && typeof s.label === "string" && isSlotIcon(s.icon))) {
      return parsed.slice(0, MAX_SLOTS);
    }
  } catch {
    // fall through to defaults
  }
  return structuredClone(DEFAULT_SLOTS);
}

export const buildSlotStore = proxy<BuildSlotState>({
  slots: loadSlots(),
  activeIndex: null,
  rotation: 0,
  touchMode: false
});

subscribe(buildSlotStore.slots, () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(buildSlotStore.slots));
  } catch {
    // storage blocked: the dock still works for this session
  }
});

export function selectSlot(index: number | null) {
  if (index === null || index < 0 || index >= buildSlotStore.slots.length) {
    buildSlotStore.activeIndex = null;
    return;
  }
  buildSlotStore.activeIndex = buildSlotStore.activeIndex === index ? null : index;
}

/** Replaces slot `index`, or appends when index is undefined or past the end. Returns the index used. */
export function upsertSlot(slot: BuildSlot, index?: number): number {
  if (index !== undefined && index >= 0 && index < buildSlotStore.slots.length) {
    buildSlotStore.slots[index] = slot;
    return index;
  }
  if (buildSlotStore.slots.length >= MAX_SLOTS) {
    throw new Error(`The dock is full (${MAX_SLOTS} slots). Replace a slot instead.`);
  }
  buildSlotStore.slots.push(slot);
  return buildSlotStore.slots.length - 1;
}

export function removeSlot(index: number) {
  if (index < 0 || index >= buildSlotStore.slots.length) return;
  buildSlotStore.slots.splice(index, 1);
  if (buildSlotStore.activeIndex !== null && buildSlotStore.activeIndex >= buildSlotStore.slots.length) {
    buildSlotStore.activeIndex = null;
  }
}

export function resetSlots() {
  buildSlotStore.slots.splice(0, buildSlotStore.slots.length, ...structuredClone(DEFAULT_SLOTS));
  buildSlotStore.activeIndex = null;
}

export function rotateSlot() {
  buildSlotStore.rotation = (buildSlotStore.rotation + 1) % 4;
}
