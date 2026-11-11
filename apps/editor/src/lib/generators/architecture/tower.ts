// Modern tower in WORLD meters: a podium, a shaft of 1 to 4 sections, and a crown.
// Three looks: "glass" (sleek curtain wall, a mechanical screen on a clean top), "setback"
// (stepped art deco massing with stone piers and a spire), "needle" (a tapering shaft with a mast).
// The built height is exactly p.height (the crown and the mast are parts of it). A floor is about
// 3.6 to 3.8 m: floor bands, mullions and a few lit windows give the scale. All geometry is merged
// by material (no node for each window).
import { box, lathe, mix, rgb, shade, type MeshBuilder, type Rand, type RGB, type V3 } from "./mesh";
import type { BuildInfo } from "./japanese";
import { TOWER_HEIGHT, type ArchParams } from "./params";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

/** One part of the shaft: a box or a frustum, half sizes at the bottom and at the top. */
type Section = { y0: number; y1: number; ax0: number; az0: number; ax1: number; az1: number };

/** How the facade of a look is drawn. Sizes in meters. */
type Skin = {
  glass: RGB;
  frame: RGB;
  band: RGB;
  floorH: number;
  /** Mullion spacing. */
  bay: number;
  mullionW: number;
  mullionD: number;
  /** Floor band (spandrel) height and how far it stands out. */
  bandH: number;
  bandD: number;
  /** Fraction of window cells that are lit. */
  lit: number;
};

/** Side s (0 = front +z, 1 = +x, 2 = -z, 3 = -x): outward normal and the "right" direction. */
const SIDES: { n: [number, number]; t: [number, number]; x: boolean }[] = [
  { n: [0, 1], t: [1, 0], x: true },
  { n: [1, 0], t: [0, -1], x: false },
  { n: [0, -1], t: [-1, 0], x: true },
  { n: [-1, 0], t: [0, 1], x: false }
];

/** Point on side s of a section: u = -1..1 across the side, y in meters, out = meters outward, ext = meters added to the half length. */
function sidePoint(sec: Section, s: number, u: number, y: number, out = 0, ext = 0): V3 {
  const side = SIDES[s];
  const t = sec.y1 > sec.y0 ? clamp((y - sec.y0) / (sec.y1 - sec.y0), 0, 1) : 0;
  const ax = lerp(sec.ax0, sec.ax1, t);
  const az = lerp(sec.az0, sec.az1, t);
  const half = side.x ? ax : az;
  const dist = side.x ? az : ax;
  const along = u * (half + ext);
  return [side.t[0] * along + side.n[0] * (dist + out), y, side.t[1] * along + side.n[1] * (dist + out)];
}

/** Half length of side s at height y. */
function sideHalf(sec: Section, s: number, y: number) {
  const t = sec.y1 > sec.y0 ? clamp((y - sec.y0) / (sec.y1 - sec.y0), 0, 1) : 0;
  return SIDES[s].x ? lerp(sec.ax0, sec.ax1, t) : lerp(sec.az0, sec.az1, t);
}

/** Point at a distance (meters) from the side center, not a fraction. */
function sidePointM(sec: Section, s: number, along: number, y: number, out = 0): V3 {
  const h = sideHalf(sec, s, y);
  return sidePoint(sec, s, h > 1e-6 ? along / h : 0, y, out);
}

/**
 * Curtain wall of one section: glass for each floor and side, a floor band at each floor line,
 * mullions over the whole section height, some lit windows, and a roof cap.
 */
