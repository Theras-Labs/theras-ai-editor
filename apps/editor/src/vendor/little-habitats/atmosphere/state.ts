// Ports index-BwioI7A7.js lines 16805-17420: the atmosphere look. Day keyframes and season looks are blended into
// one state object (sky colours, light, fog, grade) from the clock state and the rain amount.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/anim';
import type { ClockState } from '../core/clock';

export const COLOR_KEYS = [ // cs (16805)
  'zenith',
  'horizon',
  'glow',
  'hemiSky',
  'hemiGround',
  'cloudLit',
  'cloudShade',
  'shadowTint',
  'highlightTint',
  'vignetteColor',
] as const;
export type ColorKey = (typeof COLOR_KEYS)[number];

export const SCALAR_KEYS = [ // ls (16817)
  'wb',
  'hemiI',
  'exposure',
  'stars',
  'glowI',
  'sat',
  'contrast',
  'split',
  'lift',
  'fogNear',
  'fogFar',
  'bloom',
  'env',
] as const;
export type ScalarKey = (typeof SCALAR_KEYS)[number];

export type AtmosphereState = Record<ColorKey, THREE.Color> &
  Record<ScalarKey, number> & {
    fog: THREE.Color;
    sunColor: THREE.Color;
    moonColor: THREE.Color;
    sunIntensity: number;
    moonIntensity: number;
    sunWeight: number;
    cloudCover: number;
    warmth: number;
    grain: number;
    vignette: number;
    rain: number;
  };

export function createAtmosphereState(): AtmosphereState { // us (16832)
  const e: Record<string, THREE.Color | number> = {};
  for (const key of COLOR_KEYS) e[key] = new THREE.Color();
  for (const key of SCALAR_KEYS) e[key] = 0;
  e.fog = new THREE.Color();
  e.sunColor = new THREE.Color();
  e.moonColor = new THREE.Color();
  e.sunIntensity = 0;
  e.moonIntensity = 0;
  e.sunWeight = 1;
  e.cloudCover = 0.3;
  e.warmth = 0;
  e.grain = 0.035;
  e.vignette = 0.3;
  e.rain = 0;
  return e as AtmosphereState;
}

interface DayKeyframe {
  t: number;
  c: Record<ColorKey, THREE.Color>;
  s: Record<ScalarKey, number>;
}

