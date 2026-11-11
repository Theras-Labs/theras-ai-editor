// Parts spec of the object modeler: the DATA a model writes for an object that is not in the
// library. Code (build.ts) turns it into meshes; the editor never runs model-written code.
// validateSpec() makes any input safe: wrong types are dropped, numbers are clamped, counts are
// capped. check.ts then does the geometric self-check (far parts, floating parts).
import { PALETTES, isPaletteId } from "@/lib/copilot/palettes";

export type Vec3 = [number, number, number];
export type Axis = "x" | "y" | "z";

export const PART_SHAPES = ["box", "wedge", "ellipsoid", "cylinder", "cone", "capsule", "torus", "lathe", "extrude", "tube"] as const;
export type PartShape = (typeof PART_SHAPES)[number];

export type PartRepeat = {
  /** Number of copies, the original included (2 to 32). */
  n: number;
  /** Linear array: copy i is moved by i * step. */
  step?: Vec3;
  /** Radial array: copy i is turned by i * 360 / n degrees about this axis through `center`. */
  radial?: Axis;
  /** Point the radial axis goes through (default: the part's own `at`). */
  center?: Vec3;
};

export type Part = {
  name?: string;
  shape: PartShape;
  /** Center of the part (lathe, extrude, tube: the origin of profile, outline or points). */
  at: Vec3;
  /** Euler XYZ rotation in degrees, applied after `axis`. */
  rot?: Vec3;
  scale?: Vec3;
  /** box, wedge, ellipsoid: full extents [x, y, z]. */
  size?: Vec3;
  /** cylinder, cone, capsule: bottom radius. torus: ring radius. tube: tube radius. */
  r?: number;
  /** cylinder: top radius (cone: default 0). */
  r2?: number;
  /** cylinder, cone, capsule: length along the axis. */
  h?: number;
  /** torus: tube radius. */
  t?: number;
  /** Long axis of cylinder, cone, capsule, lathe; hole axis of torus. Default "y". */
  axis?: Axis;
  /** Radial segments (3 = triangular prism, 6 = hex). */
  sides?: number;
  /** box, wedge, extrude: rounded edge radius. */
  bevel?: number;
  /** box: scale of the top face [x, z] (1 = straight sides). */
  taper?: [number, number];
  /** cylinder, cone: bend of the axis in degrees, toward +x of the part. */
  bend?: number;
  /** torus: arc in degrees (180 = arch). */
  arc?: number;
  /** ellipsoid: part of the height cut flat from the bottom, 0..0.9 (0.5 = dome). */
  clip?: number;
  /** lathe: [radius, position along the axis] from one end to the other. */
  profile?: [number, number][];
  /** extrude: 2D outline points in `plane`. */
  outline?: [number, number][];
  /** extrude: plane of the outline; the thickness goes along the third axis. Default "xy". */
  plane?: "xy" | "xz" | "zy";
  /** extrude: thickness. */
  depth?: number;
  /** tube: polyline points, relative to `at`. */
  points?: Vec3[];
  /** Palette role or "#rrggbb". */
  color: string;
  rough?: number;
  metal?: number;
  /** Glow strength 0..3 (lamps, lights, screens). */
  emit?: number;
  /** Smooth shading (default: flat facets, the library look). */
  smooth?: boolean;
  /** Adds a mirrored copy across the plane x = 0 or z = 0. */
  mirror?: "x" | "z";
  repeat?: PartRepeat;
  /** Name of a pivot group in spec.groups (moving parts: propeller, wheel, door). */
  group?: string;
};

export type PartsStage = { name: string; parts: Part[] };

export type PartsSpec = {
  name: string;
  /** Overall size [width x, height y, depth z] in meters. Origin: ground center; +z is the front. */
  size: Vec3;
  palette: Record<string, string>;
  /** Pivot point of each moving group. */
  groups?: Record<string, Vec3>;
  /** Primary forms first, details last. */
  stages: PartsStage[];
};

export const LIMITS = {
  minParts: 3,
  maxParts: 80,
  maxStages: 5,
  maxInstances: 480,
  maxProfile: 24,
  maxOutline: 48,
  maxPoints: 16,
  coord: 60,
  minDim: 0.002,
  maxDim: 60
} as const;

export const DEFAULT_COLOR = "#b9b1a6";
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export type SpecIssue = string;

