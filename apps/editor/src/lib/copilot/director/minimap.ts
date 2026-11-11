// Plan thumbnails for the choice popup (Director v2): a small map seen from above, as an SVG data
// URL. Generators draw the built cities and their own proposal on it (a river route, a building
// lot, a city size), so the user chooses a place or a size from a picture. Pure: no DOM, no canvas.
import type { CitySiteFacts, SiteRect } from "./types";

export type MinimapLine = { points: [number, number][]; width: number; color?: string };
export type MinimapRect = { rect: SiteRect; color?: string; outline?: string };
export type MinimapDot = { x: number; z: number; r: number; color?: string; outline?: string };

export type MinimapInput = {
  /** City plans to draw (world meters). */
  cities?: CitySiteFacts[];
  /** Rectangles under the proposal: existing buildings or other sites, in gray. */
  context?: MinimapRect[];
  /** Round things under the proposal (a castle, a tower). */
  contextDots?: MinimapDot[];
  /** The proposal: water lines (blue by default). width in world meters. */
  lines?: MinimapLine[];
  /** The proposal: highlighted rectangles (a lot). */
  rects?: MinimapRect[];
  /** The proposal: highlighted round things. */
  dots?: MinimapDot[];
  /** World area to show. Default: everything, with a margin. */
  view?: SiteRect;
  /** Image size in pixels. */
  width?: number;
  height?: number;
};

export const MAP_COLORS = {
  land: "#a9cf9f",
  ground: "#8fbf88",
  street: "#4b5058",
  avenue: "#3f444c",
  median: "#7fb07a",
  lot: "#d9dde1",
  downtown: "#c9d3e3",
  residential: "#ead9c2",
  industrial: "#c3bdb4",
  park: "#5aa862",
  plaza: "#e6dcc6",
  context: "#8a9099",
  water: "#3b8fd6",
  highlight: "#ff8a3d",
  highlightFill: "#ffb27a"
};

const n = (v: number) => (Math.round(v * 10) / 10).toString();

function zoneColor(kind: string, zone: string) {
  if (kind === "park") return MAP_COLORS.park;
  if (kind === "plaza") return MAP_COLORS.plaza;
  if (/industr/.test(zone)) return MAP_COLORS.industrial;
  if (/resid|suburb|house/.test(zone)) return MAP_COLORS.residential;
  if (/downtown|tower|core/.test(zone)) return MAP_COLORS.downtown;
  return MAP_COLORS.lot;
}

function boundsOf(input: MinimapInput): SiteRect {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  const grow = (x: number, z: number, pad = 0) => {
    x0 = Math.min(x0, x - pad);
    z0 = Math.min(z0, z - pad);
    x1 = Math.max(x1, x + pad);
    z1 = Math.max(z1, z + pad);
  };
  for (const c of input.cities ?? []) {
    grow(c.groundRect.x0, c.groundRect.z0);
    grow(c.groundRect.x1, c.groundRect.z1);
  }
  for (const r of [...(input.context ?? []), ...(input.rects ?? [])]) {
    grow(r.rect.x0, r.rect.z0);
    grow(r.rect.x1, r.rect.z1);
  }
  for (const d of [...(input.contextDots ?? []), ...(input.dots ?? [])]) grow(d.x, d.z, d.r);
  for (const l of input.lines ?? []) for (const [x, z] of l.points) grow(x, z, l.width / 2);
  if (!Number.isFinite(x0)) return { x0: -20, z0: -20, x1: 20, z1: 20 };
  const pad = Math.max(x1 - x0, z1 - z0) * 0.06 + 1;
  return { x0: x0 - pad, z0: z0 - pad, x1: x1 + pad, z1: z1 + pad };
}

/** The map as SVG text. World +x is right, world +z is down (the editor's top view). */
export function minimapSvg(input: MinimapInput): string {
  const W = input.width ?? 192;
  const H = input.height ?? 128;
  const view = input.view ?? boundsOf(input);
  const vw = Math.max(1, view.x1 - view.x0);
  const vh = Math.max(1, view.z1 - view.z0);
  const k = Math.min(W / vw, H / vh);
  const ox = (W - vw * k) / 2 - view.x0 * k;
  const oz = (H - vh * k) / 2 - view.z0 * k;
  const X = (x: number) => n(x * k + ox);
  const Z = (z: number) => n(z * k + oz);
  const rect = (r: SiteRect, fill: string, extra = "") =>
    `<rect x="${X(r.x0)}" y="${Z(r.z0)}" width="${n((r.x1 - r.x0) * k)}" height="${n((r.z1 - r.z0) * k)}" fill="${fill}"${extra}/>`;
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" rx="8" fill="${MAP_COLORS.land}"/>`
  ];
  for (const c of input.cities ?? []) {
    out.push(rect(c.groundRect, MAP_COLORS.ground, ' rx="2"'));
    out.push(rect(c.streetsRect, MAP_COLORS.street));
    for (const b of c.blocks) out.push(rect(b.rect, zoneColor(b.kind, b.zone), ' rx="1"'));
    for (const s of c.streets) {
      if (!s.avenue) continue;
      const half = s.carriage / 2;
      const r: SiteRect = s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.pos - half, z1: s.pos + half } : { z0: s.from, z1: s.to, x0: s.pos - half, x1: s.pos + half };
      out.push(rect(r, MAP_COLORS.avenue));
      if (s.median > 0) {
        const m = s.median / 2;
        const mr: SiteRect = s.axis === "x" ? { x0: s.from, x1: s.to, z0: s.pos - m, z1: s.pos + m } : { z0: s.from, z1: s.to, x0: s.pos - m, x1: s.pos + m };
        out.push(rect(mr, MAP_COLORS.median));
      }
    }
  }
  for (const r of input.context ?? []) out.push(rect(r.rect, r.color ?? MAP_COLORS.context, ' rx="1"'));
  for (const d of input.contextDots ?? []) out.push(`<circle cx="${X(d.x)}" cy="${Z(d.z)}" r="${n(Math.max(2, d.r * k))}" fill="${d.color ?? MAP_COLORS.context}"/>`);
  for (const l of input.lines ?? []) {
    if (l.points.length < 2) continue;
    const d = l.points.map(([x, z], i) => `${i === 0 ? "M" : "L"}${X(x)} ${Z(z)}`).join(" ");
    const w = Math.max(2.5, l.width * k);
    out.push(`<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity="0.7" stroke-width="${n(w + 2)}" stroke-linecap="round" stroke-linejoin="round"/>`);
    out.push(`<path d="${d}" fill="none" stroke="${l.color ?? MAP_COLORS.water}" stroke-width="${n(w)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  }
  for (const r of input.rects ?? [])
    out.push(rect(r.rect, r.color ?? MAP_COLORS.highlightFill, ` rx="1.5" stroke="${r.outline ?? MAP_COLORS.highlight}" stroke-width="2.5"`));
  for (const d of input.dots ?? [])
    out.push(
      `<circle cx="${X(d.x)}" cy="${Z(d.z)}" r="${n(Math.max(3, d.r * k))}" fill="${d.color ?? MAP_COLORS.highlightFill}" stroke="${d.outline ?? MAP_COLORS.highlight}" stroke-width="2.5"/>`
    );
  out.push("</svg>");
  return out.join("");
}

/** The map as a data URL for ChoiceOption.image. */
export function minimapImage(input: MinimapInput): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(minimapSvg(input))}`;
}
