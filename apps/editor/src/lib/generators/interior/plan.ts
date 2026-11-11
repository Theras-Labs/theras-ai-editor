// Interior plan: which furniture a room gets and where it stands. Pure layout math (no scene).
//
// The planner works in a canonical frame with the entrance on +z, then turns the whole plan to
// the real side `front`. Furniture comes in blocks (a seating group, a desk cluster, a bar). A
// block is placed only where all its items keep their wall distance and the block keeps a gap
// to every block placed before it. The main piece is placed first, then the clear way from the
// entrance to it is reserved, then the other blocks follow by priority. So a small room drops
// the low-priority blocks and still has its main piece.
import { Rand } from "../architecture/mesh";
import type { InteriorParams, InteriorSide, InteriorUse } from "./params";

export type InteriorItem = { kind: string; label: string; x: number; z: number; w: number; d: number; h: number; rotY: number; group?: string };
// x, z = center in the room frame; w (along local x of the item), d, h in meters; rotY is a multiple of PI/2.
export type InteriorPlan = { items: InteriorItem[]; counts: Record<string, number>; lights: { x: number; y: number; z: number }[]; summary: string };

const Q = Math.PI / 2;
const EPS = 1e-6;
/** Half width of the clear way from the entrance to the main piece. */
export const WAY_HALF = 0.7;
/** Distance of free-standing items from a wall, and of wall pieces. */
export const FREE_GAP = 0.25;
export const WALL_GAP = 0.03;

/** Kinds that stand against a wall (0.03 from it). All other kinds keep 0.25 from the walls. */
export const WALL_KINDS: ReadonlySet<string> = new Set([
  "lift-core",
  "storage",
  "back-shelf",
  "kitchen",
  "fridge",
  "bed",
  "nightstand",
  "wardrobe",
  "tv-console",
  "booth"
]);
/** Kinds that lie flat on the floor or hang overhead: a clear way can pass over or under them. */
export const PASSABLE_KINDS: ReadonlySet<string> = new Set(["rug", "pendant"]);
/** The key piece of each use. Its block has the group "main". */
export const MAIN_KIND: Record<InteriorUse, string> = { lobby: "reception-desk", office: "desk", lounge: "bar", apartment: "sofa" };
export const MAIN_GROUP = "main";

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** Quarter turns (0..3) of an angle. */
export function quarterTurns(rotY: number): number {
  return ((Math.round(rotY / Q) % 4) + 4) % 4;
}

/** World-frame footprint (after rotY) of an item: half sizes on x and z. */
export function itemHalf(item: InteriorItem): [number, number] {
  return quarterTurns(item.rotY) % 2 ? [item.d / 2, item.w / 2] : [item.w / 2, item.d / 2];
}

/** Quarter turns from the canonical frame (entrance on +z) to the real side. */
export function sideTurns(front: InteriorSide): number {
  return front === "+z" ? 0 : front === "+x" ? 1 : front === "-z" ? 2 : 3;
}

/** Turns a point about y by k quarter turns (same sense as THREE rotation.y = k * PI/2). */
export function turn(x: number, z: number, k: number): [number, number] {
  switch (((k % 4) + 4) % 4) {
    case 0:
      return [x, z];
    case 1:
      return [z, -x];
    case 2:
      return [-x, -z];
    default:
      return [-z, x];
  }
}

/** Width (along the entrance wall) and depth (entrance to back wall) of the room. */
export function canonicalSize(p: Pick<InteriorParams, "width" | "depth" | "front">): [number, number] {
  return sideTurns(p.front) % 2 ? [p.depth, p.width] : [p.width, p.depth];
}

export type Rect = { x0: number; z0: number; x1: number; z1: number };

export function itemRect(it: InteriorItem): Rect {
  const [hx, hz] = itemHalf(it);
  return { x0: it.x - hx, z0: it.z - hz, x1: it.x + hx, z1: it.z + hz };
}

export function unionRect(items: InteriorItem[]): Rect {
  const r = { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity };
  for (const it of items) {
    const q = itemRect(it);
    r.x0 = Math.min(r.x0, q.x0);
    r.z0 = Math.min(r.z0, q.z0);
    r.x1 = Math.max(r.x1, q.x1);
    r.z1 = Math.max(r.z1, q.z1);
  }
  return r;
}

/** Lifts in a lift core of this width. */
export function liftCount(core: InteriorItem): number {
  return core.w >= 5 ? 3 : 2;
}

/**
 * The clear way of a canonical plan (entrance on +z): a band from the entrance straight in to the
 * level just in front of the main block, then a band across to the main block. Both 1.4 wide.
 */
