// The landmark pieces of the crop, built from the desert builders:
// the giant's hand and the giant's reach (the giants' road), the memory of water (salt crust,
// wash stains, stranded boats, qanat wells), the pilgrims' cairns, the riders' red strips,
// the field-stone, the stair ruin with its dune and the sand rivers.
// All geometry is in world coordinates and goes into the batch.
import * as THREE from "three";
import { dryWash, hollow, saltPan } from "./height";
import { Batch, ellipseTube, mergePainted, paint, taperTube, V3, wobble } from "./kit";
import type { Ground, InCrop } from "./scatter";
import { BOATS, DUNE_RUINS, FIELD_STONE, GIANTS, HAND_TO_CITY, QANAT_SITES, RIDE_SPEC, ROAD_POINTS, RUIN_OFFSET, SALT_PAN } from "./sites";

const BONE = "#f2ead6";
const BONE2 = "#e9dec4";
const DARK = "#7a6857";
const RED = "#c8483a";
const CREAM = "#f3ead8";
const STONE = "#cdb38f";
const STONE2 = "#d9c3a0";
const CLAY = "#b86a43";
const WOOD = "#8a6a4a";
const WOOD2 = "#a88a64";
const SLOT = "#2f2b36";
const SAND = "#eec07c";

/** The giant's reach: shoulder, elbow, wrist, palm, and where the palm points. */
const REACH = {
  shoulder: [422, 463] as [number, number],
  elbow: [430, 458] as [number, number],
  wrist: [440, 450] as [number, number],
  palm: [447, 445] as [number, number],
  toward: [499, 403] as [number, number],
  rise: 1.3
};

function yawFrame(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { w: (a: number, y: number, b: number) => V3(x + a * c + b * s, y, z - a * s + b * c) };
}

export type PieceInfo = { name: string; at: THREE.Vector3 }[];

