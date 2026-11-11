// Ports index-BwioI7A7.js 36424-36605: landmark footprints (cv, lv, uv), the sagging-span point (dv)
// and the site placer (fv) that finds free, flat ground for festival props.
import * as THREE from 'three';
import type { Game } from '../game/types';
import type { Point2, Point3, Site, Span } from './types';

/** [footprint radius, height] of each landmark, for clearance tests. */
export const LANDMARK_FOOTPRINT: Record<string, [number, number]> = { // cv (36424)
  windmill: [1.25, 3],
  scarecrow: [0.95, 1.6],
  greenhouse: [1.25, 1.6],
  bell_tower: [0.85, 2.2],
  gazebo: [1.05, 1.9],
  maypole: [1.25, 2.4],
  lighthouse: [0.75, 2.8],
  island_shrine: [1.7, 1.8],
  wishing_well: [0.75, 1.3],
  hot_spring: [1.2, 1.2],
  snowman: [0.6, 1.1],
  treehouse: [1.9, 4],
  standing_stones: [1.15, 1.3],
  campfire: [0.95, 0.8],
  sundial: [0.6, 0.9],
  weather_vane: [0.45, 1.4],
  lookout_tower: [1, 3.5],
  rope_swing: [1.4, 3],
  kite: [0.7, 1],
  garden_shed: [1.1, 1.8],
  fountain: [0.8, 1.2],
  water_wheel: [1, 1.8],
};

export const footprintRadius = (id: string): number => LANDMARK_FOOTPRINT[id]?.[0] ?? 1; // lv (36448)
export const footprintHeight = (id: string): number => LANDMARK_FOOTPRINT[id]?.[1] ?? 2; // uv (36449)

/** Point at t (0..1) along a span, lowered by the parabolic sag. Writes into out. */
export function spanPoint(span: Span, t: number, out: THREE.Vector3): THREE.Vector3 { // dv (36450)
  out.lerpVectors(span.a, span.b, t);
  out.y -= span.sag * 4 * t * (1 - t);
  return out;
}

interface Obstacle {
  x: number;
  z: number;
  r: number;
}

interface PlacedLandmark extends Obstacle {
  y: number;
  h: number;
  id: string;
}

export interface FreeOptions {
  /** Clearance radius around trees (default 0.4). */
  trees?: number;
  ignoreTaken?: boolean;
}

export interface FindOptions {
  x: number;
  z: number;
  rMin?: number;
  rMax: number;
  /** Ring step (default 0.3). */
  step?: number;
  maxSlope?: number;
  radius: number;
  /** Search only around this direction, within +-spread. */
  dir?: number;
  phase?: number;
  spread?: number;
  trees?: number;
  /** false: do not reserve the found spot. */
  claim?: boolean;
}

export interface ChainOptions {
  postH: number;
  sag?: number;
  maxSpan?: number;
  clear?: number;
}

export interface Chain {
  posts: Point3[];
  spans: Span[];
}

export class SitePlacer { // fv (36453)
  game: Game;
  taken: Obstacle[] = [];
  lms: PlacedLandmark[];
  trees: Point2[];
  feats: Obstacle[];

  constructor(game: Game) {
    this.game = game;
    this.lms = game.landmarks
      .instances()
      .map((e: any) => ({ x: e.x, y: e.y, z: e.z, r: footprintRadius(e.id), h: footprintHeight(e.id), id: e.id }));
    const habitat = game.ecology.habitat;
    this.trees = habitat.trees.map((e: any) => ({ x: e.base.x, z: e.base.z }));
    this.feats = habitat.features.map((e: any) => ({
      x: e.x,
      z: e.z,
      r: e.type === `bridge` || e.type === `fence` ? 0.8 : e.type === `stepping_stone` ? 0.3 : 0.45,
    }));
  }

  ground(x: number, z: number): number {
    return this.game.terrain.heightAt(x, z);
  }

  land(x: number, z: number): boolean {
    return this.game.terrain.surfaceAt(x, z) !== `water` && this.game.terrain.heightAt(x, z) > 0.1;
  }

  water(x: number, z: number): boolean {
    return this.game.terrain.surfaceAt(x, z) === `water` && this.game.terrain.heightAt(x, z) <= 0.02;
  }

  /** Height range of the ground on a ring of radius r around (x, z), centre included. */
  slope(x: number, z: number, r: number): number {
    let lo = this.ground(x, z);
    let hi = lo;
    for (let a = 0; a < 8; a++) {
      const o = (a / 8) * Math.PI * 2;
      const s = this.ground(x + Math.cos(o) * r, z + Math.sin(o) * r);
      if (s < lo) lo = s;
      if (s > hi) hi = s;
    }
    return hi - lo;
  }

  free(x: number, z: number, radius: number, opts: FreeOptions = {}): boolean {
    for (const r of this.lms) if ((r.x - x) ** 2 + (r.z - z) ** 2 < (r.r + radius) ** 2) return false;
    const treeR = opts.trees ?? 0.4;
    for (const r of this.trees) if ((r.x - x) ** 2 + (r.z - z) ** 2 < (treeR + radius) ** 2) return false;
    for (const r of this.feats) if ((r.x - x) ** 2 + (r.z - z) ** 2 < (r.r + radius) ** 2) return false;
    if (!opts.ignoreTaken) {
      for (const r of this.taken) if ((r.x - x) ** 2 + (r.z - z) ** 2 < (r.r + radius) ** 2) return false;
    }
    return true;
  }