export function wayRects(mainRect: Rect, hd: number): Rect[] {
  const zf = mainRect.z1;
  const mx = (mainRect.x0 + mainRect.x1) / 2;
  return [
    { x0: -WAY_HALF, x1: WAY_HALF, z0: zf, z1: hd },
    { x0: Math.min(0, mx) - WAY_HALF, x1: Math.max(0, mx) + WAY_HALF, z0: zf, z1: Math.min(hd, zf + 2 * WAY_HALF) }
  ];
}

// ── Layout engine ────────────────────────────────────────────

type Cand = [number, number, number];

const item = (kind: string, label: string, x: number, z: number, w: number, d: number, h: number, rotY = 0, grouped = false): InteriorItem => ({
  kind,
  label,
  x,
  z,
  w,
  d,
  h,
  rotY,
  ...(grouped ? { group: "@" } : {})
});

class Room {
  items: InteriorItem[] = [];
  blocks: Record<string, number> = {};
  private taken: (Rect & { pad: number; way?: boolean })[] = [];
  constructor(
    readonly hw: number,
    readonly hd: number
  ) {}

  private fits(out: InteriorItem[], pad: number) {
    for (const it of out) {
      const [hx, hz] = itemHalf(it);
      const m = WALL_KINDS.has(it.kind) ? WALL_GAP : FREE_GAP;
      if (Math.abs(it.x) + hx > this.hw - m + EPS || Math.abs(it.z) + hz > this.hd - m + EPS) return false;
    }
    const r = unionRect(out);
    for (const t of this.taken) {
      // The reserved way needs only a small gap: furniture may line it.
      const g = t.way ? 0.05 : pad + t.pad;
      if (r.x0 < t.x1 + g - EPS && r.x1 > t.x0 - g + EPS && r.z0 < t.z1 + g - EPS && r.z1 > t.z0 - g + EPS) return false;
    }
    return true;
  }

  /** Places a block (items in block-local coordinates) at (ax, az) turned by k quarter turns. */
  place(type: string, proto: InteriorItem[], ax: number, az: number, k: number, pad: number, main = false): InteriorItem[] | null {
    const id = main ? MAIN_GROUP : `${type}-${(this.blocks[type] ?? 0) + 1}`;
    const out = proto.map((it) => {
      const [x, z] = turn(it.x, it.z, k);
      const o: InteriorItem = { ...it, x: ax + x, z: az + z, rotY: quarterTurns(it.rotY + k * Q) * Q };
      if (it.group) o.group = id;
      return o;
    });
    if (!this.fits(out, pad)) return null;
    this.items.push(...out);
    this.taken.push({ ...unionRect(out), pad });
    this.blocks[type] = (this.blocks[type] ?? 0) + 1;
    return out;
  }

  tryAt(type: string, proto: InteriorItem[], cands: Cand[], pad: number, main = false): InteriorItem[] | null {
    for (const [x, z, k] of cands) {
      const r = this.place(type, proto, x, z, k, pad, main);
      if (r) return r;
    }
    return null;
  }

  /** Reserves the clear way to the main block. */
  reserveWay(main: InteriorItem[]) {
    for (const r of wayRects(unionRect(main), this.hd)) this.taken.push({ ...r, pad: 0, way: true });
  }
}

/** Local extents of a block after k quarter turns. */
function extents(proto: InteriorItem[], k: number): Rect {
  return unionRect(proto.map((it) => ({ ...it, ...(([x, z]) => ({ x, z }))(turn(it.x, it.z, k)), rotY: it.rotY + k * Q })));
}

/** Values from lo to hi in steps, ordered by distance from pref. */
function sweep(lo: number, hi: number, pref: number, step = 0.5): number[] {
  if (hi < lo) return [lo];
  const out: number[] = [];
  for (let v = lo; v <= hi + EPS; v += step) out.push(v);
  out.push(clamp(pref, lo, hi));
  return out.sort((a, b) => Math.abs(a - pref) - Math.abs(b - pref));
}

/** Plant candidates: entrance sides, corners, then along the walls every `every` meters. */
function plantSpots(hw: number, hd: number, every: number): [number, number][] {
  const m = FREE_GAP + 0.3;
  const out: [number, number][] = [
    [-1.8, hd - m],
    [1.8, hd - m],
    [-hw + m, -hd + m],
    [hw - m, -hd + m],
    [-hw + m, hd - m],
    [hw - m, hd - m]
  ];
  const nz = Math.floor((2 * hd - 2 * m) / every);
  for (let i = 1; i <= nz; i++) {
    const z = hd - m - (i * (2 * hd - 2 * m)) / (nz + 1);
    out.push([-hw + m, z], [hw - m, z]);
  }
  const nx = Math.floor((2 * hw - 2 * m) / every);
  for (let i = 1; i <= nx; i++) out.push([-hw + m + (i * (2 * hw - 2 * m)) / (nx + 1), -hd + m]);
  return out;
}