function facade(b: MeshBuilder, sec: Section, skin: Skin, rand: Rand, opts: { detail: number; topY: number; roof: RGB; cap: boolean }) {
  const h = sec.y1 - sec.y0;
  const floors = Math.max(1, Math.round(h / skin.floorH));
  const fh = h / floors;
  const bandH = Math.min(skin.bandH, fh * 0.3);
  const coarse = opts.detail < 0.35;
  for (let s = 0; s < 4; s++) {
    const sideTone = s % 2 === 0 ? 1 : 0.86;
    // Glass: one quad for each floor (tone varies a little, lighter near the top: the sky).
    b.withMat("glass", () => {
      for (let k = 0; k < floors; k++) {
        const ya = sec.y0 + k * fh;
        const yb = ya + fh;
        const sky = 0.82 + 0.32 * clamp(ya / Math.max(1, opts.topY), 0, 1);
        const col = shade(skin.glass, sideTone * sky * rand.range(0.95, 1.05));
        b.quad(sidePoint(sec, s, -1, ya), sidePoint(sec, s, 1, ya), sidePoint(sec, s, 1, yb), sidePoint(sec, s, -1, yb), col);
      }
    });
    // Floor bands: front, top and bottom faces; they reach around the corner (ext = depth).
    const d = skin.bandD;
    const bandCol = shade(skin.band, sideTone);
    for (let k = 0; k < floors; k++) {
      if (coarse && k % 2 === 1) continue;
      const ya = sec.y0 + k * fh;
      const yb = ya + bandH;
      b.quad(sidePoint(sec, s, -1, ya, d, d), sidePoint(sec, s, 1, ya, d, d), sidePoint(sec, s, 1, yb, d, d), sidePoint(sec, s, -1, yb, d, d), bandCol);
      b.quad(sidePoint(sec, s, -1, yb, d, d), sidePoint(sec, s, 1, yb, d, d), sidePoint(sec, s, 1, yb, 0, 0), sidePoint(sec, s, -1, yb, 0, 0), shade(bandCol, 1.08));
      b.quad(sidePoint(sec, s, -1, ya, 0, 0), sidePoint(sec, s, 1, ya, 0, 0), sidePoint(sec, s, 1, ya, d, d), sidePoint(sec, s, -1, ya, d, d), shade(bandCol, 0.7));
    }
    // Mullions: thin strips from the bottom to the top of the section.
    const halfBottom = sideHalf(sec, s, sec.y0);
    const bay = skin.bay * (coarse ? 2 : 1);
    const bays = Math.max(2, Math.round((2 * halfBottom) / bay));
    const w = skin.mullionW / 2;
    const md = skin.mullionD;
    const frameCol = shade(skin.frame, sideTone);
    for (let i = 1; i < bays; i++) {
      const u = -1 + (2 * i) / bays;
      const at = (y: number) => u * sideHalf(sec, s, y);
      const P = (y: number, dw: number, out: number) => sidePointM(sec, s, at(y) + dw, y, out);
      const y0 = sec.y0;
      const y1 = sec.y1;
      b.quad(P(y0, -w, md), P(y0, w, md), P(y1, w, md), P(y1, -w, md), frameCol);
      b.quad(P(y0, w, md), P(y0, w, 0), P(y1, w, 0), P(y1, w, md), shade(frameCol, 0.82));
      b.quad(P(y0, -w, 0), P(y0, -w, md), P(y1, -w, md), P(y1, -w, 0), shade(frameCol, 0.9));
    }
    // Lit windows: a few warm cells, set just in front of the glass.
    if (opts.detail >= 0.3 && skin.lit > 0) {
      b.withMat("lit", () => {
        for (let k = 0; k < floors; k++) {
          const ya = sec.y0 + k * fh + bandH + fh * 0.08;
          const yb = sec.y0 + (k + 1) * fh - fh * 0.1;
          if (yb <= ya) continue;
          for (let i = 0; i < bays; i++) {
            if (rand.next() >= skin.lit) continue;
            const u0 = -1 + (2 * i) / bays;
            const u1 = -1 + (2 * (i + 1)) / bays;
            const ym = (ya + yb) / 2;
            const hm = sideHalf(sec, s, ym);
            const inset = hm > 1e-6 ? (w + 0.12) / hm : 0;
            const a = u0 + inset;
            const c = u1 - inset;
            if (c <= a) continue;
            const col = mix(rgb("#ffd79a"), rgb("#fff1d6"), rand.next());
            b.quad(sidePoint(sec, s, a, ya, 0.04), sidePoint(sec, s, c, ya, 0.04), sidePoint(sec, s, c, yb, 0.04), sidePoint(sec, s, a, yb, 0.04), col);
          }
        }
      });
    }
  }
  if (opts.cap) {
    const y = sec.y1;
    b.quad([-sec.ax1, y, sec.az1], [sec.ax1, y, sec.az1], [sec.ax1, y, -sec.az1], [-sec.ax1, y, -sec.az1], opts.roof);
  }
}

