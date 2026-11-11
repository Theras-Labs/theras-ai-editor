// Ports index-BwioI7A7.js 31515-31889: the campfire landmark (tg) with its log colours (Qh, $h) and the log helper eg.
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { PALETTE } from '../../core/palette';
import { Rng, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { patchWorldMaterial } from '../../fx/pokefx';
import { SparkPoints, Spring, disposeSprite, glowSprite, setGlowSprite } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { BASE_YAW, KitFrame, TAU, XorShift, emberSparks, groundGlow, localWind, nightness, smokePuffs } from './shared';

const BARK = PALETTE.bark; // Qh (31515)
const CHAR = `#3f3431`; // $h (31516)

/** A log from (x0, y0, z0) to (x1, y1, z1) with light cut ends and darker heartwood rings. */
function log( // eg (31517)
  f: KitFrame,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  r: number,
  rng: Rng,
): void {
  const bark = shadeColor(BARK, rng.range(-0.05, 0.04));
  f.tube(x0, y0, z0, x1, y1, z1, r, r * 0.96, 7, bark, { grad: 0.15 });
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const len = Math.hypot(dx, dy, dz);
  const ux = dx / len;
  const uy = dy / len;
  const uz = dz / len;
  for (const [x, y, z, s] of [
    [x0, y0, z0, -1],
    [x1, y1, z1, 1],
  ]) {
    f.tube(x, y, z, x + ux * s * 0.012, y + uy * s * 0.012, z + uz * s * 0.012, r * 0.9, r * 0.9, 7, PALETTE.woodLight, {
      grad: 0,
    });
    f.tube(x, y, z, x + ux * s * 0.016, y + uy * s * 0.016, z + uz * s * 0.016, r * 0.42, r * 0.42, 7, PALETTE.wood, {
      grad: 0,
    });
  }
}

export const CAMPFIRE: LandmarkDef = { // tg (31538)
  id: `campfire`,
  name: `Campfire`,
  icon: `🔥`,
  tint: `#f6d2b0`,
  blurb: `Two log seats round a crackling fire. It smoulders by day and roars into life at dusk.`,
  hint: `A single flat stone, alone in an open meadow, is just the place to gather round at dusk.`,
  priority: 25,
  max: 1,
  detect(ctx) {
    const found: (LandmarkPlacement & { score: number })[] = [];
    for (const c of ctx.corners) {
      if (ctx.mat(c) !== `stone` || ctx.h(c) !== 1 || ctx.sown(c)) continue;
      const nbrs = ctx.nbrs(c);
      if (nbrs.length < 3 || !nbrs.every((n) => !ctx.rim(n) && ctx.mat(n) === `soil` && ctx.h(n) === 1 && !ctx.sown(n)))
        continue;
      const top = ctx.top(c);
      const y = ctx.flat(top.x, top.z, 0.7, 0.08);
      if (y !== null)
        found.push({
          key: `campfire:${c}`,
          x: top.x,
          y,
          z: top.z,
          rotY: BASE_YAW,
          radius: 0.62,
          clear: 0.82,
          score: ctx.h01(c, 4503),
        });
    }
    found.sort((a, b) => a.score - b.score);
    return found;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const rng = new Rng(seed ^ hashString(p.key));
    const kit = new MeshKit(rng);
    const f = new KitFrame(kit);
    // Ash bed and scattered charcoal.
    f.cyl(0.22, 0.24, 0.025, 10, 0, -0.005, 0, `#5a504b`, { grad: 0 });
    for (let k = 0; k < 6; k++) {
      const a = rng.next() * TAU;
      const r = rng.next() * 0.13;
      f.blob(0.03 + rng.next() * 0.015, Math.sin(a) * r, 0.02, Math.cos(a) * r, CHAR, { detail: 0, sc: [1.3, 0.6, 1] });
    }
    // Ring of hearth stones, some scorched.
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * TAU + rng.range(-0.1, 0.1);
      const s = 0.075 + rng.next() * 0.022;
      f.blob(s, Math.sin(a) * 0.29, s * 0.55, Math.cos(a) * 0.29, shadeColor(PALETTE.stone, rng.range(-0.1, 0.02)), {
        detail: 1,
        sc: [1.15, 0.78, 1],
        yaw: a,
        grad: 0.35,
      });
      if (rng.chance(0.3))
        f.blob(s * 0.4, Math.sin(a) * 0.3, s * 1.05, Math.cos(a) * 0.3, CHAR, { detail: 0, sc: [1.2, 0.3, 1] });
    }
    // Teepee of sticks with charred tops, and two crossed logs at the bottom.
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.3;
      const bx = Math.sin(a) * 0.19;
      const bz = Math.cos(a) * 0.19;
      const tx = Math.sin(a) * 0.03;
      const tz = Math.cos(a) * 0.03;
      f.tube(bx, 0.01, bz, tx, 0.32, tz, 0.028, 0.022, 6, shadeColor(BARK, rng.range(-0.06, 0.04)), { grad: 0.1 });
      f.tube(bx * 0.35 + tx * 0.65, 0.21, bz * 0.35 + tz * 0.65, tx * 0.8, 0.33, tz * 0.8, 0.024, 0.02, 6, CHAR, {
        grad: 0,
      });
    }
    f.tube(-0.2, 0.04, -0.06, 0.2, 0.04, 0.07, 0.035, 0.035, 7, shadeColor(BARK, -0.05), { grad: 0.1 });
    f.tube(-0.08, 0.05, 0.19, 0.06, 0.05, -0.2, 0.032, 0.032, 7, shadeColor(BARK, 0.02), { grad: 0.1 });
    // Two log seats with a tuft of moss each.
    for (const side of [-1, 1]) {
      const x = side * 0.66;
      const yaw = rng.range(-0.25, 0.25);
      const half = 0.3;
      log(f, x - Math.sin(yaw) * half, 0.1, -Math.cos(yaw) * half, x + Math.sin(yaw) * half, 0.1, Math.cos(yaw) * half, 0.1, rng);
      f.blob(0.05, x + side * 0.03, 0.18, -0.12, PALETTE.leafDark, { detail: 0, sc: [1.3, 0.4, 1.1] });
    }
    // A toasting stick with a marshmallow.
    f.tube(0.62, 0.21, 0.14, 0.3, 0.36, 0.1, 0.008, 0.007, 4, PALETTE.woodDark, { grad: 0 });
    f.blob(0.028, 0.285, 0.365, 0.1, `#fbf1dc`, { sc: [1, 1.3, 1], detail: 1, grad: 0 });
    // Woodpile.
    const pileAt = { x: -0.5, z: -0.42 };
    const pileAlong = { x: 0.62, z: 0.78 };
    const pileAcross = { x: 0.78, z: -0.62 };
    for (const [s, y] of [
      [-0.11, 0.05],
      [0, 0.05],
      [0.11, 0.05],
      [-0.055, 0.135],
      [0.055, 0.135],
    ]) {
      const cx = pileAt.x + pileAcross.x * s;
      const cz = pileAt.z + pileAcross.z * s;
      log(f, cx - pileAlong.x * 0.16, y, cz - pileAlong.z * 0.16, cx + pileAlong.x * 0.16, y, cz + pileAlong.z * 0.16, 0.05, rng);
    }
    // Kettle on a flat stone.
    const kx = 0.34;
    const kz = 0.4;
    f.blob(0.1, kx, 0.02, kz, shadeColor(PALETTE.stone, -0.03), { detail: 1, sc: [1.1, 0.35, 1] });
    f.lathe(
      [
        [0.001, 0],
        [0.065, 0],
        [0.078, 0.035],
        [0.07, 0.075],
        [0.04, 0.1],
        [0.001, 0.105],
      ],
      10,
      kx,
      0.04,
      kz,
      `#6f9fc0`,
      { grad: 0.2 },
    );
    f.cyl(0.014, 0.018, 0.02, 6, kx, 0.14, kz, `#4f7d9c`);
    f.tube(0.4, 0.07, kz, 0.46, 0.13, 0.42000000000000004, 0.014, 0.009, 5, `#6f9fc0`, { grad: 0 });
    f.ring(0.05, 0.007, 3, 10, kx, 0.14, kz, `#4f4a52`, { pitch: -Math.PI / 2, arc: Math.PI, grad: 0 });
    const root = new THREE.Group(); // d
    root.add(landmarkMesh(kit.build(), mats.base));

    // Flames: white lathe tongues, recoloured by height, swayed in the vertex shader.
    const flameKit = new MeshKit(rng);
    const ff = new KitFrame(flameKit);
    const tongue = [
      [0.001, 0],
      [0.07, 0.03],
      [0.082, 0.09],
      [0.058, 0.18],
      [0.028, 0.28],
      [0.001, 0.36],
    ];
    ff.lathe(tongue, 7, 0, 0.02, 0, `#ffffff`, { ao: !1, grad: 0, jitter: 0, smooth: !0 });
    ff.lathe(tongue, 7, 0.07, 0.02, 0.03, `#ffffff`, {
      ao: !1,
      grad: 0,
      jitter: 0,
      sc: [0.7, 0.62, 0.7],
      roll: -0.25,
      smooth: !0,
    });
    ff.lathe(tongue, 7, -0.06, 0.02, -0.03, `#ffffff`, {
      ao: !1,
      grad: 0,
      jitter: 0,
      sc: [0.66, 0.7, 0.66],
      roll: 0.3,
      smooth: !0,
    });
    ff.lathe(tongue, 7, 0, 0.02, 0.07, `#ffffff`, {
      ao: !1,
      grad: 0,
      jitter: 0,
      sc: [0.55, 0.5, 0.55],
      pitch: 0.3,
      smooth: !0,
    });
    for (let k = 0; k < 7; k++) {
      const a = rng.next() * TAU;
      const r = 0.05 + rng.next() * 0.1;
      ff.blob(0.026, Math.sin(a) * r, 0.02, Math.cos(a) * r, `#ffffff`, { detail: 0, ao: !1, grad: 0, jitter: 0 });
    }
    const flameGeo = flameKit.build(); // h
    {
      const pos = flameGeo.attributes.position.array;
      const col = flameGeo.attributes.color.array;
      const hot = new THREE.Color(`#ffe7a0`);
      const mid = new THREE.Color(`#ff9a30`);
      const tip = new THREE.Color(`#e4482a`);
      const c = new THREE.Color();
      for (let k = 0; k < pos.length; k += 3) {
        const t = Math.min(1, Math.max(0, (pos[k + 1] - 0.02) / 0.34));
        if (t < 0.35) c.copy(hot).lerp(mid, t / 0.35);
        else c.copy(mid).lerp(tip, (t - 0.35) / 0.65);
        col[k] = c.r;
        col[k + 1] = c.g;
        col[k + 2] = c.b;
      }
    }
    const flameGain = { value: 0 }; // g
    const flameMat = patchWorldMaterial( // _
      new THREE.MeshStandardMaterial({ vertexColors: !0, color: `#000000`, roughness: 1, flatShading: !1 }),
      {
        uniforms: { uFlame: flameGain },
        vertex: `
        float fh = max(0.0, position.y);
        float fph = uTime * 7.3 + position.x * 11.0 + position.z * 8.0;
        transformed.x += sin(fph + fh * 13.0) * 0.1 * fh * fh * 3.0;
        transformed.z += cos(fph * 1.17 + fh * 11.0) * 0.08 * fh * fh * 3.0;
        transformed.y *= 1.0 + 0.12 * sin(uTime * 9.1 + position.x * 20.0);`,
        fragmentHeader: `uniform float uFlame;`,
        fragment: `totalEmissiveRadiance = vColor.rgb * uFlame;`,
        cacheKey: `stone-flame`,
      },
    );
    const flames = new THREE.Mesh(flameGeo, flameMat); // v
    flames.position.y = 0.01;
    root.add(flames);
    const glowDisc = groundGlow(1.55, `#ff9446`, 0.035); // y
    root.add(glowDisc);
    const embers = emberSparks(24, `#ff9a3c`, `#fff1c2`, 0.0035); // b
    root.add(embers.mesh);
    const smoke = smokePuffs(18, `#c9c3d2`, 1.15, 0.85); // x
    root.add(smoke.mesh);
    const smokeUniforms = smoke.mesh.material.uniforms; // S
    const smokeDay = new THREE.Color(`#cfc9d6`); // C
    const smokeNight = new THREE.Color(`#6d6883`); // T
    const roar = new Spring(70, 8); // E
    let stoke = 0; // D
    const halo = glowSprite(3.4, 1.7, 0.6); // O
    halo.position.set(0, 0.26, 0);
    root.add(halo);
    const sparks = new SparkPoints(72, !0); // k
    root.add(sparks.points);
    const puffs = new SparkPoints(16, !1); // A
    root.add(puffs.points);
    let flash = 0; // j
    const rand = new XorShift(seed ^ hashString(p.key) ^ 61822); // M
    const wind = { x: 0, z: 0 }; // N
    const rotY = p.rotY ?? 0; // P
    let night = 0; // F
    let emberAcc = 0; // I
    let smokeAcc = 0; // L
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05);
        const time = ctx.realTime;
        night = damp(night, nightness(ctx.time.dayFrac), 1.6, dt);
        stoke *= Math.exp(-dt / (0.85 + stoke * 0.3));
        roar.target = stoke;
        const boost = roar.update(dt);
        flash *= Math.exp(-dt / 0.32);
        sparks.update(dt);
        puffs.update(dt);
        const fire = Math.min(2, Math.max(0, night + boost * (1 - 0.4 * night)));
        setGlowSprite(halo, 0.5 + flash * 0.55 + fire * 0.15, flash * (0.75 + 0.15 * Math.sin(time * 40)));
        localWind(ctx, rotY, wind);
        const flicker = 0.86 + 0.09 * Math.sin(time * 11.3) * Math.sin(time * 7.1 + 1.3) + 0.05 * Math.sin(time * 23.7);
        flames.visible = fire > 0.02;
        const f = Math.max(0.001, fire);
        const tall = f < 1 ? f : 1 + (f - 1) * 0.55;
        const wide = 0.95 + 0.25 * Math.min(f, 1) + 0.4 * Math.max(0, f - 1);
        for (
          flames.scale.set(wide, tall * flicker * 1.4, wide),
            flames.rotation.y = time * 0.4,
            flameGain.value = 3.2 * (0.55 + 0.45 * f) * (0.9 + 0.1 * flicker),
            glowDisc.visible = fire > 0.02,
            glowDisc.material.opacity = Math.min(1, fire * 0.58 * flicker),
            emberAcc += dt * night * 9;
          emberAcc >= 1;

        ) {
          --emberAcc;
          const i = embers.free();
          if (i < 0) break;
          embers.x[i] = (rand.next() - 0.5) * 0.14;
          embers.z[i] = (rand.next() - 0.5) * 0.14;
          embers.y[i] = 0.18 + rand.next() * 0.12;
          embers.vx[i] = (rand.next() - 0.5) * 0.25;
          embers.vz[i] = (rand.next() - 0.5) * 0.25;
          embers.vy[i] = 0.55 + rand.next() * 0.5;
          embers.age[i] = 0;
          embers.life[i] = 0.9 + rand.next() * 0.9;
          embers.size[i] = 0.03 + rand.next() * 0.022;
          embers.rnd[i] = rand.next() * TAU;
        }
        for (let i = 0; i < embers.n; i++) {
          if (!embers.alive(i)) continue;
          embers.age[i] += dt;
          const k = embers.age[i] / embers.life[i];
          if (k >= 1) {
            embers.kill(i);
            continue;
          }
          embers.vy[i] *= 1 - 0.9 * dt;
          embers.x[i] += (embers.vx[i] + wind.x * 0.25 + Math.sin(time * 6 + embers.rnd[i]) * 0.12) * dt;
          embers.z[i] += (embers.vz[i] + wind.z * 0.25 + Math.cos(time * 5 + embers.rnd[i]) * 0.12) * dt;
          embers.y[i] += embers.vy[i] * dt;
          const twinkle = 0.6 + 0.4 * Math.sin(time * 25 + embers.rnd[i] * 7);
          embers.write(i, embers.x[i], embers.y[i], embers.z[i], embers.size[i] * (1 - k * 0.6), (1 - k) * twinkle);
        }
        for (
          embers.flush(),
            smokeUniforms.uColor.value.copy(smokeDay).lerp(smokeNight, ctx.night),
            smokeUniforms.uOpacity.value = 0.85,
            smokeAcc += dt * (2.2 + night * 0.8);
          smokeAcc >= 1;

        ) {
          --smokeAcc;
          const i = smoke.free();
          if (i < 0) break;
          smoke.x[i] = (rand.next() - 0.5) * 0.08;
          smoke.z[i] = (rand.next() - 0.5) * 0.08;
          smoke.y[i] = 0.12 + night * 0.3;
          smoke.vy[i] = 0.3 + rand.next() * 0.12 + night * 0.12;
          smoke.age[i] = 0;
          smoke.life[i] = 3.4 + rand.next() * 1.4;
          smoke.size[i] = 0.15 + rand.next() * 0.05 + night * 0.05;
          smoke.rnd[i] = rand.next() * TAU;
        }
        for (let i = 0; i < smoke.n; i++) {
          if (!smoke.alive(i)) continue;
          smoke.age[i] += dt;
          const k = smoke.age[i] / smoke.life[i];
          if (k >= 1) {
            smoke.kill(i);
            continue;
          }
          const k2 = k * k;
          smoke.x[i] += (wind.x * 0.28 * (0.3 + k2) + Math.sin(time * 1.3 + smoke.rnd[i]) * 0.03) * dt;
          smoke.z[i] += (wind.z * 0.28 * (0.3 + k2) + Math.cos(time * 1.1 + smoke.rnd[i]) * 0.03) * dt;
          smoke.y[i] += smoke.vy[i] * dt * (1 - k * 0.5);
          const size = smoke.size[i] * (0.55 + 1.9 * k);
          const alpha = Math.min(1, k * 4) * (1 - k) * (1 - k) * (0.95 - 0.35 * night);
          smoke.write(i, smoke.x[i], smoke.y[i], smoke.z[i], size, alpha);
        }
        smoke.flush();
      },
      poke(poke) {
        const count = Math.min(3, Math.max(1, poke.count));
        stoke = Math.min(1.7, stoke + 0.75 + 0.3 * count);
        roar.kick(4 + 3 * count);
        flash = Math.min(2.2, flash + 0.9 + 0.3 * count);
        const n = count === 1 ? 11 : count === 2 ? 18 : 34;
        for (let k = 0; k < n; k++) {
          const a = rand.next() * TAU;
          const v = 0.15 + rand.next() * (0.35 + 0.1 * count);
          sparks.emit(
            Math.sin(a) * 0.04,
            0.16 + rand.next() * 0.14,
            Math.cos(a) * 0.04,
            Math.sin(a) * v,
            1.1 + rand.next() * (0.9 + 0.35 * count),
            Math.cos(a) * v,
            1 + rand.next() * 0.9,
            0.05 + rand.next() * 0.045,
            3,
            1.2 + rand.next() * 0.7,
            0.3,
            { gravity: 0.9, drag: 0.7, twinkle: 0.45, grow: 0.5 },
          );
        }
        const m = count === 1 ? 2 : count === 2 ? 3 : 5;
        for (let k = 0; k < m; k++) {
          const a = rand.next() * TAU;
          puffs.emit(
            Math.sin(a) * 0.05,
            0.3,
            Math.cos(a) * 0.05,
            Math.sin(a) * 0.1,
            0.65 + rand.next() * 0.3,
            Math.cos(a) * 0.1,
            1.5 + rand.next() * 0.6,
            0.2 + rand.next() * 0.08,
            0.72,
            0.7,
            0.75,
            { a: 0.55, grow: 2.6, drag: 0.6 },
          );
        }
        return !0;
      },
      dispose() {
        (root.children[0] as THREE.Mesh).geometry.dispose();
        disposeSprite(halo);
        sparks.dispose();
        puffs.dispose();
        flameGeo.dispose();
        flameMat.dispose();
        glowDisc.material.dispose();
        embers.dispose();
        smoke.dispose();
      },
    };
  },
};
