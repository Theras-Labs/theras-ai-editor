// Thumbnails for the choice popup, drawn in code as SVG data URLs (no canvas, no DOM).
// Each picture shows the thing the option builds, in the right style and in its real colors:
// a Japanese curved roof, a medieval keep with battlements, or a tower look.
import type { ArchColors, TowerLook } from "./params";

const url = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
const n = (v: number) => (Math.round(v * 10) / 10).toString();

/** Darker or lighter version of a hex color (f < 1 darker). */
function tone(hex: string, f: number): string {
  const h = hex.replace("#", "");
  const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  const out = c.map((v) => Math.max(0, Math.min(255, Math.round(f >= 1 ? v + (255 - v) * (f - 1) : v * f))));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Japanese roof swatch: a curved roof in the color over a light wall. */
export function japaneseRoofSwatch(hex: string, walls: string): string {
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">` +
      `<rect width="64" height="48" rx="6" fill="#eef3f6"/>` +
      `<rect x="18" y="26" width="28" height="16" fill="${walls}"/>` +
      `<path d="M4 26 Q18 22 24 12 L40 12 Q46 22 60 26 Q56 29 50 28 L14 28 Q8 29 4 26 Z" fill="${hex}"/>` +
      `<rect x="22" y="31" width="4" height="6" fill="#3a3833"/><rect x="30" y="31" width="4" height="6" fill="#3a3833"/><rect x="38" y="31" width="4" height="6" fill="#3a3833"/>` +
      `</svg>`
  );
}

/** Medieval roof swatch: a stone keep with battlements, a turret and a cone (round) or pyramid (square) roof in the color. */
export function medievalRoofSwatch(hex: string, stone: string, round: boolean): string {
  const merlons = [12, 20, 28, 36, 44].map((x) => `<rect x="${x}" y="22" width="5" height="4" fill="${stone}"/>`).join("");
  const roof = round
    ? `<path d="M22 18 L32 3 L42 18 Q32 20 22 18 Z" fill="${hex}"/>`
    : `<path d="M21 18 L32 4 L43 18 Z" fill="${hex}"/><path d="M32 4 L43 18 L36 18 Z" fill="${tone(hex, 0.8)}"/>`;
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="48" viewBox="0 0 64 48">` +
      `<rect width="64" height="48" rx="6" fill="#eef3f6"/>` +
      `<rect x="24" y="17" width="16" height="10" fill="${tone(stone, 0.92)}"/>` +
      roof +
      `<rect x="12" y="26" width="37" height="18" fill="${stone}"/>` +
      merlons +
      `<path d="M12 32 H49 M12 38 H49" stroke="${tone(stone, 0.8)}" stroke-width="0.8"/>` +
      `<path d="M27 44 V38 Q30.5 34 34 38 V44 Z" fill="#5a3f2a"/>` +
      `<rect x="18" y="30" width="1.6" height="4" fill="#2b2826"/><rect x="42" y="30" width="1.6" height="4" fill="#2b2826"/>` +
      `</svg>`
  );
}

/** Tower silhouette of a look, standing on the ground line gy, base width w, height h, center cx. */
function towerShape(look: TowerLook, c: ArchColors, cx: number, gy: number, w: number, h: number): string {
  const glass = c.timber;
  const frame = c.walls;
  const out: string[] = [];
  const podH = Math.max(2, h * 0.07);
  out.push(`<rect x="${n(cx - w / 2)}" y="${n(gy - podH)}" width="${n(w)}" height="${n(podH)}" fill="${c.base}"/>`);
  const sw = w * 0.78;
  const top = gy - h;
  const bands = (x0: number, x1: number, y0: number, y1: number, step: number, col: string) => {
    const lines: string[] = [];
    for (let y = y1 - step; y > y0 + 0.5; y -= step) lines.push(`M${n(x0)} ${n(y)} H${n(x1)}`);
    return lines.length ? `<path d="${lines.join(" ")}" stroke="${col}" stroke-width="0.6"/>` : "";
  };
  const piers = (x0: number, x1: number, y0: number, y1: number, count: number, col: string, wd: number) => {
    const lines: string[] = [];
    for (let k = 1; k < count; k++) {
      const x = x0 + ((x1 - x0) * k) / count;
      lines.push(`M${n(x)} ${n(y0)} V${n(y1)}`);
    }
    return `<path d="${lines.join(" ")}" stroke="${col}" stroke-width="${wd}"/>`;
  };
  if (look === "glass") {
    const crown = h * 0.06;
    const y0 = top + crown;
    const y1 = gy - podH;
    out.push(`<rect x="${n(cx - sw / 2)}" y="${n(y0)}" width="${n(sw)}" height="${n(y1 - y0)}" fill="${glass}"/>`);
    out.push(`<rect x="${n(cx)}" y="${n(y0)}" width="${n(sw / 2)}" height="${n(y1 - y0)}" fill="${tone(glass, 0.82)}"/>`);
    out.push(bands(cx - sw / 2, cx + sw / 2, y0, y1, 2.2, tone(glass, 0.55)));
    out.push(piers(cx - sw / 2, cx + sw / 2, y0, y1, 5, tone(frame, 0.95), 0.4));
    out.push(`<rect x="${n(cx - sw / 2 + 0.6)}" y="${n(top)}" width="${n(sw - 1.2)}" height="${n(crown)}" fill="${tone(c.roof, 0.6)}"/>`);
    out.push(piers(cx - sw / 2 + 0.6, cx + sw / 2 - 0.6, top, top + crown, 7, frame, 0.7));
  } else if (look === "setback") {
    const spire = h * 0.13;
    const crown = h * 0.05;
    const body = h - spire - crown - podH;
    const ws = [1, 0.76, 0.58];
    const hs = [0.5, 0.31, 0.19];
    let y = gy - podH;
    for (let i = 0; i < 3; i++) {
      const ww = sw * ws[i];
      const hh = body * hs[i];
      out.push(`<rect x="${n(cx - ww / 2)}" y="${n(y - hh)}" width="${n(ww)}" height="${n(hh)}" fill="${tone(glass, 0.85)}"/>`);
      out.push(piers(cx - ww / 2, cx + ww / 2, y - hh, y, 4, frame, 1.1));
      out.push(`<path d="M${n(cx - ww / 2)} ${n(y - hh)} V${n(y)} M${n(cx + ww / 2)} ${n(y - hh)} V${n(y)}" stroke="${frame}" stroke-width="1.4"/>`);
      out.push(`<rect x="${n(cx - ww / 2 - 0.4)}" y="${n(y - hh)}" width="${n(ww + 0.8)}" height="0.9" fill="${c.accent}"/>`);
      y -= hh;
    }
    const cw = sw * 0.58 * 0.6;
    out.push(`<rect x="${n(cx - cw / 2)}" y="${n(y - crown)}" width="${n(cw)}" height="${n(crown)}" fill="${frame}"/>`);
    out.push(`<path d="M${n(cx - cw / 4)} ${n(y - crown)} L${n(cx)} ${n(top)} L${n(cx + cw / 4)} ${n(y - crown)} Z" fill="${c.accent}"/>`);
  } else {
    const mast = h * 0.16;
    const y1 = gy - podH;
    const y0 = top + mast;
    const tw = sw * 0.5;
    out.push(`<path d="M${n(cx - sw / 2)} ${n(y1)} L${n(cx - tw / 2)} ${n(y0)} L${n(cx + tw / 2)} ${n(y0)} L${n(cx + sw / 2)} ${n(y1)} Z" fill="${glass}"/>`);
    out.push(`<path d="M${n(cx)} ${n(y1)} L${n(cx)} ${n(y0)} L${n(cx + tw / 2)} ${n(y0)} L${n(cx + sw / 2)} ${n(y1)} Z" fill="${tone(glass, 0.82)}"/>`);
    for (const t of [1 / 3, 2 / 3]) {
      const y = y1 + (y0 - y1) * t;
      const half = (sw + (tw - sw) * t) / 2 + 0.4;
      out.push(`<rect x="${n(cx - half)}" y="${n(y - 0.5)}" width="${n(half * 2)}" height="1" fill="${frame}"/>`);
    }
    out.push(bands(cx - tw / 2, cx + tw / 2, y0, y1, 2.4, tone(glass, 0.65)));
    out.push(`<path d="M${n(cx - 1.4)} ${n(y0)} L${n(cx)} ${n(top)} L${n(cx + 1.4)} ${n(y0)} Z" fill="${frame}"/>`);
    out.push(`<circle cx="${n(cx)}" cy="${n(top)}" r="0.9" fill="${c.accent}"/>`);
  }
  return out.join("");
}

const SKY = `<defs><linearGradient id="s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3f1"/><stop offset="1" stop-color="#eef3f6"/></linearGradient></defs>`;

/** Gray city boxes for scale, up to height sh (pixels) on the ground line. */
function skyline(gy: number, sh: number, x0: number, x1: number): string {
  const hs = [0.55, 0.85, 0.4, 1, 0.65, 0.5, 0.9, 0.45];
  const w = (x1 - x0) / hs.length;
  return hs.map((f, i) => `<rect x="${n(x0 + i * w + 0.5)}" y="${n(gy - sh * f)}" width="${n(w - 1)}" height="${n(sh * f)}" fill="${i % 2 ? "#b4bcc4" : "#a6afb8"}"/>`).join("");
}