/** Day keyframes by day fraction (0 = midnight, 0.5 = noon). */
export const DAY_KEYFRAMES: DayKeyframe[] = [ // ds (16851)
  {
    t: 0,
    c: {
      zenith: '#1c1e3e',
      horizon: '#3e3c68',
      glow: '#4c4a80',
      hemiSky: '#7676a8',
      hemiGround: '#3e3854',
      cloudLit: '#5e5e94',
      cloudShade: '#24244a',
      shadowTint: '#5e5294',
      highlightTint: '#ffd8b0',
      vignetteColor: '#1a1630',
    },
    s: {
      wb: 0,
      hemiI: 1.125,
      exposure: 1.364,
      stars: 1,
      glowI: 0.2,
      sat: 0.9,
      contrast: 1.02,
      split: 0.1,
      lift: 0.05,
      fogNear: 27,
      fogFar: 117,
      bloom: 1.25,
      env: 0.35,
    },
  },
  {
    t: 0.19,
    c: {
      zenith: '#222850',
      horizon: '#524e84',
      glow: '#8a6a9c',
      hemiSky: '#7474b0',
      hemiGround: '#453b5c',
      cloudLit: '#7a73a8',
      cloudShade: '#2a2d5c',
      shadowTint: '#4d4aa8',
      highlightTint: '#c9b0e0',
      vignetteColor: '#1b1838',
    },
    s: {
      wb: -0.02,
      hemiI: 1.08,
      exposure: 1.276,
      stars: 0.75,
      glowI: 0.5,
      sat: 0.974,
      contrast: 1.02,
      split: 0.1,
      lift: 0.045,
      fogNear: 24,
      fogFar: 109,
      bloom: 1.15,
      env: 0.35,
    },
  },
  {
    t: 0.235,
    c: {
      zenith: '#5a6aa8',
      horizon: '#f2a996',
      glow: '#ffb28c',
      hemiSky: '#a9a6d8',
      hemiGround: '#8e6c76',
      cloudLit: '#ffc2a8',
      cloudShade: '#8a7aa8',
      shadowTint: '#6a5ab8',
      highlightTint: '#ffc9a0',
      vignetteColor: '#3a2840',
    },
    s: {
      wb: 0.05,
      hemiI: 0.945,
      exposure: 1.056,
      stars: 0.12,
      glowI: 1.1,
      sat: 1.023,
      contrast: 1.03,
      split: 0.12,
      lift: 0.03,
      fogNear: 22,
      fogFar: 98,
      bloom: 1,
      env: 0.4,
    },
  },
  {
    t: 0.27,
    c: {
      zenith: '#7aa4d8',
      horizon: '#ffd0aa',
      glow: '#ffc590',
      hemiSky: '#c6cfee',
      hemiGround: '#b4927c',
      cloudLit: '#fff0dc',
      cloudShade: '#b3a7c4',
      shadowTint: '#6a64c0',
      highlightTint: '#ffd2a0',
      vignetteColor: '#40303a',
    },
    s: {
      wb: 0.05,
      hemiI: 1.008,
      exposure: 0.95,
      stars: 0,
      glowI: 0.9,
      sat: 1.028,
      contrast: 1.03,
      split: 0.1,
      lift: 0.02,
      fogNear: 24,
      fogFar: 109,
      bloom: 0.9,
      env: 0.45,
    },
  },
  {
    t: 0.33,
    c: {
      zenith: '#83bbe6',
      horizon: '#f5ecdb',
      glow: '#fff0d4',
      hemiSky: '#d0e3f6',
      hemiGround: '#baa988',
      cloudLit: '#ffffff',
      cloudShade: '#c2cde2',
      shadowTint: '#6a70c8',
      highlightTint: '#fff0d8',
      vignetteColor: '#3a3440',
    },
    s: {
      wb: 0.01,
      hemiI: 1.125,
      exposure: 0.88,
      stars: 0,
      glowI: 0.55,
      sat: 1.023,
      contrast: 1.04,
      split: 0.08,
      lift: 0.015,
      fogNear: 30,
      fogFar: 129,
      bloom: 0.8,
      env: 0.5,
    },
  },
  {
    t: 0.5,
    c: {
      zenith: '#74b4e4',
      horizon: '#eef0e2',
      glow: '#fff6e2',
      hemiSky: '#d4e6f8',
      hemiGround: '#bdae8c',
      cloudLit: '#ffffff',
      cloudShade: '#c6d2e6',
      shadowTint: '#6a74cc',
      highlightTint: '#fff4e0',
      vignetteColor: '#383440',
    },
    s: {
      wb: 0,
      hemiI: 1.17,
      exposure: 0.88,
      stars: 0,
      glowI: 0.45,
      sat: 1.023,
      contrast: 1.05,
      split: 0.08,
      lift: 0.012,
      fogNear: 32,
      fogFar: 136,
      bloom: 0.75,
      env: 0.5,
    },
  },
  {
    t: 0.64,
    c: {
      zenith: '#7db8e2',
      horizon: '#f8e9cf',
      glow: '#ffe8c0',
      hemiSky: '#d8e2f2',
      hemiGround: '#c0a888',
      cloudLit: '#fffaf0',
      cloudShade: '#c8c8dc',
      shadowTint: '#6a6cc8',
      highlightTint: '#ffe8c8',
      vignetteColor: '#3a3238',
    },
    s: {
      wb: 0.02,
      hemiI: 1.125,
      exposure: 0.88,
      stars: 0,
      glowI: 0.6,
      sat: 1.034,
      contrast: 1.05,
      split: 0.09,
      lift: 0.012,
      fogNear: 30,
      fogFar: 133,
      bloom: 0.8,
      env: 0.5,
    },
  },
  {
    t: 0.705,
    c: {
      zenith: '#8aaad6',
      horizon: '#ffd79c',
      glow: '#ffbf6e',
      hemiSky: '#d8d0e0',
      hemiGround: '#c49a74',
      cloudLit: '#ffe2b0',
      cloudShade: '#b6a6c4',
      shadowTint: '#7a64c8',
      highlightTint: '#ffc880',
      vignetteColor: '#40282c',
    },
    s: {
      wb: 0.08,
      hemiI: 1.008,
      exposure: 0.906,
      stars: 0,
      glowI: 1,
      sat: 1.056,
      contrast: 1.05,
      split: 0.13,
      lift: 0.015,
      fogNear: 27,
      fogFar: 117,
      bloom: 0.95,
      env: 0.5,
    },
  },
  {
    t: 0.748,
    c: {
      zenith: '#6a78b8',
      horizon: '#ffae8e',
      glow: '#ff9a6a',
      hemiSky: '#c4acc8',
      hemiGround: '#a87866',
      cloudLit: '#ffb898',
      cloudShade: '#8a74a8',
      shadowTint: '#7a5ac0',
      highlightTint: '#ffc0a0',
      vignetteColor: '#3c2232',
    },
    s: {
      wb: 0.035,
      hemiI: 0.918,
      exposure: 0.968,
      stars: 0.02,
      glowI: 1.25,
      sat: 1.056,
      contrast: 1.04,
      split: 0.14,
      lift: 0.02,
      fogNear: 24,
      fogFar: 105,
      bloom: 1.05,
      env: 0.45,
    },
  },
  {
    t: 0.78,
    c: {
      zenith: '#3c4886',
      horizon: '#d98ea0',
      glow: '#f09a8c',
      hemiSky: '#8e88c4',
      hemiGround: '#6c5274',
      cloudLit: '#e89aa4',
      cloudShade: '#4a4680',
      shadowTint: '#5a4ab8',
      highlightTint: '#ffb0a8',
      vignetteColor: '#2a1c36',
    },
    s: {
      wb: 0.02,
      hemiI: 0.972,
      exposure: 1.1,
      stars: 0.3,
      glowI: 0.9,
      sat: 1.023,
      contrast: 1.03,
      split: 0.13,
      lift: 0.035,
      fogNear: 23,
      fogFar: 101,
      bloom: 1.15,
      env: 0.4,
    },
  },
  {
    t: 0.82,
    c: {
      zenith: '#262c5a',
      horizon: '#5a5890',
      glow: '#8a6aa4',
      hemiSky: '#7678b4',
      hemiGround: '#46395e',
      cloudLit: '#7070a8',
      cloudShade: '#262a5c',
      shadowTint: '#4a4ab0',
      highlightTint: '#b8b0ff',
      vignetteColor: '#18163a',
    },
    s: {
      wb: -0.03,
      hemiI: 1.062,
      exposure: 1.25,
      stars: 0.75,
      glowI: 0.45,
      sat: 0.974,
      contrast: 1.02,
      split: 0.1,
      lift: 0.045,
      fogNear: 26,
      fogFar: 113,
      bloom: 1.2,
      env: 0.35,
    },
  },
  {
    t: 0.88,
    c: {
      zenith: '#1c1f40',
      horizon: '#3e3d6a',
      glow: '#4c4a80',
      hemiSky: '#7676a8',
      hemiGround: '#3e3854',
      cloudLit: '#5e5e94',
      cloudShade: '#24244a',
      shadowTint: '#5e5294',
      highlightTint: '#ffd8b0',
      vignetteColor: '#1a1630',
    },
    s: {
      wb: -0.03,
      hemiI: 1.125,
      exposure: 1.364,
      stars: 1,
      glowI: 0.2,
      sat: 0.9,
      contrast: 1.02,
      split: 0.1,
      lift: 0.05,
      fogNear: 27,
      fogFar: 117,
      bloom: 1.25,
      env: 0.35,
    },
  },
].map((e) => {
  const c = {} as Record<ColorKey, THREE.Color>;
  for (const key of COLOR_KEYS) c[key] = new THREE.Color(e.c[key]);
  return { t: e.t, c, s: { ...e.s } };
});

