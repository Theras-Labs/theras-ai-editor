// River dressing: reeds at inner bends, stones at outer bends, lily pads in the slow pool,
// and one crossing (a library bridge, or stepping stones for a narrow river). Pure code,
// unit tested in tests/river.test.ts; the generator places the result as library objects.
import { riverRandom, type P2, type RiverObstacle, type RiverPool, type RiverSample } from "./path";

export const RIVER_DRESSING_IDS = {
  reeds: "nature:plant:cattail-reeds",
  boulder: "nature:rock:boulder",
  pebbles: "nature:rock:pebbles",
  lily: "nature:plant:water-lily",
  bridge: "lh:feature:bridge"
} as const;

/** Footprint radius (scale 1) of each dressing entry, from the library. */
export const RIVER_DRESSING_FOOTPRINT: Record<string, number> = {
  [RIVER_DRESSING_IDS.reeds]: 0.45,
  [RIVER_DRESSING_IDS.boulder]: 0.9,
  [RIVER_DRESSING_IDS.pebbles]: 0.8,
  [RIVER_DRESSING_IDS.lily]: 1,
  [RIVER_DRESSING_IDS.bridge]: 1.6
};
/** The library bridge spans 3 m (local x from -1.5 to 1.5) and is 0.64 m wide. */
export const BRIDGE_SPAN = 3;
export const BRIDGE_MAX_SCALE = 5.2;

export type BankStyle = "reeds" | "stones" | "mixed" | "clean";
export type DressRole = "reeds" | "stone" | "pebbles" | "lily" | "bridge";

export type DressItem = { id: string; role: DressRole; x: number; y: number; z: number; rotationY: number; scale: number; seed: number };

export type Crossing = {
  index: number;
  x: number;
  z: number;
  kind: "bridge" | "stones";
  /** Stepping stones (world x, z, radius) for kind "stones". */
  stones?: { x: number; z: number; r: number }[];
};

export type DressingInput = {
  samples: RiverSample[];
  width: number;
  pool?: RiverPool;
  banks: BankStyle;
  bridge: boolean;
  stones: boolean;
  seed: number;
  obstacles: RiverObstacle[];
  anchor: P2;
  /** Landmarks: a bridge goes where the river crosses the line between two of them. */
  landmarks: (P2 & { r: number })[];
  /** Ground or water height at a signed offset from the centerline at a sample (offset > 0 = +n side). */
  heightAt: (index: number, offset: number) => number;
  /** Height of the water surface. */
  waterY: number;
  /** Preferred bridge spot (in line with a city avenue): tried before every other place. */
  crossingAt?: P2;
  /**
   * For each sample: the side of the normal n that faces a city (+1 or -1), or 0. That bank is a
   * clean quay: no reeds or stones are put on it.
   */
  citySide?: number[];
};

export type DressingResult = {
  items: DressItem[];
  /** Stepping stones across the river (drawn by the river object itself). */
  stepping?: Crossing;
  /** Sample index of the library bridge, when there is one. */
  bridgeIndex?: number;
  skipped: string[];
};

function segmentIntersection(a: P2, b: P2, c: P2, d: P2): number | null {
  const r = { x: b.x - a.x, z: b.z - a.z };
  const s = { x: d.x - c.x, z: d.z - c.z };
  const den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den;
  const u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : null;
}

