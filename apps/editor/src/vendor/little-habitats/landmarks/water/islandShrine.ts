// Ports bundle lines 34144-34487: the island shrine landmark (p_) with its gate (u_), stone lantern (d_) and
// pine (f_) builders.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { levelY } from '../../core/config';
import { PALETTE } from '../../core/palette';
import { Rng } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { envelope, glowSprite, setGlowSprite, SparkPoints, Spring } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkDef, LandmarkPlacement } from '../types';
import { lightPoolMaterial, nightAmount, SplashRing, v3 } from './shared';

const GATE_RED = `#d95a3f`; // r_ (34144)
const GATE_RED_DARK = `#b8472f`; // i_ (34145)
const GATE_BLACK = `#4b3a33`; // a_ (34146)
const ROPE = `#dcc38c`; // o_ (34147)
const PAPER = `#f7f1e3`; // s_ (34148)
const POST_X = 0.46; // c_ (34149)
/** Height of the sagging rope at t in [0, 1] along it. */
const ropeY = (t: number): number => 0.72 - Math.sin(Math.PI * t) * 0.09; // l_ (34150)

/** Torii gate at depth z: posts, beams, plaque, curved top and the sagging rope. */
function buildGate(kit: MeshKit, z: number): void { // u_ (34151)
  const px = POST_X;
  for (const side of [-1, 1]) {
    const x = side * px;
    kit.cyl(0.062, 0.074, 2.2, 10, x, -0.98, z, GATE_RED, { grad: 0.25, ao: false });
    kit.cyl(0.084, 0.086, 0.26, 10, x, -0.12, z, GATE_BLACK, { grad: 0.1, ao: false });
    kit.cyl(0.07, 0.07, 0.04, 10, x, 1.2, z, GATE_BLACK, { ao: false, grad: 0 });
  }
  kit.box(1.24, 0.09, 0.085, 0, 0.86, z, GATE_RED, { bevel: 0.015, ao: false, grad: 0.1 });
  for (const side of [-1, 1]) kit.box(0.05, 0.07, 0.11, side * 0.55, 0.86, z, GATE_RED_DARK, { bevel: 0.01, ao: false });
  kit.box(0.07, 0.24, 0.07, 0, 1, z, GATE_RED, { ao: false, bevel: 0.012 });
  kit.box(0.2, 0.24, 0.035, 0, 1, z, GATE_BLACK, { ao: false, bevel: 0.012 });
  kit.box(0.13, 0.16, 0.045, 0, 1, z, PALETTE.autumnGold, { ao: false, bevel: 0.01, grad: 0 });
  kit.box(1.34, 0.08, 0.11, 0, 1.17, z, GATE_RED, { bevel: 0.015, ao: false, grad: 0.05 });
  kit.box(1.12, 0.09, 0.15, 0, 1.255, z, GATE_BLACK, { bevel: 0.02, ao: false, grad: 0.05 });
  for (const side of [-1, 1])
    kit.box(0.32, 0.085, 0.15, side * 0.68, 1.275, z, GATE_BLACK, {
      rot: [0, 0, side * 0.17],
      bevel: 0.02,
      ao: false,
      grad: 0.05,
    });
  let prev = v3(-0.39, 0.72, z);
  for (let i = 1; i <= 8; i++) {
    const t = i / 8,
      p = v3(-0.39 + (2 * px - 0.14) * t, 0.72 - Math.sin(Math.PI * t) * 0.09, z);
    kit.beam(prev, p, 0.05, 0.05, ROPE, { ao: false, extend: 0.02, bevel: 0.015 });
    prev = p;
  }
}