  okGround(x: number, z: number, radius: number, maxSlope: number): boolean {
    if (!this.land(x, z)) return false;
    for (let r = 0; r < 6; r++) {
      const i = (r / 6) * Math.PI * 2;
      if (!this.land(x + Math.cos(i) * radius, z + Math.sin(i) * radius)) return false;
    }
    return this.slope(x, z, Math.max(0.12, radius)) <= maxSlope;
  }

  claim(x: number, z: number, r: number): void {
    this.taken.push({ x, z, r });
  }

  /** Searches rings outward from (x, z) for a free, flat land spot. Claims it unless opts.claim is false. */
  find(e: FindOptions): Point3 | null {
    const rMin = e.rMin ?? 0;
    const step = e.step ?? 0.3;
    const maxSlope = e.maxSlope ?? 0.1;
    for (let i = rMin; i <= e.rMax + 1e-6; i += step) {
      const t = i < 0.001 ? 1 : Math.max(6, Math.ceil((Math.PI * 2 * i) / 0.35));
      for (let n = 0; n < t; n++) {
        const a = n % 2 ? (n + 1) / 2 : -n / 2;
        const o = (e.dir ?? e.phase ?? 0) + (a / t) * Math.PI * 2;
        if (e.dir !== void 0 && Math.abs(a / t) * Math.PI * 2 > (e.spread ?? Math.PI)) continue;
        const s = e.x + Math.cos(o) * i;
        const c = e.z + Math.sin(o) * i;
        if (this.free(s, c, e.radius, { trees: e.trees }) && this.okGround(s, c, e.radius, maxSlope)) {
          if (e.claim !== false) this.claim(s, c, e.radius);
          return { x: s, y: this.ground(s, c), z: c };
        }
      }
    }
    return null;
  }

  /** True when the span stays `clear` above the ground and does not pass through a landmark (except `skip`). */
  spanClear(span: Span, clear = 0.45, skip?: Point2): boolean {
    const r = new THREE.Vector3();
    const len = span.a.distanceTo(span.b);
    const o = Math.max(6, Math.ceil(len / 0.35));
    for (let i = 1; i < o; i++) {
      spanPoint(span, i / o, r);
      if (r.y < this.ground(r.x, r.z) + clear) return false;
      for (const e of this.lms)
        if (
          !(skip && Math.abs(e.x - skip.x) < 0.01 && Math.abs(e.z - skip.z) < 0.01) &&
          (e.x - r.x) ** 2 + (e.z - r.z) ** 2 < (e.r * 0.9) ** 2 &&
          r.y < e.y + e.h
        )
          return false;
    }
    return true;
  }

  /** Posts and sagging spans from landmark a to landmark b. */
  chain(e: Site, t: Site, n: ChainOptions): Chain | null {
    const maxSpan = n.maxSpan ?? 3.4;
    const i = Math.atan2(t.z - e.z, t.x - e.x);
    const o = i + Math.PI;
    const s = footprintRadius(e.id) + 0.35;
    const c = footprintRadius(t.id) + 0.35;
    const l = this.find({
      x: e.x,
      z: e.z,
      rMin: s,
      rMax: s + 1.6,
      radius: 0.18,
      maxSlope: 0.3,
      dir: i,
      spread: 1.3,
      step: 0.25,
    });
    const u = this.find({
      x: t.x,
      z: t.z,
      rMin: c,
      rMax: c + 1.6,
      radius: 0.18,
      maxSlope: 0.3,
      dir: o,
      spread: 1.3,
      step: 0.25,
    });
    if (!l || !u) return null;
    const d: Point3[] = [l];
    const f = Math.hypot(u.x - l.x, u.z - l.z);
    const p = Math.max(0, Math.ceil(f / maxSpan) - 1);
    for (let k = 1; k <= p; k++) {
      const tt = k / (p + 1);
      const nx = l.x + (u.x - l.x) * tt;
      const nz = l.z + (u.z - l.z) * tt;
      const a = this.find({ x: nx, z: nz, rMax: 1.1, radius: 0.18, maxSlope: 0.3, step: 0.2, phase: i + Math.PI / 2 });
      if (a) d.push(a);
    }
    d.push(u);
    const m = n.sag ?? 0.26;
    const h: Span[] = [];
    for (let k = 0; k < d.length - 1; k++) {
      const a = d[k];
      const b = d[k + 1];
      const dist = Math.hypot(b.x - a.x, b.z - a.z);
      if (dist > maxSpan * 1.9 || dist < 0.5) continue;
      const span: Span = {
        a: new THREE.Vector3(a.x, a.y + n.postH - 0.06, a.z),
        b: new THREE.Vector3(b.x, b.y + n.postH - 0.06, b.z),
        sag: m * Math.min(1.3, dist / 3),
      };
      if (this.spanClear(span, n.clear ?? 0.5)) h.push(span);
    }
    return { posts: d, spans: h };
  }

  get landmarks(): PlacedLandmark[] {
    return this.lms;
  }
}