function num(v: unknown): number | undefined {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : undefined;
}
function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}
function numIn(v: unknown, lo: number, hi: number): number | undefined {
  const n = num(v);
  return n === undefined ? undefined : clamp(n, lo, hi);
}
function vec3(v: unknown, lo: number, hi: number): Vec3 | undefined {
  if (!Array.isArray(v) || v.length < 3) return undefined;
  const out = [num(v[0]), num(v[1]), num(v[2])];
  if (out.some((x) => x === undefined)) return undefined;
  return out.map((x) => clamp(x!, lo, hi)) as Vec3;
}
function vec2List(v: unknown, max: number, lo: number, hi: number): [number, number][] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: [number, number][] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const a = num(p[0]);
    const b = num(p[1]);
    if (a === undefined || b === undefined) continue;
    out.push([clamp(a, lo, hi), clamp(b, lo, hi)]);
    if (out.length >= max) break;
  }
  return out;
}
function axisOf(v: unknown): Axis | undefined {
  return v === "x" || v === "y" || v === "z" ? v : undefined;
}
function pos(v: number | undefined, fallback: number) {
  return v === undefined ? fallback : Math.max(LIMITS.minDim, v);
}

/** A color is valid when it is a hex or a role of the palette. */
function colorOf(v: unknown, palette: Record<string, string>, issues: SpecIssue[], where: string): string {
  if (typeof v === "string") {
    const s = v.trim();
    if (HEX.test(s)) return s.toLowerCase();
    if (palette[s]) return s;
  }
  issues.push(`${where}: unknown color "${String(v)}", used stone grey`);
  return DEFAULT_COLOR;
}

function normalizeHex(h: string) {
  const s = h.trim().toLowerCase();
  return s.length === 4 ? `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}` : s;
}

/** Resolves a part color (role or hex) to "#rrggbb". */
export function resolveColor(color: string, palette: Record<string, string>): string {
  if (HEX.test(color)) return normalizeHex(color);
  const p = palette[color];
  return p && HEX.test(p) ? normalizeHex(p) : DEFAULT_COLOR;
}

/** [{ role, hex }] (the tool schema) or { role: hex }, as entries. */
function entriesOf(v: unknown, valueKey: string): [string, unknown][] {
  if (Array.isArray(v))
    return v
      .filter((e): e is Record<string, unknown> => Boolean(e) && typeof e === "object")
      .map((e) => [String(e.role ?? e.name ?? ""), e[valueKey]] as [string, unknown]);
  if (v && typeof v === "object") return Object.entries(v as Record<string, unknown>);
  return [];
}

function paletteOf(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (typeof v === "string" && isPaletteId(v)) return { ...PALETTES[v].colors };
  for (const [k, c] of entriesOf(v, "hex").slice(0, 12)) {
    if (typeof c !== "string") continue;
    const role = k.trim().slice(0, 24);
    if (!role) continue;
    if (HEX.test(c.trim())) out[role] = normalizeHex(c);
    else {
      // "harbor.wood": a role of a named editor palette.
      const [pid, prole] = c.split(".");
      const named = pid && isPaletteId(pid) ? (PALETTES[pid].colors as Record<string, string>)[prole ?? ""] : undefined;
      if (named) out[role] = named;
    }
  }
  return out;
}

