// Ghost preview (plan docs/plans/realtime-ai-harness.md, 5.10): a soft pulsing ring at the
// anchor while a prompt waits for the model. useCopilot shows it when the prompt goes to the
// model and hides it at the first tool call, on abort, on error and on completion.
// The viewport (src/viewport/components/GhostPreviewRing.tsx) subscribes to this state.
//
// Client-only. No network, no timers: the ring animates in useFrame only while it is visible.
// Same sharing method as src/lib/build-reveal.ts (module state that the viewport reads),
// plus a subscribe function so the viewport mounts the ring only while it is visible.

export type GhostPoint = { x: number; y: number; z: number };

export type GhostState = {
  visible: boolean;
  position: GhostPoint;
  /** Ring radius in meters. */
  radius: number;
  /** performance.now() time of showGhost (for the fade-in). */
  shownAt: number;
};

let state: GhostState = { visible: false, position: { x: 0, y: 0, z: 0 }, radius: 2, shownAt: 0 };
const listeners = new Set<() => void>();

function set(next: GhostState) {
  state = next;
  for (const listener of listeners) listener();
}

export function showGhost(position: GhostPoint, radius: number) {
  set({ visible: true, position: { ...position }, radius, shownAt: typeof performance === "undefined" ? 0 : performance.now() });
}

export function hideGhost() {
  if (!state.visible) return;
  set({ ...state, visible: false });
}

/** Current state. The object changes identity on each change (for useSyncExternalStore). */
export function getGhost(): GhostState {
  return state;
}

export function subscribeGhost(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ── Anchor (pure, unit tested) ───────────────────────────────

/** The fields of a scene digest node that the anchor needs (see scene-digest.ts DigestNode). */
export type GhostNode = { id: string; name: string; kind: string; position: GhostPoint; radius?: number; terrain?: boolean };

export const GHOST_MIN_RADIUS = 1.5;
export const GHOST_MAX_RADIUS = 12;
export const GHOST_DEFAULT_RADIUS = 3;

const clampRadius = (r: number) => Math.min(GHOST_MAX_RADIUS, Math.max(GHOST_MIN_RADIUS, r));
const normalize = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/**
 * Where the ring goes: a scene node named in the prompt ("next to the windmill"), else the
 * selection, else the camera target. A name that more than one node has is not used.
 */
export function resolveGhostAnchor(
  prompt: string,
  nodes: GhostNode[],
  selection: string[],
  cameraTarget?: GhostPoint
): { position: GhostPoint; radius: number; source: "node" | "selection" | "camera" } {
  const placeable = nodes.filter((n) => !n.terrain && !n.kind.startsWith("sky") && n.kind !== "folder");

  const text = normalize(prompt);
  const named = placeable.filter((n) => {
    const name = normalize(n.name);
    return name.trim().length >= 3 && text.includes(name);
  });
  if (named.length > 0) {
    const longest = Math.max(...named.map((n) => n.name.trim().length));
    const best = named.filter((n) => n.name.trim().length === longest);
    if (best.length === 1) {
      const n = best[0];
      return { position: { ...n.position }, radius: clampRadius((n.radius ?? 1) + 1), source: "node" };
    }
  }

  const selected = placeable.filter((n) => selection.includes(n.id));
  if (selected.length > 0) {
    const c = selected.reduce((acc, n) => ({ x: acc.x + n.position.x, y: acc.y + n.position.y, z: acc.z + n.position.z }), { x: 0, y: 0, z: 0 });
    const center = { x: c.x / selected.length, y: c.y / selected.length, z: c.z / selected.length };
    const spread = Math.max(...selected.map((n) => Math.hypot(n.position.x - center.x, n.position.z - center.z) + (n.radius ?? 1)));
    return { position: center, radius: clampRadius(spread + 0.5), source: "selection" };
  }

  return { position: cameraTarget ? { ...cameraTarget } : { x: 0, y: 0, z: 0 }, radius: GHOST_DEFAULT_RADIUS, source: "camera" };
}
