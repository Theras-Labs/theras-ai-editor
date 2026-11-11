// Ports index-BwioI7A7.js 32764-33200: the standing stones landmark (wg), its constants _g..Sg (rune glyphs) and the
// stone builder Cg.
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { patchWorldMaterial } from '../../fx/pokefx';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { BASE_YAW, KitFrame, TAU, XorShift, emberSparks, midsummer } from './shared';

const round2 = (v: number): number => Math.round(v * 100) / 100; // _g (32764)
const STONE_COLORS = [`#a9a397`, `#b3ada1`, `#9f9a91`, `#b8b0a2`]; // vg (32765)
const MOSS_COLORS = [`#6f9a4a`, `#5f8c45`, `#86a857`]; // yg (32766)
const LICHEN_COLORS = [`#d9d8a0`, `#e3c98c`, `#cfd9b0`]; // bg (32767)
const RUNE_COLOR = `#7c8a8a`; // xg (32768)
/** Rune glyphs: strokes [x0, y0, x1, y1] in glyph units. */
const GLYPHS: number[][][] = [ // Sg (32769)
  [
    [-0.2, 0, -0.2, 1],
    [-0.2, 0.62, 0.3, 0.9],
    [-0.2, 0.36, 0.3, 0.64],
  ],
  [
    [0, 0, 0, 1],
    [0, 0.55, -0.38, 0.95],
    [0, 0.55, 0.38, 0.95],
  ],
  [
    [0, 0, 0, 1],
    [0, 1, -0.36, 0.62],
    [0, 1, 0.36, 0.62],
  ],
  [
    [-0.2, 0, -0.2, 1],
    [-0.2, 0.75, 0.25, 0.5],
    [0.25, 0.5, -0.2, 0.25],
  ],
  [
    [-0.3, 0, -0.3, 1],
    [0.3, 0, 0.3, 1],
    [-0.3, 1, 0.3, 0.55],
    [0.3, 1, -0.3, 0.55],
  ],
  [
    [0, 0.1, 0.3, 0.5],
    [0.3, 0.5, 0, 0.9],
    [0, 0.9, -0.3, 0.5],
    [-0.3, 0.5, 0, 0.1],
  ],
  [
    [-0.2, 0, -0.2, 1],
    [-0.2, 1, 0.3, 0.72],
    [-0.2, 0.68, 0.3, 0.4],
  ],
];

interface StoneSpec {
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  roll: number;
  /** Height. */
  H: number;
  /** Base half-width. */
  rb: number;
  runes: boolean;
}