/** Hexagonal stone lantern at (x, y, z), scale s. The glowing core goes to the glow kit. */
function buildStoneLantern( // d_ (34175)
  kit: MeshKit,
  glowKit: MeshKit,
  rng: Rng,
  x: number,
  y: number,
  z: number,
  s: number,
): void {
  const stone = shadeColor(PALETTE.stone, rng.next() * 0.04 - 0.02),
    light = PALETTE.stoneLight,
    rot = Math.PI / 6;
  kit.cyl(0.19 * s, 0.24 * s, 0.08 * s, 6, x, y - 0.02, z, stone, { rot: [0, rot, 0], grad: 0.3 });
  kit.cyl(0.07 * s, 0.09 * s, 0.3 * s, 6, x, y + 0.06 * s, z, light, { rot: [0, rot, 0], grad: 0.25 });
  kit.cyl(0.17 * s, 0.11 * s, 0.075 * s, 6, x, y + 0.36 * s, z, stone, { rot: [0, rot, 0], grad: 0.2 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    kit.box(
      0.035 * s,
      0.16 * s,
      0.035 * s,
      x + Math.cos(a) * 0.118 * s,
      y + 0.515 * s,
      z + Math.sin(a) * 0.118 * s,
      light,
      { rot: [0, -a, 0], grad: 0.1 },
    );
  }
  glowKit.cyl(0.108 * s, 0.108 * s, 0.15 * s, 6, x, y + 0.435 * s, z, PALETTE.lanternGlow, { ao: false, grad: 0, jitter: 0 });
  kit.cyl(0.285 * s, 0.285 * s, 0.03 * s, 6, x, y + 0.59 * s, z, stone, { rot: [0, rot, 0], grad: 0 });
  kit.cyl(0.05 * s, 0.27 * s, 0.13 * s, 6, x, y + 0.618 * s, z, stone, { rot: [0, rot, 0], grad: 0.15 });
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rot;
    kit.blob(0.035 * s, x + Math.cos(a) * 0.28 * s, y + 0.63 * s, z + Math.sin(a) * 0.28 * s, stone, { detail: 0 });
    if (i % 2 == 0)
      kit.blob(0.05 * s, x + Math.cos(a) * 0.17 * s, y + 0.69 * s, z + Math.sin(a) * 0.17 * s, PALETTE.leafDark, {
        scale: [1.2, 0.4, 1],
        detail: 0,
      });
  }
  kit.cyl(0.03 * s, 0.045 * s, 0.04 * s, 6, x, y + 0.745 * s, z, light);
  kit.blob(0.05 * s, x, y + 0.805 * s, z, light, { scale: [1, 1.15, 1] });
}

/** Small windswept pine with three flat foliage pads. */
function buildPine(kit: MeshKit, x: number, y: number, z: number): void { // f_ (34204)
  const bark = PALETTE.bark,
    a = v3(x, y - 0.05, z),
    b = v3(x - 0.05, y + 0.26, z - 0.03),
    c = v3(x + 0.05, y + 0.5, z + 0.02),
    d = v3(x - 0.02, y + 0.68, z);
  kit.beam(a, b, 0.075, 0.075, bark, { extend: 0.03 });
  kit.beam(b, c, 0.06, 0.06, bark, { extend: 0.03 });
  kit.beam(c, d, 0.045, 0.045, bark, { extend: 0.03 });
  kit.beam(b, v3(x - 0.25, y + 0.36, z - 0.04), 0.04, 0.04, bark, { extend: 0.02 });
  const pads = [
    [x - 0.27, y + 0.4, z - 0.04, 0.18],
    [x + 0.13, y + 0.54, z + 0.02, 0.16],
    [x - 0.02, y + 0.72, z, 0.15],
  ];
  for (const [px, py, pz, r] of pads) {
    kit.blob(r, px, py, pz, PALETTE.pine, { scale: [1.25, 0.5, 1.05], detail: 1 });
    kit.blob(r * 0.7, px - 0.02, py + 0.045, pz - 0.02, shadeColor(PALETTE.pine, 0.07), { scale: [1.2, 0.45, 1], detail: 1 });
  }
}

/** Gate offsets tested around the islet (lateral, along). */
const GATE_SPOTS: [number, number][] = [
  [0, 0],
  [0.46, 0],
  [-0.46, 0],
  [0.46, 0.22],
  [-0.46, 0.22],
  [0.46, -0.22],
  [-0.46, -0.22],
  [0.7, 0],
  [-0.7, 0],
  [0, -0.45],
];

interface Hanger {
  grp: THREE.Group;
  ax: Spring;
  az: Spring;
  len: number;
}