/** A ring wall (parapet) on a roof edge, outer half sizes ax, az. */
function parapet(b: MeshBuilder, y: number, ax: number, az: number, h: number, t: number, col: RGB) {
  box(b, [-ax, y, az - t], [ax, y + h, az], col, { bottom: false });
  box(b, [-ax, y, -az], [ax, y + h, -az + t], col, { bottom: false });
  box(b, [ax - t, y, -az + t], [ax, y + h, az - t], col, { bottom: false });
  box(b, [-ax, y, -az + t], [-ax + t, y + h, az - t], col, { bottom: false });
}

/**
 * The entrance opening in the front (+z) glass wall of the podium: centered, on the plinth.
 * One size for every tower: a double door. The portal frame of an interior (2.4 m wide) then
 * stands just inside it.
 */
export function towerDoor(_footprint: number): { width: number; height: number } {
  return { width: 2.6, height: 2.7 };
}

/** Podium: plinth, a glass lobby set back behind piers, a band for each upper floor, a canopy on the front. */
function podium(b: MeshBuilder, W: number, D: number, H: number, c: { stone: RGB; frame: RGB; glass: RGB; roof: RGB }, detail: number) {
  const pa = W / 2;
  const pz = D / 2;
  const floors = Math.max(1, Math.round(H / 4.5));
  const fh = H / floors;
  box(b, [-pa, 0, -pz], [pa, 0.3, pz], shade(c.stone, 1.05), { chamfer: 0.05 });
  // The glass hall: three closed walls, a roof, and a front wall with the entrance opening
  // under the canopy. A person can walk in from the street (game mode), and an interior
  // (generators/interior) has a real door to stand behind.
  const gx = pa - 0.6;
  const gz = pz - 0.6;
  const door = towerDoor(W);
  const dx = door.width / 2;
  const dTop = 0.3 + door.height;
  const glass = shade(c.glass, 0.75);
  b.withMat("glass", () => {
    b.quad([-gx, 0.3, -gz], [gx, 0.3, -gz], [gx, H, -gz], [-gx, H, -gz], glass);
    b.quad([-gx, 0.3, gz], [-gx, 0.3, -gz], [-gx, H, -gz], [-gx, H, gz], glass);
    b.quad([gx, 0.3, -gz], [gx, 0.3, gz], [gx, H, gz], [gx, H, -gz], glass);
    b.quad([-gx, H, gz], [gx, H, gz], [gx, H, -gz], [-gx, H, -gz], glass);
    b.quad([-gx, 0.3, gz], [-dx, 0.3, gz], [-dx, H, gz], [-gx, H, gz], glass);
    b.quad([dx, 0.3, gz], [gx, 0.3, gz], [gx, H, gz], [dx, H, gz], glass);
    b.quad([-dx, dTop, gz], [dx, dTop, gz], [dx, H, gz], [-dx, H, gz], glass);
  });
  // Door frame: two posts and a head, and two steps up to the plinth.
  const post = 0.14;
  for (const sx of [-1, 1]) box(b, [sx * dx - post / 2, 0.3, gz - post / 2], [sx * dx + post / 2, dTop, gz + post / 2], shade(c.frame, 0.8), { bottom: false });
  box(b, [-dx - post / 2, dTop, gz - post / 2], [dx + post / 2, dTop + post, gz + post / 2], shade(c.frame, 0.8));
  box(b, [-dx - 0.6, 0, pz], [dx + 0.6, 0.15, pz + 0.7], shade(c.stone, 0.98), { chamfer: 0.03 });
  for (let k = 1; k <= floors; k++) {
    const y = k * fh;
    const bh = Math.min(1.1, fh * 0.25);
    box(b, [-pa, y - bh, -pz], [pa, y, pz], k === floors ? c.stone : shade(c.stone, 0.96), { chamfer: 0.05, bottom: k === 1 ? undefined : false });
  }
  // Piers along each side.
  const pier = 0.7;
  for (const along of [true, false]) {
    const half = along ? pa : pz;
    const n = Math.max(2, Math.round((2 * half) / (detail >= 0.35 ? 6 : 10)));
    for (let i = 0; i <= n; i++) {
      const u = -half + (2 * half * i) / n;
      for (const side of [-1, 1]) {
        // No pier in front of the entrance (the front is +z).
        if (along && side > 0 && Math.abs(u) < door.width / 2 + pier / 2 + 0.2) continue;
        if (along) box(b, [u - pier / 2, 0.3, side * pz - (side > 0 ? pier : 0)], [u + pier / 2, H, side * pz + (side < 0 ? pier : 0)], c.stone, { bottom: false, top: shade(c.stone, 1.05) });
        else box(b, [side * pa - (side > 0 ? pier : 0), 0.3, u - pier / 2], [side * pa + (side < 0 ? pier : 0), H, u + pier / 2], c.stone, { bottom: false, top: shade(c.stone, 1.05) });
      }
    }
  }
  // Roof of the podium and the entrance canopy.
  box(b, [-pa + 0.6, H - 0.05, -pz + 0.6], [pa - 0.6, H + 0.15, pz - 0.6], c.roof, { bottom: false });
  const cw = Math.min(W * 0.32, 10);
  const cd = Math.min(3, W * 0.1);
  const cy = Math.min(4.2, fh * 0.85);
  box(b, [-cw / 2, cy, pz], [cw / 2, cy + 0.35, pz + cd], shade(c.frame, 0.95), { chamfer: 0.05 });
  return cd;
}

