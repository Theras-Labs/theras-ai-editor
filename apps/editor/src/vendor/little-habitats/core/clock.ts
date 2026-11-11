// Ports index-BwioI7A7.js 12349-12444 (oa SEASONS, sa, ca, la Clock).
import { CONFIG } from './config';
import type { Events } from './events';

export type Season = 'spring' | 'summer' | 'autumn' | 'winter';
export type DayPhase = 'dawn' | 'day' | 'dusk' | 'night';

export const SEASONS: Season[] = [`spring`, `summer`, `autumn`, `winter`]; // oa (12349)

const TAU = Math.PI * 2; // sa (12350)

const smooth = (edge0: number, edge1: number, x: number): number => { // ca (12351)
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** The clock state object. Clock.update mutates and returns the same object each frame. */
export interface ClockState {
  /** Real seconds since start (not scaled, not paused). Drives UNIFORMS.uTime. */
  realTime: number;
  /** Game seconds (scaled by speed, stops when paused). */
  gameTime: number;
  /** Game seconds this frame. */
  gameDt: number;
  /** Day count, fractional (gameTime / DAY_SECONDS). */
  day: number;
  /** 0..1 time of day. 0.25 sunrise, 0.5 noon, 0.75 sunset. */
  dayFrac: number;
  /** 0..1 time of year. */
  yearFrac: number;
  season: Season;
  /** 0..1 progress through the current season. */
  seasonFrac: number;
  phase: DayPhase;
  /** 0..1 light level. */
  daylight: number;
  /** Sine of the sun height, scaled; negative at night. */
  sunElevation: number;
  sunAzimuth: number;
  snow: number;
  autumn: number;
  bloom: number;
  speed: number;
  paused: boolean;
}

export interface ClockOptions {
  dayFrac?: number;
  yearFrac?: number;
}

export class Clock { // la (12355)
  events: Events;
  state: ClockState;
  gameSeconds: number;
  yearOffset = 0;
  yearSeconds = CONFIG.DAY_SECONDS * CONFIG.DAYS_PER_SEASON * 4;

  constructor(events: Events, opts: ClockOptions = {}) {
    this.events = events;
    const dayFrac = opts.dayFrac ?? 0.36;
    const yearFrac = opts.yearFrac ?? 0.16;
    this.gameSeconds = dayFrac * CONFIG.DAY_SECONDS;
    this.yearOffset = yearFrac - this.gameSeconds / this.yearSeconds;
    this.state = {
      realTime: 0,
      gameTime: 0,
      gameDt: 0,
      day: 0,
      dayFrac: 0,
      yearFrac: 0,
      season: `spring`,
      seasonFrac: 0,
      phase: `day`,
      daylight: 1,
      sunElevation: 1,
      sunAzimuth: 0,
      snow: 0,
      autumn: 0,
      bloom: 1,
      speed: 1,
      paused: false,
    };
    this.recompute(false);
  }

  /** Advances by `dt` real seconds. Returns the state object. */
  update(dt: number): ClockState {
    const s = this.state;
    s.realTime += dt;
    s.gameDt = s.paused ? 0 : dt * s.speed;
    this.gameSeconds += s.gameDt;
    this.recompute(true);
    return s;
  }

  setSpeed(speed: number): void {
    this.state.speed = Math.max(0, speed);
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused;
  }

  /** Jumps to a time of day on the current day. The year fraction stays the same. */
  setDayFrac(dayFrac: number): void {
    const day = Math.floor(this.gameSeconds / CONFIG.DAY_SECONDS);
    const yearFrac = this.state.yearFrac;
    this.gameSeconds = (day + (((dayFrac % 1) + 1) % 1)) * CONFIG.DAY_SECONDS;
    this.yearOffset += yearFrac - this.rawYear();
    this.recompute(true);
  }

  setYearFrac(yearFrac: number): void {
    this.yearOffset = (((yearFrac % 1) + 1) % 1) - this.gameSeconds / this.yearSeconds;
    this.recompute(true);
  }

  setSeason(season: Season): void {
    this.setYearFrac(SEASONS.indexOf(season) * 0.25 + 0.08);
  }

  rawYear(): number {
    return (((this.gameSeconds / this.yearSeconds + this.yearOffset) % 1) + 1) % 1;
  }

  /** Recomputes the derived state. With `emit`, sends season:changed and dayphase:changed on change. */
  recompute(emit: boolean): void {
    const s = this.state;
    const prevSeason = s.season;
    const prevPhase = s.phase;
    s.gameTime = this.gameSeconds;
    s.day = this.gameSeconds / CONFIG.DAY_SECONDS;
    s.dayFrac = ((s.day % 1) + 1) % 1;
    s.yearFrac = this.rawYear();
    const seasonIndex = Math.min(3, Math.floor(s.yearFrac * 4));
    s.season = SEASONS[seasonIndex];
    s.seasonFrac = s.yearFrac * 4 - seasonIndex;
    const sun = Math.sin((s.dayFrac - 0.25) * TAU);
    s.sunElevation = sun * (1.05 - 0.3 * smooth(0.6, 0.85, s.yearFrac) * (1 - smooth(0.95, 1, s.yearFrac)));
    s.sunAzimuth = (s.dayFrac - 0.5) * TAU * 0.9 + 0.6;
    s.daylight = smooth(-0.12, 0.2, sun);
    const d = s.dayFrac;
    s.phase = d >= 0.2 && d < 0.3 ? `dawn` : d >= 0.3 && d < 0.7 ? `day` : d >= 0.7 && d < 0.8 ? `dusk` : `night`;
    const y = s.yearFrac;
    s.autumn = smooth(0.48, 0.58, y) * (1 - smooth(0.76, 0.82, y));
    s.snow = smooth(0.78, 0.85, y) * (1 - smooth(0.955, 0.995, y));
    s.bloom = smooth(0, 0.08, y) * (1 - smooth(0.5, 0.6, y));
    if (emit) {
      if (s.season !== prevSeason) this.events.emit(`season:changed`, { season: s.season });
      if (s.phase !== prevPhase) this.events.emit(`dayphase:changed`, { phase: s.phase });
    }
  }
}