/** Season looks (spring, summer, autumn, winter) multiplied into the day look. */
export const SEASON_LOOKS = [ // fs (17217)
  {
    sky: '#f2fffa',
    horizon: '#fbfff2',
    sun: '#fffcf2',
    hemiGround: '#eef8dc',
    sunMul: 1,
    hemiMul: 1,
    sat: 0.03,
    contrast: 0,
    warmth: 0,
    exposure: 1,
    fog: 1,
    clouds: 0.34,
  },
  {
    sky: '#eef6ff',
    horizon: '#fff6e6',
    sun: '#fff3e0',
    hemiGround: '#f4f0da',
    sunMul: 1.07,
    hemiMul: 1,
    sat: 0.05,
    contrast: 0.03,
    warmth: 0.025,
    exposure: 1,
    fog: 1.05,
    clouds: 0.26,
  },
  {
    sky: '#fff0e0',
    horizon: '#ffe4bc',
    sun: '#ffe0b4',
    hemiGround: '#ffe8c8',
    sunMul: 0.96,
    hemiMul: 1,
    sat: 0,
    contrast: 0.02,
    warmth: 0.08,
    exposure: 1,
    fog: 0.86,
    clouds: 0.4,
  },
  {
    sky: '#eef3ff',
    horizon: '#eef2ff',
    sun: '#f4f6ff',
    hemiGround: '#e8eeff',
    sunMul: 1,
    hemiMul: 1.04,
    sat: -0.08,
    contrast: 0,
    warmth: -0.06,
    exposure: 0.97,
    fog: 0.9,
    clouds: 0.42,
  },
].map((e) => ({
  sky: new THREE.Color(e.sky),
  horizon: new THREE.Color(e.horizon),
  sun: new THREE.Color(e.sun),
  hemiGround: new THREE.Color(e.hemiGround),
  d: e,
}));