function addPlants(R: Room, rand: Rand, max: number, hMin: number, hMax: number) {
  let n = 0;
  for (const [x, z] of plantSpots(R.hw, R.hd, 5)) {
    if (n >= max) break;
    const h = +rand.range(hMin, hMax).toFixed(2);
    if (R.place("plant", [item("plant", "Potted plant", 0, 0, 0.6, 0.6, h)], x, z, 0, 0.15)) n++;
  }
}

// ── Blocks (block-local, the front of the block is +z) ───────

/** Seating group: sofa, two armchairs opposite, coffee table, floor lamp. Compact: sofa and table only. */
function seatingBlock(compact: boolean): InteriorItem[] {
  if (compact)
    return [
      item("rug", "Rug", 0, -0.1, 2.6, 1.8, 0.015, 0, true),
      item("sofa", "Three-seat sofa", 0, -0.6, 2.1, 0.9, 0.8, 0, true),
      item("coffee-table", "Coffee table", 0, 0.45, 1.0, 0.5, 0.42, 0, true)
    ];
  return [
    item("rug", "Rug", 0, 0, 3.2, 2.4, 0.015, 0, true),
    item("sofa", "Three-seat sofa", 0, -1.15, 2.1, 0.9, 0.8, 0, true),
    item("coffee-table", "Coffee table", 0, -0.05, 1.1, 0.6, 0.42, 0, true),
    item("armchair", "Armchair", -0.6, 1.1, 0.85, 0.85, 0.8, Math.PI, true),
    item("armchair", "Armchair", 0.6, 1.1, 0.85, 0.85, 0.8, Math.PI, true),
    item("floor-lamp", "Floor lamp", 1.35, -1.35, 0.4, 0.4, 1.65, 0, true)
  ];
}

function receptionBlock(L: number): InteriorItem[] {
  return [
    item("reception-desk", "Reception desk", 0, 0, L, 1.35, 1.1, 0, true),
    item("task-chair", "Desk chair", -L / 4, -0.6, 0.6, 0.6, 1.0, 0, true),
    item("task-chair", "Desk chair", L / 4, -0.6, 0.6, 0.6, 1.0, 0, true),
    ...[-1, 0, 1].map((i) => item("pendant", "Pendant lamp", (i * L) / 3, 0.3, 0.4, 0.4, 0.3, 0, true))
  ];
}

function clusterBlock(n: 1 | 2 | 4): InteriorItem[] {
  const out: InteriorItem[] = [];
  const desk = (x: number, z: number, rot: number) => {
    out.push(item("desk", "Desk", x, z, 1.6, 0.75, 0.74, rot, true));
    const [cx, cz] = turn(0, 0.525, quarterTurns(rot));
    out.push(item("task-chair", "Desk chair", x + cx, z + cz, 0.6, 0.6, 1.0, rot + Math.PI, true));
  };
  if (n === 1) desk(0, 0, 0);
  else
    for (const x of n === 4 ? [-0.8, 0.8] : [0]) {
      desk(x, 0.375, 0);
      desk(x, -0.375, Math.PI);
    }
  return out;
}

function meetingBlock(L: number, rug: boolean): InteriorItem[] {
  const per = L >= 3 ? 4 : 3;
  const out = [item("meeting-table", "Meeting table", 0, 0, L, 1.1, 0.74, 0, true)];
  if (rug) out.unshift(item("rug", "Rug", 0, 0, L + 1.6, 2.8, 0.015, 0, true));
  for (let i = 0; i < per; i++) {
    const x = (i - (per - 1) / 2) * (L / per);
    out.push(item("chair", "Chair", x, 0.7, 0.5, 0.5, 0.85, Math.PI, true), item("chair", "Chair", x, -0.7, 0.5, 0.5, 0.85, 0, true));
  }
  out.push(item("pendant", "Pendant lamp", -L / 4, 0, 0.4, 0.4, 0.3, 0, true), item("pendant", "Pendant lamp", L / 4, 0, 0.4, 0.4, 0.3, 0, true));
  return out;
}