/** Builds one standing stone into `body`, with moss and lichen, and its rune strokes into `runes`. */
function buildStone(body: KitFrame, runes: KitFrame, st: StoneSpec, rng: Rng): void { // Cg (32808)
  const { H: height, rb: half } = st;
  body.frame(st.x, 0, st.z, st.yaw, st.pitch, st.roll);
  runes.frame(st.x, 0, st.z, st.yaw, st.pitch, st.roll);
  const bulge = rng.range(-0.012, 0.018);
  const w = (k: number) => round2(half * k);
  const profile = [
    [w(1.02), -0.06],
    [w(1.08), round2(height * 0.12)],
    [round2(half * 1.02 + bulge), round2(height * 0.48)],
    [w(0.9), round2(height * 0.76)],
    [w(0.68), round2(height * 0.9)],
    [w(0.34), round2(height * 0.985)],
    [0.001, round2(height + 0.01)],
  ];
  const depth = 0.6;
  const color = shadeColor(rng.pick(STONE_COLORS), rng.range(-0.04, 0.03));
  body.lathe(profile, 6, 0, 0, 0, color, { phi: Math.PI / 6, sc: [1, 1, depth], grad: 0.32, jitter: 0.04 });
  /** Distance from the stone axis to its front face at height y. */
  const faceAt = (y: number) => {
    let r = profile[0][0];
    for (let k = 0; k < profile.length - 1; k++) {
      const [r0, y0] = profile[k];
      const [r1, y1] = profile[k + 1];
      if (y >= y0 && y <= y1) {
        r = r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-4, y1 - y0);
        break;
      }
    }
    return r * Math.cos(Math.PI / 6) * depth;
  };
  const moss = rng.pick(MOSS_COLORS);
  if (rng.chance(0.7)) body.blob(half * 0.62, rng.range(-0.05, 0.05), height * 0.9, 0, moss, { sc: [1.25, 0.42, 0.95], detail: 0 });
  for (let k = 0; k < 2; k++) {
    const side = k ? 1 : -1;
    body.blob(0.06 + rng.next() * 0.03, side * half * rng.range(0.4, 1), 0.02, side * rng.range(-0.06, 0.06), shadeColor(moss, 0.04), {
      sc: [1.4, 0.5, 1.1],
      detail: 0,
    });
  }
  for (let k = 0; k < 3; k++) {
    const y = height * rng.range(0.18, 0.72);
    const side = rng.chance(0.5) ? 1 : -1;
    const x = rng.range(-half * 0.55, half * 0.55);
    body.blob(0.03 + rng.next() * 0.018, x, y, side * (faceAt(y) + 0.002), rng.pick(LICHEN_COLORS), {
      sc: [1, 0.85, 0.28],
      detail: 0,
      grad: 0,
    });
  }
  if (!st.runes) return;
  const count = height > 0.8 ? 3 : 2;
  const size = 0.105;
  for (const side of [1, -1]) {
    let y = height * 0.66 + (count === 3 ? 0.04 : 0);
    for (let g = 0; g < count; g++) {
      const glyph = GLYPHS[rng.int(0, GLYPHS.length - 1)];
      const face = faceAt(y + size * 0.5) + 0.004;
      for (const [gx0, gy0, gx1, gy1] of glyph) {
        const x0 = gx0 * size * side;
        const x1 = gx1 * size * side;
        const y0 = y + gy0 * size;
        const y1 = y + gy1 * size;
        const len = Math.hypot(x1 - x0, y1 - y0);
        const roll = Math.atan2(y1 - y0, x1 - x0);
        runes.box(len + 0.018, 0.02, 0.014, (x0 + x1) / 2, (y0 + y1) / 2, side * face, RUNE_COLOR, {
          roll,
          bevel: 0.004,
          grad: 0,
          ao: !1,
          jitter: 0,
        });
      }
      y -= size * 1.45;
    }
  }
}