/** Spire or mast: a slender cone with rings, ending exactly at y = top. */
function mast(b: MeshBuilder, y0: number, top: number, r0: number, col: RGB, tip: RGB, rings: number, segs = 10) {
  const h = top - y0;
  const prof: [number, number][] = [
    [r0, y0],
    [r0 * 0.75, y0 + h * 0.35],
    [r0 * 0.4, y0 + h * 0.7],
    [r0 * 0.12, y0 + h * 0.96],
    [0, top]
  ];
  lathe(b, prof, segs, (i, j) => shade(col, (i % 2 ? 0.92 : 1) * (1 + j * 0.03)));
  for (let k = 1; k <= rings; k++) {
    const y = y0 + (h * 0.62 * k) / (rings + 1);
    const r = lerp(r0, r0 * 0.4, (y - y0) / (h * 0.7)) + Math.max(0.08, r0 * 0.15);
    b.withMat("gold", () => lathe(b, [[0, y - 0.15], [r, y - 0.15], [r, y + 0.15], [0, y + 0.15]], segs, tip));
  }
}

/** Height of the podium for a tower of height H and this look (the same budget as buildModernTower). */
function podiumHeight(H: number, look: string): number {
  const podH = clamp(Math.round((H * 0.07) / 4.5) * 4.5, 4.5, 13.5);
  const crownH = look === "glass" ? clamp(H * 0.05, 2.5, 12) : look === "setback" ? clamp(H * 0.05, 1.5, 12) : clamp(H * 0.025, 1, 6);
  const spireH = look === "setback" ? H * 0.12 : look === "needle" ? H * 0.15 : 0;
  return Math.max(3, Math.min(podH, H * 0.6 - crownH - spireH));
}

/**
 * The hall inside the podium of a modern tower, in the tower's own meters (origin at the center
 * of the footprint on the ground, front = +z): the inner half sizes between the glass walls, the
 * level of its floor (the top of the plinth), its full clear height and the height of one
 * podium storey. The interior generator fits a lobby into it.
 */
export function towerLobby(p: ArchParams): { halfX: number; halfZ: number; floorY: number; height: number; storey: number; storeys: number; front: "+z" } {
  const H = clamp(p.height > 0 ? p.height : TOWER_HEIGHT.def, TOWER_HEIGHT.min, TOWER_HEIGHT.max);
  const W = p.footprint;
  const D = W * 0.9;
  const hall = podiumHeight(H, p.look ?? "glass");
  const storeys = Math.max(1, Math.round(hall / 4.5));
  // The glass box of the podium stands 0.6 m inside the plinth edge; 0.12 m more keeps the
  // floor and the furniture clear of the glass.
  const inset = 0.6 + 0.12;
  return { halfX: W / 2 - inset, halfZ: D / 2 - inset, floorY: 0.3, height: hall - 0.3, storey: hall / storeys, storeys, front: "+z" };
}