function partOf(raw: unknown, palette: Record<string, string>, groups: Record<string, Vec3>, issues: SpecIssue[], where: string): Part | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shape = (PART_SHAPES as readonly string[]).includes(String(o.shape)) ? (o.shape as PartShape) : null;
  if (!shape) {
    issues.push(`${where}: unknown shape "${String(o.shape)}", dropped`);
    return null;
  }
  const C = LIMITS.coord;
  const at = vec3(o.at, -C, C) ?? vec3(o.pos, -C, C) ?? vec3(o.position, -C, C);
  if (!at) {
    issues.push(`${where}: no valid "at", dropped`);
    return null;
  }
  const p: Part = { shape, at, color: colorOf(o.color, palette, issues, where) };
  if (typeof o.name === "string" && o.name.trim()) p.name = o.name.trim().slice(0, 40);
  const rot = vec3(o.rot, -720, 720);
  if (rot && rot.some((x) => x !== 0)) p.rot = rot;
  const scale = vec3(o.scale, 0.01, 50);
  if (scale && scale.some((x) => x !== 1)) p.scale = scale;
  const axis = axisOf(o.axis);
  if (axis && axis !== "y") p.axis = axis;
  const sides = num(o.sides);
  if (sides !== undefined) p.sides = Math.round(clamp(sides, 3, 32));

  const D = LIMITS.maxDim;
  const m = LIMITS.minDim;
  switch (shape) {
    case "box":
    case "wedge":
    case "ellipsoid": {
      const size = vec3(o.size, m, D);
      if (!size) {
        issues.push(`${where}: ${shape} needs size [x,y,z], dropped`);
        return null;
      }
      p.size = size;
      if (shape !== "ellipsoid") {
        const bevel = numIn(o.bevel, 0, D);
        if (bevel !== undefined) p.bevel = bevel;
      }
      if (shape === "box") {
        const taper = Array.isArray(o.taper) ? [numIn(o.taper[0], 0, 4), numIn(o.taper[1], 0, 4)] : undefined;
        if (taper && taper[0] !== undefined && taper[1] !== undefined && (taper[0] !== 1 || taper[1] !== 1)) p.taper = [taper[0], taper[1]];
      }
      if (shape === "ellipsoid") {
        const clip = numIn(o.clip, 0, 0.9);
        if (clip) p.clip = clip;
      }
      break;
    }
    case "cylinder":
    case "cone":
    case "capsule": {
      const r = numIn(o.r, m, D);
      const h = numIn(o.h, m, D);
      if (r === undefined || h === undefined) {
        issues.push(`${where}: ${shape} needs r and h, dropped`);
        return null;
      }
      p.r = r;
      p.h = h;
      if (shape !== "capsule") {
        const r2 = numIn(o.r2, 0, D);
        if (r2 !== undefined) p.r2 = r2;
        const bend = numIn(o.bend, -270, 270);
        if (bend) p.bend = bend;
      }
      break;
    }
    case "torus": {
      const r = numIn(o.r, m, D);
      if (r === undefined) {
        issues.push(`${where}: torus needs r, dropped`);
        return null;
      }
      p.r = r;
      p.t = clamp(pos(num(o.t), r * 0.25), m, r);
      const arc = numIn(o.arc, 5, 360);
      if (arc !== undefined && arc < 360) p.arc = arc;
      break;
    }
    case "lathe": {
      const profile = vec2List(o.profile, LIMITS.maxProfile, -C, C)?.map(([r, y]) => [Math.abs(r), y] as [number, number]);
      if (!profile || profile.length < 2 || profile.every(([r]) => r < m)) {
        issues.push(`${where}: lathe needs 2+ profile points [radius, y], dropped`);
        return null;
      }
      p.profile = profile;
      break;
    }
    case "extrude": {
      const outline = vec2List(o.outline, LIMITS.maxOutline, -C, C);
      if (!outline || outline.length < 3 || polygonArea(outline) < m * m) {
        issues.push(`${where}: extrude needs an outline of 3+ points with area, dropped`);
        return null;
      }
      p.outline = outline;
      p.plane = o.plane === "xz" || o.plane === "zy" ? o.plane : "xy";
      p.depth = pos(numIn(o.depth, m, D), 0.05);
      const bevel = numIn(o.bevel, 0, D);
      if (bevel !== undefined) p.bevel = bevel;
      break;
    }
    case "tube": {
      const pts = Array.isArray(o.points) ? o.points.map((q) => vec3(q, -C, C)).filter((q): q is Vec3 => Boolean(q)).slice(0, LIMITS.maxPoints) : [];
      const r = numIn(o.r, m, D);
      if (pts.length < 2 || r === undefined) {
        issues.push(`${where}: tube needs 2+ points and r, dropped`);
        return null;
      }
      p.points = pts;
      p.r = r;
      break;
    }
  }

  const rough = numIn(o.rough, 0, 1);
  if (rough !== undefined) p.rough = rough;
  const metal = numIn(o.metal, 0, 1);
  if (metal !== undefined && metal > 0) p.metal = metal;
  const emit = numIn(o.emit, 0, 3);
  if (emit) p.emit = emit;
  if (o.smooth === true) p.smooth = true;
  if (o.mirror === "x" || o.mirror === "z") p.mirror = o.mirror;
  if (o.repeat && typeof o.repeat === "object") {
    const rr = o.repeat as Record<string, unknown>;
    const n = num(rr.n ?? rr.count);
    if (n !== undefined && n >= 2) {
      const rep: PartRepeat = { n: Math.round(clamp(n, 2, 32)) };
      const radial = axisOf(rr.radial);
      const step = vec3(rr.step, -C, C);
      if (radial) {
        rep.radial = radial;
        const center = vec3(rr.center, -C, C);
        if (center) rep.center = center;
      } else if (step) rep.step = step;
      if (rep.radial || rep.step) p.repeat = rep;
    }
  }
  // A group used without a pivot gets one after all parts are read (validateSpec).
  if (typeof o.group === "string" && o.group.trim()) p.group = o.group.trim().slice(0, 32);
  return p;
}