function barBlock(Lb: number, Lr: number, stools: number): InteriorItem[] {
  const out = [
    item("back-shelf", "Back shelf", 0, 0, Lb, 0.4, 2.2, 0, true),
    item("bar", "Bar counter", 0, 1.4, Lb, 0.6, 1.05, 0, true)
  ];
  if (Lr > 0) out.push(item("bar-return", "Bar counter", Lb / 2 - 0.3, 1.7 + Lr / 2, Lr, 0.6, 1.05, Q, true));
  const x0 = -Lb / 2 + 0.45;
  const x1 = Lb / 2 - (Lr > 0 ? 0.6 : 0) - 0.45;
  for (let i = 0; i < stools; i++) {
    const x = stools === 1 ? (x0 + x1) / 2 : x0 + ((x1 - x0) * i) / (stools - 1);
    out.push(item("stool", "Bar stool", x, 2.05, 0.42, 0.42, 0.78, Math.PI, true));
  }
  return out;
}

function cafeBlock(): InteriorItem[] {
  return [
    item("cafe-table", "Cafe table", 0, 0, 0.7, 0.7, 0.74, 0, true),
    item("chair", "Chair", -0.6, 0, 0.5, 0.5, 0.85, Q, true),
    item("chair", "Chair", 0.6, 0, 0.5, 0.5, 0.85, -Q, true),
    item("pendant", "Pendant lamp", 0, 0, 0.4, 0.4, 0.3, 0, true)
  ];
}

function boothBlock(): InteriorItem[] {
  return [
    item("booth", "Booth bench", 0, -0.75, 1.4, 0.6, 1.1, 0, true),
    item("booth", "Booth bench", 0, 0.75, 1.4, 0.6, 1.1, Math.PI, true),
    item("booth-table", "Booth table", 0, 0, 0.9, 0.7, 0.74, 0, true),
    item("pendant", "Pendant lamp", 0, 0, 0.4, 0.4, 0.3, 0, true)
  ];
}

/** Living area, TV on local -z, sofa on local +z facing it. */
function livingBlock(full: boolean): InteriorItem[] {
  const out = [
    item("tv-console", "TV console", 0, -1.85, 1.8, 0.45, 1.3, 0, true),
    item("rug", "Rug", 0, 0.2, 2.8, 2.2, 0.015, 0, true),
    item("coffee-table", "Coffee table", 0, 0.1, 1.1, 0.6, 0.42, 0, true),
    item("sofa", "Three-seat sofa", 0, 1.15, 2.1, 0.9, 0.8, Math.PI, true)
  ];
  if (full) out.push(item("armchair", "Armchair", -1.75, 0.1, 0.85, 0.85, 0.8, Q, true), item("floor-lamp", "Floor lamp", 1.6, 1.35, 0.4, 0.4, 1.65, 0, true));
  return out;
}

function kitchenBlock(Lk: number, fridgeSide: number): InteriorItem[] {
  return [item("kitchen", "Kitchen run", 0, 0, Lk, 0.6, 2.2), item("fridge", "Fridge", fridgeSide * (Lk / 2 + 0.36), 0.05, 0.7, 0.7, 2.0)];
}

function diningBlock(six: boolean): InteriorItem[] {
  const out = [item("dining-table", "Dining table", 0, 0, 1.6, 0.9, 0.75, 0, true)];
  for (const x of [-0.4, 0.4]) out.push(item("chair", "Chair", x, 0.6, 0.45, 0.45, 0.85, Math.PI, true), item("chair", "Chair", x, -0.6, 0.45, 0.45, 0.85, 0, true));
  if (six) out.push(item("chair", "Chair", -0.95, 0, 0.45, 0.45, 0.85, Q, true), item("chair", "Chair", 0.95, 0, 0.45, 0.45, 0.85, -Q, true));
  out.push(item("pendant", "Pendant lamp", 0, 0, 0.4, 0.4, 0.3, 0, true));
  return out;
}

/**
 * Seating groups: the front part first, left and right of the way, then further back; about one
 * every 6.5 m. Sofas turn their backs to the side walls. Compact groups when no full group fits.
 */
function addSeating(R: Room, max: number, pad: number): number {
  const { hw, hd } = R;
  let groups = 0;
  for (const compact of [false, true]) {
    const proto = seatingBlock(compact);
    let misses = 0;
    for (let pass = 0; pass < 30 && groups < max && misses < 2; pass++) {
      const s = pass % 2 === 0 ? -1 : 1;
      const k = s < 0 ? 1 : 3;
      const e = extents(proto, k);
      const exNear = s < 0 ? e.x1 : -e.x0;
      const exFar = s < 0 ? -e.x0 : e.x1;
      const xs: number[] = [];
      for (let x = WAY_HALF + pad + exNear; x + exFar <= hw - FREE_GAP + EPS; x += 6.5) xs.push(s * x);
      xs.push(s * (hw - FREE_GAP - exFar));
      const cands: Cand[] = [];
      for (const z of sweep(-hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1 - 0.4, hd, 0.5)) for (const x of xs) cands.push([x, z, k]);
      if (R.tryAt("seating-group", proto, cands, pad)) {
        groups++;
        misses = 0;
      } else misses++;
    }
    if (groups > 0) break;
  }
  return groups;
}

