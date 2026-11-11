// Choice card picture of an interior: a top-down plan drawn from planInterior(). 192 x 128 SVG
// on a dark background. One path for each color keeps the data URL small.
import { paletteOf, type InteriorParams } from "./params";
import { itemHalf, planInterior, sideTurns } from "./plan";

const W = 192;
const H = 128;
const PAD = 8;
const BG = "#0b1311";

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const r1 = (v: number) => Math.round(v * 10) / 10;

const WOOD = new Set([
  "reception-desk",
  "desk",
  "meeting-table",
  "dining-table",
  "coffee-table",
  "cafe-table",
  "booth-table",
  "bar",
  "bar-return",
  "island",
  "back-shelf",
  "storage",
  "kitchen",
  "tv-console",
  "nightstand",
  "wardrobe",
  "low-shelf",
  "bed"
]);
const SEAT = new Set(["sofa", "armchair", "booth"]);
const SMALL_SEAT = new Set(["chair", "task-chair", "stool"]);
const SKIP = new Set(["pendant", "floor-lamp", "plant", "rug"]);

export function interiorThumb(p: InteriorParams): string {
  const pal = paletteOf(p.finish);
  const plan = planInterior(p);
  const s = Math.min((W - 2 * PAD) / p.width, (H - 2 * PAD) / p.depth);
  const cx = W / 2;
  const cy = H / 2;
  const X = (x: number) => r1(cx + x * s);
  const Y = (z: number) => r1(cy + z * s);
  const paths = new Map<string, string[]>();
  const rect = (fill: string, x0: number, z0: number, x1: number, z1: number) => {
    const a = X(x0);
    const b = Y(z0);
    const w = Math.max(1, r1(X(x1) - a));
    const h = Math.max(1, r1(Y(z1) - b));
    const list = paths.get(fill) ?? [];
    list.push(`M${a} ${b}h${w}v${h}h${-w}z`);
    paths.set(fill, list);
  };
  const disc = (fill: string, x: number, z: number, rm: number) => {
    const r = Math.max(1.6, r1(rm * s));
    const list = paths.get(fill) ?? [];
    list.push(`M${r1(X(x) - r)} ${Y(z)}a${r} ${r} 0 1 0 ${r1(2 * r)} 0a${r} ${r} 0 1 0 ${r1(-2 * r)} 0`);
    paths.set(fill, list);
  };
  const hw = p.width / 2;
  const hd = p.depth / 2;
  const items = plan.items;
  const draw = (pred: (kind: string) => boolean, fill: (kind: string) => string) => {
    for (const it of items) {
      if (!pred(it.kind)) continue;
      const [ax, az] = itemHalf(it);
      rect(fill(it.kind), it.x - ax, it.z - az, it.x + ax, it.z + az);
    }
  };
  draw((k) => k === "rug", () => pal.rug);
  const body: string[] = [];
  const flush = () => {
    for (const [fill, list] of paths) body.push(`<path fill="${fill}" d="${list.join("")}"/>`);
    paths.clear();
  };
  flush();
  draw((k) => k === "lift-core", () => pal.wall);
  draw((k) => WOOD.has(k), () => pal.wood);
  draw((k) => SEAT.has(k), () => pal.fabric);
  draw((k) => SMALL_SEAT.has(k), () => pal.fabricAlt);
  draw((k) => !SKIP.has(k) && k !== "lift-core" && !WOOD.has(k) && !SEAT.has(k) && !SMALL_SEAT.has(k), () => pal.metal);
  flush();
  for (const it of items) if (it.kind === "plant") disc(pal.plant, it.x, it.z, 0.42);
  flush();

  // Entrance: a bright bar on the front wall and a small arrow into the room.
  const k = sideTurns(p.front);
  const dir: [number, number] = k === 0 ? [0, 1] : k === 1 ? [1, 0] : k === 2 ? [0, -1] : [-1, 0];
  const ex = dir[0] * hw;
  const ez = dir[1] * hd;
  const half = Math.min(1.2, (dir[0] ? hd : hw) - 0.1);
  const tw = 3 / s;
  if (dir[0]) rect(pal.accent, ex - tw / 2, -half, ex + tw / 2, half);
  else rect(pal.accent, -half, ez - tw / 2, half, ez + tw / 2);
  // Arrow: tip 10 px inside the wall, base 3 px inside, 8 px wide.
  const pt = (inward: number, side: number) => {
    const x = ex - dir[0] * (inward / s) + Math.abs(dir[1]) * (side / s);
    const z = ez - dir[1] * (inward / s) + Math.abs(dir[0]) * (side / s);
    return `${X(x)} ${Y(z)}`;
  };
  const marker = `<path fill="${pal.accent}" d="${(paths.get(pal.accent) ?? []).join("")}M${pt(10, 0)}L${pt(3, 4)}L${pt(3, -4)}z"/>`;
  paths.clear();

  const room = `<rect x="${X(-hw)}" y="${Y(-hd)}" width="${r1(p.width * s)}" height="${r1(p.depth * s)}" fill="${pal.floor}" stroke="#e9e4d8" stroke-width="1.2"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">` +
    `<rect width="${W}" height="${H}" fill="${BG}"/>` +
    room +
    `<g stroke="${BG}" stroke-width="0.5">${body.join("")}</g>` +
    marker +
    `</svg>`;
  return url(svg);
}