/** Writes the four season weights for a year fraction into `out` (they sum to 1). */
export function seasonWeights(yearFrac: number, out: number[]): number[] { // ps (17281)
  let sum = 0;
  for (let i = 0; i < 4; i++) {
    const center = 0.125 + 0.25 * i;
    let d = Math.abs(yearFrac - center);
    d = Math.min(d, 1 - d);
    const w = smoothstep(0.25, 0, d);
    out[i] = w;
    sum += w;
  }
  for (let i = 0; i < 4; i++) out[i] /= sum || 1;
  return out;
}

/** Sun colour by sun elevation. */
export const SUN_COLOR_STOPS = [ // ms (17293)
  { el: -0.05, c: new THREE.Color('#ff7a52') },
  { el: 0.04, c: new THREE.Color('#ff9460') },
  { el: 0.14, c: new THREE.Color('#ffae6c') },
  { el: 0.3, c: new THREE.Color('#ffc585') },
  { el: 0.5, c: new THREE.Color('#ffdfb2') },
  { el: 0.8, c: new THREE.Color('#ffeed4') },
  { el: 1.1, c: new THREE.Color('#fff3e0') },
];
export const MOON_COLOR = new THREE.Color('#b8bcf0'); // hs (17302)
const RAIN_ZENITH = new THREE.Color('#9aa6b8'); // gs (17303)
const RAIN_HORIZON = new THREE.Color('#c8ccd2'); // _s (17304)
const RAIN_CLOUD_LIT = new THREE.Color('#aab2c0'); // vs (17305)
const RAIN_CLOUD_SHADE = new THREE.Color('#6e7890'); // ys (17306)
const WHITE = new THREE.Color(1, 1, 1); // bs (17307)
const weights = [0, 0, 0, 0]; // xs (17308)
const skyMul = new THREE.Color(); // Ss (17309)
const horizonMul = new THREE.Color(); // Cs (17310)
const sunMul = new THREE.Color(); // ws (17311)
const groundMul = new THREE.Color(); // Ts (17312)
const snowGround = new THREE.Color(); // Es (17313)

/** Samples the day keyframes at `dayFrac` (wrapping past midnight) into `out`. */
export function sampleDay(dayFrac: number, out: AtmosphereState): void { // Ds (17314)
  const n = DAY_KEYFRAMES.length;
  let r = n - 1;
  for (let i = 0; i < n; i++)
    if (DAY_KEYFRAMES[i].t > dayFrac) {
      r = i - 1;
      break;
    }
  const a = DAY_KEYFRAMES[(r + n) % n];
  const b = DAY_KEYFRAMES[(r + 1) % n];
  let span = b.t - a.t;
  if (span <= 0) span += 1;
  let s = dayFrac - a.t;
  if (s < 0) s += 1;
  const k = smoothstep(0, 1, s / span);
  for (const key of COLOR_KEYS) out[key].copy(a.c[key]).lerp(b.c[key], k);
  for (const key of SCALAR_KEYS) out[key] = lerp(a.s[key], b.s[key], k);
}

/** Sun colour at an elevation. */
export function sunColorAt(elevation: number, out: THREE.Color): THREE.Color { // Os (17332)
  if (elevation <= SUN_COLOR_STOPS[0].el) return out.copy(SUN_COLOR_STOPS[0].c);
  for (let i = 1; i < SUN_COLOR_STOPS.length; i++) {
    const hi = SUN_COLOR_STOPS[i];
    if (elevation <= hi.el) {
      const lo = SUN_COLOR_STOPS[i - 1];
      return out.copy(lo.c).lerp(hi.c, smoothstep(lo.el, hi.el, elevation));
    }
  }
  return out.copy(SUN_COLOR_STOPS[SUN_COLOR_STOPS.length - 1].c);
}