// ── Uses ─────────────────────────────────────────────────────

function planLobby(R: Room, p: InteriorParams, W: number, D: number, rand: Rand) {
  const { hw, hd } = R;
  const core = W >= 7 && D >= 8;
  const cw = clamp(W * 0.3, 3.2, 7);
  const cd = clamp(D * 0.12, 2.2, 4);
  const coreFront = -hd + WALL_GAP + cd;
  let main: InteriorItem[] | null = null;
  for (const L of [Math.min(clamp(W * 0.2, 3.2, 4.6), W - 0.6), Math.min(2.4, W - 0.6), W - 0.6]) {
    const proto = receptionBlock(L);
    const cands: Cand[] = [];
    if (core) cands.push([0, coreFront + 2.4, 0]);
    for (const z of sweep(-hd + FREE_GAP + 0.9, hd - 0.675 - FREE_GAP, -hd + FREE_GAP + 0.9, 0.25)) cands.push([0, z, 0]);
    main = R.tryAt("reception", proto, cands, 0.35, true);
    if (main) break;
  }
  if (main) R.reserveWay(main);
  if (core && main) R.place("core", [item("lift-core", "Lift core", 0, 0, cw, cd, p.height)], 0, -hd + WALL_GAP + cd / 2, 0, 0.3);

  const max = Math.max(2, Math.min(10, Math.round((W * D) / 60)));
  addSeating(R, max, W * D > 200 ? 1.0 : 0.35);
  addPlants(R, rand, clamp(Math.round((W + D) / 4), 2, 16), 1.4, 1.9);
}

function planOffice(R: Room, p: InteriorParams, W: number, D: number, rand: Rand) {
  const { hw, hd } = R;
  const rowFront = hd - Math.max(D / 3, 3.2);
  let main: InteriorItem[] | null = null;
  let variant: 1 | 2 | 4 = 1;
  for (const n of [4, 2, 1] as const) {
    const proto = clusterBlock(n);
    const e = extents(proto, 0);
    const z = clamp(rowFront - e.z1, -hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1 - 1.4);
    main = R.tryAt("desk-cluster", proto, [[WAY_HALF + 0.1 + e.x1, z, 0]], 0.35, true);
    if (main) {
      variant = n;
      break;
    }
  }
  if (!main) {
    for (const n of [2, 1] as const) {
      const proto = clusterBlock(n);
      const e = extents(proto, 0);
      main = R.tryAt("desk-cluster", proto, sweep(-hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1, -hd, 0.25).map((z) => [0, z, 0] as Cand), 0.35, true);
      if (main) {
        variant = n;
        break;
      }
    }
  }
  if (main) R.reserveWay(main);

  // Storage run along the back wall.
  for (let n = clamp(Math.floor(W * 0.5), 1, 12); n >= 1; n--) {
    const proto = Array.from({ length: n }, (_, i) => item("storage", "Storage unit", (i - (n - 1) / 2) * 1.0, 0, 1.0, 0.45, 2.0));
    if (R.place("storage-run", proto, 0, -hd + WALL_GAP + 0.225, 0, 0.45)) break;
  }

  // More desk clusters on a grid with 1.6 aisles in the back two thirds.
  if (main) {
    const proto = clusterBlock(variant);
    const e = extents(proto, 0);
    const mr = unionRect(main);
    const mz = (mr.z0 + mr.z1) / 2 - (e.z0 + e.z1) / 2;
    const pitchX = e.x1 - e.x0 + 1.6;
    const pitchZ = e.z1 - e.z0 + 1.6;
    const cands: Cand[] = [];
    for (let j = 0; j < 20; j++) {
      const z = mz - j * pitchZ;
      if (z + e.z0 < -hd) break;
      for (let i = 0; i < 20; i++) {
        const x = WAY_HALF + 0.1 + e.x1 + i * pitchX;
        if (x + e.x1 > hw) break;
        cands.push([x, z, 0], [-x, z, 0]);
      }
    }
    let n = 1;
    for (const c of cands) {
      if (n >= 24) break;
      if (R.place("desk-cluster", proto, c[0], c[1], 0, 0.35)) n++;
    }
  }

  // Meeting tables near the front on the left.
  const tables = W * D > 400 ? 2 : 1;
  for (let t = 0; t < tables; t++) {
    let ok = false;
    for (const [L, rug] of (W >= 12 ? [[3.2, true], [2.4, true], [2.4, false]] : [[2.4, true], [2.4, false]]) as [number, boolean][]) {
      const proto = meetingBlock(L, rug);
      const e = extents(proto, 0);
      const xs = [-(WAY_HALF + 0.4 + e.x1), -(hw - FREE_GAP - e.x1), WAY_HALF + 0.4 + e.x1, hw - FREE_GAP - e.x1];
      const cands: Cand[] = [];
      for (const z of sweep(-hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1 - 0.2, hd, 0.5).filter((z) => z > rowFront - 1)) for (const x of xs) cands.push([x, z, 0]);
      if (R.tryAt("meeting-area", proto, cands, 0.4)) {
        ok = true;
        break;
      }
    }
    if (!ok) break;
  }

  // A small sofa by the entrance, back to the front wall.
  const sofa = [item("sofa", "Two-seat sofa", 0, 0, 1.6, 0.8, 0.78)];
  R.tryAt("entrance-sofa", sofa, [[WAY_HALF + 0.5 + 0.8, hd - FREE_GAP - 0.4, 2], [-(WAY_HALF + 0.5 + 0.8), hd - FREE_GAP - 0.4, 2]], 0.3);
  addPlants(R, rand, clamp(Math.round((W + D) / 5), 1, 14), 1.2, 1.7);
}

