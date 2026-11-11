// Ports index-BwioI7A7.js 12456-12541 (da World: the editable corner heights and materials).
import { CONFIG } from './config';
import type { Events } from './events';
import type { Grid } from './grid';

export type Material = 'water' | 'soil' | 'stone';
export type Tool = 'soil' | 'stone' | 'water' | 'seed' | 'poke';
/** What World.apply did to the corner. */
export type ApplyKind = 'none' | 'raise' | 'lower' | 'paint' | 'sow' | 'unsow';

export interface CornerState {
  /** 0 = water (lake bed); 1..CONFIG.MAX_HEIGHT = land levels. */
  height: number;
  material: Material;
  sown: boolean;
}

/** Payload of the world:changed event. */
export interface WorldChangedEvent {
  corners: number[];
  /** First changed corner, or -1. */
  cornerId: number;
  /** Null for World.commit (bulk changes). */
  tool: Tool | null;
  kind: ApplyKind;
}

export class World { // da (12456)
  grid: Grid;
  events: Events;
  corners: CornerState[];
  /** Increments on every change. */
  version = 0;
  /** When true, apply does nothing (visiting a shared garden). */
  locked = false;

  constructor(grid: Grid, events: Events) {
    this.grid = grid;
    this.events = events;
    this.corners = grid.corners.map((): CornerState => ({ height: 0, material: `water`, sown: false }));
  }

  get(id: number): CornerState {
    return this.corners[id];
  }

  isLand(id: number): boolean {
    return this.corners[id].height > 0;
  }

  /**
   * Applies a tool to one corner. `alt` (secondary action) lowers land, or unsows with the seed tool.
   * Emits world:changed and returns the kind when the corner changed; returns `none` otherwise.
   */
  apply(tool: Tool, id: number, alt = false): ApplyKind {
    const gc = this.grid.corners[id];
    if (!gc || gc.boundary || this.locked || tool === `poke`) return `none`;
    const c = this.corners[id];
    const before = { ...c };
    let kind: ApplyKind = `none`;
    if (alt) {
      if (tool === `seed`) {
        if (c.sown) {
          c.sown = false;
          kind = `unsow`;
        }
      } else if (c.height > 0) {
        --c.height;
        if (c.height === 0) {
          c.material = `water`;
          c.sown = false;
        }
        kind = `lower`;
      }
    } else
      switch (tool) {
        case `soil`:
        case `stone`:
          if (c.height === 0) {
            c.height = 1;
            c.material = tool;
            c.sown = false;
            kind = `raise`;
          } else if (c.material === tool) {
            if (c.height < CONFIG.MAX_HEIGHT) {
              c.height += 1;
              kind = `raise`;
            }
          } else {
            c.material = tool;
            kind = `paint`;
          }
          break;
        case `water`:
          if (c.height > 0) {
            --c.height;
            if (c.height === 0) {
              c.material = `water`;
              c.sown = false;
            }
            kind = `lower`;
          }
          break;
        case `seed`:
          if (!c.sown) {
            c.sown = true;
            kind = `sow`;
          }
      }
    if (kind === `none` || (before.height === c.height && before.material === c.material && before.sown === c.sown))
      return `none`;
    this.version++;
    const change: WorldChangedEvent = { corners: [id], cornerId: id, tool, kind };
    this.events.emit(`world:changed`, change);
    return kind;
  }

  /** Sets a corner without an event. Clamps height to 0..MAX_HEIGHT; boundary corners stay water. Call commit after. */
  set(id: number, value: Partial<CornerState>): void {
    const c = this.corners[id];
    Object.assign(c, value);
    if (c.height <= 0) {
      c.height = 0;
      c.material = `water`;
    } else if (c.material === `water`) c.material = `soil`;
    c.height = Math.min(CONFIG.MAX_HEIGHT, Math.round(c.height));
    if (this.grid.corners[id].boundary) {
      c.height = 0;
      c.material = `water`;
      c.sown = false;
    }
  }

  /** Emits one world:changed for a batch of set calls. */
  commit(corners: number[]): void {
    this.version++;
    const change: WorldChangedEvent = { corners, cornerId: corners[0] ?? -1, tool: null, kind: `none` };
    this.events.emit(`world:changed`, change);
  }

  serialize(): string {
    return JSON.stringify({
      v: 1,
      seed: this.grid.seed,
      n: this.corners.length,
      h: this.corners.map((c) => c.height).join(``),
      m: this.corners.map((c) => (c.material === `stone` ? `s` : c.material === `soil` ? `o` : `w`)).join(``),
      s: this.corners.map((c) => +!!c.sown).join(``),
    });
  }

  /** Loads a serialize string. Returns false when it does not match this grid. */
  deserialize(json: string): boolean {
    try {
      const data = JSON.parse(json);
      if (data.v !== 1 || data.seed !== this.grid.seed || data.n !== this.corners.length) return false;
      for (let i = 0; i < this.corners.length; i++) {
        const m = data.m[i];
        this.set(i, {
          height: Number(data.h[i]),
          material: m === `s` ? `stone` : m === `o` ? `soil` : `water`,
          sown: data.s[i] === `1`,
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}
