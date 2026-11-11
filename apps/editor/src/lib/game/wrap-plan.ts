// The wrap plan of game mode: in which order and how fast the scene gets its colliders, so the
// user sees the step (GameWorld builds a few units per tick and draws a sweep over each one).
// Pure functions, no three.js, no Rapier.

/** Time between two wrap ticks (only while the phase is "wrapping"). */
export const WRAP_TICK_MS = 90;
/** The shortest wrap: a small scene still shows the step. */
export const WRAP_MIN_MS = 1200;
/** The longest wrap: after this time every remaining unit is built at once. */
export const WRAP_MAX_MS = 6000;
/** Added wrap time per unit (400 units = 1.2 s + 3.2 s = 4.4 s). */
export const WRAP_MS_PER_UNIT = 8;

/** A unit that is ready for its collider. */
export type WrapItem = { id: string; terrain: boolean; x: number; y: number; z: number };

/** Planned wrap length for a number of units. */
export function wrapDurationMs(total: number) {
  return Math.min(WRAP_MAX_MS, WRAP_MIN_MS + Math.max(0, total) * WRAP_MS_PER_UNIT);
}

/**
 * Terrain first, then the other units from near to far (horizontal distance to the start
 * hint). Equal distances keep the id order, so the order is stable.
 */
export function orderWrap<T extends WrapItem>(items: readonly T[], hint: { x: number; z: number }): T[] {
  const dist = (t: T) => Math.hypot(t.x - hint.x, t.z - hint.z);
  return [...items].sort((a, b) => {
    if (a.terrain !== b.terrain) return a.terrain ? -1 : 1;
    const d = dist(a) - dist(b);
    if (d !== 0) return d;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Units that should be built after elapsedMs of the wrap. The first unit is due at once, the
 * last one at the planned end (total * elapsed / duration, rounded up).
 */
export function wrapDue(elapsedMs: number, total: number) {
  if (total <= 0) return 0;
  const duration = wrapDurationMs(total);
  if (elapsedMs >= duration) return total;
  return Math.min(total, Math.max(1, Math.ceil((total * Math.max(0, elapsedMs)) / duration)));
}

export type WrapState = {
  elapsedMs: number;
  /** Units built in this wrap. */
  done: number;
  /** Units that are ready and wait for their collider. */
  ready: number;
  /** Units that are seen but not ready yet (loading, still moving). */
  waiting: number;
  /** The user asked to finish now. */
  skip: boolean;
};

/** How many ready units to build in this tick. */
export function wrapBudget(s: WrapState) {
  if (s.skip || s.elapsedMs >= WRAP_MAX_MS) return s.ready;
  const total = s.done + s.ready + s.waiting;
  return Math.max(0, Math.min(s.ready, wrapDue(s.elapsedMs, total) - s.done));
}

/**
 * The wrap is over (after this tick's builds): every unit is built and the planned time has
 * passed, or the user skipped, or the time cap is reached. On skip and on the cap the caller
 * also builds the units that are not ready yet.
 */
export function wrapFinished(s: WrapState) {
  if (s.skip || s.elapsedMs >= WRAP_MAX_MS) return true;
  const total = s.done + s.ready + s.waiting;
  return s.ready === 0 && s.waiting === 0 && s.elapsedMs >= wrapDurationMs(total);
}

/** Total wrap time of a scene where every unit is ready at once (for tests and planning). */
export function simulateWrapMs(total: number, tickMs = WRAP_TICK_MS) {
  let done = 0;
  // Bounded loop: the time cap ends it after WRAP_MAX_MS / tickMs + 1 ticks.
  for (let elapsed = 0; elapsed <= WRAP_MAX_MS + tickMs; elapsed += tickMs) {
    const state: WrapState = { elapsedMs: elapsed, done, ready: total - done, waiting: 0, skip: false };
    done += wrapBudget(state);
    if (wrapFinished({ ...state, done, ready: total - done })) return elapsed;
  }
  return WRAP_MAX_MS + tickMs;
}