export const ISLAND_SHRINE: LandmarkDef = { // p_ (34223)
  id: `island_shrine`,
  name: `Island shrine`,
  icon: `⛩️`,
  tint: `#f7d2c4`,
  blurb: `A red gate standing in the shallows of a tiny islet, a lantern keeping it company.`,
  hint: `Raise a speck of land (one to three spots) out in the lake, apart from your island.`,
  priority: 45,
  max: 2,
  detect(ctx) {
    const regions = ctx.regions((c) => ctx.land(c));
    if (regions.length < 2) return [];
    let main = regions[0];
    for (const r of regions) if (r.length > main.length) main = r;
    if (main.length < 6) return [];
    const terrain = ctx.game.terrain,
      features = ctx.habitat.features,
      openWater = (x: number, z: number) => terrain.surfaceAt(x, z) === `water` && terrain.heightAt(x, z) <= 0.02,
      out: LandmarkPlacement[] = [];
    for (const islet of regions) {
      if (islet === main || islet.length > 3) continue;
      const set = new Set(islet);
      let surrounded = true;
      for (const c of islet) for (const n of ctx.nbrs(c)) if (!set.has(n) && !ctx.lake(n)) surrounded = false;
      if (!surrounded) continue;
      let best = Infinity,
        from = islet[0],
        to = main[0];
      for (const c of islet) {
        const a = ctx.top(c);
        for (const m of main) {
          const b = ctx.top(m),
            d2 = (b.x - a.x) ** 2 + (b.z - a.z) ** 2;
          if (d2 < best) {
            best = d2;
            from = c;
            to = m;
          }
        }
      }
      const top = ctx.top(from),
        toMain = ctx.angle(from, to);
      let spot: { th: number; d: number } | null = null;
      search: for (let i = 0; i < 13; i++) {
        const th = toMain + (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 0.26,
          c = Math.cos(th),
          s = Math.sin(th);
        for (const d of [1.2, 1.35, 1.05]) {
          const gx = top.x + c * d,
            gz = top.z + s * d;
          if (
            GATE_SPOTS.every(([e, t]) => openWater(gx - s * e + c * t, gz + c * e + s * t)) &&
            !features.some((f) => (f.x - gx) ** 2 + (f.z - gz) ** 2 < 1)
          ) {
            spot = { th, d };
            break search;
          }
        }
      }
      if (!spot) continue;
      const h = ctx.h(from);
      out.push({
        key: `island_shrine:${from}`,
        x: top.x,
        y: 0,
        z: top.z,
        rotY: Math.PI / 2 - spot.th,
        radius: 0.3,
        clear: 0.5,
        data: { d: Math.round(spot.d * 100) / 100, top: levelY(h), n: islet.length },
      });
    }
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials(),
      rng = new Rng(seed ^ 28897),
      kit = new MeshKit(rng),
      glowKit = new MeshKit(rng),
      gateZ = p.data?.d ?? 1.2,
      top = p.data?.top ?? 0.25;
    buildGate(kit, gateZ);
    const stepAt = [0.52, 0.8];
    for (let i = 0; i < stepAt.length; i++) {
      const z = gateZ * stepAt[i] - 0.1,
        x = (i % 2 ? 0.07 : -0.06) + (rng.next() - 0.5) * 0.04;
      kit.cyl(0.13, 0.15, 0.6, 7, x, -0.56, z, shadeColor(PALETTE.stoneDark, -0.05), {
        grad: 0.4,
        ao: false,
        rot: [0, rng.next(), 0],
      });
      kit.blob(0.15, x, 0.035, z, shadeColor(PALETTE.stone, (rng.next() - 0.5) * 0.06), {
        scale: [1.05, 0.3, 0.9],
        detail: 1,
        ao: false,
        rot: [0, rng.next() * 3, 0],
      });
    }
    for (let i = 0; i < 4; i++) {
      const a = Math.PI * 0.35 + i * 0.95 + rng.next() * 0.3,
        r = 0.5 + rng.next() * 0.08;
      kit.blob(0.06 + rng.next() * 0.04, Math.sin(a) * r, 0.03, Math.cos(a) * r, shadeColor(PALETTE.stone, (rng.next() - 0.5) * 0.1), {
        scale: [1.2, 0.65, 1],
        detail: 0,
        ao: false,
      });
    }
    buildStoneLantern(kit, glowKit, rng, 0.19, top, 0.04, 1.06);
    buildPine(kit, -0.18, top, -0.14);
    const root = new THREE.Group();
    root.add(landmarkMesh(kit.build(), mats.base));
    const lanternCore = landmarkMesh(glowKit.build(), mats.glow, false);
    root.add(lanternCore);

    // Paper streamers and the bell hang from the rope and swing on their own springs.
    const hangers: Hanger[] = [],
      hang = (x: number, y: number, len: number, add: (k: MeshKit) => void): Hanger => {
        const k = new MeshKit(rng);
        add(k);
        const grp = new THREE.Group();
        grp.position.set(x, y, gateZ);
        const mesh = landmarkMesh(k.build(), mats.base, false);
        grp.add(mesh);
        root.add(grp);
        const h: Hanger = { grp, ax: new Spring(62, 2.4), az: new Spring(62, 2.4), len };
        hangers.push(h);
        return h;
      };
    for (const t of [0.25, 0.75])
      hang(-0.39 + (2 * POST_X - 0.14) * t, ropeY(t) - 0.05, 0.15, (k) => {
        for (let i = 0; i < 3; i++)
          k.box(0.05, 0.05, 0.012, i % 2 ? 0.02 : -0.01, -i * 0.05, 0.012, PAPER, { ao: false, grad: 0, bevel: 0.004 });
      });
    const bell = hang(0, ropeY(0.5) - 0.02, 0.2, (k) => {
      k.cyl(0.008, 0.008, 0.06, 5, 0, -0.07, 0, ROPE, { ao: false, grad: 0 });
      k.blob(0.058, 0, -0.14, 0, PALETTE.autumnGold, { ao: false, grad: 0.2, detail: 1 });
      k.box(0.075, 0.012, 0.014, 0, -0.165, 0.052, GATE_BLACK, { ao: false, grad: 0 });
      k.cyl(0.02, 0.02, 0.012, 6, 0, -0.2, 0, PALETTE.autumnGold, { ao: false, grad: 0 });
      k.box(0.014, 0.1, 0.014, -0.02, -0.26, 0, GATE_RED, { ao: false, grad: 0 });
      k.box(0.014, 0.1, 0.014, 0.02, -0.26, 0, PAPER, { ao: false, grad: 0 });
    });

    // Night light pools: one on the water around the islet, one on the ground under the lantern.
    const poolGeo = mergeGeometries([
        new THREE.PlaneGeometry(2.8, 2.8).rotateX(-Math.PI / 2).translate(0.1, 0.03, 0.25),
        new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2).translate(0.19, top + 0.03, 0.04),
      ]),
      pool = new THREE.Mesh(poolGeo, lightPoolMaterial());
    pool.renderOrder = 2;
    root.add(pool);
    const poolMat = lightPoolMaterial();
    pool.raycast = () => undefined;
    const lanternPos = new THREE.Vector3(0.19, top + 0.4611, 0.04),
      halo = glowSprite(2, 1.35, 0.6);
    halo.position.copy(lanternPos);
    const embers = new SparkPoints(56, true),
      petals = new SparkPoints(48, false),
      ring = new SplashRing(`#fff6ee`);
    ring.mesh.position.set(0, 0.03, gateZ);
    const ring2 = new SplashRing(`#fff6ee`);
    root.add(halo, embers.points, petals.points, ring.mesh, ring2.mesh);

    const squash = new Spring(140, 8);
    let glow = 0, // E
      glowT = 0, // D
      petalsLeft = 0, // O
      embersLeft = 0, // k
      ring2Delay = -1, // A
      power = 1; // j
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05),
          night = nightAmount(ctx.time.daylight);
        pool.visible = night > 0.01;
        poolMat.opacity = night * 0.55;
        for (let i = 0; i < hangers.length; i++) {
          const h = hangers[i];
          h.grp.rotation.x = h.ax.update(dt) + Math.sin(ctx.realTime * 1.4 + i * 2.1) * 0.03 * ctx.wind;
          h.grp.rotation.z = h.az.update(dt);
        }
        const sq = squash.update(dt);
        lanternCore.scale.set(1 - sq * 0.12, 1 + sq * 0.28, 1 - sq * 0.12);
        lanternCore.position.y = lanternPos.y * (1 - (1 + sq * 0.28));
        lanternCore.position.x = lanternPos.x * (1 - (1 - sq * 0.12));
        lanternCore.position.z = lanternPos.z * (1 - (1 - sq * 0.12));
        glowT += dt;
        setGlowSprite(halo, 0.55 + glow * 0.75, glow * envelope(glowT, 0.07, 0.4));
        if (glowT > 3) glow = 0;
        if (petalsLeft > 0) {
          const n = Math.min(petalsLeft, 30 * dt * (0.6 + power * 0.4) + Math.random());
          for (let i = 0; i < Math.floor(n); i++) {
            petalsLeft--;
            const x = (Math.random() - 0.5) * 1.05;
            petals.emit(
              x,
              1.32 + Math.random() * 0.1,
              gateZ + (Math.random() - 0.5) * 0.14,
              (Math.random() - 0.5) * 0.25 + ctx.windDir.x * 0.12,
              0.05,
              (Math.random() - 0.5) * 0.25 + ctx.windDir.y * 0.12,
              1.8 + Math.random() * 1,
              0.05 + Math.random() * 0.025,
              1,
              0.74 + Math.random() * 0.12,
              0.82,
              { gravity: 0.32, drag: 1.4, a: 0.95, twinkle: 0.2 },
            );
          }
        }
        if (embersLeft > 0) {
          const n = Math.min(embersLeft, 40 * dt + Math.random());
          for (let i = 0; i < Math.floor(n); i++) {
            embersLeft--;
            const a = Math.random() * Math.PI * 2;
            embers.emit(
              lanternPos.x + Math.cos(a) * 0.08,
              lanternPos.y - 0.05 + Math.random() * 0.1,
              lanternPos.z + Math.sin(a) * 0.08,
              Math.cos(a) * 0.12,
              0.4 + Math.random() * 0.6,
              Math.sin(a) * 0.12,
              1 + Math.random() * 0.9,
              0.06 + Math.random() * 0.04,
              1.6,
              1.15,
              0.55,
              { gravity: -0.15, drag: 0.8, twinkle: 0.55, grow: 0.6 },
            );
          }
        }
        if (ring2Delay >= 0) {
          ring2Delay -= dt;
          if (ring2Delay < 0) ring2.start(0, 0.03, gateZ, 0.15, 0.68, 1.1, 0.6);
        }
        ring.update(dt);
        ring2.update(dt);
        petals.update(dt);
        embers.update(dt);
      },
      poke(poke) {
        const n = Math.min(3, Math.max(1, poke.count));
        power = n;
        const swing = n === 1 ? 3.4 : n === 2 ? 4.6 : 6.2;
        for (const h of hangers) {
          const isBell = h === bell;
          h.ax.kick((isBell ? swing : swing * 0.6) * (0.85 + Math.random() * 0.3));
          h.az.kick((Math.random() - 0.5) * (isBell ? 2.4 : 1.6));
        }
        squash.kick(4 + n * 1.6);
        glow = 0.6 + n * 0.25;
        glowT = 0;
        petalsLeft += n === 1 ? 6 : n === 2 ? 12 : 22;
        embersLeft += n === 1 ? 7 : n === 2 ? 12 : 22;
        ring.start(0, 0.03, gateZ, 0.12, 0.68, 1.1, 0.7);
        if (n >= 3) ring2Delay = 0.22;
        return true;
      },
      dispose() {
        root.traverse((o) => {
          if (o instanceof THREE.Mesh && o !== ring.mesh && o !== ring2.mesh) o.geometry.dispose();
        });
        embers.dispose();
        petals.dispose();
        halo.material.dispose();
        ring.dispose();
        ring2.dispose();
      },
    };
  },
};
