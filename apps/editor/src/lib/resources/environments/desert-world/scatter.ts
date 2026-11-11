// The desert scatter, built in code (random generator mulberry32(42)). The whole
// random sequence runs as in the game, so each piece is where the game puts it; only the pieces
// inside the crop become geometry.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { biomeAt, type BiomeWeights } from "./height";
import { Batch, flatTube, paint, taperTube, terraces, V3, warp } from "./kit";
import { mulberry32, type Rng } from "./noise";
import {
  DESERT_SITES,
  keepersWay,
  markedStones,
  OBSERVATORY,
  processionLoop,
  QANAT_SITES,
  ridePoints,
  ROSE_HOUSE,
  SANDFALL_MESAS,
  TELEGRAPH,
  vistaWedge
} from "./sites";

export type Ground = { heightAt(x: number, z: number): number; baseAt(x: number, z: number, r: number): number };
/** True when a piece at (x, z) with radius r touches the crop. */
export type InCrop = (x: number, z: number, r: number) => boolean;

export type InstanceSet = { matrices: THREE.Matrix4[]; colors: THREE.Color[] };
export type ScatterResult = { rocks: InstanceSet; spikes: InstanceSet; scrub: InstanceSet; pieces: string[] };

const BONE = "#f2ead6";
const BONE2 = "#e9dec4";
const BONE_DARK = "#7a6857";
const RIB_REACH = { x: -5, z: 23.75 };

/** A strata palette index from the scatter random sequence (the game's strataMaterial). */
const strataPalette = (rng: Rng) => Math.floor(rng() * 4);