export function planDressing(input: DressingInput): DressingResult {
  const { samples, width, pool, banks } = input;
  const rng = riverRandom(input.seed ^ 0xd2e55);
  const total = samples[samples.length - 1]?.s ?? 0;
  const items: DressItem[] = [];
  const skipped: string[] = [];
  const taken: { x: number; z: number; r: number }[] = [];
  const free = (x: number, z: number, r: number) =>
    input.obstacles.every((o) => Math.hypot(o.x - x, o.z - z) >= o.r + r + 0.2) && taken.every((t) => Math.hypot(t.x - x, t.z - z) >= t.r + r + 0.05);
  /** True when a bank offset at sample i lies on the city side (a clean quay). */
  const onCitySide = (i: number, offset: number) => {
    const side = input.citySide?.[i] ?? 0;
    return side !== 0 && Math.sign(offset) === side;
  };
  const add = (item: Omit<DressItem, "seed">, r: number, at?: { i: number; offset: number }) => {
    if (at && onCitySide(at.i, at.offset)) return false;
    if (!free(item.x, item.z, r)) return false;
    taken.push({ x: item.x, z: item.z, r });
    items.push({ ...item, seed: Math.floor(rng() * 1e6) });
    return true;
  };
  const at = (i: number, offset: number, along = 0) => {
    const p = samples[i]!;
    return { x: p.x + p.nx * offset + p.tx * along, z: p.z + p.nz * offset + p.tz * along };
  };
  const smoothK = (i: number) => {
    let sum = 0;
    let n = 0;
    for (let j = Math.max(0, i - 4); j <= Math.min(samples.length - 1, i + 4); j++) {
      sum += samples[j]!.k;
      n++;
    }
    return sum / n;
  };

  // ── Crossing ────────────────────────────────────────────────
  const poolSpread = width * 1.4 + 1;
  const crossingOk = (i: number) => {
    const p = samples[i]!;
    if (p.s < Math.max(4, total * 0.12) || p.s > total - Math.max(4, total * 0.12)) return false;
    if (pool && Math.abs(p.s - pool.s) < poolSpread * 1.6) return false;
    for (let j = Math.max(0, i - 4); j <= Math.min(samples.length - 1, i + 4); j++) if (Math.abs(samples[j]!.k) > 1 / (3 * width + 2)) return false;
    return true;
  };
  const candidates: number[] = [];
  for (let a = 0; a < input.landmarks.length; a++) {
    for (let b = a + 1; b < input.landmarks.length; b++) {
      for (let i = 0; i < samples.length - 1; i++) {
        if (segmentIntersection(samples[i]!, samples[i + 1]!, input.landmarks[a]!, input.landmarks[b]!) !== null) candidates.push(i);
      }
    }
  }
  if (input.crossingAt) {
    const c = input.crossingAt;
    let best = -1;
    let bestD = Infinity;
    samples.forEach((p, i) => {
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (best >= 0) candidates.unshift(best);
  }
  const byAnchor = samples.map((p, i) => ({ i, d: Math.hypot(p.x - input.anchor.x, p.z - input.anchor.z) })).sort((a, b) => a.d - b.d);
  candidates.push(...byAnchor.map((c) => c.i));
  const crossings: number[] = [];
  const wanted = (input.bridge ? 1 : 0) + (input.stones ? 1 : 0);
  // The bridge (first crossing) prefers a place narrow enough for the library bridge.
  const bridgeFits = (i: number) => 2 * samples[i]!.hw + 1.4 <= BRIDGE_SPAN * BRIDGE_MAX_SCALE;
  if (input.bridge) {
    const fit = candidates.find((i) => crossingOk(i) && bridgeFits(i));
    if (fit !== undefined) crossings.push(fit);
  }
  for (const i of candidates) {
    if (crossings.length >= wanted) break;
    if (!crossingOk(i)) continue;
    if (crossings.some((j) => Math.abs(samples[j]!.s - samples[i]!.s) < 10)) continue;
    crossings.push(i);
  }
  let crossing: Crossing | undefined;
  const stonesAcross = (i: number) => {
    const p = samples[i]!;
    const n = Math.max(3, Math.round((2 * p.hw) / 0.7));
    const list: { x: number; z: number; r: number }[] = [];
    for (let k = 0; k < n; k++) {
      const off = -p.hw + 0.35 + ((2 * p.hw - 0.7) * k) / Math.max(1, n - 1);
      const zig = (k % 2 === 0 ? 1 : -1) * (0.08 + rng() * 0.1);
      list.push({ ...at(i, off, zig), r: 0.24 + rng() * 0.08 });
    }
    return list;
  };
  if (wanted > 0 && crossings.length === 0) skipped.push("crossing: no straight part of the river away from the ends and the pool");
  let next = 0;
  if (input.bridge && crossings[next] !== undefined) {
    const i = crossings[next++]!;
    const p = samples[i]!;
    const needScale = (2 * p.hw + 1.4) / BRIDGE_SPAN;
    if (2 * p.hw <= 2.4) {
      crossing = { index: i, x: p.x, z: p.z, kind: "stones", stones: stonesAcross(i) };
    } else if (needScale > BRIDGE_MAX_SCALE) {
      skipped.push(`bridge: the river is ${(2 * p.hw).toFixed(1)} m wide there; the library bridge spans ${(BRIDGE_SPAN * BRIDGE_MAX_SCALE - 1.4).toFixed(1)} m at most`);
    } else {
      const scale = Math.max(1, needScale);
      const half = (BRIDGE_SPAN * scale) / 2;
      const y = (input.heightAt(i, half * 0.8) + input.heightAt(i, -half * 0.8)) / 2;
      const ends = [at(i, half), at(i, -half)];
      const clear = ends.every((e) => input.obstacles.every((o) => Math.hypot(o.x - e.x, o.z - e.z) >= o.r + 0.3));
      if (clear) {
        // Local x of the bridge runs across the river (along n).
        items.push({ id: RIVER_DRESSING_IDS.bridge, role: "bridge", x: p.x, y, z: p.z, rotationY: Math.atan2(-p.nz, p.nx), scale, seed: Math.floor(rng() * 1e6) });
        taken.push({ x: p.x, z: p.z, r: 0.5 });
        crossing = { index: i, x: p.x, z: p.z, kind: "bridge" };
      } else skipped.push("bridge: an object stands at a bridge end");
    }
  }
  const stoneCrossing = input.stones && crossings[next] !== undefined ? crossings[next]! : undefined;
  let stepping: Crossing | undefined;
  if (stoneCrossing !== undefined && crossing?.kind !== "stones") {
    const p = samples[stoneCrossing]!;
    stepping = { index: stoneCrossing, x: p.x, z: p.z, kind: "stones", stones: stonesAcross(stoneCrossing) };
  }
  const crossingIndices = [crossing?.index, stepping?.index].filter((i): i is number => i !== undefined);
  const nearCrossing = (i: number) => crossingIndices.some((j) => Math.abs(samples[j]!.s - samples[i]!.s) < 2.5 + width * 0.3);

  // ── Banks: reeds at inner bends, stones at outer bends ──────
  if (banks !== "clean") {
    const threshold = 1 / (7 * width + 6);
    const spots: { i: number; k: number }[] = [];
    for (let i = 2; i < samples.length - 2; i++) {
      const k = smoothK(i);
      if (Math.abs(k) < threshold) continue;
      if (Math.abs(k) < Math.abs(smoothK(i - 1)) || Math.abs(k) < Math.abs(smoothK(i + 1))) continue;
      spots.push({ i, k });
    }
    // Straight stretches get an accent every 7 to 13 m (shorter rivers more often).
    const every = Math.max(7, Math.min(13, total / 3));
    let last = -Infinity;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!.s;
      const nearBend = spots.some((b) => Math.abs(samples[b.i]!.s - s) < 6);
      if (!nearBend && s - last > every && s > 3 && s < total - 3) {
        spots.push({ i, k: (rng() < 0.5 ? 1 : -1) * 1e-6 });
        last = s;
      } else if (nearBend) last = s;
    }
    spots.sort((a, b) => a.i - b.i);
    let lastS = -Infinity;
    for (const spot of spots) {
      const p = samples[spot.i]!;
      if (p.s < 2 || p.s > total - 2 || p.s - lastS < 4.5 || nearCrossing(spot.i)) continue;
      lastS = p.s;
      const inner = spot.k >= 0 ? 1 : -1;
      const outer = -inner;
      const bend = Math.abs(spot.k) >= threshold;
      const wantReeds = banks === "reeds" || banks === "mixed";
      const wantStones = banks === "stones" || banks === "mixed";
      if (wantReeds) {
        const count = bend ? 2 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2);
        for (let c = 0; c < count; c++) {
          const off = inner * (p.hw + 0.05 + rng() * 0.45);
          const along = (rng() - 0.5) * 2.6;
          const q = at(spot.i, off, along);
          const scale = 0.8 + rng() * 0.4;
          add({ id: RIVER_DRESSING_IDS.reeds, role: "reeds", x: q.x, z: q.z, y: input.heightAt(spot.i, off), rotationY: rng() * Math.PI * 2, scale }, 0.3 * scale, { i: spot.i, offset: off });
        }
        if (banks === "reeds" && bend && rng() < 0.5) {
          const off = outer * (p.hw + 0.3 + rng() * 0.3);
          const q = at(spot.i, off, (rng() - 0.5) * 2);
          add({ id: RIVER_DRESSING_IDS.reeds, role: "reeds", x: q.x, z: q.z, y: input.heightAt(spot.i, off), rotationY: rng() * Math.PI * 2, scale: 0.8 }, 0.25, { i: spot.i, offset: off });
        }
      }
      if (wantStones && (bend || banks === "stones")) {
        const side = bend ? outer : spot.k >= 0 ? -1 : 1;
        const count = bend ? 1 + Math.floor(rng() * 2) : 1;
        for (let c = 0; c < count; c++) {
          const scale = Math.min(0.75, 0.32 + width * 0.05 + rng() * 0.2);
          const off = side * (p.hw + 0.1 + scale * 0.6 + rng() * 0.3);
          const q = at(spot.i, off, (rng() - 0.5) * 2.4);
          add({ id: RIVER_DRESSING_IDS.boulder, role: "stone", x: q.x, z: q.z, y: input.heightAt(spot.i, off) - 0.04, rotationY: rng() * Math.PI * 2, scale }, 0.9 * scale, { i: spot.i, offset: off });
        }
        if (rng() < (banks === "stones" ? 0.8 : 0.45)) {
          const off = side * (p.hw - 0.1);
          const q = at(spot.i, off, (rng() < 0.5 ? -1 : 1) * (1.4 + rng()));
          const scale = 0.55 + rng() * 0.25;
          add({ id: RIVER_DRESSING_IDS.pebbles, role: "pebbles", x: q.x, z: q.z, y: input.heightAt(spot.i, off), rotationY: rng() * Math.PI * 2, scale }, 0.8 * scale, { i: spot.i, offset: off });
        }
      }
    }

    // ── Lily pads in the slow water ─────────────────────────────
    let lilyIndex = -1;
    if (pool) {
      lilyIndex = samples.reduce((best, p, i) => (Math.abs(p.s - pool.s) < Math.abs(samples[best]!.s - pool.s) ? i : best), 0);
    } else if (width >= 2.5) {
      let bestW = 0;
      samples.forEach((p, i) => {
        if (p.s > total * 0.2 && p.s < total * 0.8 && p.hw > bestW && !nearCrossing(i)) {
          bestW = p.hw;
          lilyIndex = i;
        }
      });
    }
    if (lilyIndex >= 0 && !nearCrossing(lilyIndex)) {
      const p = samples[lilyIndex]!;
      const count = pool ? 2 + Math.floor(rng() * 2) : 1;
      const k = smoothK(lilyIndex);
      // Lilies float on the slow, inner side of the bend.
      const inner = k >= 0 ? 1 : -1;
      for (let c = 0; c < count; c++) {
        const scale = Math.max(0.4, Math.min(0.8, (p.hw - 0.3) / 1.6));
        const off = inner * Math.max(0, p.hw - scale * 1.0 - 0.25) * (0.35 + rng() * 0.6);
        const q = at(lilyIndex, off, (rng() - 0.5) * Math.min(4, p.hw * 1.6));
        add({ id: RIVER_DRESSING_IDS.lily, role: "lily", x: q.x, z: q.z, y: input.waterY + 0.005, rotationY: rng() * Math.PI * 2, scale }, scale * 0.85);
      }
    }
  }

  return {
    items,
    stepping: crossing?.kind === "stones" ? crossing : stepping,
    bridgeIndex: crossing?.kind === "bridge" ? crossing.index : undefined,
    skipped
  };
}