function planLounge(R: Room, p: InteriorParams, W: number, D: number, rand: Rand) {
  const { hw, hd } = R;
  let main: InteriorItem[] | null = null;
  for (const Lb of [Math.min(clamp(W * 0.45, 2.4, 7), W - 0.6), Math.min(1.8, W - 0.6)]) {
    const Lr = W >= 5 && D >= 6 && Lb >= 2.4 ? clamp(D * 0.15, 1.2, 1.8) : 0;
    const stools = clamp(Math.floor((Lb - (Lr > 0 ? 0.6 : 0) - 0.3) / 0.65), 1, 6);
    main = R.tryAt("bar", barBlock(Lb, Lr, stools), [[0, -hd + WALL_GAP + 0.2, 0]], 0.35, true);
    if (main) break;
  }
  if (main) R.reserveWay(main);

  // Booths along the left wall, back to back.
  if (W >= 6) {
    const proto = boothBlock();
    const max = clamp(Math.floor(D / 2.2) - 1, 1, 10);
    let n = 0;
    for (let z = hd - FREE_GAP - 1.05 - 0.6; z > -hd + 1.05 && n < max; z -= 2.2) if (R.place("booth-set", proto, -hw + WALL_GAP + 0.7, z, 0, 0.05)) n++;
  }

  // Cafe tables in the middle.
  const proto = cafeBlock();
  const max = clamp(Math.round((W * D) / 14), 1, 30);
  const cands: Cand[] = [];
  for (let z = hd - FREE_GAP - 0.35 - 0.7; z > -hd + 0.6; z -= 2.2)
    for (let x = WAY_HALF + 0.45 + 0.85; x + 0.85 <= hw - FREE_GAP; x += 2.8) cands.push([x, z, 0], [-x, z, 0]);
  let n = 0;
  for (const c of cands) {
    if (n >= max) break;
    if (R.place("cafe-set", proto, c[0], c[1], 0, 0.35)) n++;
  }
  addPlants(R, rand, clamp(Math.round((W + D) / 4), 1, 16), 1.2, 1.8);
}