export const STANDING_STONES: LandmarkDef = { // wg (32879)
  id: `standing_stones`,
  name: `Standing stones`,
  icon: `🪨`,
  tint: `#cfd6e6`,
  blurb: `An old ring of whispering stones. Their runes wake at night — brightest at midsummer.`,
  hint: `Ring a single patch of grass (or flowers) with low stone on every side, all at one level.`,
  priority: 45,
  max: 1,
  detect(ctx) {
    const found: (LandmarkPlacement & { score: number })[] = [];
    for (const c of ctx.corners) {
      if (ctx.mat(c) !== `soil`) continue;
      const h = ctx.h(c);
      if (h < 1 || h > 2) continue;
      const nbrs = ctx.nbrs(c);
      if (nbrs.length < 3) continue;
      let ringed = !0;
      let dist = 0;
      const top = ctx.top(c);
      for (const n of nbrs) {
        if (ctx.rim(n) || ctx.mat(n) !== `stone` || ctx.h(n) !== h) {
          ringed = !1;
          break;
        }
        const nt = ctx.top(n);
        dist += Math.hypot(nt.x - top.x, nt.z - top.z);
      }
      if (!ringed) continue;
      const R = round2(Math.min(0.8, Math.max(0.6, (dist / nbrs.length) * 0.68)));
      const y = ctx.flat(top.x, top.z, R + 0.08, 0.09);
      if (y !== null)
        found.push({
          key: `standing_stones:${c}`,
          x: top.x,
          y,
          z: top.z,
          rotY: BASE_YAW,
          radius: R + 0.05,
          clear: R + 0.2,
          data: { R },
          score: ctx.h01(c, 4501),
        });
    }
    found.sort((a, b) => a.score - b.score);
    return found;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(seed ^ hashString(p.key));
    const R = p.data?.R ?? 0.68; // i
    const bodyKit = new MeshKit(rng); // a
    const runeKit = new MeshKit(rng); // o
    const body = new KitFrame(bodyKit); // s
    const runes = new KitFrame(runeKit); // c
    const fallen = rng.chance(0.4) ? (rng.chance(0.5) ? 1 : 6) : -1; // l: index of a toppled stone, or -1
    const stones: StoneSpec[] = []; // u
    // Six stones around the ring; slots 3 and 4 (the back) become a trilithon pair.
    for (let k = 1; k < 7; k++) {
      const a = (k / 7) * TAU;
      const pair = k === 3 || k === 4;
      const x = Math.sin(a) * R;
      const z = Math.cos(a) * R;
      if (k === fallen) {
        body.frame(x, 0.05, z, a + Math.PI / 2 + rng.range(-0.25, 0.25), Math.PI / 2 - 0.06, rng.range(-0.2, 0.2));
        const r = 0.15;
        const color = shadeColor(rng.pick(STONE_COLORS), -0.03);
        body.lathe(
          [
            [r, -0.3],
            [r * 1.05, -0.1],
            [r, 0.2],
            [r * 0.7, 0.34],
            [0.001, 0.38],
          ],
          6,
          0,
          0,
          0,
          color,
          { phi: Math.PI / 6, sc: [1, 1, 0.62], grad: 0.1, ao: !1 },
        );
        body.frame();
        body.blob(0.07, x + rng.range(-0.1, 0.1), 0.2, z, rng.pick(MOSS_COLORS), { sc: [1.4, 0.35, 1], detail: 0 });
        continue;
      }
      stones.push({
        x: pair ? Math.sign(x) * R * 0.46 : x,
        z: pair ? -R * 0.9 : z,
        yaw: pair ? 0 : a + Math.PI + rng.range(-0.14, 0.14),
        pitch: pair ? 0 : rng.range(-0.1, 0.08),
        roll: pair ? rng.range(-0.02, 0.02) : rng.range(-0.08, 0.08),
        H: pair ? 0.96 : rng.range(0.58, 0.78),
        rb: pair ? 0.17 : rng.range(0.16, 0.185),
        runes: !0,
      });
    }
    for (const st of stones) buildStone(body, runes, st, rng);
    body.frame();
    const pair = stones.filter((st) => st.yaw === 0);
    if (pair.length === 2) {
      // Lintel across the trilithon, with moss and three runes on its front.
      const span = Math.abs(pair[0].x - pair[1].x);
      const z = pair[0].z;
      body.box(span + 0.36, 0.17, 0.22, 0, 1.03, z, shadeColor(`#a8a296`, 0.02), { bevel: 0.05, grad: 0.2, ao: !1 });
      body.blob(0.1, -0.1, 1.12, z, MOSS_COLORS[0], { sc: [1.6, 0.35, 1], detail: 0, ao: !1 });
      body.blob(0.06, 0.2, 1.115, z + 0.03, MOSS_COLORS[2], { sc: [1.2, 0.3, 1], detail: 0, ao: !1 });
      for (let k = 0; k < 3; k++) {
        const x = (k - 1) * 0.16;
        runes.frame(x, 0.99, z + 0.111);
        const glyph = GLYPHS[(k * 3 + 1) % GLYPHS.length];
        for (const [gx0, gy0, gx1, gy1] of glyph) {
          const x0 = gx0 * 0.08;
          const x1 = gx1 * 0.08;
          const y0 = gy0 * 0.08;
          const y1 = gy1 * 0.08;
          runes.box(Math.hypot(x1 - x0, y1 - y0) + 0.014, 0.017, 0.012, (x0 + x1) / 2, (y0 + y1) / 2, 0, RUNE_COLOR, {
            roll: Math.atan2(y1 - y0, x1 - x0),
            bevel: 0.004,
            grad: 0,
            ao: !1,
            jitter: 0,
          });
        }
      }
      runes.frame();
    }
    // Altar in the middle: two legs, a slab, a rune circle and an offering of flowers.
    const altar = `#bdb5a8`;
    body.box(0.12, 0.22, 0.26, -0.17, 0.1, 0, shadeColor(altar, -0.06), { bevel: 0.03, grad: 0.35 });
    body.box(0.12, 0.22, 0.26, 0.17, 0.1, 0, shadeColor(altar, -0.05), { bevel: 0.03, grad: 0.35 });
    body.box(0.56, 0.1, 0.36, 0, 0.255, 0, altar, { bevel: 0.035, grad: 0.15, yaw: rng.range(-0.06, 0.06) });
    body.blob(0.06, -0.24, 0.3, 0.12, MOSS_COLORS[1], { sc: [1.3, 0.35, 1], detail: 0 });
    runes.ring(0.075, 0.011, 4, 16, 0.05, 0.308, -0.02, RUNE_COLOR, { grad: 0, ao: !1, jitter: 0 });
    runes.ring(0.036, 0.009, 4, 12, 0.05, 0.308, -0.02, RUNE_COLOR, { grad: 0, ao: !1, jitter: 0 });
    const flowers = [PALETTE.blossom, PALETTE.daisy, PALETTE.lavender];
    body.box(0.1, 0.018, 0.03, -0.13, 0.316, 0.07, PALETTE.leafDark, { yaw: 0.5, grad: 0 });
    flowers.forEach((c, k) => body.blob(0.026, -0.17 + k * 0.03, 0.33, 0.05 + (k % 2) * 0.03, c, { detail: 0, grad: 0 }));
    for (let k = 0; k < 5; k++) {
      const a = rng.next() * TAU;
      const r = R * rng.range(0.45, 0.75);
      body.blob(0.035 + rng.next() * 0.02, Math.sin(a) * r, 0.015, Math.cos(a) * r, shadeColor(PALETTE.pebble, rng.range(-0.05, 0.03)), {
        sc: [1.2, 0.55, 1],
        detail: 0,
      });
    }
    const root = new THREE.Group(); // m
    root.add(landmarkMesh(bodyKit.build(), mats.base));
    const sweepAngle = { value: 0 }; // h
    const pokeGlow = { value: 0 }; // g
    const centre = { value: new THREE.Vector2(p.x, p.z) }; // _
    const runeMat = patchWorldMaterial( // v
      new THREE.MeshStandardMaterial({
        vertexColors: !0,
        flatShading: !0,
        roughness: 0.8,
        emissive: new THREE.Color(`#8ff5dc`),
        emissiveIntensity: 0,
      }),
      {
        uniforms: { uPhase: sweepAngle, uPoke: pokeGlow, uCen: centre },
        fragmentHeader: `uniform float uPhase; uniform float uPoke; uniform vec2 uCen;`,
        fragment: `
          float runeWave = 0.62 + 0.38 * sin(uTime * 1.25 - (vScWorldPos.x * 1.7 + vScWorldPos.z * 1.1) * 2.3);
          totalEmissiveRadiance *= runeWave;
          if (uPoke > 0.002) {
            vec2 dq = vScWorldPos.xz - uCen;
            float dd = mod(atan(dq.y, dq.x + 1e-5) - uPhase + 3.14159265, 6.2831853) - 3.14159265;
            float front = exp(-dd * dd * 2.4);
            totalEmissiveRadiance += vec3(0.5, 1.0, 0.86) * uPoke * (0.45 + 2.6 * front);
          }`,
        cacheKey: `stone-runes`,
      },
    );
    const runeMesh = landmarkMesh(runeKit.build(), runeMat, !1); // y
    root.add(runeMesh);
    const wisps = emberSparks(40, `#9ff7df`, `#f6fff9`, 0.0045); // b
    root.add(wisps.mesh);
    const halo = glowSprite(1, 2.8, 2.2); // x
    halo.position.set(0.05, 0.36, -0.02);
    root.add(halo);
    const motes = new SparkPoints(96, !0); // S
    root.add(motes.points);
    const thrum = new Spring(110, 6.5); // C
    const FULL = Math.PI * 2; // T
    const rotY = p.rotY ?? 0; // E
    const cosY = Math.cos(rotY); // D
    const sinY = Math.sin(rotY); // O
    const stoneX: number[] = []; // k
    const stoneZ: number[] = []; // A
    const stoneH: number[] = []; // j
    const stoneAngle: number[] = []; // M: world angle of each stone around the centre
    for (const st of stones) {
      stoneX.push(st.x);
      stoneZ.push(st.z);
      stoneH.push(st.H);
      stoneAngle.push(Math.atan2(-st.x * sinY + st.z * cosY, st.x * cosY + st.z * sinY));
    }
    let sweepLeft = 0; // N: radians of sweep left
    let sweep = 0; // P: current sweep angle
    let sweepGlow = 0; // F
    let haloGlow = 0; // I
    let finale = 0; // L: 0 none, 1 or 2 the finale burst size
    let finaleTime = 1 / 0; // R
    const rand = new XorShift(seed ^ 334414); // ee
    let glow = 0; // z
    let wispAcc = 0; // te
    return {
      object: root,
      update(ctx) {
        const summer = midsummer(ctx.time.yearFrac);
        const night = Math.min(1, Math.max(0, (ctx.night - 0.25) / 0.6));
        glow = damp(glow, night * (1.1 + 2.9 * summer), 1.5, ctx.dt);
        runeMat.emissiveIntensity = glow;
        {
          const dt = Math.min(ctx.dt, 0.05);
          if (sweepLeft > 0) {
            // A wave runs round the ring; each stone it passes gives off motes.
            const step = Math.min(sweepLeft, 5.6 * dt);
            const from = sweep;
            sweep += step;
            sweepLeft -= step;
            for (let s = 0; s < stoneAngle.length; s++) {
              let d = (stoneAngle[s] - from) % FULL;
              if (d < 0) d += FULL;
              if (d < step) {
                thrum.kick(0.9);
                const n = 5 + (finale > 1 ? 3 : 0);
                for (let k = 0; k < n; k++)
                  motes.emit(
                    stoneX[s] + (motes.rnd() - 0.5) * 0.14,
                    stoneH[s] * (0.55 + motes.rnd() * 0.5),
                    stoneZ[s] + (motes.rnd() - 0.5) * 0.1,
                    (motes.rnd() - 0.5) * 0.12,
                    0.35 + motes.rnd() * 0.45,
                    (motes.rnd() - 0.5) * 0.12,
                    0.9 + motes.rnd() * 0.8,
                    0.05 + motes.rnd() * 0.05,
                    0.9,
                    2.5,
                    2,
                    { gravity: -0.1, drag: 0.9, twinkle: 0.5, grow: 0.7 },
                  );
              }
            }
            if (sweepLeft <= 0) finaleTime = 0;
            sweepGlow = damp(sweepGlow, 1, 9, dt);
            haloGlow = Math.max(haloGlow, 0.55);
          } else sweepGlow *= Math.exp(-dt / 0.7);
          if (finaleTime !== 1 / 0) {
            if (finaleTime === 0 && finale > 0) {
              // The sweep is done: a burst from the altar.
              haloGlow = 1.2 + finale * 0.5;
              thrum.kick(2 + finale);
              const n = 10 + Math.round(finale * 8);
              for (let k = 0; k < n; k++) {
                const a = motes.rnd() * FULL;
                const r = motes.rnd() * 0.25;
                motes.emit(
                  Math.sin(a) * r,
                  0.34,
                  Math.cos(a) * r,
                  Math.sin(a) * 0.12,
                  0.6 + motes.rnd() * 0.8,
                  Math.cos(a) * 0.12,
                  1.2 + motes.rnd() * 0.9,
                  0.05 + motes.rnd() * 0.06,
                  0.9,
                  2.5,
                  2,
                  { gravity: 0.35, drag: 0.7, twinkle: 0.5 },
                );
              }
              finale = 0;
            }
            finaleTime += dt;
            if (finaleTime > 3) finaleTime = 1 / 0;
          }
          sweepAngle.value = sweep;
          pokeGlow.value = sweepGlow < 0.004 ? 0 : sweepGlow * 0.55;
          haloGlow *= Math.exp(-dt / 0.5);
          setGlowSprite(halo, 0.5 + haloGlow * 0.7, haloGlow * 0.8);
          const s = thrum.update(dt);
          root.scale.set(1 - s * 0.008, 1 + s * 0.02, 1 - s * 0.008);
          motes.update(dt);
        }
        const dt = Math.min(ctx.dt, 0.05);
        for (wispAcc += dt * night * (0.5 + 10 * summer); wispAcc >= 1; ) {
          --wispAcc;
          const i = wisps.free();
          if (i < 0) break;
          const a = rand.next() * TAU;
          const r = R * (0.2 + rand.next() * 0.95);
          wisps.x[i] = Math.sin(a) * r;
          wisps.z[i] = Math.cos(a) * r;
          wisps.y[i] = 0.12 + rand.next() * 0.35;
          wisps.vy[i] = 0.1 + rand.next() * 0.14;
          wisps.age[i] = 0;
          wisps.life[i] = 3.2 + rand.next() * 2.6;
          wisps.size[i] = 0.05 + rand.next() * 0.045;
          wisps.rnd[i] = rand.next() * TAU;
        }
        for (let i = 0; i < wisps.n; i++) {
          if (!wisps.alive(i)) continue;
          wisps.age[i] += dt;
          const k = wisps.age[i] / wisps.life[i];
          if (k >= 1) {
            wisps.kill(i);
            continue;
          }
          // Slow orbit round the ring.
          const x = wisps.x[i];
          const z = wisps.z[i];
          const spin = 0.35;
          wisps.x[i] = x + (z * spin + Math.sin(ctx.realTime * 0.9 + wisps.rnd[i]) * 0.05) * dt;
          wisps.z[i] = z + (-x * spin + Math.cos(ctx.realTime * 0.8 + wisps.rnd[i] * 1.3) * 0.05) * dt;
          wisps.y[i] += wisps.vy[i] * dt;
          const twinkle = 0.75 + 0.25 * Math.sin(ctx.realTime * 5 + wisps.rnd[i] * 3);
          const alpha = Math.sin(Math.PI * k) * twinkle * (0.5 + 0.5 * summer);
          wisps.write(i, wisps.x[i], wisps.y[i], wisps.z[i], wisps.size[i], alpha);
        }
        wisps.flush();
      },
      poke(poke) {
        const count = Math.min(3, Math.max(1, poke.count));
        if (sweepLeft <= 0) sweep = Math.atan2(poke.point.z - p.z, poke.point.x - p.x);
        sweepLeft = Math.min(FULL * 4, sweepLeft + FULL * (count === 1 ? 1 : count === 2 ? 1.6 : 2.4));
        finale = Math.max(finale, count === 3 ? 2 : 1);
        finaleTime = 1 / 0;
        sweepGlow = Math.max(sweepGlow, 0.6);
        haloGlow = Math.min(2, haloGlow + 0.6);
        thrum.kick(1.5 + 0.7 * count);
        return !0;
      },
      dispose() {
        disposeSprite(halo);
        motes.dispose();
        runeMesh.geometry.dispose();
        (root.children[0] as THREE.Mesh).geometry.dispose();
        runeMat.dispose();
        wisps.dispose();
      },
    };
  },
};
