// Ports bundle lines 35102-35516: the wishing well landmark (inline in I_) and the landmark catalog I_.
import * as THREE from 'three';
import { easeOutBack } from '../core/anim';
import { levelY } from '../core/config';
import { PALETTE } from '../core/palette';
import { Rng } from '../core/rng';
import { extrudePolygon, MeshKit, shadeColor } from '../ecology/meshKit';
import { FRIENDSHIP_LANTERN } from './friendshipLantern';
import { GARDEN_LANDMARKS } from './garden/index';
import { HEIGHTS_LANDMARKS } from './heights/index';
import { glowSprite, setGlowSprite, SparkPoints, Spring } from './kit';
import { landmarkMaterials, landmarkMesh } from './materials';
import { STONE_LANDMARKS } from './stone/index';
import type { LandmarkDef, LandmarkPlacement } from './types';
import { FOUNTAIN } from './water/fountain';
import { ISLAND_SHRINE } from './water/islandShrine';
import { LIGHTHOUSE } from './water/lighthouse';
import {
  fitScale,
  makeCoinMesh,
  nearestFeatureDistance,
  SplashRing,
  WATER_FX,
  WaterFxKit,
  waterFxMaterial,
} from './water/shared';
import { WATER_WHEEL } from './water/waterWheel';
import { WEATHER_VANE } from './weatherVane';

const ROOF = `#b9614c`; // j_ (35102)
const ROOF_SLAT = `#cf7a5f`; // M_ (35103)
const ROPE = `#d8c396`; // N_ (35104)
const IRON = `#5d4a3c`; // P_ (35105)
const CRANK_Y = 0.8; // F_ (35106)

/** A coin in flight: from the thrower (sx, sz) to the rim (rx, rz), then down the shaft. */
interface Coin {
  mesh: THREE.Mesh;
  ring: SplashRing;
  t: number;
  sx: number;
  sz: number;
  rx: number;
  rz: number;
  spin: number;
  last: boolean;
  power: number;
}