/** "Which look?" thumbnail: the tower of that look before a small skyline. */
export function towerLookImage(look: TowerLook, colors: ArchColors): string {
  const W = 96;
  const H = 72;
  const gy = 66;
  return url(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${SKY}` +
      `<rect width="${W}" height="${H}" rx="8" fill="url(#s)"/>` +
      skyline(gy, 22, 6, 90) +
      towerShape(look, colors, 48, gy, 16, 60) +
      `<rect x="0" y="${gy}" width="${W}" height="${H - gy}" fill="#8e979f"/>` +
      `</svg>`
  );
}

/** "How tall?" thumbnail: the tower at this height beside the present skyline (0 = no buildings). */
export function towerHeightImage(look: TowerLook, colors: ArchColors, height: number, skylineH: number, maxHeight: number): string {
  const W = 96;
  const H = 72;
  const gy = 66;
  const k = 60 / Math.max(height, maxHeight, skylineH, 1);
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${SKY}`, `<rect width="${W}" height="${H}" rx="8" fill="url(#s)"/>`];
  if (skylineH > 0) {
    parts.push(skyline(gy, skylineH * k, 6, 90));
    parts.push(`<path d="M4 ${n(gy - skylineH * k)} H92" stroke="#ff8a3d" stroke-width="0.8" stroke-dasharray="2 2"/>`);
  } else parts.push(`<circle cx="20" cy="${gy - 6}" r="6" fill="#7fae74"/><circle cx="76" cy="${gy - 5}" r="5" fill="#7fae74"/>`);
  parts.push(towerShape(look, colors, 48, gy, Math.max(8, Math.min(18, height * k * 0.2)), height * k));
  parts.push(`<rect x="0" y="${gy}" width="${W}" height="${H - gy}" fill="#8e979f"/></svg>`);
  return url(parts.join(""));
}
