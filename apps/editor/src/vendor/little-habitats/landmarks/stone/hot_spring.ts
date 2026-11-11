// Ports index-BwioI7A7.js 32264-32763: the hot spring landmark (hg), its constants sg..mg and the geometry merge gg.
import * as THREE from 'three';
import { damp } from '../../core/anim';
import { CONFIG } from '../../core/config';
import { PALETTE } from '../../core/palette';
import { Rng, hashString } from '../../core/rng';
import { MeshKit, shadeColor } from '../../ecology/meshKit';
import { patchWorldMaterial } from '../../fx/pokefx';
import { SparkPoints, Spring } from '../kit';
import { landmarkMaterials, landmarkMesh } from '../materials';
import type { LandmarkData, LandmarkDef, LandmarkPlacement } from '../types';
import { KitFrame, TAU, XorShift, localWind, smokePuffs, wintriness } from './shared';

const round2 = (v: number): number => Math.round(v * 100) / 100; // sg (32264)
const BAMBOO = `#b9c46e`; // cg (32265)
const BAMBOO_RING = `#8f9a4c`; // lg (32266)
const ROCK_COLORS = [`#9d968c`, `#a8a196`, `#8f887f`, `#b0a89c`]; // ug (32267)
const SIGN_RED = `#b3493a`; // dg (32268)
/** Detect puts the spout on the free rim stone furthest along -VIEW_DIR and the sign off to the SIDE_DIR side. */
const VIEW_DIR = { x: Math.SQRT1_2, z: Math.SQRT1_2 }; // fg (32269)
const SIDE_DIR = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }; // pg (32270)
const SPOUT_RADIUS = 0.25; // mg (32271)