const WISHING_WELL: LandmarkDef = { // inline entry of I_ (35113)
  id: `wishing_well`,
  name: `Wishing well`,
  icon: `🪣`,
  tint: `#e9dcc4`,
  blurb: `A mossy old well with a crank and a bucket. Toss a coin and make a wish!`,
  hint: `Dig a single little hole of water in the middle of a flat, grassy meadow.`,
  priority: 30,
  max: 3,
  detect(ctx) {
    const out: LandmarkPlacement[] = [];
    for (const pond of ctx.ponds) {
      if (pond.corners.length !== 1) continue;
      const c = pond.corners[0],
        nbrs = ctx.nbrs(c),
        h = ctx.h(nbrs[0]);
      if (h < 1 || nbrs.some((n) => ctx.mat(n) !== `soil` || ctx.h(n) !== h)) continue;
      const top = ctx.top(c),
        s = fitScale(nearestFeatureDistance(ctx, top.x, top.z), 0.55, 1);
      out.push({
        key: `wishing_well:${c}`,
        x: top.x,
        y: levelY(h),
        z: top.z,
        rotY: Math.PI / 4 - 0.55 + (ctx.h01(c, 77) - 0.5) * 0.4,
        radius: 0.12,
        clear: 0.7,
        data: { h, s },
      });
    }
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials(),
      rng = new Rng(seed ^ 15889),
      kit = new MeshKit(rng),
      depth = levelY(p.data?.h ?? 1) / (p.data?.s ?? 1),
      stone = PALETTE.stone,
      light = PALETTE.stoneLight,
      moss = PALETTE.leafDark,
      inner = 0.26;
    // Shaft wall, three courses of stone, cap stones, pebble ring and moss.
    kit.lathe(
      [
        [inner, -depth - 0.05],
        [0.32999999999999996, -depth - 0.05],
        [0.32999999999999996, 0.33999999999999997],
        [inner, 0.33999999999999997],
        [inner, -depth - 0.05],
      ],
      14,
      0,
      0,
      0,
      shadeColor(stone, -0.12),
      { grad: 0.6, ao: false },
    );
    for (let row = 0; row < 3; row++)
      for (let i = 0; i < 11; i++) {
        const a = ((i + (row % 2) * 0.5) / 11) * Math.PI * 2 + rng.next() * 0.05,
          r = 0.33999999999999997 + rng.next() * 0.012,
          col = shadeColor(row === 0 ? PALETTE.stoneDark : stone, (rng.next() - 0.5) * 0.08);
        kit.box(
          0.2,
          0.10133333333333333,
          0.09,
          Math.cos(a) * r,
          0.11333333333333333 * (row + 0.5),
          Math.sin(a) * r,
          col,
          { rot: [0, -a + Math.PI / 2, 0], bevel: 0.022, grad: 0.15 },
        );
      }
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + 0.15,
        r = 0.31;
      kit.box(0.2, 0.07, 0.14, Math.cos(a) * r, 0.375, Math.sin(a) * r, shadeColor(light, (rng.next() - 0.5) * 0.06), {
        rot: [0, -a + Math.PI / 2, 0],
        bevel: 0.025,
        grad: 0.1,
      });
    }
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * Math.PI * 2 + rng.next() * 0.2,
        r = 0.43999999999999995 + rng.next() * 0.03;
      kit.blob(0.1 + rng.next() * 0.025, Math.cos(a) * r, 0, Math.sin(a) * r, shadeColor(PALETTE.pebble, (rng.next() - 0.5) * 0.1), {
        scale: [1.15, 0.32, 0.9],
        rot: [0, -a, 0],
        detail: 1,
      });
    }
    for (let i = 0; i < 5; i++) {
      const a = rng.next() * Math.PI * 2,
        y = i < 3 ? 0.03 : 0.2 + rng.next() * 0.1;
      kit.blob(0.06, Math.cos(a) * 0.36, y, Math.sin(a) * 0.36, moss, { scale: [1.3, 0.55, 1.1], detail: 0 });
    }
    // Posts, roof, ridge, gables, crank drum and handle.
    for (const s of [-1, 1]) {
      kit.box(0.075, 0.9, 0.075, s * 0.31, 0.74, 0, PALETTE.woodDark, { bevel: 0.015, grad: 0.3 });
      kit.box(0.1, 0.05, 0.1, s * 0.31, 0.42, 0, PALETTE.wood, { bevel: 0.015 });
    }
    const ridgeY = 1.24,
      pitch = 0.66,
      half = 0.27;
    for (const s of [-1, 1]) {
      const z = s * Math.cos(pitch) * half * 0.98,
        y = ridgeY - Math.sin(pitch) * half;
      kit.box(0.84, 0.045, 0.62, 0, y, z, s > 0 ? ROOF : shadeColor(ROOF, -0.05), {
        rot: [s * pitch, 0, 0],
        bevel: 0.015,
        grad: 0.1,
        ao: false,
      });
      for (let i = 0; i < 3; i++) {
        const t = (i + 0.5) / 3,
          sy = ridgeY - Math.sin(pitch) * half * 2 * t + 0.03,
          sz = s * Math.cos(pitch) * half * 2 * t;
        kit.box(0.86, 0.03, 0.08, 0, sy, sz, i % 2 ? ROOF_SLAT : shadeColor(ROOF_SLAT, -0.06), {
          rot: [s * pitch, 0, 0],
          bevel: 0.01,
          ao: false,
        });
      }
    }
    kit.box(0.9, 0.07, 0.07, 0, 1.26, 0, PALETTE.woodDark, { bevel: 0.015, ao: false });
    for (const s of [-1, 1])
      kit.tris(
        extrudePolygon(
          [
            [-0.24, 0],
            [0.24, 0],
            [0, 0.24],
          ],
          0.03,
        ),
        s * 0.33,
        0.97,
        0,
        PALETTE.woodDark,
        { rot: [0, Math.PI / 2, 0], ao: false, grad: 0.1 },
      );
    kit.cyl(0.045, 0.045, 0.8, 8, -0.4, CRANK_Y, 0, PALETTE.wood, { rot: [0, 0, -Math.PI / 2], ao: false });
    kit.cyl(0.075, 0.075, 0.24, 10, -0.24, CRANK_Y, 0, ROPE, { rot: [0, 0, -Math.PI / 2], ao: false, grad: 0 });
    for (let i = 0; i < 4; i++)
      kit.ring(0.076, 0.009, 3, 12, -0.21 + i * 0.06, CRANK_Y, 0, shadeColor(ROPE, -0.1), { rot: [0, 0, Math.PI / 2], ao: false });
    kit.box(0.04, 0.04, 0.22, 0.41, CRANK_Y, 0.09, PALETTE.woodDark, { ao: false, bevel: 0.01 });
    kit.cyl(0.024, 0.024, 0.13, 6, 0.4, CRANK_Y, 0.19, PALETTE.woodLight, { rot: [0, 0, -Math.PI / 2], ao: false });

    // Bucket on its rope (swings).
    const bucketKit = new MeshKit(rng);
    bucketKit.cyl(0.011, 0.011, 0.18000000000000002, 5, 0, -0.2 + 0.02, 0, ROPE, { ao: false, grad: 0 });
    bucketKit.ring(0.045, 0.008, 3, 10, 0, -0.195, 0, IRON, { rot: [Math.PI / 2, 0, 0], ao: false });
    bucketKit.lathe(
      [
        [0.001, -0.16],
        [0.07, -0.16],
        [0.085, -0.02],
        [0.075, -0.02],
        [0.065, -0.14],
        [0.001, -0.14],
      ],
      10,
      0,
      -0.23,
      0,
      PALETTE.woodLight,
      { ao: false, grad: 0.3 },
    );
    bucketKit.ring(0.08, 0.01, 3, 12, 0, -0.275, 0, IRON, { ao: false });
    bucketKit.ring(0.073, 0.01, 3, 12, 0, -0.36, 0, IRON, { ao: false });
    bucketKit.cyl(0.066, 0.066, 0.01, 10, 0, -0.28, 0, `#8fd3cf`, { ao: false, grad: 0 });
    const bucket = new THREE.Group();
    bucket.position.set(-0.12, 0.73, 0);
    bucket.add(landmarkMesh(bucketKit.build(), mats.base));

    // Water at the bottom of the shaft, sunken coins, a coin on the rim and a ripple.
    const water = new WaterFxKit(rng),
      waterY = -depth + 0.03;
    water.part(WATER_FX.STILL, 0, (k) =>
      k.cyl(0.265, 0.265, 0.02, 14, 0, waterY - 0.02, 0, `#5fb3b3`, { ao: false, grad: 0, jitter: 0 }),
    );
    for (let i = 0; i < 6; i++) {
      const a = rng.next() * Math.PI * 2,
        r = 0.05 + rng.next() * 0.15;
      water.part(WATER_FX.COIN, rng.next(), (k) =>
        k.cyl(0.035, 0.035, 0.012, 8, Math.cos(a) * r, waterY - 0.012 + i * 0.001, Math.sin(a) * r, PALETTE.autumnGold, {
          ao: false,
          grad: 0,
          rot: [(rng.next() - 0.5) * 0.3, 0, (rng.next() - 0.5) * 0.3],
        }),
      );
    }
    water.part(WATER_FX.COIN, 0.61, (k) =>
      k.cyl(0.035, 0.035, 0.012, 8, 0.2, 0.415, 0.22, PALETTE.autumnGold, { ao: false, grad: 0, rot: [0.1, 0, 0.05] }),
    );
    water.part(WATER_FX.RIPPLE, 0.1, (k) =>
      k.ring(0.2, 0.01, 3, 16, 0, waterY + 0.004, 0, `#e9f7f4`, {
        ao: false,
        grad: 0,
        jitter: 0,
        center: [0, waterY, 0],
        scale: [1, 0.5, 1],
      }),
    );

    const root = new THREE.Group();
    root.scale.setScalar(p.data?.s ?? 1);
    root.add(landmarkMesh(kit.build(), mats.base));
    root.add(bucket);
    const waterMesh = landmarkMesh(water.build(), waterFxMaterial(), false);
    root.add(waterMesh);

    const phase = rng.next() * 10, // b
      flight = 0.5, // x: total coin time
      arc = 0.33, // S: time to reach the rim
      rimY = 0.42, // C
      coins: Coin[] = []; // T
    for (let i = 0; i < 4; i++) {
      const mesh = makeCoinMesh(0.085),
        ring = new SplashRing(`#f2fbf8`);
      root.add(mesh, ring.mesh);
      coins.push({ mesh, ring, t: Infinity, sx: 0, sz: 1, rx: 0, rz: 0.3, spin: 1, last: false, power: 1 });
    }
    const splash = new SparkPoints(48, false),
      sparkles = new SparkPoints(72, true),
      wishGlow = glowSprite(1.7, 1.2, 0.5),
      rimGlow = glowSprite(2, 1.6, 0.8);
    root.add(splash.points, sparkles.points, wishGlow, rimGlow);
    let rimFlash = 0, // A
      rimX = 0, // j
      rimZ = 0.3; // M
    const swingX = new Spring(70, 3.2), // N
      swingZ = new Spring(70, 3.2); // P
    let wish = 0, // F
      wishY = 0.36, // I
      nextCoin = 0; // L
    const from = new THREE.Vector3(), // R
      splashUp = (power: number) => { // ee
        const n = 5 + Math.round(power * 4);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2,
            r = Math.random() * 0.06,
            vy = 1.4 + Math.random() * 1.1 * (0.7 + power * 0.3),
            sp = 0.1 + Math.random() * 0.25;
          splash.emit(
            Math.cos(a) * r,
            waterY + 0.02,
            Math.sin(a) * r,
            Math.cos(a) * sp,
            vy,
            Math.sin(a) * sp,
            0.55 + Math.random() * 0.35,
            0.04 + Math.random() * 0.025,
            0.85,
            0.96,
            1,
            { gravity: 6.5, drag: 0.2, a: 0.95 },
          );
        }
      },
      makeWish = (power: number) => { // z
        const n = 8 + Math.round(power * 9);
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2,
            r = Math.random() * 0.17;
          sparkles.emit(
            Math.cos(a) * r,
            0.38 + Math.random() * 0.06,
            Math.sin(a) * r,
            Math.cos(a + 1.6) * 0.12,
            0.45 + Math.random() * 0.75,
            Math.sin(a + 1.6) * 0.12,
            1.1 + Math.random() * 0.9,
            0.06 + Math.random() * 0.05,
            1.5,
            1.15,
            0.5,
            { gravity: -0.25, drag: 0.7, twinkle: 0.55, grow: 0.5 },
          );
        }
        wish = Math.min(1.5, wish + 0.55 + power * 0.25);
        if (wish < 0.7) wishY = 0.41;
      };
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05),
          t = ctx.realTime + phase,
          gust = 0.5 + ctx.wind * 0.5;
        bucket.rotation.z = Math.sin(t * 1.3) * 0.07 * gust + swingZ.update(dt);
        bucket.rotation.x = Math.sin(t * 0.9 + 1.3) * 0.05 * gust + swingX.update(dt);
        bucket.position.y = 0.73 + Math.sin(t * 0.7) * 0.025;
        for (const c of coins) {
          c.ring.update(dt);
          if (c.t === Infinity) continue;
          const prevT = c.t;
          c.t += dt;
          if (c.t < 0) continue;
          if (c.t / flight >= 1) {
            c.t = Infinity;
            c.mesh.visible = false;
            if (prevT < flight) {
              c.ring.start(0, waterY + 0.012, 0, 0.04, 0.24, 0.95, 0.85);
              splashUp(c.power);
              swingX.kick((Math.random() - 0.5) * 0.6 + 0.4);
              swingZ.kick((Math.random() - 0.5) * 0.9);
              if (c.last) makeWish(c.power);
            }
            continue;
          }
          let x: number, z: number, y: number;
          if (c.t < arc) {
            const k = c.t / arc;
            x = c.sx + (c.rx - c.sx) * k;
            z = c.sz + (c.rz - c.sz) * k;
            y = 0.72 + -0.3 * k + 2 * k * (1 - k);
          } else {
            const k = (c.t - arc) / 0.16999999999999998,
              e = k * k * (3 - 2 * k);
            x = c.rx * (1 - e);
            z = c.rz * (1 - e);
            y = rimY + 0.4 * k * (1 - k) - (rimY - waterY) * k * k;
            if (prevT < arc) {
              for (let i = 0; i < 6; i++) {
                const a = Math.random() * Math.PI * 2;
                sparkles.emit(
                  c.rx,
                  0.44,
                  c.rz,
                  Math.cos(a) * 0.5,
                  0.3 + Math.random() * 0.5,
                  Math.sin(a) * 0.5,
                  0.35 + Math.random() * 0.25,
                  0.06,
                  1.6,
                  1.3,
                  0.6,
                  { gravity: 2.5, drag: 1.2, twinkle: 0.4 },
                );
              }
              rimFlash = 1;
              rimX = c.rx;
              rimZ = c.rz;
            }
          }
          c.mesh.visible = true;
          c.mesh.position.set(x, y, z);
          c.mesh.scale.setScalar(Math.max(0.01, easeOutBack(c.t * 9)));
          c.mesh.rotation.set(c.t * Math.PI * 9 * c.spin, c.t * 3, 0.35 * Math.sin(c.t * 14));
          if (Math.random() < 0.8)
            sparkles.emit(
              x,
              y,
              z,
              (Math.random() - 0.5) * 0.1,
              0.05 + Math.random() * 0.15,
              (Math.random() - 0.5) * 0.1,
              0.4 + Math.random() * 0.25,
              0.05,
              1.5,
              1.2,
              0.55,
              { twinkle: 0.5, drag: 1.5 },
            );
        }
        wish *= Math.exp(-dt / 0.45);
        wishY += dt * 0.55;
        wishGlow.position.set(0, wishY, 0);
        rimFlash *= Math.exp(-dt / 0.13);
        rimGlow.position.set(rimX, 0.47, rimZ);
        setGlowSprite(rimGlow, 0.2 + rimFlash * 0.2, rimFlash * 0.9);
        setGlowSprite(wishGlow, 0.28 + wish * 0.38, wish * 0.9);
        splash.update(dt);
        sparkles.update(dt);
      },
      poke(poke) {
        const n = Math.min(3, Math.max(1, poke.count));
        from.set(poke.from.x, poke.from.y, poke.from.z);
        root.worldToLocal(from);
        const len = Math.hypot(from.x, from.z) || 1,
          side = from.z >= 0 ? 1 : -1,
          dx = Math.max(-0.62, Math.min(0.62, from.x / len)),
          dz = side * Math.sqrt(1 - dx * dx);
        for (let i = 0; i < n; i++) {
          let slot = -1;
          for (let j = 0; j < 4; j++)
            if (coins[(nextCoin + j) % 4].t === Infinity) {
              slot = (nextCoin + j) % 4;
              break;
            }
          if (slot < 0) {
            let oldest = 0;
            for (let j = 1; j < 4; j++) if (coins[j].t > coins[oldest].t) oldest = j;
            slot = oldest;
          }
          nextCoin = (slot + 1) % 4;
          const c = coins[slot];
          c.t = -i * (n > 2 ? 0.17 : 0.2);
          const o = (i - (n - 1) / 2) * 0.13;
          c.sx = dx * 0.95 + dz * o;
          c.sz = dz * 0.95 - dx * o;
          c.rx = dx * 0.305 + dz * o * 0.4;
          c.rz = dz * 0.305 - dx * o * 0.4;
          c.spin = i % 2 ? -1 : 1;
          c.last = i === n - 1;
          c.power = n;
          c.mesh.position.set(c.sx, 0.72, c.sz);
        }
        return true;
      },
      dispose() {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && !coins.some((c) => c.ring.mesh === o)) o.geometry.dispose();
        });
        splash.dispose();
        sparkles.dispose();
        wishGlow.material.dispose();
        rimGlow.material.dispose();
        for (const c of coins) c.ring.dispose();
      },
    };
  },
};

/** Every landmark, in the original order. createLandmarks sorts a copy by priority. */
export const LANDMARKS: LandmarkDef[] = [ // I_ (35107)
  WEATHER_VANE,
  LIGHTHOUSE,
  ISLAND_SHRINE,
  FOUNTAIN,
  WATER_WHEEL,
  WISHING_WELL,
  ...HEIGHTS_LANDMARKS,
  ...STONE_LANDMARKS,
  ...GARDEN_LANDMARKS,
  FRIENDSHIP_LANTERN,
];