/** Computes the full atmosphere state for a clock state and a rain amount. */
export function computeAtmosphere(clock: ClockState, rain: number, n: AtmosphereState): AtmosphereState { // ks (17343)
  sampleDay(clock.dayFrac, n);
  seasonWeights(clock.yearFrac, weights);
  skyMul.setRGB(0, 0, 0);
  horizonMul.setRGB(0, 0, 0);
  sunMul.setRGB(0, 0, 0);
  let sunK = 0;
  let hemiK = 0;
  let satAdd = 0;
  let contrastAdd = 0;
  let warmth = 0;
  let exposureK = 0;
  let fogK = 0;
  let clouds = 0;
  const ground = groundMul.setRGB(0, 0, 0);
  for (let i = 0; i < 4; i++) {
    const w = weights[i];
    if (w <= 0) continue;
    const look = SEASON_LOOKS[i];
    skyMul.r += look.sky.r * w;
    skyMul.g += look.sky.g * w;
    skyMul.b += look.sky.b * w;
    horizonMul.r += look.horizon.r * w;
    horizonMul.g += look.horizon.g * w;
    horizonMul.b += look.horizon.b * w;
    sunMul.r += look.sun.r * w;
    sunMul.g += look.sun.g * w;
    sunMul.b += look.sun.b * w;
    ground.r += look.hemiGround.r * w;
    ground.g += look.hemiGround.g * w;
    ground.b += look.hemiGround.b * w;
    sunK += look.d.sunMul * w;
    hemiK += look.d.hemiMul * w;
    satAdd += look.d.sat * w;
    contrastAdd += look.d.contrast * w;
    warmth += look.d.warmth * w;
    exposureK += look.d.exposure * w;
    fogK += look.d.fog * w;
    clouds += look.d.clouds * w;
  }
  n.zenith.multiply(skyMul);
  n.horizon.multiply(horizonMul);
  n.hemiSky.multiply(skyMul);
  n.hemiGround.multiply(ground);
  n.cloudLit.multiply(horizonMul);
  n.sat += satAdd;
  n.contrast += contrastAdd;
  n.warmth = warmth + n.wb;
  n.exposure *= exposureK;
  n.fogNear *= fogK;
  n.fogFar *= fogK;
  n.hemiI *= hemiK;
  n.cloudCover = clouds;
  if (clock.snow > 0) n.hemiGround.lerp(snowGround.copy(n.hemiSky).lerp(WHITE, 0.35), clock.snow * 0.6);
  const el = clock.sunElevation;
  const up = smoothstep(-0.03, 0.14, el);
  n.sunIntensity = 3.3 * sunK * up * (0.62 + 0.38 * smoothstep(0.12, 0.85, el));
  sunColorAt(el, n.sunColor).multiply(sunMul);
  n.moonIntensity = 0.9 * smoothstep(0, -0.2, el);
  n.moonColor.copy(MOON_COLOR);
  n.sunWeight = +(el > -0.015);
  n.rain = rain;
  if (rain > 0.001) {
    const r = rain;
    n.zenith.lerp(skyMul.copy(RAIN_ZENITH).multiplyScalar(0.35 + 0.65 * clock.daylight), r * 0.75);
    n.horizon.lerp(skyMul.copy(RAIN_HORIZON).multiplyScalar(0.3 + 0.7 * clock.daylight), r * 0.6);
    n.cloudLit.lerp(skyMul.copy(RAIN_CLOUD_LIT).multiplyScalar(0.3 + 0.7 * clock.daylight), r);
    n.cloudShade.lerp(skyMul.copy(RAIN_CLOUD_SHADE).multiplyScalar(0.3 + 0.7 * clock.daylight), r);
    n.cloudCover = lerp(n.cloudCover, 0.9, r);
    n.sunIntensity *= 1 - 0.6 * r;
    n.glowI *= 1 - 0.7 * r;
    n.stars *= 1 - r;
    n.sat -= 0.12 * r;
    n.warmth -= 0.04 * r;
    n.fogNear *= 1 - 0.35 * r;
    n.fogFar *= 1 - 0.4 * r;
    n.hemiI *= 1 + 0.08 * r;
  }
  n.fog.copy(n.horizon).lerp(n.glow, clamp(0.12 * n.glowI, 0, 0.2));
  n.vignette = 0.32;
  n.grain = 0.03;
  return n;
}