/** Merges the position and normal attributes of the geometries into one non-indexed geometry. */
function mergePositionsNormals(geos: THREE.BufferGeometry[]): THREE.BufferGeometry { // gg (32751)
  const pos: number[] = [];
  const nor: number[] = [];
  for (const g of geos) {
    const flat = g.index ? g.toNonIndexed() : g;
    const p = flat.attributes.position.array;
    const n = flat.attributes.normal.array;
    for (let k = 0; k < p.length; k++) {
      pos.push(p[k]);
      nor.push(n[k]);
    }
    if (flat !== g) flat.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute(`position`, new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute(`normal`, new THREE.Float32BufferAttribute(nor, 3));
  out.computeBoundingSphere();
  return out;
}

export const HOT_SPRING: LandmarkDef = { // hg (32272)
  id: `hot_spring`,
  name: `Hot spring`,
  icon: `♨️`,
  tint: `#d9e8f0`,
  blurb: `A steaming stone pool with a trickling bamboo spout. Loveliest on a snowy night.`,
  hint: `Dig a pool at least three corners big and wall it all round with stone. Mind the steam!`,
  priority: 42,
  max: 1,
  detect(ctx) {
    const out: (LandmarkPlacement & { score: number })[] = [];
    const lanterns = ctx.habitat.features.filter((f) => f.type === `lantern`);
    const nearLantern = (x: number, z: number, r: number) => lanterns.some((f) => (f.x - x) ** 2 + (f.z - z) ** 2 < r * r);
    const blockers = ctx.habitat.features.map((f) => ({
      x: f.x,
      z: f.z,
      r: f.type === `fence` || f.type === `bridge` ? 0.9 : 0.55,
    }));
    const paths: number[][] = [];
    for (const f of ctx.habitat.features) {
      if (f.type !== `stepping_stone`) continue;
      const ids = f.id.split(`:`)[1]?.split(`-`).map(Number) ?? [];
      if (ids.length >= 2 && ids.every((c) => Number.isFinite(c) && c >= 0 && c < ctx.grid.corners.length)) paths.push(ids);
    }
    /** True when (x, z) is within 0.3 of a stepping-stone path. */
    const onPath = (x: number, z: number) => {
      for (const path of paths)
        for (let k = 0; k < path.length - 1; k++) {
          const a = ctx.grid.corners[path[k]];
          const b = ctx.grid.corners[path[k + 1]];
          const dx = b.x - a.x;
          const dz = b.z - a.z;
          const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
          if (Math.hypot(x - a.x - dx * t, z - a.z - dz * t) < 0.3) return !0;
        }
      return !1;
    };
    for (const pond of ctx.ponds) {
      const water = pond.corners;
      if (water.length < 3 || water.length > 10) continue;
      const inPond = new Set(water);
      const rim = new Set<number>();
      let walled = !0;
      for (const c of water) {
        for (const n of ctx.nbrs(c))
          if (!inPond.has(n)) {
            if (ctx.rim(n) || !ctx.land(n) || ctx.mat(n) !== `stone`) {
              walled = !1;
              break;
            }
            rim.add(n);
          }
        if (!walled) break;
      }
      if (!walled || rim.size < 3) continue;
      const centre = ctx.centroid(water);
      /** Corner position relative to the pond centre; y above the water. */
      const rel = (c: number) => {
        const top = ctx.top(c);
        return { x: top.x - centre.x, z: top.z - centre.z, y: top.y - CONFIG.WATER_Y };
      };
      const data: LandmarkData = {};
      data.wn = water.length;
      water.forEach((c, k) => {
        const r = rel(c);
        data[`w${k}x`] = round2(r.x);
        data[`w${k}z`] = round2(r.z);
      });
      const rimSorted = [...rim].sort((a, b) => a - b);
      // Spout: the free rim stone nearest the viewer.
      let spout = -1;
      let spoutScore = 1 / 0;
      for (const c of rimSorted) {
        const r = rel(c);
        const wx = centre.x + r.x;
        const wz = centre.z + r.z;
        if (blockers.some((b) => (b.x - wx) ** 2 + (b.z - wz) ** 2 < (b.r + SPOUT_RADIUS + 0.05) ** 2) || onPath(wx, wz)) continue;
        const s = r.x * VIEW_DIR.x + r.z * VIEW_DIR.z + ctx.h01(c, 4506) * 0.05;
        if (s < spoutScore) {
          spoutScore = s;
          spout = c;
        }
      }
      if (spout < 0) continue;
      // The water corner the spout pours into.
      let pour = water[0];
      let pourDist = 1 / 0;
      for (const n of ctx.nbrs(spout)) {
        if (!inPond.has(n)) continue;
        const a = rel(n);
        const b = rel(spout);
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (d < pourDist) {
          pourDist = d;
          pour = n;
        }
      }
      const s = rel(spout);
      const pr = rel(pour);
      data.sx = round2(s.x);
      data.sz = round2(s.z);
      data.sy = round2(s.y);
      data.px = round2(pr.x);
      data.pz = round2(pr.z);
      // Sign and towel bucket: a rim stone away from the spout, to the side.
      let sign = -1;
      let signScore = -1 / 0;
      for (const c of rimSorted) {
        if (c === spout) continue;
        const r = rel(c);
        if (
          Math.hypot(r.x - s.x, r.z - s.z) < 1.2 ||
          nearLantern(centre.x + r.x, centre.z + r.z, 0.8) ||
          onPath(centre.x + r.x, centre.z + r.z)
        )
          continue;
        const score = Math.abs(r.x * SIDE_DIR.x + r.z * SIDE_DIR.z) + (r.x * VIEW_DIR.x + r.z * VIEW_DIR.z) * 0.35;
        if (score > signScore) {
          signScore = score;
          sign = c;
        }
      }
      if (sign >= 0) {
        const r = rel(sign);
        const d = Math.hypot(r.x, r.z) || 1;
        data.gx = round2(r.x + (r.x / d) * 0.12);
        data.gz = round2(r.z + (r.z / d) * 0.12);
        data.gy = round2(r.y);
      }
      // Rocks on the rim edges, spaced out and clear of the spout, the sign, lanterns and paths.
      const rocks: { x: number; z: number }[] = [];
      for (const c of water) {
        const a = rel(c);
        for (const n of ctx.nbrs(c)) {
          if (inPond.has(n)) continue;
          const b = rel(n);
          const x = a.x + (b.x - a.x) * 0.5;
          const z = a.z + (b.z - a.z) * 0.5;
          if (
            !(
              rocks.some((q) => (q.x - x) ** 2 + (q.z - z) ** 2 < 0.42 * 0.42) ||
              Math.hypot(x - s.x, z - s.z) < 0.45 ||
              (data.gx !== void 0 && Math.hypot(x - data.gx, z - data.gz) < 0.4) ||
              nearLantern(centre.x + x, centre.z + z, 0.5) ||
              onPath(centre.x + x, centre.z + z)
            )
          )
            rocks.push({ x, z });
        }
      }
      rocks.sort(
        (a, b) =>
          ctx.h01(Math.round(a.x * 100), Math.round(a.z * 100), 7) - ctx.h01(Math.round(b.x * 100), Math.round(b.z * 100), 7),
      );
      const rn = Math.min(9, rocks.length);
      data.rn = rn;
      for (let k = 0; k < rn; k++) {
        data[`r${k}x`] = round2(rocks[k].x);
        data[`r${k}z`] = round2(rocks[k].z);
      }
      out.push({
        key: `hot_spring:${Math.min(...water)}`,
        x: centre.x + s.x,
        y: CONFIG.WATER_Y + s.y,
        z: centre.z + s.z,
        rotY: 0,
        radius: SPOUT_RADIUS,
        clear: 0.45,
        data,
        score: -water.length + ctx.h01(Math.min(...water), 4505) * 0.5,
      });
    }
    out.sort((a, b) => a.score - b.score);
    return out;
  },
  build(p, seed) {
    const mats = landmarkMaterials();
    const data = p.data ?? {};
    const rng = new Rng(seed ^ hashString(p.key));
    const kit = new MeshKit(rng);
    const f = new KitFrame(kit);
    // The placement sits at the spout; everything below is built in pond-centre space and shifted by (-sx, -sy, -sz).
    const rn = data.rn ?? 0;
    for (let k = 0; k < rn; k++) {
      const x = data[`r${k}x`];
      const z = data[`r${k}z`];
      const s = 0.15 + rng.next() * 0.07;
      const color = shadeColor(rng.pick(ROCK_COLORS), rng.range(-0.04, 0.03));
      f.blob(s, x, 0.1, z, color, { detail: 1, sc: [1.2, 0.78, 1], yaw: rng.next() * TAU, grad: 0.45 });
      if (rng.chance(0.55)) {
        const a = rng.next() * TAU;
        f.blob(s * 0.6, x + Math.sin(a) * s * 0.9, 0.07, z + Math.cos(a) * s * 0.9, shadeColor(color, 0.03), {
          detail: 1,
          sc: [1.1, 0.75, 1],
          grad: 0.4,
        });
      }
      if (rng.chance(0.6))
        f.blob(s * 0.55, x + rng.range(-0.04, 0.04), 0.1 + s * 0.66, z, rng.chance(0.5) ? PALETTE.leafDark : `#6f9a4a`, {
          detail: 0,
          sc: [1.3, 0.35, 1.1],
          grad: 0.1,
        });
    }
    const sx = data.sx ?? 0; // l
    const sz = data.sz ?? -1; // u
    const sy = data.sy ?? 0.25; // d
    const dx = (data.px ?? 0) - sx;
    const dz = (data.pz ?? 0) - sz;
    const pourDist = Math.hypot(dx, dz) || 1;
    const spoutYaw = Math.atan2(dx, dz); // h
    const reach = Math.min(0.78, pourDist * 0.5 + 0.2); // g
    // Bamboo spout on two stones.
    f.frame(sx, sy, sz, spoutYaw);
    f.blob(0.13, -0.03, 0.03, -0.06, rng.pick(ROCK_COLORS), { detail: 1, sc: [1.25, 0.7, 1], grad: 0.4 });
    f.blob(0.09, 0.1, 0.02, 0.03, rng.pick(ROCK_COLORS), { detail: 1, sc: [1.2, 0.65, 1], grad: 0.4 });
    f.cyl(0.046, 0.05, 0.58, 7, 0, 0, -0.08, BAMBOO, { grad: 0.2 });
    for (const y of [0.16, 0.34, 0.52]) f.cyl(0.054, 0.054, 0.024, 7, 0, y, -0.08, BAMBOO_RING, { grad: 0 });
    f.cyl(0.038, 0.038, 0.012, 7, 0, 0.58, -0.08, `#e6dcb0`, { grad: 0 });
    const lipY = 0.4; // _
    f.tube(0, 0.5, -0.16, 0, lipY, reach, 0.036, 0.034, 7, BAMBOO, { grad: 0.1 });
    for (const t of [0.3, 0.65]) {
      const z = -0.16 + (reach + 0.16) * t;
      const y = 0.5 + -0.09999999999999998 * t;
      f.tube(0, y, z - 0.012, 0, y - 0.003, z + 0.012, 0.041, 0.041, 7, BAMBOO_RING, { grad: 0 });
    }
    f.box(0.11, 0.035, 0.06, 0, 0.49, -0.08, `#c9a66b`, { bevel: 0.01 });
    f.frame();
    if (data.gx !== void 0) {
      // Sign post with a red onsen mark, a wash bucket and a folded towel.
      const gx = data.gx;
      const gz = data.gz;
      const gy = data.gy ?? 0.25;
      f.frame(gx, gy, gz, Math.PI / 4);
      f.box(0.05, 0.5, 0.05, 0, 0.25, 0, PALETTE.woodDark, { bevel: 0.012, grad: 0.3 });
      f.box(0.34, 0.22, 0.035, 0, 0.52, 0.035, `#ead6ad`, { bevel: 0.012, grad: 0.1, ao: !1 });
      f.box(0.36, 0.03, 0.05, 0, 0.64, 0.035, PALETTE.wood, { bevel: 0.01, ao: !1 });
      f.box(0.22, 0.02, 0.1, -0.09, 0.675, 0.035, `#6d5a4c`, { roll: 0.42, bevel: 0.006, ao: !1 });
      f.box(0.22, 0.02, 0.1, 0.09, 0.675, 0.035, `#6d5a4c`, { roll: -0.42, bevel: 0.006, ao: !1 });
      f.ring(0.07, 0.011, 3, 10, 0, 0.49, 0.056, SIGN_RED, { pitch: Math.PI / 2, arc: Math.PI, grad: 0, ao: !1 });
      for (const x of [-0.05, 0, 0.05])
        for (let k = 0; k < 3; k++) {
          const y = 0.5 + k * 0.035;
          const roll = k % 2 ? -0.35 : 0.35;
          f.box(0.012, 0.04, 0.008, x + (k % 2 ? 0.006 : -0.006), y + 0.02, 0.056, SIGN_RED, {
            roll,
            bevel: 0.002,
            grad: 0,
            ao: !1,
            jitter: 0,
          });
        }
      f.lathe(
        [
          [0.001, 0],
          [0.075, 0],
          [0.085, 0.12],
          [0.074, 0.12],
          [0.066, 0.02],
          [0.001, 0.02],
        ],
        10,
        0.2,
        0,
        0.05,
        `#caa06a`,
        { grad: 0.25 },
      );
      f.ring(0.08, 0.008, 3, 12, 0.2, 0.03, 0.05, `#5a4a40`, { grad: 0 });
      f.ring(0.084, 0.008, 3, 12, 0.2, 0.1, 0.05, `#5a4a40`, { grad: 0 });
      f.cyl(0.07, 0.07, 0.006, 10, 0.2, 0.09, 0.05, `#8fd3cf`, { grad: 0, ao: !1 });
      f.blob(0.1, -0.2, 0.025, 0.05, rng.pick(ROCK_COLORS), { detail: 1, sc: [1.2, 0.4, 1], grad: 0.3 });
      f.box(0.14, 0.035, 0.09, -0.2, 0.075, 0.05, `#f3e6ea`, { bevel: 0.014, grad: 0.05, yaw: 0.2 });
      f.box(0.14, 0.012, 0.03, -0.2, 0.078, 0.05, `#e8a5b3`, { bevel: 0.004, grad: 0, yaw: 0.2 });
      f.frame();
    }
    const root = new THREE.Group(); // v
    const pond = new THREE.Group(); // y: pond-centre space
    pond.position.set(-sx, -sy, -sz);
    root.add(pond);
    pond.add(landmarkMesh(kit.build(), mats.base));
    // The trickle of water from the spout lip down to the pool.
    const streamKit = new MeshKit(rng);
    const sf = new KitFrame(streamKit);
    sf.frame(sx, sy, sz, spoutYaw);
    const fall = sy + lipY; // S
    const arc: number[][] = [];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6;
      arc.push([reach + 0.02 + 0.09 * Math.sqrt(t), lipY - fall * t * t * 0.4 - fall * t * 0.6]);
    }
    for (let k = 0; k < arc.length - 1; k++)
      sf.tube(0, arc[k][1], arc[k][0], 0, arc[k + 1][1], arc[k + 1][0], 0.02 - k * 0.001, 0.02 - (k + 1) * 0.001, 6, `#ffffff`, {
        ao: !1,
        grad: 0,
        jitter: 0,
      });
    const stream = landmarkMesh(streamKit.build(), mats.water, !1); // T
    pond.add(stream);
    // Splash ring where the trickle lands, and four ripple rings for pokes.
    const splashAt = { x: sx + Math.sin(spoutYaw) * (reach + 0.11), z: sz + Math.cos(spoutYaw) * (reach + 0.11) }; // E
    const splashMat = new THREE.MeshBasicMaterial({ color: `#f4fbf8`, transparent: !0, opacity: 0, depthWrite: !1 }); // D
    const splash = new THREE.Mesh(new THREE.TorusGeometry(1, 0.08, 3, 20).rotateX(Math.PI / 2), splashMat); // O
    splash.position.set(splashAt.x, 0.03, splashAt.z);
    pond.add(splash);
    const rippleGeo = new THREE.TorusGeometry(1, 0.07, 3, 28).rotateX(Math.PI / 2); // k
    const ripples: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; delay: number; big: number }[] = []; // A
    for (let k = 0; k < 4; k++) {
      const mat = new THREE.MeshBasicMaterial({ color: `#f4fbf8`, transparent: !0, opacity: 0, depthWrite: !1 });
      const m = new THREE.Mesh(rippleGeo, mat);
      m.visible = !1;
      m.raycast = () => void 0;
      pond.add(m);
      ripples.push({ m, mat, t: 1 / 0, delay: 0, big: 1 });
    }
    let nextRipple = 0; // j
    // Yuzu fruit that float on the pool in winter and snow.
    const yuzuKit = new MeshKit(rng); // M
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + rng.next() * 0.8;
      const r = 0.12 + rng.next() * 0.22;
      yuzuKit.blob(0.052, Math.sin(a) * r, 0.03, Math.cos(a) * r, rng.chance(0.3) ? `#f2b53a` : `#f4cf45`, {
        detail: 1,
        grad: 0.1,
        ao: !1,
        smooth: !0,
      });
      yuzuKit.blob(0.012, Math.sin(a) * r, 0.08, Math.cos(a) * r, PALETTE.leafDark, { detail: 0, grad: 0, ao: !1 });
    }
    const yuzu = landmarkMesh(yuzuKit.build(), mats.base, !1); // N
    pond.add(yuzu);
    // Water surface: a disc under each water corner, merged.
    const wn = data.wn ?? 0; // P
    const discs: THREE.BufferGeometry[] = []; // F
    for (let k = 0; k < wn; k++)
      discs.push(new THREE.CircleGeometry(0.8, 18).rotateX(-Math.PI / 2).translate(data[`w${k}x`], 0.022, data[`w${k}z`]));
    const waterGeo = mergePositionsNormals(discs); // I
    for (const g of discs) g.dispose();
    const waterMat = patchWorldMaterial( // L
      new THREE.MeshStandardMaterial({
        color: `#94d8cb`,
        emissive: new THREE.Color(`#3f9f98`),
        emissiveIntensity: 0.32,
        roughness: 0.18,
        metalness: 0,
      }),
      {
        fragment: `
          float onsenA = sc_noise(vScWorldPos.xz * 3.2 + vec2(uTime * 0.23, -uTime * 0.17));
          float onsenB = sc_noise(vScWorldPos.xz * 7.0 - vec2(uTime * 0.31, uTime * 0.2));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.9, 0.97, 0.95), smoothstep(0.62, 0.95, onsenA * 0.6 + onsenB * 0.5) * 0.55);
          diffuseColor.rgb *= 0.94 + 0.08 * onsenB;`,
        cacheKey: `stone-onsen`,
      },
    );
    const water = new THREE.Mesh(waterGeo, waterMat); // R
    water.receiveShadow = !0;
    pond.add(water);
    const steam = smokePuffs(96, `#f5f7fb`, 1.35, 1.1); // z
    pond.add(steam.mesh);
    const steamUniforms = steam.mesh.material.uniforms; // te
    const steamDay = new THREE.Color(`#ffffff`); // ne
    const steamNight = new THREE.Color(`#c4cbe8`); // re
    const ventCount = Math.max(1, data.wn ?? 1); // B
    const ventX = new Float32Array(ventCount); // ie
    const ventZ = new Float32Array(ventCount); // ae
    for (let k = 0; k < ventCount; k++) {
      ventX[k] = data[`w${k}x`] ?? 0;
      ventZ[k] = data[`w${k}z`] ?? 0;
    }
    const rand = new XorShift(seed ^ hashString(p.key) ^ 22506); // V
    const wind = { x: 0, z: 0 }; // oe
    const surge = new Spring(110, 6); // se
    const glow = new Spring(60, 7); // ce
    const bob = new Spring(70, 4); // le
    const droplets = new SparkPoints(40, !1); // ue
    pond.add(droplets.points);
    const local = new THREE.Vector3(); // de
    let steamAcc = 0; // fe
    let steaminess = 0.5; // pe
    let splashPhase = 0; // me
    let yuzuShow = 0; // ge
    return {
      object: root,
      update(ctx) {
        const dt = Math.min(ctx.dt, 0.05);
        const time = ctx.realTime;
        const clock = ctx.time;
        const winter = wintriness(clock.yearFrac);
        const want = Math.min(1.25, 0.5 + 0.45 * winter + 0.35 * ctx.night + 0.25 * clock.snow + (clock.phase === `dawn` ? 0.15 : 0));
        for (
          steaminess = damp(steaminess, want, 0.8, dt),
            steamUniforms.uOpacity.value = 0.8 + 0.4 * Math.min(1, steaminess),
            steamUniforms.uColor.value.copy(steamDay).lerp(steamNight, ctx.night),
            localWind(ctx, 0, wind),
            steamAcc += dt * (3 + 9 * steaminess);
          steamAcc >= 1;

        ) {
          --steamAcc;
          const i = steam.free();
          if (i < 0) break;
          const v = Math.floor(rand.next() * ventCount) % ventCount;
          steam.x[i] = ventX[v] + (rand.next() - 0.5) * 0.7;
          steam.z[i] = ventZ[v] + (rand.next() - 0.5) * 0.7;
          steam.y[i] = 0.06;
          steam.vy[i] = 0.3 + rand.next() * 0.16;
          steam.age[i] = 0;
          steam.life[i] = 2.8 + rand.next() * 1.6;
          steam.size[i] = (0.26 + rand.next() * 0.16) * (0.7 + 0.4 * Math.min(1, steaminess));
          steam.rnd[i] = rand.next() * TAU;
        }
        for (let i = 0; i < steam.n; i++) {
          if (!steam.alive(i)) continue;
          steam.age[i] += dt;
          const k = steam.age[i] / steam.life[i];
          if (k >= 1) {
            steam.kill(i);
            continue;
          }
          steam.x[i] += (wind.x * 0.22 * k + Math.sin(time * 0.9 + steam.rnd[i]) * 0.05) * dt;
          steam.z[i] += (wind.z * 0.22 * k + Math.cos(time * 0.7 + steam.rnd[i] * 1.3) * 0.05) * dt;
          steam.y[i] += steam.vy[i] * dt * (1 - k * 0.4);
          const size = steam.size[i] * (0.5 + 1.3 * Math.sqrt(k));
          const alpha = Math.min(1, k * 3.5) * (1 - k) * (1 - k) * 1.45;
          steam.write(i, steam.x[i], steam.y[i], steam.z[i], size, alpha);
        }
        steam.flush();
        splashPhase = (splashPhase + dt / 0.85) % 1;
        const s = 0.04 + splashPhase * 0.16;
        splash.scale.set(s, 1, s);
        splashMat.opacity = 0.55 * (1 - splashPhase);
        {
          const lift = surge.update(dt);
          water.position.y = Math.max(-0.012, Math.min(0.05, lift));
          waterMat.emissiveIntensity = 0.32 + Math.max(0, glow.update(dt)) * 0.9;
          for (let k = 0; k < 4; k++) {
            const r = ripples[k];
            if (r.t === 1 / 0) continue;
            r.t += dt;
            const u = (r.t - r.delay) / 1.15;
            if (u < 0) continue;
            if (u >= 1) {
              r.t = 1 / 0;
              r.m.visible = !1;
              continue;
            }
            const sc = 0.06 + (1 - (1 - u) * (1 - u)) * 0.5 * r.big;
            r.m.visible = !0;
            r.m.scale.set(sc, 1, sc);
            r.mat.opacity = 0.7 * (1 - u) * Math.min(1, u * 10);
          }
          droplets.update(dt);
        }
        yuzuShow = damp(yuzuShow, +(winter > 0.72 || clock.snow > 0.2), 1.2, dt);
        yuzu.visible = yuzuShow > 0.02;
        yuzu.scale.setScalar(Math.max(0.001, yuzuShow));
        yuzu.position.y = Math.sin(time * 1.4) * 0.008 + bob.update(dt);
        yuzu.rotation.y = Math.sin(time * 0.15) * 0.4;
      },
      poke(poke) {
        const count = Math.min(3, Math.max(1, poke.count));
        pond.worldToLocal(local.set(poke.point.x, poke.point.y, poke.point.z));
        let nearest = 0;
        let best = 1 / 0;
        for (let k = 0; k < ventCount; k++) {
          const d = (ventX[k] - local.x) ** 2 + (ventZ[k] - local.z) ** 2;
          if (d < best) {
            best = d;
            nearest = k;
          }
        }
        const inside = best < 0.7 * 0.7;
        const rx = inside ? local.x : ventX[nearest];
        const rz = inside ? local.z : ventZ[nearest];
        surge.kick(0.5 + 0.35 * count);
        glow.kick(5 + 3 * count);
        bob.kick(0.35 + 0.15 * count);
        const rings = count === 1 ? 2 : count === 2 ? 3 : 4;
        for (let k = 0; k < rings; k++) {
          const r = ripples[nextRipple];
          nextRipple = (nextRipple + 1) % 4;
          r.m.position.set(rx, 0.035, rz);
          r.t = 0;
          r.delay = k * 0.16;
          r.big = 1 + 0.3 * count;
          r.mat.opacity = 0;
        }
        const puffs = count === 1 ? 8 : count === 2 ? 11 : 14;
        for (let k = 0; k < puffs; k++) {
          const i = steam.free();
          if (i < 0) break;
          const v = Math.floor(rand.next() * ventCount) % ventCount;
          steam.x[i] = ventX[v] + (rand.next() - 0.5) * 0.8;
          steam.z[i] = ventZ[v] + (rand.next() - 0.5) * 0.8;
          steam.y[i] = 0.05 + rand.next() * 0.05;
          steam.vy[i] = 0.55 + rand.next() * (0.35 + 0.15 * count);
          steam.age[i] = 0;
          steam.life[i] = 2.2 + rand.next() * 1.4;
          steam.size[i] = 0.38 + rand.next() * 0.22 + count * 0.05;
          steam.rnd[i] = rand.next() * TAU;
        }
        const drops = count === 1 ? 7 : count === 2 ? 12 : 20;
        for (let k = 0; k < drops; k++) {
          const v = Math.floor(rand.next() * ventCount) % ventCount;
          const x = ventX[v] + (rand.next() - 0.5) * 0.9;
          const z = ventZ[v] + (rand.next() - 0.5) * 0.9;
          droplets.emit(
            x,
            0.03,
            z,
            (rand.next() - 0.5) * 0.15,
            0.35 + rand.next() * 0.5,
            (rand.next() - 0.5) * 0.15,
            0.45 + rand.next() * 0.5,
            0.05 + rand.next() * 0.05,
            0.93,
            1,
            0.98,
            { a: 0.85, gravity: -0.2, drag: 0.5, grow: 1.5 },
          );
        }
        return !0;
      },
      dispose() {
        for (const obj of [pond.children[0], stream, yuzu]) (obj as THREE.Mesh).geometry.dispose();
        rippleGeo.dispose();
        for (const r of ripples) r.mat.dispose();
        droplets.dispose();
        splash.geometry.dispose();
        waterGeo.dispose();
        waterMat.dispose();
        splashMat.dispose();
        steam.dispose();
      },
    };
  },
};