function planApartment(R: Room, p: InteriorParams, W: number, D: number, rand: Rand) {
  const { hw, hd } = R;
  let main: InteriorItem[] | null = null;
  const tries: { proto: InteriorItem[]; k: number }[] = [
    { proto: livingBlock(true), k: 3 },
    { proto: livingBlock(true), k: 1 },
    { proto: livingBlock(false), k: 3 },
    { proto: livingBlock(false), k: 1 }
  ];
  for (const t of tries) {
    const e = extents(t.proto, t.k);
    const x = t.k === 3 ? hw - WALL_GAP - e.x1 : -hw + WALL_GAP - e.x0;
    const cands = sweep(-hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1, hd - FREE_GAP - e.z1 - 0.6, 0.25).map((z) => [x, z, t.k] as Cand);
    main = R.tryAt("living-area", t.proto, cands, 0.35, true);
    if (main) break;
  }
  if (!main) {
    const proto = [item("sofa", "Three-seat sofa", 0, 0, Math.min(2.1, W - 0.6), 0.9, 0.8, 0, true)];
    main = R.tryAt("living-area", proto, sweep(-hd + FREE_GAP + 0.45, hd - FREE_GAP - 0.45, -hd, 0.25).map((z) => [0, z, 0] as Cand), 0.35, true);
  }
  if (main) R.reserveWay(main);

  // Kitchen run along the back wall, fridge at the end by the side wall.
  let kitchen: InteriorItem[] | null = null;
  for (const Lk of [clamp(W * 0.45, 1.8, 4.8), 1.8, 1.2]) {
    const left = kitchenBlock(Lk, -1);
    const right = kitchenBlock(Lk, 1);
    const z = -hd + WALL_GAP + 0.3;
    kitchen =
      R.place("kitchen", left, -hw + WALL_GAP + Lk / 2 + 0.71, z, 0, 0.35) ??
      R.place("kitchen", right, hw - WALL_GAP - Lk / 2 - 0.71, z, 0, 0.35) ??
      R.place("kitchen", left, 0.36, z, 0, 0.35);
    if (kitchen) break;
  }
  const run = kitchen?.find((i) => i.kind === "kitchen");
  let front = run ? run.z + 0.3 : -hd;

  // Island when the room is wider than 7.
  if (run && W > 7) {
    const Li = clamp(run.w - 0.8, 1.4, 2.4);
    const stools = Li >= 2 ? 3 : 2;
    const proto = [item("island", "Kitchen island", 0, 0, Li, 0.9, 0.92, 0, true)];
    for (let i = 0; i < stools; i++) proto.push(item("stool", "Bar stool", (i - (stools - 1) / 2) * 0.62, 0.62, 0.42, 0.42, 0.78, Math.PI, true));
    const isl = R.place("island", proto, run.x, front + 1.1 + 0.45, 0, 0.35);
    if (isl) front = unionRect(isl).z1;
  }

  // Dining table in front of the kitchen.
  {
    const six = W * D > 50;
    for (const proto of six ? [diningBlock(true), diningBlock(false)] : [diningBlock(false)]) {
      const e = extents(proto, 0);
      const x0 = run ? run.x : -hw / 2;
      const xs = [x0, -(WAY_HALF + 0.4 + e.x1), -hw + FREE_GAP - e.x0, WAY_HALF + 0.4 + e.x1, hw - FREE_GAP - e.x1];
      const cands: Cand[] = [];
      for (const z of sweep(-hd + FREE_GAP - e.z0, hd - FREE_GAP - e.z1, front + 0.9 - e.z0, 0.5)) for (const x of xs) cands.push([x, z, 0]);
      if (R.tryAt("dining", proto, cands, 0.35)) break;
    }
  }

  // Bed zone behind a low shelf when the room is deeper than 8.
  if (D > 8) {
    const proto = [
      item("bed", "Double bed", 0, 0, 1.6, 2.1, 1.0),
      item("nightstand", "Nightstand", -1.08, -0.85, 0.45, 0.4, 0.5),
      item("nightstand", "Nightstand", 1.08, -0.85, 0.45, 0.4, 0.5)
    ];
    const z = -hd + WALL_GAP + 1.05;
    const xs = [hw - WALL_GAP - 1.31, -hw + WALL_GAP + 1.31];
    for (let x = hw - 2; x > -hw + 2; x -= 0.5) xs.push(x);
    const bed = R.tryAt("bed-zone", proto, xs.map((x) => [x, z, 0] as Cand), 0.35);
    if (bed) {
      const bx = bed[0].x;
      const shelfZ = bed[0].z + 1.05 + 0.9 + 0.175;
      R.place("low-shelf", [item("low-shelf", "Low shelf", 0, 0, 2.4, 0.35, 1.0)], bx, shelfZ, 0, 0.3);
      const side = bx > 0 ? 1 : -1;
      const wx = side * (hw - WALL_GAP - 0.3);
      R.tryAt(
        "wardrobe",
        [item("wardrobe", "Wardrobe", 0, 0, 2.0, 0.6, 2.2)],
        sweep(-hd + WALL_GAP + 1.0, hd - 2, -hd + 2.6, 0.5).map((wz) => [wx, wz, side > 0 ? 3 : 1] as Cand),
        0.3
      );
    }
  }
  // A big open apartment gets more seating groups (a loft), never bigger furniture.
  if (W * D > 120) addSeating(R, Math.min(8, Math.round((W * D) / 100)), 1.0);
  addPlants(R, rand, clamp(Math.round((W + D) / 5), 1, 10), 1.0, 1.6);
}

// ── Summary and lights ───────────────────────────────────────