export function polygonArea(pts: [number, number][]) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a / 2);
}

/** Copies of a part after repeat and mirror. */
export function instanceCount(p: Part) {
  return (p.repeat?.n ?? 1) * (p.mirror ? 2 : 1);
}

export type ValidationResult = { spec: PartsSpec; issues: SpecIssue[] } | { error: string };

/**
 * Makes a model-written spec safe and well-formed. Accepts JSON text or an object.
 * Returns an error text when nothing buildable is left.
 */
export function validateSpec(input: unknown): ValidationResult {
  let raw = input;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return { error: "spec is not valid JSON" };
    }
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { error: "spec must be an object" };
  const o = raw as Record<string, unknown>;
  const issues: SpecIssue[] = [];
  const name = typeof o.name === "string" && o.name.trim() ? o.name.trim().slice(0, 60) : "Object";
  const size = vec3(o.size, 0.05, LIMITS.maxDim) ?? [1, 1, 1];
  const palette = paletteOf(o.palette);
  const groups: Record<string, Vec3> = {};
  for (const [k, v] of entriesOf(o.groups, "pivot").slice(0, 8)) {
    const pivot = vec3(Array.isArray(v) ? v : (v as Record<string, unknown> | null)?.pivot, -LIMITS.coord, LIMITS.coord);
    if (pivot && k) groups[k.slice(0, 32)] = pivot;
  }

  // Stages; a flat "parts" list becomes one stage.
  let rawStages: unknown[] = [];
  if (Array.isArray(o.stages)) rawStages = o.stages;
  else if (Array.isArray(o.parts)) rawStages = [{ name: "Parts", parts: o.parts }];
  const stages: PartsStage[] = [];
  let total = 0;
  let instances = 0;
  let cut = 0;
  rawStages.forEach((s, si) => {
    const so = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
    const parts: Part[] = [];
    (Array.isArray(so.parts) ? so.parts : []).forEach((rp, pi) => {
      const part = partOf(rp, palette, groups, issues, `stage ${si + 1} part ${pi + 1}`);
      if (!part) return;
      const n = instanceCount(part);
      if (total >= LIMITS.maxParts || instances + n > LIMITS.maxInstances) {
        cut++;
        return;
      }
      total++;
      instances += n;
      parts.push(part);
    });
    if (parts.length === 0) return;
    const stageName = typeof so.name === "string" && so.name.trim() ? so.name.trim().slice(0, 40) : `Stage ${stages.length + 1}`;
    if (stages.length < LIMITS.maxStages) stages.push({ name: stageName, parts });
    else stages[stages.length - 1]!.parts.push(...parts);
  });
  // Pivots of groups used but not defined: the mean of the parts' centers (a radial repeat's center).
  const pivotSum = new Map<string, { x: number; y: number; z: number; n: number }>();
  for (const st of stages)
    for (const p of st.parts) {
      if (!p.group || groups[p.group]) continue;
      if (Object.keys(groups).length + pivotSum.size >= 8 && !pivotSum.has(p.group)) {
        delete p.group;
        continue;
      }
      const c = p.repeat?.radial ? (p.repeat.center ?? p.at) : p.at;
      const acc = pivotSum.get(p.group) ?? { x: 0, y: 0, z: 0, n: 0 };
      pivotSum.set(p.group, { x: acc.x + c[0], y: acc.y + c[1], z: acc.z + c[2], n: acc.n + 1 });
    }
  for (const [g, a] of pivotSum) groups[g] = [a.x / a.n, a.y / a.n, a.z / a.n];
  if (cut) issues.push(`${cut} parts over the limit of ${LIMITS.maxParts} parts / ${LIMITS.maxInstances} copies were dropped`);
  if (total < LIMITS.minParts) return { error: `spec has ${total} valid parts; ${LIMITS.minParts} or more are needed` };

  // Roles used but not defined fall back to grey; record them once.
  return { spec: { name, size, palette, ...(Object.keys(groups).length ? { groups } : {}), stages }, issues };
}

export function partCount(spec: PartsSpec) {
  return spec.stages.reduce((n, s) => n + s.parts.length, 0);
}

export function totalInstances(spec: PartsSpec) {
  return spec.stages.reduce((n, s) => n + s.parts.reduce((m, p) => m + instanceCount(p), 0), 0);
}