export function buildPieces(ground: Ground, inCrop: InCrop, batch: Batch): PieceInfo {
  const H = (x: number, z: number) => ground.heightAt(x, z);
  const info: PieceInfo = [];
  const rag = (at: THREE.Vector3, yaw: number, len: number, isRed = true) =>
    batch.add("cloth", new THREE.PlaneGeometry(0.42, len).translate(0, -len / 2, 0).rotateZ(0.06).rotateY(yaw).translate(at.x, at.y, at.z), isRed ? RED : CREAM);

  /** A shrine: wobbled stone with clay marks, a clay brazier bowl on 3 legs and a pole with strips. */
  function shrine(count: number, at: THREE.Vector3, yaw: number, { pole = true } = {}) {
    const sn = Math.sin(yaw);
    const cs = Math.cos(yaw);
    const local = (a: number, y: number, b: number) => V3(at.x + cs * a + sn * b, at.y + y, at.z - sn * a + cs * b);
    batch.add(
      "solid",
      wobble(new THREE.CylinderGeometry(0.42, 0.52, 1.5, 6, 2).scale(1.15, 1, 0.45), 0.05, 1.2, 40 + count * 7)
        .rotateZ(0.04)
        .rotateY(yaw)
        .translate(at.x, at.y + 0.68, at.z),
      STONE
    );
    for (let i = 0; i < count; i++) {
      const p = local((i - (count - 1) / 2) * 0.17, 1.12, 0.23);
      batch.add("solid", new THREE.BoxGeometry(0.06, 0.26, 0.04).rotateY(yaw).translate(p.x, p.y, p.z), CLAY);
    }
    {
      const p = local(0, 0.7, 0.24);
      batch.add("solid", new THREE.BoxGeometry(0.5, 0.04, 0.04).rotateY(yaw).translate(p.x, p.y, p.z), CLAY);
      batch.add("solid", new THREE.BoxGeometry(0.42, 0.04, 0.04).rotateY(yaw).translate(p.x, p.y - 0.14, p.z), CLAY);
    }
    const bowl = local(-0.95, 0, 0.25);
    batch.add(
      "solid",
      new THREE.LatheGeometry(
        (
          [
            [0.05, 0],
            [0.32, 0.04],
            [0.38, 0.2],
            [0.33, 0.27]
          ] as [number, number][]
        ).map(([a, b]) => new THREE.Vector2(a, b)),
        9
      ).translate(bowl.x, bowl.y + 0.62, bowl.z),
      CLAY
    );
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      batch.add(
        "solid",
        new THREE.CylinderGeometry(0.03, 0.04, 0.68, 4)
          .rotateZ(0.18)
          .rotateY(a)
          .translate(bowl.x + Math.sin(a) * 0.16, bowl.y + 0.32, bowl.z + Math.cos(a) * 0.16),
        WOOD
      );
    }
    batch.add("glow", new THREE.ConeGeometry(0.2, 0.62, 6).translate(bowl.x, bowl.y + 0.82 + 0.31, bowl.z), "#ffd27a");
    if (pole) {
      const p = local(0.9, 0, -0.55);
      batch.add("solid", new THREE.CylinderGeometry(0.05, 0.07, 3.6, 5).translate(p.x, p.y + 1.8, p.z), WOOD);
      for (let i = 0; i < 4; i++) rag(V3(p.x, p.y + 3.45 - i * 0.12, p.z), yaw + i * 1.4, 1.4 - i * 0.15, i % 2 === 0);
    }
  }

  // ---- the giant's hand, rising from the sand, palm toward the hoverbike dip
  {
    const site = GIANTS.hand;
    const yaw = Math.atan2(QANAT_SITES.bike.x - site.x, QANAT_SITES.bike.z - site.z);
    const frame = yawFrame(site.x, site.z, yaw);
    const base = Math.min(H(site.x, site.z), ...[0, 1, 2, 3, 4, 5].map((a) => H(site.x + Math.cos(a) * 6, site.z + Math.sin(a) * 6)));
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, col = BONE) => parts.push(paint(g, col));
    const S = 1.4;
    const at = (a: number, y: number, b: number) => frame.w(a * S, base + y * S, b * S);
    push(
      ellipseTube(
        [at(0, -6, -1.2), at(0, -1, -0.6), at(0, 3, 0)],
        () => 4.1 * S,
        () => 3 * S,
        6,
        12
      )
    );
    {
      const p = at(0, 8, 0);
      push(
        new THREE.SphereGeometry(1, 16, 12)
          .scale(6.6 * S, 7.4 * S, 2.7 * S)
          .rotateX(-0.12)
          .rotateY(yaw)
          .translate(p.x, p.y, p.z)
      );
    }
    (
      [
        [-4.5, 0.85 * S, 11.5, 0.16],
        [-1.5, S, 14.5, 0.1],
        [1.5, 0.95 * S, 13.2, 0.12],
        [4.4, 0.8 * S, 9.5, 0.22]
      ] as [number, number, number, number][]
    ).forEach(([side, k, len, curl], i) => {
      const root = at(side, 14, 0.2);
      const pts = [root];
      let dy = 1;
      let dz = 0.05;
      let y = 14;
      let z = 0.2;
      for (let j = 1; j <= 3; j++) {
        const step = len / 3;
        y += dy * step;
        z += dz * step;
        pts.push(at(side * (1 + 0.03 * j), y, z));
        dz += curl;
        const l = Math.hypot(dy, dz);
        dy /= l;
        dz /= l;
      }
      if (i === 2) pts.pop();
      push(taperTube(pts, 1.75 * k, 1.25 * k, 10, 8), i % 2 ? BONE : BONE2);
      for (const p of pts.slice(1)) push(new THREE.SphereGeometry(1.55 * k, 8, 6).translate(p.x, p.y, p.z));
      push(new THREE.SphereGeometry(1.9 * k, 8, 6).translate(root.x, root.y, root.z));
    });
    push(taperTube([at(-6, 6, 0.8), at(-8.6, 9.5, 2.2), at(-10, 13.5, 3.3), at(-10.2, 16.6, 3.6)], 2 * S, 1.3 * S, 10, 8), BONE2);
    for (const [a, y] of [
      [2.6, 5.2],
      [-2.2, 10.2],
      [3.8, 11]
    ]) {
      const p = at(a, y, 2.45);
      push(
        new THREE.SphereGeometry(1, 8, 4)
          .scale(0.9 * S, 1.3 * S, 0.2 * S)
          .rotateY(yaw)
          .translate(p.x, p.y, p.z),
        DARK
      );
    }
    push(
      ellipseTube(
        [at(-4.55, 16.2, 0.4), at(-4.6, 17.1, 0.5)],
        () => 1.62 * S,
        () => 1.62 * S,
        1,
        10
      ),
      RED
    );
    batch.add("solid", mergePainted(parts), null, { smooth: true });
    const stand = at(3.2, 0, 5.4);
    stand.y = H(stand.x, stand.z);
    shrine(1, stand, yaw + 0.25);
    info.push({ name: "The giant's hand", at: at(0, 0, 0).setY(base) });
  }

  // ---- the giant's reach: an arm out of a dune, the hand open on the dune's lip
  if (inCrop(REACH.palm[0], REACH.palm[1], 20)) {
    const R = REACH;
    const onGround = ([x, z]: [number, number]) => V3(x, H(x, z), z);
    const shoulder = onGround(R.shoulder);
    const elbow = onGround(R.elbow);
    const wrist = onGround(R.wrist);
    const palm = onGround(R.palm);
    const parts: THREE.BufferGeometry[] = [];
    const push = (g: THREE.BufferGeometry, col = BONE) => parts.push(paint(g, col));
    const sunk = (p: THREE.Vector3, d: number) => p.clone().setY(p.y - d + R.rise);
    const between = (a: THREE.Vector3, b: THREE.Vector3, t: number) => {
      const x = a.x + (b.x - a.x) * t;
      const z = a.z + (b.z - a.z) * t;
      return V3(x, H(x, z), z);
    };
    push(
      ellipseTube(
        [sunk(shoulder, 2.6).setY(shoulder.y - 2.4), sunk(between(shoulder, elbow, 0.5), 2.5), sunk(elbow, 2.4)],
        () => 2.6,
        () => 2.2,
        12,
        12
      ),
      BONE2
    );
    {
      const p = sunk(elbow, 2.4).setY(elbow.y + 0.4);
      push(new THREE.SphereGeometry(1, 12, 8).scale(3, 2.4, 3.2).translate(p.x, p.y, p.z));
    }
    push(taperTube([sunk(elbow, 2.2), sunk(between(elbow, wrist, 0.35), 2), sunk(between(elbow, wrist, 0.7), 1.9), sunk(wrist, 1.7)], 2.2, 1.7, 14, 10));
    {
      const p = sunk(between(elbow, wrist, 0.88), 1.75);
      push(
        ellipseTube(
          [p, sunk(between(elbow, wrist, 0.94), 1.75)],
          () => 1.85,
          () => 1.85,
          1,
          12
        ),
        RED
      );
      rag(V3(p.x, p.y + 1.6, p.z), Math.atan2(R.toward[0] - p.x, R.toward[1] - p.z) + Math.PI / 2, 1.8, true);
    }
    const fwd = V3(R.toward[0] - palm.x, 0, R.toward[1] - palm.z).normalize();
    const right = V3(fwd.z, 0, -fwd.x);
    const yaw = Math.atan2(fwd.x, fwd.z);
    push(new THREE.SphereGeometry(1, 14, 8).scale(4, 1.1, 4.6).rotateY(yaw).translate(palm.x, palm.y + 0.25, palm.z));
    (
      [
        [-2.6, 6.2, 0.78],
        [-0.9, 7.6, 0.86],
        [0.9, 7.2, 0.84],
        [2.6, 5.6, 0.72]
      ] as [number, number, number][]
    ).forEach(([b, len, k], i) => {
      const f = (t: number, lift: number) => {
        const p = palm
          .clone()
          .addScaledVector(fwd, 3.6 + len * t)
          .addScaledVector(right, b * (1 + t * 0.12));
        return p.setY(H(p.x, p.z) + lift);
      };
      const finger = [f(0, 0.5), f(0.35, 0.9), f(0.7, 0.7), f(1, -0.3)];
      push(taperTube(finger, 1 * k, 0.7 * k, 10, 8), i % 2 ? BONE2 : BONE);
      for (const p of finger.slice(1, 3)) push(new THREE.SphereGeometry(0.95 * k, 8, 6).translate(p.x, p.y, p.z));
    });
    {
      const a = palm.clone().addScaledVector(right, -3.8).addScaledVector(fwd, 0.6);
      const b = a.clone().addScaledVector(right, -2.4).addScaledVector(fwd, 2.6);
      push(taperTube([a.setY(H(a.x, a.z) + 0.5), b.setY(H(b.x, b.z) + 0.6)], 1, 0.75, 8, 8), BONE2);
    }
    batch.add("solid", mergePainted(parts), null, { smooth: true });
    info.push({ name: "The giant's hand on the dune's lip", at: palm.clone() });
  }

  // ---- the memory of water: the salt crust on the pan
  const level = saltPan.level();
  const centre = V3(SALT_PAN.x, level, SALT_PAN.z);
  const panR = SALT_PAN.r - 5;
  {
    const pos = [centre.x, level + 0.02, centre.z];
    const idx: number[] = [];
    for (let ring = 1; ring <= 6; ring++)
      for (let k = 0; k < 40; k++) {
        const a = (k / 40) * Math.PI * 2;
        const r = (panR * (0.9 + 0.1 * Math.sin(a * 3 + 1.3) * Math.cos(a * 5)) * ring) / 6;
        pos.push(centre.x + Math.cos(a) * r, level + 0.02, centre.z + Math.sin(a) * r);
      }
    for (let k = 0; k < 40; k++) idx.push(0, 1 + ((k + 1) % 40), 1 + k);
    for (let ring = 1; ring < 6; ring++)
      for (let k = 0; k < 40; k++) {
        const a = 1 + (ring - 1) * 40 + k;
        const b = 1 + (ring - 1) * 40 + ((k + 1) % 40);
        idx.push(a, b, a + 40, b, b + 40, a + 40);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    batch.add("salt", g, "#f1ece0", { smooth: true });
    info.push({ name: "The salt pan", at: centre.clone() });
  }

  // ---- old water-line stains on both banks of the dry wash
  {
    const pts = dryWash.points;
    const bed = dryWash.opt.bed;
    for (const off of [bed + 1.6, bed + 4.2])
      for (const side of [-1, 1])
        for (let i = 2; i < pts.length - 3; i++) {
          if (Math.sin(i * 0.53 + off + side) < -0.35) continue;
          if (!inCrop(pts[i][0], pts[i][1], 12)) continue;
          const quad: number[] = [];
          for (const j of [i, i + 1]) {
            const a = pts[j - 1];
            const b = pts[j + 1];
            const dx = b[0] - a[0];
            const dz = b[1] - a[1];
            const l = Math.hypot(dx, dz);
            const nx = (-dz / l) * side;
            const nz = (dx / l) * side;
            if (dryWash.fadeAt((j / (pts.length - 1)) * dryWash.length) < 0.6) {
              quad.length = 0;
              break;
            }
            for (const w of [-0.3, 0.3]) {
              const x = pts[j][0] + nx * (off + w);
              const z = pts[j][1] + nz * (off + w);
              quad.push(x, H(x, z) + 0.02, z);
            }
          }
          if (quad.length < 12) continue;
          const g = new THREE.BufferGeometry();
          g.setAttribute("position", new THREE.Float32BufferAttribute(quad, 3));
          g.setIndex([0, 1, 2, 1, 3, 2]);
          g.computeVertexNormals();
          if (g.attributes.normal.getY(0) < 0) g.setIndex([0, 2, 1, 1, 2, 3]);
          batch.add("salt", g, "#efe6d3");
        }
  }

  // ---- boats stranded in the dry wash
  for (const [along, sideOff, turn] of BOATS) {
    const u = along / dryWash.length;
    const p = dryWash.curve.getPointAt(u);
    const tan = dryWash.curve.getTangentAt(u);
    const across = V3(-tan.z, 0, tan.x);
    const at = p.clone().addScaledVector(across, sideOff);
    if (!inCrop(at.x, at.z, 8)) continue;
    at.y = H(at.x, at.z);
    const heading = Math.atan2(tan.x, tan.z) + turn;
    const roll = 1.15 * Math.sign(sideOff);
    const s = 1.6;
    batch.add(
      "solid",
      new THREE.LatheGeometry(
        (
          [
            [0.05, -3.4],
            [0.9, -2.8],
            [1.35, -1.2],
            [1.45, 0.6],
            [1.25, 2.2],
            [0.6, 3.3],
            [0.05, 3.7]
          ] as const
        ).map(([r, y]) => new THREE.Vector2(r * s, y * s)),
        12,
        Math.PI * 0.5,
        Math.PI
      )
        .rotateX(Math.PI / 2)
        .scale(1, 0.75, 1)
        .rotateZ(roll)
        .rotateY(heading)
        .translate(at.x, at.y + 0.55 * s, at.z),
      WOOD,
      { smooth: true }
    );
    for (const o of [-2.6, 0, 2.6]) {
      const q = at.clone().add(V3(Math.sin(heading) * o, 1, Math.cos(heading) * o));
      batch.add("solid", new THREE.BoxGeometry(3.8, 0.18, 0.4).rotateZ(roll * 0.9).rotateY(heading).translate(q.x, q.y, q.z), WOOD2);
    }
    const oar = at.clone().add(V3(Math.cos(heading) * 3.4 * -Math.sign(sideOff), 0.25, -Math.sin(heading) * 3.4 * -Math.sign(sideOff)));
    batch.add(
      "solid",
      new THREE.CylinderGeometry(0.15, 0.2, 7.5, 5)
        .rotateZ(Math.PI / 2 - 0.08)
        .rotateY(heading + Math.PI / 2 + 0.3)
        .translate(oar.x, oar.y, oar.z),
      WOOD2
    );
    info.push({ name: "A boat stranded in the dry wash", at });
  }

  // ---- the qanat wells from the giant's hand toward the city
  HAND_TO_CITY.forEach(([x, z], i) => {
    if (!inCrop(x, z, 6)) return;
    const yaw = Math.atan2(QANAT_SITES.city.x - x, QANAT_SITES.city.z - z);
    const low = Math.min(...[0, 1, 2, 3, 4, 5].map((k) => H(x + Math.cos(k) * 1.9, z + Math.sin(k) * 1.9)));
    batch.add(
      "solid",
      new THREE.LatheGeometry(
        (
          [
            [1.15, -0.6],
            [1.75, -0.6],
            [1.8, 0.9],
            [1.65, 1.05],
            [1.2, 1.05],
            [1.15, 0.9]
          ] as const
        ).map(([r, y]) => new THREE.Vector2(r, y)),
        16
      ).translate(x, low, z),
      STONE
    );
    const high = Math.max(H(x, z), ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => H(x + Math.cos((k * Math.PI) / 4) * 1.15, z + Math.sin((k * Math.PI) / 4) * 1.15)));
    batch.add("solid", new THREE.CircleGeometry(1.15, 16).rotateX(-Math.PI / 2).translate(x, high + 0.04, z), SLOT);
    const wx = x - Math.cos(yaw) * 2.9;
    const wz = z + Math.sin(yaw) * 2.9;
    const wy = H(wx, wz);
    batch.add("solid", wobble(new THREE.BoxGeometry(1.5, 4.4, 1.5), 0.03, 1.6, i).translate(wx, wy + 2, wz), STONE2);
    batch.add("solid", new THREE.BoxGeometry(1.9, 0.3, 1.9).rotateY(yaw).translate(wx, wy + 4.35, wz), STONE);
    batch.add("solid", new THREE.ConeGeometry(1, 0.9, 4).rotateY(yaw + Math.PI / 4).translate(wx, wy + 4.95, wz), STONE2);
    for (let k = 0; k < 4; k++) {
      const a = yaw + (k * Math.PI) / 2;
      batch.add("solid", new THREE.BoxGeometry(0.34, 0.9, 0.05).rotateY(a).translate(wx + Math.sin(a) * 0.76, wy + 3.55, wz + Math.cos(a) * 0.76), SLOT);
    }
    const jx = x + Math.sin(yaw + 1.9) * 2.3;
    const jz = z + Math.cos(yaw + 1.9) * 2.3;
    batch.add(
      "solid",
      new THREE.LatheGeometry(
        (
          [
            [0.05, 0],
            [0.32, 0.1],
            [0.4, 0.42],
            [0.22, 0.72],
            [0.16, 0.82]
          ] as const
        ).map(([r, y]) => new THREE.Vector2(r, y)),
        9
      ).translate(jx, H(jx, jz), jz),
      CLAY,
      { smooth: true }
    );
    {
      const rx = x + Math.sin(yaw - 1.6) * 2.2;
      const rz = z + Math.cos(yaw - 1.6) * 2.2;
      batch.add("solid", new THREE.TorusGeometry(0.42, 0.07, 4, 10).rotateX(Math.PI / 2).translate(rx, H(rx, rz) + 0.08, rz), WOOD);
    }
    if (i % 2 === 0) {
      const px = x + Math.sin(yaw + 2.9) * 2;
      const pz = z + Math.cos(yaw + 2.9) * 2;
      const py = H(px, pz);
      batch.add("solid", new THREE.CylinderGeometry(0.035, 0.045, 2.2, 4).translate(px, py + 1.1, pz), WOOD);
      batch.add("cloth", new THREE.PlaneGeometry(0.3, 0.9).translate(0, -0.45, 0).rotateZ(0.15).rotateY(yaw + i).translate(px, py + 2.1, pz), RED);
    }
    info.push({ name: `Qanat well ${i + 1}`, at: V3(x, low, z) });
  });

  // ---- the pilgrims' road: a cairn of 4 or 5 stones with a lamp bowl at each point
  ROAD_POINTS.forEach(([x, z], k) => {
    if (!inCrop(x, z, 2)) return;
    const y = H(x, z);
    const turn = k * 1.7;
    let stack = 0;
    const count = 4 + (k % 2);
    for (let j = 0; j < count; j++) {
      const r = 0.62 - j * 0.1;
      const h = r * 0.62;
      batch.add(
        "solid",
        wobble(new THREE.IcosahedronGeometry(r, 0).scale(1.25, 0.62, 1), 0.035, 3, k * 7 + j)
          .rotateY(turn + j * 0.9)
          .translate(x + Math.sin(j * 2.1 + k) * 0.05, y + stack + h * 0.5 - 0.12, z + Math.cos(j * 1.7 + k) * 0.05),
        STONE
      );
      stack += h * 0.82;
    }
    const top = V3(x, y + stack - 0.1, z);
    batch.add(
      "solid",
      new THREE.LatheGeometry(
        (
          [
            [0.03, 0],
            [0.16, 0.02],
            [0.2, 0.1],
            [0.17, 0.14]
          ] as [number, number][]
        ).map(([a, b]) => new THREE.Vector2(a, b)),
        9
      ).translate(top.x, top.y, top.z),
      CLAY
    );
  });

  // ---- the riders' red strips: stakes with 3 red strips, 4.5 m either side of the ride line
  {
    const from = QANAT_SITES.bike;
    const to = QANAT_SITES.hearth;
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    const side = [-dz / len, dx / len];
    const taken = Object.values(RIDE_SPEC).map((s) => s.f);
    const fractions: number[] = [];
    for (let f = 0.04; f < 0.8; f += 0.05) if (taken.every((t) => Math.abs(t - f) > 0.02)) fractions.push(+f.toFixed(3));
    fractions.forEach((f, k) => {
      const off = (k % 2 ? 1 : -1) * 4.5;
      const x = from.x + dx * f + side[0] * off;
      const z = from.z + dz * f + side[1] * off;
      if (!inCrop(x, z, 3)) return;
      const y = H(x, z);
      const lean = Math.sin(k * 2.3) * 0.06;
      batch.add("solid", new THREE.CylinderGeometry(0.07, 0.1, 6, 5).translate(0, 2.9, 0).rotateZ(lean).translate(x, y, z), WOOD);
      for (let j = 0; j < 3; j++)
        batch.add(
          "cloth",
          new THREE.PlaneGeometry(2.8 - j * 0.7, 0.5 - j * 0.1)
            .translate(1.4 - j * 0.35, 0, 0)
            .rotateX(0.4 + j * 0.7)
            .rotateZ(-0.1 - j * 0.08)
            .rotateY(k * 0.7)
            .translate(x, y + 5.6 - j * 0.15, z),
          RED
        );
    });
  }

  // ---- the field-stone: a wobbled slab facing the Rose House with a small clay sign
  if (inCrop(FIELD_STONE.x, FIELD_STONE.z, 3)) {
    const { x, z } = FIELD_STONE;
    const heading = Math.atan2(FIELD_STONE.toward[0] - x, FIELD_STONE.toward[1] - z);
    const y = Math.min(H(x, z), ...[0, 1, 2, 3, 4, 5].map((i) => H(x + Math.cos(i * 1.05) * 0.7, z + Math.sin(i * 1.05) * 0.7)));
    const local = (a: number, c: number) => V3(x + Math.cos(heading) * a + Math.sin(heading) * c, y, z - Math.sin(heading) * a + Math.cos(heading) * c);
    batch.add(
      "solid",
      wobble(new THREE.CylinderGeometry(0.5, 0.62, 2, 6, 3).scale(1.1, 1, 0.42), 0.09, 1.1, 21)
        .rotateZ(0.07)
        .rotateY(heading)
        .translate(x, y + 0.8, z),
      STONE
    );
    const face = local(0, 0.24);
    batch.add("solid", new THREE.BoxGeometry(0.08, 1.1, 0.04).rotateY(heading).translate(face.x, y + 0.75, face.z), CLAY);
    batch.add("solid", new THREE.CylinderGeometry(0.14, 0.14, 0.04, 8).rotateX(Math.PI / 2).rotateY(heading).translate(face.x, y + 1.42, face.z), CLAY);
    const side = local(0.26, 0.24);
    for (const h of [0.45, 0.7, 0.95]) batch.add("solid", new THREE.BoxGeometry(0.22, 0.04, 0.04).rotateY(heading).translate(side.x, y + h, side.z), CLAY);
    info.push({ name: "The field-stone", at: V3(x, y, z) });
  }

  // ---- the stair ruin that the walking dune let go of, and its dune beside it
  /** A dune mound (9 rings of 22) leaning downwind. */
  const mound = (x: number, z: number, h: number, r: number) => {
    const reach = r * 2.7;
    const pos: number[] = [x, H(x, z) + h, z];
    const idx: number[] = [];
    for (let ring = 1; ring <= 9; ring++)
      for (let k = 0; k < 22; k++) {
        const a = (k / 22) * Math.PI * 2;
        const d = (reach * ring) / 9;
        const px = x + Math.cos(a) * d * (1 + 0.12 * Math.sin(a * 3 + x));
        const pz = z + Math.sin(a) * d;
        const lee = Math.max(0, Math.cos(a) * RUIN_OFFSET.dx + Math.sin(a) * RUIN_OFFSET.dz) / Math.hypot(RUIN_OFFSET.dx, RUIN_OFFSET.dz);
        const fall = Math.exp(-((d / r) ** 2) * (0.5 + 0.35 * lee));
        pos.push(px, H(px, pz) + h * fall - (ring === 9 ? 0.45 : 0), pz);
      }
    for (let k = 0; k < 22; k++) idx.push(0, 1 + ((k + 1) % 22), 1 + k);
    for (let ring = 1; ring < 9; ring++)
      for (let k = 0; k < 22; k++) {
        const a = 1 + (ring - 1) * 22 + k;
        const b = 1 + (ring - 1) * 22 + ((k + 1) % 22);
        idx.push(a, b, a + 22, b, b + 22, a + 22);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    batch.add("sand", g, SAND, { smooth: true });
  };
  {
    const ruin = DUNE_RUINS[0];
    if (inCrop(ruin.x, ruin.z, 10)) {
      const c = Math.cos(ruin.yaw);
      const s = Math.sin(ruin.yaw);
      const floor = Math.min(...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => H(ruin.x + Math.cos(k * 0.785) * 5, ruin.z + Math.sin(k * 0.785) * 5)));
      const at = (lx: number, ly: number, lz: number) => V3(ruin.x + lx * c + lz * s, floor + ly, ruin.z - lx * s + lz * c);
      const block = (color: string, w: number, h: number, d: number, lx: number, ly: number, lz: number) => {
        const p = at(lx, ly, lz);
        batch.add("solid", new THREE.BoxGeometry(w, h, d).rotateY(ruin.yaw).translate(p.x, p.y, p.z), color);
      };
      block(STONE, 7, 1.6, 6, 0, 0.3, -1);
      block(STONE, 1.2, 4.2, 1.6, -2.4, 2.4, 1.2);
      block(STONE, 1.2, 4.2, 1.6, 2.4, 2.4, 1.2);
      block(STONE, 6.6, 1.1, 2, 0, 5, 1.2);
      for (let i = 0; i < 5; i++) block(STONE2, 0.7, 0.18, 0.12, -2.2 + i * 1.1, 5, 2.22);
      block("#3b3340", 3.6, 3.4, 0.2, 0, 2.2, 0.4);
      for (let i = 0; i < 5; i++) block(STONE2, 3.4, 0.3, 1, 0, 1.2 - i * 0.32, 2.6 - i * 0.55);
      for (const [lx, lz, r] of [
        [-4.4, 2.6, 0.9],
        [4.1, 3.4, 0.7],
        [3.4, -3.6, 0.8]
      ]) {
        const p = at(lx, 0.2, lz);
        batch.add("solid", wobble(new THREE.IcosahedronGeometry(r, 0), 0.08, 2, lx).translate(p.x, p.y, p.z), STONE);
      }
      // visit 0: this ruin is open, so its dune lies beside it
      mound(ruin.x + RUIN_OFFSET.dx, ruin.z + RUIN_OFFSET.dz, 7.5, 11);
      info.push({ name: "A doorway the dune let go of", at: at(0, 0, 0) });
    }
  }

  // ---- the sand rivers: a ribbon on the bed of each channel
  for (const ch of [hollow, dryWash]) {
    const pts = ch.points;
    const half = ch.opt.bed - 0.4;
    const pos: number[] = [];
    const idx: number[] = [];
    let rows = 0;
    for (let i = 0; i < pts.length; i++) {
      if (!inCrop(pts[i][0], pts[i][1], 20)) {
        if (rows) break;
        continue;
      }
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(pts.length - 1, i + 1)];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const l = Math.hypot(dx, dz);
      const nx = -dz / l;
      const nz = dx / l;
      const along = (i / (pts.length - 1)) * ch.length;
      const w = half * Math.min(1, ch.fadeAt(along) * 1.6);
      for (let j = 0; j <= 6; j++) {
        const o = ((j / 6) * 2 - 1) * Math.max(0.5, w);
        const x = pts[i][0] + nx * o;
        const z = pts[i][1] + nz * o;
        pos.push(x, H(x, z) + 0.03, z);
      }
      rows++;
    }
    for (let i = 0; i < rows - 1; i++)
      for (let j = 0; j < 6; j++) {
        const a = i * 7 + j;
        const b = a + 7;
        idx.push(a, a + 1, b, a + 1, b + 1, b);
      }
    if (rows < 2) continue;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    batch.add("salt", g, "#f7e0b2", { smooth: true });
  }
  return info;
}