const NUM = ["no", "a", "2", "3", "4", "5", "6", "7", "8", "9"];
function nouns(n: number, one: string, many: string) {
  if (n === 1) return `${/^[aeiou]/.test(one) ? "an" : "a"} ${one}`;
  return `${n < NUM.length ? NUM[n] : n} ${many}`;
}
function list(parts: string[]) {
  const p = parts.filter(Boolean);
  if (p.length <= 1) return p[0] ?? "an empty room";
  return `${p.slice(0, -1).join(", ")} and ${p[p.length - 1]}`;
}

function summarize(use: InteriorUse, c: Record<string, number>, items: InteriorItem[], furniture: boolean): string {
  if (!furniture) return "a finished floor and ceiling";
  const n = (k: string) => c[k] ?? 0;
  const parts: string[] = [];
  const plants = n("plant") ? nouns(n("plant"), "plant", "plants") : "";
  if (use === "lobby") {
    if (n("reception-desk")) parts.push("a reception desk");
    if (n("seating-group")) parts.push(nouns(n("seating-group"), "seating group", "seating groups"));
    const core = items.find((i) => i.kind === "lift-core");
    if (core) parts.push(`a lift core with ${liftCount(core)} lifts`);
  } else if (use === "office") {
    if (n("desk")) parts.push(`${nouns(n("desk-cluster"), "desk cluster", "desk clusters")} with ${nouns(n("desk"), "desk", "desks")}`);
    if (n("meeting-table")) parts.push(`${nouns(n("meeting-table"), "meeting table", "meeting tables")} with ${n("chair")} chairs`);
    if (n("storage")) parts.push(nouns(n("storage"), "storage unit", "storage units"));
    if (n("sofa")) parts.push("a sofa");
  } else if (use === "lounge") {
    if (n("bar")) parts.push(n("stool") ? `a bar with ${nouns(n("stool"), "stool", "stools")}` : "a bar");
    if (n("cafe-table")) parts.push(nouns(n("cafe-table"), "cafe table", "cafe tables"));
    if (n("booth-set")) parts.push(nouns(n("booth-set"), "booth", "booths"));
  } else {
    if (n("sofa")) parts.push(n("tv-console") ? "a living area with a sofa and TV" : "a sofa");
    if (n("kitchen")) parts.push(n("island") ? "a kitchen with an island" : "a kitchen");
    if (n("dining-table")) {
      const chairs = items.filter((i) => i.kind === "chair").length;
      parts.push(`a dining table with ${chairs} chairs`);
    }
    if (n("bed")) parts.push("a bed zone");
    if (n("seating-group")) parts.push(nouns(n("seating-group"), "seating group", "seating groups"));
  }
  if (plants) parts.push(plants);
  return list(parts);
}

function lightSpots(p: InteriorParams): { x: number; y: number; z: number }[] {
  const y = +(p.height - 0.4).toFixed(3);
  const W = p.width;
  const D = p.depth;
  if (W * D < 24) return [{ x: 0, y, z: 0 }];
  if (W >= 2 * D) return [{ x: -W / 4, y, z: 0 }, { x: W / 4, y, z: 0 }];
  if (D >= 2 * W) return [{ x: 0, y, z: -D / 4 }, { x: 0, y, z: D / 4 }];
  return [
    { x: -W / 4, y, z: -D / 4 },
    { x: W / 4, y, z: -D / 4 },
    { x: -W / 4, y, z: D / 4 },
    { x: W / 4, y, z: D / 4 }
  ];
}

const round = (v: number) => Math.round(v * 1e6) / 1e6;

export function planInterior(p: InteriorParams): InteriorPlan {
  const [W, D] = canonicalSize(p);
  const R = new Room(W / 2, D / 2);
  const rand = new Rand(p.seed * 4271 + 17);
  if (p.furniture) {
    if (p.use === "lobby") planLobby(R, p, W, D, rand);
    else if (p.use === "office") planOffice(R, p, W, D, rand);
    else if (p.use === "lounge") planLounge(R, p, W, D, rand);
    else planApartment(R, p, W, D, rand);
  }
  const k = sideTurns(p.front);
  const items = R.items.map((it) => {
    const [x, z] = turn(it.x, it.z, k);
    return { ...it, x: round(x), z: round(z), rotY: quarterTurns(it.rotY + k * Q) * Q };
  });
  const counts: Record<string, number> = {};
  for (const it of items) counts[it.kind] = (counts[it.kind] ?? 0) + 1;
  for (const [type, n] of Object.entries(R.blocks)) if (!(type in counts)) counts[type] = n;
  return { items, counts, lights: lightSpots(p), summary: summarize(p.use, counts, items, p.furniture) };
}