export function scatterDesert(ground: Ground, inCrop: InCrop, batch: Batch): ScatterResult {
  const rng = mulberry32(42);
  const pieces: string[] = [];
  const keepOut: { x: number; z: number; r: number }[] = [
    { x: -430, z: -180, r: 120 },
    { x: -430, z: -470, r: 90 },
    { x: OBSERVATORY.x, z: OBSERVATORY.z, r: OBSERVATORY.radius }
  ];
  for (const s of Object.values(DESERT_SITES)) keepOut.push({ x: s.x, z: s.z, r: s.r });
  for (let i = 0; i <= 8; i++) {
    const [[ax, az], [bx, bz]] = TELEGRAPH;
    keepOut.push({ x: ax + ((bx - ax) * i) / 8, z: az + ((bz - az) * i) / 8, r: 6 });
  }
  const clear: { x: number; z: number; r: number }[] = [
    { x: QANAT_SITES.city.x, z: QANAT_SITES.city.z, r: 150 },
    { x: QANAT_SITES.camps.x, z: QANAT_SITES.camps.z, r: 70 },
    { x: QANAT_SITES.giant.x, z: QANAT_SITES.giant.z, r: 70 },
    { x: QANAT_SITES.pilgrim.x, z: QANAT_SITES.pilgrim.z, r: 18 },
    { x: QANAT_SITES.bike.x, z: QANAT_SITES.bike.z, r: 16 },
    { x: QANAT_SITES.hearth.x, z: QANAT_SITES.hearth.z, r: 60 }
  ];
  for (const [x, z] of processionLoop(10)) clear.push({ x, z, r: 12 });
  for (const [x, z] of markedStones()) clear.push({ x, z, r: 5 });
  for (const { x, z } of keepersWay()) clear.push({ x, z, r: 5 });
  for (const { x, z } of ridePoints()) clear.push({ x, z, r: 14 });
  const vista = vistaWedge(
    { ...ROSE_HOUSE, heading: Math.atan2(QANAT_SITES.city.x - ROSE_HOUSE.x, QANAT_SITES.city.z - ROSE_HOUSE.z) },
    { width: 240, front: 400, back: 280 }
  );
  const inClear = (x: number, z: number, r = 0) => {
    if (vista(x, z, r)) return true;
    for (const c of clear) if ((c.x - x) ** 2 + (c.z - z) ** 2 < (c.r + r) ** 2) return true;
    return false;
  };
  /** The game adds a piece when it is not in a clear zone (big mesas next to a sandfall mesa always). */
  const shown = (x: number, z: number, r: number) =>
    (!inClear(x, z, r) || (r > 25 && SANDFALL_MESAS.some((m) => Math.hypot(x - m.mesa[0], z - m.mesa[1]) < 12))) && inCrop(x, z, r);
  const free = (x: number, z: number, r: number) => {
    if (Math.hypot(x, z) < 190 + r || Math.max(Math.abs(x), Math.abs(z)) > 1500) return false;
    for (const k of keepOut) if (Math.hypot(k.x - x, k.z - z) < k.r + r + 10) return false;
    return true;
  };
  const spot = (r: number, weight: (b: BiomeWeights) => number = () => 1, tries = 80): [number, number] | null => {
    for (let i = 0; i < tries; i++) {
      const x = (rng() * 2 - 1) * 1450;
      const z = (rng() * 2 - 1) * 1450;
      if (!(rng() > weight(biomeAt(x, z))) && free(x, z, r)) return [x, z];
    }
    return null;
  };
  const roseWeight = (b: BiomeWeights) => 0.35 + 0.65 * b.rose - 0.25 * b.salt;
  const saltWeight = (b: BiomeWeights) => 0.3 + 0.7 * b.salt;
  const SLAB_COLORS = ["#f3ead8", "#58b4a8", "#e57f5b"];

  function mesa(x: number, z: number, r: number, h: number) {
    const steps = 3 + Math.floor(rng() * 3);
    const shrink = 0.25 + rng() * 0.2;
    const seed = rng() * 100;
    const size = 3 + rng() * 4;
    const pal = strataPalette(rng);
    const yaw = rng() * Math.PI;
    if (shown(x, z, r)) {
      const g = new THREE.CylinderGeometry(r * 0.8, r, h, 13, 8);
      terraces(g, h, steps, shrink);
      warp(g, 0.16, 0.012, seed);
      const y = ground.baseAt(x, z, r);
      g.rotateY(yaw).translate(x, y + h / 2 - 2, z);
      batch.add("solid", g, "#ffffff", { strata: [pal, size] });
      pieces.push(`mesa ${x.toFixed(0)},${z.toFixed(0)} r${r.toFixed(0)}`);
    }
    keepOut.push({ x, z, r: r * 1.02 });
  }

  function pillar(x: number, z: number, s: number) {
    const h = 18 * s + rng() * 14 * s;
    const seedA = rng() * 100;
    const cr = (8 + rng() * 6) * s;
    const ch = (4 + rng() * 3) * s;
    const seedB = rng() * 100;
    const ox = (rng() - 0.5) * 2 * s;
    const oz = (rng() - 0.5) * 2 * s;
    const size = 1.6 + rng() * 2;
    const pal = strataPalette(rng);
    const rx = (rng() - 0.5) * 0.12;
    const ry = rng() * Math.PI;
    const rz = (rng() - 0.5) * 0.12;
    if (shown(x, z, cr)) {
      const stem = new THREE.CylinderGeometry(2.2 * s, 4.5 * s, h, 9, 5);
      stem.translate(0, h / 2, 0);
      warp(stem, 0.2, 0.08, seedA);
      const cap = new THREE.CylinderGeometry(cr * 0.85, cr * 0.55, ch, 11, 2);
      warp(cap, 0.18, 0.1, seedB);
      cap.translate(ox, h + ch / 2 - 0.5, oz);
      const g = mergeGeometries([stem, cap])!;
      const m = new THREE.Mesh(g);
      m.position.set(x, ground.baseAt(x, z, 4 * s) - 1, z);
      m.rotation.set(rx, ry, rz);
      batch.addMesh("solid", m, "#ffffff", { strata: [pal, size] });
      pieces.push(`pillar ${x.toFixed(0)},${z.toFixed(0)}`);
    }
    keepOut.push({ x, z, r: 4.2 * s });
  }

  function arch(x: number, z: number, r: number, thick: number) {
    const size = 2.5 + rng() * 2;
    const pal = strataPalette(rng);
    const yaw = rng() * Math.PI;
    if (shown(x, z, r + thick)) {
      const g = new THREE.TorusGeometry(r, thick, 7, 22, Math.PI);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i);
        const py = p.getY(i);
        const pz = p.getZ(i);
        const a = Math.atan2(py, px);
        const cx = Math.cos(a) * r;
        const cy = Math.sin(a) * r;
        const k = 1.35 - 0.6 * Math.sin(Math.max(a, 0));
        p.setXYZ(i, cx + (px - cx) * k, cy + (py - cy) * k, pz * k);
      }
      const m = new THREE.Mesh(g);
      m.position.set(x, ground.baseAt(x, z, r) - thick, z);
      m.rotation.y = yaw;
      batch.addMesh("solid", m, "#ffffff", { strata: [pal, size] });
      pieces.push(`arch ${x.toFixed(0)},${z.toFixed(0)}`);
    }
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    keepOut.push({ x: x + c * r, z: z - s * r, r: thick * 1.35 });
    keepOut.push({ x: x - c * r, z: z + s * r, r: thick * 1.35 });
  }

  function stoneRing(cx: number, cz: number, r: number) {
    const n = 7 + Math.floor(rng() * 6);
    for (let i = 0; i < n; i++) {
      if (rng() < 0.15) continue;
      const a = (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      const h = 14 + rng() * 18;
      const w = 4 + rng() * 2;
      const d = 2.5 + rng();
      const color = SLAB_COLORS[rng() < 0.75 ? 0 : 1 + Math.floor(rng() * 2)];
      const rx = (rng() - 0.5) * 0.25;
      const rz = (rng() - 0.5) * 0.25;
      if (shown(x, z, 3)) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d).translate(0, h / 2, 0));
        m.position.set(x, ground.baseAt(x, z, 3) - 1.5, z);
        m.rotation.set(rx, -a + Math.PI / 2, rz);
        batch.addMesh("solid", m, color);
      }
      keepOut.push({ x, z, r: 3 });
    }
    for (let i = 0; i < 2; i++) {
      const a = rng() * Math.PI * 2;
      const x = cx + Math.cos(a) * (r + 6);
      const z = cz + Math.sin(a) * (r + 6);
      const color = ["#d9643a", "#58b4a8", "#f2c54b"][Math.floor(rng() * 3)];
      if (!inClear(x, z, 2) && inCrop(x, z, 2)) {
        const y = ground.heightAt(x, z);
        batch.add("solid", new THREE.CylinderGeometry(0.15, 0.2, 12, 5).translate(x, y + 5.5, z), "#34405e");
        const cloth = new THREE.PlaneGeometry(1.6, 6, 2, 6).translate(0, -3, 0);
        const cp = cloth.attributes.position;
        for (let k = 0; k < cp.count; k++) {
          const down = -cp.getY(k) / 6;
          cp.setZ(k, cp.getZ(k) + Math.sin(down * 4 + cp.getX(k)) * 0.3 * down + down * down * 0.6);
        }
        batch.add("cloth", cloth.rotateY(a + Math.PI / 2).translate(x + 0.2, y + 11.5, z), color);
      }
    }
    const gemY = ground.heightAt(cx, cz) + 9;
    if (!inClear(cx, cz, r)) {
      const phase = rng() * 10;
      if (inCrop(cx, cz, r)) {
        batch.add("glow", new THREE.IcosahedronGeometry(4, 1).translate(cx, gemY + Math.sin(phase) * 1.2, cz), "#58b4a8");
        pieces.push(`stone ring ${cx.toFixed(0)},${cz.toFixed(0)}`);
      }
    }
  }

  function floatingRock(x: number, z: number, r: number) {
    const h = r * (1.4 + rng());
    const seed = rng() * 100;
    const hasSpire = rng() < 0.6;
    let sx = 0;
    let sz = 0;
    if (hasSpire) {
      sx = (rng() - 0.5) * r * 0.6;
      sz = (rng() - 0.5) * r * 0.6;
    }
    const size = 2 + rng() * 2;
    const pal = strataPalette(rng);
    const lift = 70 + rng() * 90;
    const yaw = rng() * Math.PI;
    rng(); // the float phase
    if (!inCrop(x, z, r)) return;
    const cone = new THREE.ConeGeometry(r, h, 9, 4);
    cone.rotateX(Math.PI);
    cone.translate(0, -h / 2, 0);
    warp(cone, 0.22, 0.05, seed);
    const parts: THREE.BufferGeometry[] = [cone];
    if (hasSpire) parts.push(new THREE.CylinderGeometry(r * 0.12, r * 0.18, r * 1.4, 6).translate(sx, r * 0.7, sz));
    const m = new THREE.Mesh(mergeGeometries(parts.map((g) => g.toNonIndexed()))!);
    m.position.set(x, ground.heightAt(x, z) + lift, z);
    m.rotation.y = yaw;
    batch.addMesh("solid", m, "#ffffff", { strata: [pal, size] });
    pieces.push(`floating rock ${x.toFixed(0)},${z.toFixed(0)}`);
  }

  /** A half-buried ribcage with its skull (its own small generator, not the scatter one). */
  function ribcage(x: number, z: number, s: number, yaw: number) {
    if (!shown(x, z, 70 * s)) return;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
    const gnd = (lx: number, lz: number) => {
      const [wx, wz] = toWorld(lx, lz);
      return ground.heightAt(wx, wz);
    };
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, col: string) => parts.push(paint(g, col));
    let seed = (Math.abs(Math.round(x * 13 + z * 7)) % 997) + 1;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const x0 = -50 * s;
    const x1 = 40 * s;
    const taper = (lx: number) =>
      lx < -28 * s ? THREE.MathUtils.lerp(0.45, 1, (lx - x0) / (-28 * s - x0)) : lx > 26 * s ? THREE.MathUtils.lerp(1, 0.78, (lx - 26 * s) / (x1 - 26 * s)) : 1;
    const spineY = (lx: number) => gnd(lx, 0) + 0.2 * 1.5 * s * taper(lx);
    for (let lx = x0; lx <= x1 + 0.01; lx += 3.2 * s) {
      const t = taper(lx);
      const w = 1.5 * s * t;
      const h = 2.85 * s * t;
      const y = spineY(lx);
      const col = rand() < 0.5 ? BONE : BONE2;
      push(
        new THREE.LatheGeometry(
          (
            [
              [0, -h / 2],
              [w * 0.92, -h / 2],
              [w, -h / 2 + 0.18 * t],
              [w * 0.8, 0],
              [w, h / 2 - 0.18 * t],
              [w * 0.92, h / 2],
              [0, h / 2]
            ] as [number, number][]
          ).map(([a, b]) => new THREE.Vector2(Math.max(a, 0.001), b)),
          8
        )
          .rotateZ(Math.PI / 2)
          .translate(lx, y, 0),
        col
      );
      const spine = 3.2 * s * t * (0.85 + 0.3 * rand());
      push(
        new THREE.CylinderGeometry(0.3 * s * t, 0.75 * s * t, spine, 6)
          .scale(1, 1, 0.5)
          .translate(0, spine / 2, 0)
          .rotateZ(0.32)
          .translate(lx, y + w * 0.7, 0),
        col
      );
    }
    for (let i = 0; i < 9; i++) {
      const lx = -26 * s + 6.5 * s * i;
      const k = 1 - 0.42 * ((i - 4) / 4) ** 2;
      const fx = lx + RIB_REACH.x * s * k;
      const fz = RIB_REACH.z * s * k;
      const rise = 22 * s * k;
      const a = V3(lx, spineY(lx) + 1.1 * s, 1 * s);
      const b = V3(fx, gnd(fx, fz) - 0.9 * s, fz);
      const broken = i === 1;
      const n = broken ? 8 : 14;
      const pts: THREE.Vector3[] = [];
      for (let j = 0; j <= n; j++) {
        const tt = (j / 14) * Math.PI;
        const e = (1 - Math.cos(tt)) / 2;
        pts.push(V3(THREE.MathUtils.lerp(a.x, b.x, e), THREE.MathUtils.lerp(a.y, b.y, e) + rise * Math.sin(tt) ** 0.8, THREE.MathUtils.lerp(a.z, b.z, e)));
      }
      const mid = V3(THREE.MathUtils.lerp(a.x, b.x, 0.5), a.y + rise, THREE.MathUtils.lerp(a.z, b.z, 0.5));
      const up = new THREE.Vector3().crossVectors(mid.clone().sub(a), b.clone().sub(a)).normalize();
      if (up.x < 0) up.negate();
      push(flatTube(new THREE.CatmullRomCurve3(pts), 1.05 * s * (0.85 + 0.15 * k), 0.5 * s, broken ? 14 : 26, up), BONE);
      push(new THREE.SphereGeometry(1.05 * s, 8, 5).scale(1, 0.8, 1).translate(a.x, a.y, a.z), BONE);
    }
    {
      const k = 1.45;
      const hx = x1 + 9 * s;
      const hy = gnd(hx, -0.5 * s);
      const centre = V3(hx, hy + 2.2 * s, -0.5 * s);
      push(new THREE.SphereGeometry(1, 16, 11).scale(7 * s * k, 4.3 * s * k, 4.8 * s * k).rotateZ(-0.18).translate(centre.x, centre.y, centre.z), BONE);
      push(
        taperTube([V3(hx + 6.5 * s, hy + 2.8 * s, -0.4 * s), V3(hx + 13 * s, hy + 2 * s, -0.3 * s), V3(hx + 18 * s, gnd(hx + 18 * s, 0) + 0.8 * s, -0.2 * s)], 4.2 * s, 2.1 * s, 10, 9),
        BONE2
      );
      for (const side of [-1, 1]) {
        const at = (a: number, b: number, d: number) => V3(hx + a * s * k, hy + b * s * k, side * d * s * k - 0.4 * s);
        push(taperTube([at(6.5, 2.6, 1.8), at(7.8, 8, 2.6), at(6.4, 14.5, 3.2), at(2.6, 18.5, 3.4)], 1.3 * s, 0.16 * s, 16, 7), BONE);
      }
      push(new THREE.SphereGeometry(1, 10, 6).scale(1.5 * s * k, 1.1 * s * k, 0.3 * s).translate(hx + 4.5 * s * k, hy + 3.3 * s * k, 2.6 * s * k), BONE_DARK);
    }
    const m = new THREE.Mesh(mergeGeometries(parts)!);
    m.position.set(x, 0, z);
    m.rotation.y = yaw;
    batch.addMesh("solid", m, null, { smooth: true });
    pieces.push(`ribcage ${x.toFixed(0)},${z.toFixed(0)}`);
  }

  /** The keep-out marks along a ribcage. */
  function ribMarks(x: number, z: number, s: number, yaw: number) {
    const len = 120 * s;
    const c = Math.cos(yaw);
    const sn = Math.sin(yaw);
    for (let k = 0; k < 11; k++) {
      const u = 0.12 + (k / 10) * 0.76;
      const kk = Math.sin(Math.PI * u) * 0.8 + 0.2;
      const lx = (u - 0.5) * len - 5 * s;
      for (const side of [-1, 1]) {
        const lz = side * 24 * s * kk;
        keepOut.push({ x: x + lx * c + lz * sn, z: z - lx * sn + lz * c, r: 2 * s });
      }
    }
  }

  // The fixed pieces far from the crop (giant head, ribcage with the drum) use no random numbers,
  // but they keep the later random pieces away.
  keepOut.push({ x: -20, z: -400, r: 40 });
  ribMarks(150, -210, 1, 0.5);
  stoneRing(-170, -120, 22);
  arch(-10, -260, 34, 6);
  mesa(-260, -330, 50, 90);
  mesa(230, -380, 38, 70);
  // The dome city far south-east: only its random numbers and keep-out discs.
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const d = rng() * 110;
    const x = 520 + Math.cos(a) * d;
    const z = -620 + Math.sin(a) * d;
    if (rng() < 0.5) {
      const r = 8 + rng() * 20;
      rng();
      rng();
      keepOut.push({ x, z, r });
    } else {
      rng();
      const r = 1.5 + rng() * 2.5;
      rng();
      rng();
      keepOut.push({ x, z, r: r + 0.5 });
    }
  }
  for (let i = 0; i < 52; i++) {
    const p = spot(60, roseWeight);
    if (p) mesa(p[0], p[1], 25 + rng() * 45, 40 + rng() * 110);
  }
  for (let i = 0; i < 46; i++) {
    const p = spot(12, roseWeight);
    if (p) pillar(p[0], p[1], 0.7 + rng() * 1.2);
  }
  for (let i = 0; i < 14; i++) {
    const p = spot(40, roseWeight);
    if (p) arch(p[0], p[1], 22 + rng() * 26, 4 + rng() * 4);
  }
  for (let i = 0; i < 5; i++) {
    const p = spot(80, saltWeight);
    if (p) {
      const s = 0.8 + rng() * 0.8;
      const yaw = rng() * 6;
      ribcage(p[0], p[1], s, yaw);
      ribMarks(p[0], p[1], s, yaw);
    }
  }
  for (let i = 0; i < 12; i++) {
    const p = spot(30, saltWeight);
    if (p) stoneRing(p[0], p[1], 16 + rng() * 14);
  }
  for (let i = 0; i < 22; i++) floatingRock((rng() * 2 - 1) * 1400, (rng() * 2 - 1) * 1400, 12 + rng() * 26);

  const dummy = new THREE.Object3D();
  const rocks: InstanceSet = { matrices: [], colors: [] };
  {
    const colors = ["#d9a07c", "#c98d70", "#e8c49a", "#b9a3c7"];
    for (let i = 0; i < 2800; i++) {
      const x = (rng() * 2 - 1) * 1500;
      const z = (rng() * 2 - 1) * 1500;
      const s = (0.4 + rng() ** 3 * 6) * (Math.hypot(x, z) < 160 ? 0.25 : 1);
      dummy.rotation.set(rng() * 6, rng() * 6, rng() * 6);
      dummy.scale.set(s * (0.8 + rng() * 0.6), s * (0.5 + rng() * 0.5), s * (0.8 + rng() * 0.6));
      const color = colors[Math.floor(rng() * colors.length)];
      if (inClear(x, z, s) || !inCrop(x, z, s)) continue;
      dummy.position.set(x, ground.heightAt(x, z) + s * 0.3, z);
      dummy.updateMatrix();
      rocks.matrices.push(dummy.matrix.clone());
      rocks.colors.push(new THREE.Color(color));
    }
  }
  const spikes: InstanceSet = { matrices: [], colors: [] };
  {
    const colors = ["#6fa889", "#8fb57a", "#4f9a8f"];
    let k = 0;
    while (k < 4000) {
      const cx = (rng() * 2 - 1) * 1500;
      const cz = (rng() * 2 - 1) * 1500;
      const c = colors[Math.floor(rng() * colors.length)];
      const n = 4 + Math.floor(rng() * 5);
      const size = 0.6 + rng() * 1.4;
      for (let j = 0; j < n && k < 4000; j++, k++) {
        const x = cx + (rng() - 0.5) * 1.2;
        const z = cz + (rng() - 0.5) * 1.2;
        dummy.rotation.set((rng() - 0.5) * 1.1, rng() * 6, (rng() - 0.5) * 1.1);
        dummy.scale.setScalar(size * (0.6 + rng() * 0.6));
        if (inClear(x, z) && Math.hypot(x - QANAT_SITES.city.x, z - QANAT_SITES.city.z) < 80) continue;
        if (!inCrop(x, z, 2)) continue;
        dummy.position.set(x, ground.heightAt(x, z) - 0.1, z);
        dummy.updateMatrix();
        spikes.matrices.push(dummy.matrix.clone());
        spikes.colors.push(new THREE.Color(c));
      }
    }
  }
  const scrub: InstanceSet = { matrices: [], colors: [] };
  {
    const colors = ["#d9a441", "#c98a3a", "#e0b85a", "#c6743a", "#b9a24a"];
    const crng = mulberry32(1040);
    const centres = Array.from({ length: 150 }, (_, i) =>
      i < 14 ? [(crng() * 2 - 1) * 150, (crng() * 2 - 1) * 150] : [(crng() * 2 - 1) * 1450, (crng() * 2 - 1) * 1450]
    );
    for (let i = 0; i < 1040; i++) {
      const near = i < 90;
      const x0 = near ? (rng() * 2 - 1) * 160 : (rng() * 2 - 1) * 1450;
      const z0 = near ? (rng() * 2 - 1) * 160 : (rng() * 2 - 1) * 1450;
      if (near && Math.hypot(x0, z0) < 9) continue;
      const s = 0.6 + rng() ** 2 * 1.3;
      const [cx, cz] = centres[near ? i % 14 : 14 + (i % 136)];
      const a = crng() * Math.PI * 2;
      const d = 2 + crng() ** 1.6 * 16;
      const x = cx + Math.cos(a) * d;
      const z = cz + Math.sin(a) * d;
      dummy.rotation.set((rng() - 0.5) * 0.2, rng() * 6, (rng() - 0.5) * 0.2);
      dummy.scale.set(s * (0.9 + rng() * 0.4), s * (0.6 + rng() * 0.35), s * (0.9 + rng() * 0.4));
      const color = colors[Math.floor(rng() * colors.length)];
      if (inClear(x, z, 1) || Math.hypot(x, z) < 9 || !inCrop(x, z, 2)) continue;
      dummy.position.set(x, ground.heightAt(x, z) - 0.15 * s, z);
      dummy.updateMatrix();
      scrub.matrices.push(dummy.matrix.clone());
      scrub.colors.push(new THREE.Color(color));
    }
  }
  return { rocks, spikes, scrub, pieces };
}

/** One scrub ball: 9 small icosahedra (the game's instanced scrub shape). */
export function scrubGeometry(): THREE.BufferGeometry {
  const blobs: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996;
    const d = 0.2 + 0.3 * Math.sqrt((i + 0.5) / 9);
    const g = new THREE.IcosahedronGeometry(0.24 + (i % 3) * 0.04, 0);
    g.translate(Math.cos(a) * d, 0.22 + (1 - d) * 0.42 + (i % 3) * 0.05, Math.sin(a) * d);
    blobs.push(g.index ? g.toNonIndexed() : g);
  }
  const geo = mergeGeometries(blobs)!;
  geo.deleteAttribute("uv");
  geo.computeVertexNormals();
  return geo;
}