/** Builds the modern tower. Returns the real size; height = p.height exactly (60 m when 0). */
export function buildModernTower(b: MeshBuilder, p: ArchParams, rand: Rand): BuildInfo {
  const H = clamp(p.height > 0 ? p.height : TOWER_HEIGHT.def, TOWER_HEIGHT.min, TOWER_HEIGHT.max);
  const W = p.footprint;
  const D = W * 0.9;
  const n = Math.max(1, Math.min(4, Math.round(p.tiers)));
  const d = p.detail;
  const look = p.look ?? "glass";
  const frame = rgb(p.colors.walls);
  const glass = rgb(p.colors.timber);
  const stone = rgb(p.colors.base);
  const accent = rgb(p.colors.accent);
  const roof = rgb(p.colors.roof);

  // Height budget: podium + shaft + crown (+ spire or mast) = H.
  const podH = clamp(Math.round((H * 0.07) / 4.5) * 4.5, 4.5, 13.5);
  const crownH = look === "glass" ? clamp(H * 0.05, 2.5, 12) : look === "setback" ? clamp(H * 0.05, 1.5, 12) : clamp(H * 0.025, 1, 6);
  const spireH = look === "setback" ? H * 0.12 : look === "needle" ? H * 0.15 : 0;
  // The shaft keeps at least 40 % of the height, so a low tower gets a lower podium.
  const pod = Math.min(podH, H * 0.6 - crownH - spireH);

  b.stage("Podium base");
  const canopy = podium(b, W, D, Math.max(3, pod), { stone, frame, glass, roof }, d);
  const y0 = Math.max(3, pod);

  const skin: Skin =
    look === "setback"
      ? { glass: shade(glass, 0.9), frame, band: shade(roof, 1.1), floorH: 3.6, bay: 3.4, mullionW: 0.75, mullionD: 0.38, bandH: 1.0, bandD: 0.05, lit: 0.07 }
      : look === "needle"
        ? { glass, frame, band: shade(frame, 0.95), floorH: 3.8, bay: 2.6, mullionW: 0.16, mullionD: 0.14, bandH: 0.45, bandD: 0.16, lit: 0.05 }
        : { glass, frame: shade(frame, 0.9), band: mix(shade(glass, 0.5), frame, 0.35), floorH: 3.8, bay: 3, mullionW: 0.14, mullionD: 0.18, bandH: 0.9, bandD: 0.08, lit: 0.06 };

  // Sections of the shaft.
  const baseAx = W * 0.39;
  const baseAz = D * 0.39;
  const weights = look === "setback" ? Array.from({ length: n }, (_, i) => Math.pow(0.62, i)) : Array.from({ length: n }, () => 1);
  const sum = weights.reduce((a, w) => a + w, 0);
  const shaftTop = y0 + (H - y0 - crownH - spireH);
  const sections: Section[] = [];
  let y = y0;
  for (let i = 0; i < n; i++) {
    const h = ((shaftTop - y0) * weights[i]) / sum;
    let k0: number;
    let k1: number;
    if (look === "setback") k0 = k1 = Math.pow(0.76, i);
    else if (look === "needle") {
      k0 = lerp(1, 0.5, i / n);
      k1 = lerp(1, 0.5, (i + 1) / n);
    } else k0 = k1 = Math.pow(0.95, i);
    sections.push({ y0: y, y1: i === n - 1 ? shaftTop : y + h, ax0: baseAx * k0, az0: baseAz * k0, ax1: baseAx * k1, az1: baseAz * k1 });
    y += h;
  }

  for (const [i, sec] of sections.entries()) {
    b.stage(`Tier ${i + 1}`);
    facade(b, sec, skin, rand, { detail: d, topY: H, roof, cap: true });
    if (look === "setback") {
      // Corner piers and a parapet with a gold band on each terrace.
      const cp = Math.max(0.6, sec.ax0 * 0.08);
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) box(b, [sx * sec.ax0 - cp, sec.y0, sz * sec.az0 - cp], [sx * sec.ax0 + cp, sec.y1, sz * sec.az0 + cp], shade(frame, 1.04), { bottom: false });
      if (i < n - 1) {
        parapet(b, sec.y1, sec.ax1 + 0.2, sec.az1 + 0.2, 1.4, 0.4, shade(frame, 1.06));
        b.withMat("gold", () => parapet(b, sec.y1 + 1.0, sec.ax1 + 0.25, sec.az1 + 0.25, 0.25, 0.5, accent));
      }
    } else if (look === "needle" && i < n - 1) {
      // Sky lobby ring at each joint.
      const r = 0.35;
      box(b, [-sec.ax1 - r, sec.y1 - 0.6, -sec.az1 - r], [sec.ax1 + r, sec.y1 + 0.6, sec.az1 + r], shade(skin.frame, 1.05), { chamfer: 0.1 });
    } else if (look === "glass" && i < n - 1) {
      box(b, [-sec.ax1 - 0.15, sec.y1 - 0.3, -sec.az1 - 0.15], [sec.ax1 + 0.15, sec.y1 + 0.3, sec.az1 + 0.15], shade(skin.frame, 1.05));
    }
  }

  b.stage("Roof ornaments");
  const top = sections[sections.length - 1];
  const ax = top.ax1;
  const az = top.az1;
  if (look === "glass") {
    // Mechanical screen: fins in front of a dark panel, a rim on top, plant boxes behind.
    const sy0 = shaftTop;
    const sy1 = H;
    const scr: Section = { y0: sy0, y1: sy1, ax0: ax - 0.3, az0: az - 0.3, ax1: ax - 0.3, az1: az - 0.3 };
    for (let s = 0; s < 4; s++) {
      const dark = shade(roof, 0.55);
      b.quad(sidePoint(scr, s, -1, sy0, -0.5), sidePoint(scr, s, 1, sy0, -0.5), sidePoint(scr, s, 1, sy1 - 0.4, -0.5), sidePoint(scr, s, -1, sy1 - 0.4, -0.5), dark);
      const half = sideHalf(scr, s, sy0);
      const fins = Math.max(4, Math.round((2 * half) / (d >= 0.35 ? 1.2 : 2.4)));
      for (let i = 0; i <= fins; i++) {
        const u = -half + (2 * half * i) / fins;
        const P = (yy: number, dw: number, out: number) => sidePointM(scr, s, u + dw, yy, out);
        b.quad(P(sy0, -0.12, 0), P(sy0, 0.12, 0), P(sy1 - 0.4, 0.12, 0), P(sy1 - 0.4, -0.12, 0), shade(skin.frame, s % 2 ? 0.86 : 1));
      }
    }
    parapet(b, sy1 - 0.4, ax - 0.1, az - 0.1, 0.4, 0.5, shade(skin.frame, 1.08));
    for (const [cx, cz, hx, hz] of [
      [-ax * 0.35, -az * 0.2, ax * 0.3, az * 0.35],
      [ax * 0.35, az * 0.25, ax * 0.22, az * 0.28]
    ])
      box(b, [cx - hx, sy0, cz - hz], [cx + hx, sy0 + (sy1 - sy0) * 0.7, cz + hz], shade(roof, rand.range(0.95, 1.1)), { bottom: false });
  } else if (look === "setback") {
    // Stepped crown: three smaller blocks, then the spire.
    let cy = shaftTop;
    let k = 0.8;
    const step = crownH / 3;
    for (let s = 0; s < 3; s++) {
      box(b, [-ax * k, cy, -az * k], [ax * k, cy + step, az * k], shade(frame, 1.02 + s * 0.02), { bottom: false });
      b.withMat("gold", () => box(b, [-ax * k - 0.12, cy + step * 0.75, -az * k - 0.12], [ax * k + 0.12, cy + step * 0.9, az * k + 0.12], accent, { bottom: false }));
      cy += step;
      k *= 0.72;
    }
    b.withMat("gold", () => mast(b, cy, H, Math.max(0.4, ax * k * 0.9), accent, accent, 2, 8));
  } else {
    // Needle: a short drum, then the mast with rings and a beacon.
    const r = Math.min(ax, az) * 0.75;
    lathe(b, [[r, shaftTop], [r, shaftTop + crownH], [r * 0.7, shaftTop + crownH], [0, shaftTop + crownH]], 14, (_i, j) => shade(skin.frame, 1 + j * 0.04));
    mast(b, shaftTop + crownH, H, Math.max(0.3, r * 0.35), shade(skin.frame, 1.05), accent, 3, 10);
  }
  return { half: [W / 2, D / 2 + canopy], height: H, front: "+z" };
}
