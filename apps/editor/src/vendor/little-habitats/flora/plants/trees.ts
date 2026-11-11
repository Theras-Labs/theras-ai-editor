// Ports bundle lines 20300-20795: tree recipes (oak, birch, cherry, apple, pine, willow).
import * as THREE from 'three';
import {
  PART,
  PlantBuilder,
  addBlobs,
  addBranch,
  alignY,
  barkColor,
  canopyColor,
  distanceRamp,
  ellipsoid,
  faceAwayFrom,
  heightRamp,
  lathe,
  noise3,
  palette,
  quadBezier,
  sampleRamp,
  scatterOnBlobs,
  smoothNormals,
  TAU,
  toColor,
  trs,
  tube,
  v3,
  clamp01,
  type Blob,
  type ColorFn,
} from '../geometry';

export function buildOak(): THREE.BufferGeometry { // fl (20300)
  const b = new PlantBuilder(11);
  const bark = barkColor(palette(`#4a3428`, `#6b4c3a`, `#8a6a4e`, `#a3826a`), 2.2, { furrows: 3 });
  b.add(
    tube(
      [v3(0, -0.05, 0), v3(0.02, 0.45, 0.01), v3(0.05, 0.95, -0.02), v3(0.03, 1.45, 0), v3(0, 1.85, 0.02)],
      [0.27, 0.2, 0.18, 0.16, 0.12],
      8,
      false,
    ),
    null,
    { kind: PART.WOOD, color: bark, flat: true },
  );
  for (let n = 0; n < 5; n++) {
    const a = (n / 5) * TAU + 0.5 + b.random() * 0.4;
    const reach = 0.42 + b.random() * 0.12;
    b.add(
      tube(
        quadBezier(v3(0, 0.38, 0), v3(Math.cos(a) * 0.2, 0.1, Math.sin(a) * 0.2), v3(Math.cos(a) * reach, -0.04, Math.sin(a) * reach), 3),
        [0.12, 0.1, 0.065, 0.03],
        5,
      ),
      null,
      { kind: PART.WOOD, color: bark, flat: true },
    );
  }
  const top: Blob = { c: v3(0.1, 3.2, -0.08), r: 0.72 };
  const core: Blob = { c: v3(0, 2.65, 0), r: 1 };
  const ring: Blob[] = [];
  for (let t = 0; t < 6; t++) {
    const a = (t / 6) * TAU + 0.3 + (b.random() - 0.5) * 0.4;
    const r = 0.78 + b.random() * 0.15;
    ring.push({ c: v3(Math.cos(a) * r, 2.35 + (b.random() - 0.5) * 0.35, Math.sin(a) * r), r: 0.62 + b.random() * 0.14 });
  }
  const blobs = [core, top, ...ring];
  for (const blob of ring) {
    const start = v3(0, 1.55 + b.random() * 0.3, 0);
    const end = blob.c.clone().multiplyScalar(0.8);
    end.y = blob.c.y - 0.1;
    addBranch(b, start, v3(end.x * 0.45, (start.y + end.y) / 2 + 0.15, end.z * 0.45), end, 0.1, 0.04, bark, 2, 0.4);
  }
  addBranch(b, v3(0, 1.8, 0), v3(0.05, 2.4, 0), v3(0.08, 3, -0.05), 0.1, 0.04, bark, 3, 0.35);
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#2f5534`, `#4a7f3e`, `#6ea24c`, `#a4cc66`), core.c, 1.4), {
    lumps: 0.13,
    fine: 0.03,
  });
  return b.build();
}

export function buildBirch(): THREE.BufferGeometry { // pl (20346)
  const b = new PlantBuilder(23);
  const barkColors = palette(`#8f877c`, `#d8d1c4`, `#efe9de`, `#f7f3ea`);
  const markColor = toColor(`#3f3833`);
  const bark: ColorFn = (p, n, out) => {
    sampleRamp(barkColors, 0.45 + n.y * 0.2 + noise3(p.x * 9, p.y * 3, p.z * 9) * 0.2 + Math.min(0.3, p.y * 0.2), out);
    if (p.y < 0.28) out.lerp(markColor, 0.8 * (1 - p.y / 0.28) + 0.2);
  };
  const trunk = new THREE.CatmullRomCurve3([
    v3(0, -0.05, 0),
    v3(0.05, 0.8, 0.02),
    v3(-0.04, 1.6, 0),
    v3(0.03, 2.4, -0.02),
    v3(0, 3.35, 0),
  ]).getPoints(14);
  const radiusAt = (i: number) => 0.125 - (0.09 * i) / 14;
  b.add(
    tube(
      trunk,
      trunk.map((_p, t) => radiusAt(t)),
      8,
      true,
    ),
    null,
    { kind: PART.WOOD, color: bark },
  );
  for (let k = 0; k < 30; k++) {
    const y = 0.3 + b.random() * 2.8;
    const ti = Math.min(13, Math.max(0, Math.round((y / 3.35) * 14)));
    const center = trunk[ti];
    const radius = radiusAt(ti) * 1.04 + 0.003;
    const a0 = b.random() * TAU;
    const arc = 0.7 + b.random() * 1.8;
    const h = 0.02 + b.random() * 0.03;
    const positions: number[] = [];
    for (let e = 0; e < 5; e++) {
      const aA = a0 + (arc * e) / 5;
      const aB = a0 + (arc * (e + 1)) / 5;
      const hA = h * Math.sin((Math.PI * e) / 5 + 0.3);
      const hB = h * Math.sin((Math.PI * (e + 1)) / 5 + 0.3);
      const lowA = [center.x + Math.cos(aA) * radius, y - hA / 2, center.z + Math.sin(aA) * radius];
      const lowB = [center.x + Math.cos(aB) * radius, y - hB / 2, center.z + Math.sin(aB) * radius];
      const highB = [center.x + Math.cos(aB) * radius, y + hB / 2, center.z + Math.sin(aB) * radius];
      const highA = [center.x + Math.cos(aA) * radius, y + hA / 2, center.z + Math.sin(aA) * radius];
      positions.push(...lowA, ...highB, ...lowB, ...lowA, ...highA, ...highB);
    }
    const mark = new THREE.BufferGeometry();
    mark.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    mark.computeVertexNormals();
    faceAwayFrom(mark, center);
    b.add(mark, null, { kind: PART.WOOD, color: markColor });
  }
  const blobs: Blob[] = [
    { c: v3(0.38, 2.25, 0.2), r: 0.46 },
    { c: v3(-0.42, 2.45, -0.12), r: 0.48 },
    { c: v3(0.12, 2.7, -0.42), r: 0.46 },
    { c: v3(-0.18, 2.95, 0.38), r: 0.5 },
    { c: v3(0.36, 3.1, -0.12), r: 0.46 },
    { c: v3(-0.3, 3.35, -0.18), r: 0.42 },
    { c: v3(0.06, 3.62, 0.06), r: 0.4 },
    { c: v3(0.02, 2.95, 0), r: 0.5 },
  ];
  for (let t = 0; t < 7; t++) {
    const blob = blobs[t];
    const start = v3(0, 1.7 + t * 0.22, 0);
    const end = blob.c.clone().multiplyScalar(0.85);
    addBranch(b, start, v3(end.x * 0.4, (start.y + end.y) / 2 + 0.1, end.z * 0.4), end, 0.045, 0.018, bark, 2, 0.3);
  }
  const small: Blob[] = [];
  for (let t = 0; t < 6; t++) {
    const a = (t / 6) * TAU + 0.7;
    small.push({ c: v3(Math.cos(a) * 0.72, 2.2 + b.random() * 1.1, Math.sin(a) * 0.72), r: 0.2 + b.random() * 0.08 });
  }
  const leaf = canopyColor(palette(`#4f7f3c`, `#76aa52`, `#9ccb66`, `#cfe68c`), v3(0, 2.9, 0), 1, 0.14, 0.05);
  addBlobs(b, blobs, PART.LEAF, leaf, { lumps: 0.2, fine: 0.08 });
  addBlobs(b, small, PART.LEAF, leaf, { detail: 1, lumps: 0.2, seed: 5 });
  return b.build();
}

export function buildCherry(): THREE.BufferGeometry { // ml (20422)
  const b = new PlantBuilder(37);
  const bark = barkColor(palette(`#3f2a28`, `#5c3c35`, `#7a5044`, `#94664f`), 1.8, { stripes: 7 });
  const trunk = new THREE.CatmullRomCurve3([
    v3(0, -0.05, 0),
    v3(0.14, 0.45, 0.05),
    v3(-0.04, 0.9, 0.1),
    v3(0.1, 1.3, -0.04),
    v3(0.03, 1.55, 0),
  ]).getPoints(10);
  b.add(
    tube(
      trunk,
      trunk.map((_p, t) => 0.21 - (0.1 * t) / 10),
      7,
      false,
    ),
    null,
    { kind: PART.WOOD, color: bark, flat: true },
  );
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * TAU + 0.2;
    b.add(
      tube(
        quadBezier(
          v3(0, 0.3, 0),
          v3(Math.cos(a) * 0.2, 0.06, Math.sin(a) * 0.2),
          v3(Math.cos(a) * 0.4, -0.04, Math.sin(a) * 0.4),
          3,
        ),
        [0.1, 0.08, 0.05, 0.025],
        5,
      ),
      null,
      { kind: PART.WOOD, color: bark, flat: true },
    );
  }
  const core: Blob = { c: v3(0, 2.3, 0), r: 0.8, sy: 0.72 };
  const blobs: Blob[] = [core];
  for (let t = 0; t < 7; t++) {
    const a = (t / 7) * TAU + (b.random() - 0.5) * 0.3;
    const r = 0.95 + b.random() * 0.12;
    blobs.push({
      c: v3(Math.cos(a) * r, 2.05 + (b.random() - 0.5) * 0.25, Math.sin(a) * r),
      r: 0.5 + b.random() * 0.12,
      sy: 0.78,
    });
  }
  for (let e = 0; e < 3; e++) {
    const a = (e / 3) * TAU + 1;
    blobs.push({ c: v3(Math.cos(a) * 0.45, 2.62, Math.sin(a) * 0.45), r: 0.48, sy: 0.75 });
  }
  for (let n = 1; n < 8; n++) {
    const blob = blobs[n];
    const start = v3(0.03, 1.35 + b.random() * 0.2, 0);
    const end = blob.c.clone().multiplyScalar(0.85);
    end.y = blob.c.y - 0.12;
    addBranch(
      b,
      start,
      v3(end.x * 0.55 + (b.random() - 0.5) * 0.2, start.y + 0.25, end.z * 0.55 + (b.random() - 0.5) * 0.2),
      end,
      0.085,
      0.035,
      bark,
      2,
      0.35,
    );
  }
  const blossomColors = palette(`#d9789a`, `#eea1b8`, `#f8c3d2`, `#fde4ec`);
  addBlobs(
    b,
    blobs,
    PART.BLOSSOM,
    (p, n, out) => {
      const t =
        0.35 +
        n.y * 0.3 +
        (p.y - 2.2) * 0.35 +
        noise3(p.x * 8, p.y * 8, p.z * 8) * 0.16 +
        noise3(p.x * 19, p.y * 19, p.z * 19) * 0.14;
      sampleRamp(blossomColors, t, out);
    },
    { lumps: 0.15, fine: 0.06, scale: 1.06, seed: 3 },
  );
  const flowerColors = palette(`#e690ab`, `#f4b1c5`, `#fbd2de`);
  for (const { p, n } of scatterOnBlobs(
    b,
    blobs.map((e) => ({ ...e, r: e.r * 1.06 })),
    44,
    -0.5,
    0.02,
  )) {
    const s = 0.8 + b.random() * 0.5;
    b.add(ellipsoid(0.085 * s, 0.05 * s, 0.085 * s, 6, 4), alignY(p, n, 1, b.random() * 6), {
      kind: PART.BLOSSOM,
      color: (_q, nn, out) => sampleRamp(flowerColors, 0.25 + nn.y * 0.5, out),
      anchor: p,
    });
  }
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#2f5a36`, `#4d8544`, `#72a852`, `#a6cd6a`), core.c, 1.3), {
    lumps: 0.08,
    fine: 0.02,
    scale: 0.9,
    seed: 3,
  });
  return b.build();
}

export function buildApple(): THREE.BufferGeometry { // hl (20532)
  const b = new PlantBuilder(41);
  const bark = barkColor(palette(`#46332a`, `#634836`, `#80604a`, `#9a7a5e`), 1.6, { furrows: 2 });
  b.add(tube([v3(0, -0.05, 0), v3(0.03, 0.5, 0), v3(0, 1, 0.02), v3(0.02, 1.2, 0)], [0.18, 0.15, 0.13, 0.12], 7, false), null, {
    kind: PART.WOOD,
    color: bark,
    flat: true,
  });
  const core: Blob = { c: v3(0, 2, 0), r: 0.86 };
  const blobs: Blob[] = [core, { c: v3(0.05, 2.45, 0.02), r: 0.56 }];
  for (let t = 0; t < 5; t++) {
    const a = (t / 5) * TAU + 0.4;
    blobs.push({
      c: v3(Math.cos(a) * 0.62, 1.8 + (b.random() - 0.5) * 0.2, Math.sin(a) * 0.62),
      r: 0.54 + b.random() * 0.08,
    });
  }
  for (let n = 2; n < blobs.length; n++) {
    const end = blobs[n].c.clone().multiplyScalar(0.85);
    addBranch(b, v3(0, 1.1, 0), v3(end.x * 0.35, 1.45, end.z * 0.35), end, 0.08, 0.035, bark, 2, 0.3);
  }
  addBranch(b, v3(0, 1.15, 0), v3(0.02, 1.7, 0), v3(0.05, 2.3, 0.02), 0.08, 0.035, bark, 3, 0.3);
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#2e5634`, `#467d3e`, `#68a04a`, `#9cc862`), core.c, 1.15), { lumps: 0.14 });
  const blossomColors = palette(`#e9a3b8`, `#f7cfdb`, `#fff1f4`, `#fffafa`);
  for (const { p, n } of scatterOnBlobs(b, blobs, 46, -0.25, 0.04)) {
    const s = 0.9 + b.random() * 0.4;
    b.add(ellipsoid(0.075 * s, 0.032 * s, 0.075 * s, 7, 4), alignY(p, n, 1, b.random() * 6), {
      kind: PART.BLOSSOM,
      color: distanceRamp(blossomColors, p.clone().addScaledVector(n, -0.03), 0.09),
      anchor: p,
    });
    b.add(ellipsoid(0.022, 0.02, 0.022, 5, 3), alignY(p.clone().addScaledVector(n, 0.022), n), {
      kind: PART.BLOSSOM,
      color: toColor(`#f2a0b4`),
      anchor: p,
    });
  }
  const fruitColors = palette(`#8f2a24`, `#c23a30`, `#dd5a42`, `#f29a6a`);
  for (const { p, n } of scatterOnBlobs(b, blobs, 20, -0.55, 0.03)) {
    const at = p.clone().add(v3(0, -0.05, 0));
    const r = 0.092 + b.random() * 0.022;
    const blush = b.random() < 0.3;
    b.add(
      lathe(
        [
          [0.001, -r * 0.9],
          [r * 0.6, -r * 0.8],
          [r, -r * 0.1],
          [r * 0.85, r * 0.6],
          [r * 0.3, r * 0.82],
          [0.001, r * 0.7],
        ],
        9,
      ),
      trs(at.x, at.y, at.z),
      {
        kind: PART.FRUIT,
        color: (_q, nn, out) => {
          sampleRamp(fruitColors, 0.3 + nn.y * 0.35 + (nn.x * n.x + nn.z * n.z) * 0.3, out);
          if (blush) out.lerp(toColor(`#e8b04a`), 0.35 * clamp01(0.5 - nn.y));
        },
        anchor: at,
      },
    );
    b.add(tube([v3(at.x, at.y + r * 0.7, at.z), v3(at.x + 0.01, at.y + r * 0.7 + 0.04, at.z)], [0.008, 0.005], 3), null, {
      kind: PART.FRUIT,
      color: toColor(`#5a4030`),
      anchor: at,
    });
  }
  return b.build();
}

export function buildPine(): THREE.BufferGeometry { // gl (20604)
  const b = new PlantBuilder(53);
  const bark = barkColor(palette(`#3f2c22`, `#5c4030`, `#7a5842`), 3, { furrows: 4 });
  b.add(tube([v3(0, -0.05, 0), v3(0, 1.2, 0), v3(0.02, 2.6, 0), v3(0, 4, 0)], [0.17, 0.13, 0.08, 0.02], 6, true), null, {
    kind: PART.WOOD,
    color: bark,
    flat: true,
  });
  const needleColors = palette(`#2a5a40`, `#3a7449`, `#528f55`, `#72ad65`, `#a2d07e`);
  for (let t = 0; t < 6; t++) {
    const k = t / 5;
    const y0 = 0.45 + t * 0.56;
    const w = 1 - k * 0.7;
    const h = 1 - k * 0.34;
    const seed = t * 3.3;
    const droop = 0.16 * h;
    let tier = lathe(
      [
        [0.06, 0.12 * h],
        [0.45 * w, 0],
        [0.9 * w, -droop],
        [w, -droop * 0.6],
        [0.86 * w, 0.14 * h],
        [0.62 * w, 0.38 * h],
        [0.36 * w, 0.66 * h],
        [0.14 * w, 0.88 * h],
        [0.001, h],
      ],
      20,
    );
    tier = tier.toNonIndexed();
    const position = tier.getAttribute('position');
    for (let e = 0; e < position.count; e++) {
      const x = position.getX(e);
      const y = position.getY(e);
      const z = position.getZ(e);
      const d = Math.hypot(x, z) / w;
      const a = Math.atan2(z, x);
      const lobe = Math.abs(Math.cos(a * 4.5 + t)) ** 2;
      const s = 1 + noise3(Math.cos(a) * 1.6 + seed, Math.sin(a) * 1.6, seed) * 0.12 * d + lobe * 0.08 * d * d;
      position.setXYZ(e, x * s, y - d * d * d * lobe * 0.1 * h, z * s);
    }
    tier.deleteAttribute('normal');
    tier.computeVertexNormals();
    smoothNormals(tier);
    const color: ColorFn = (p, n, out) => {
      const d = Math.hypot(p.x, p.z) / w;
      const v = (p.y - y0) / h;
      sampleRamp(needleColors, 0.18 + d * 0.3 + v * 0.25 + n.y * 0.25 + noise3(p.x * 7, p.y * 7, p.z * 7) * 0.12 + k * 0.1, out);
    };
    const anchor = new THREE.Vector3(0, y0 + h * 0.4, 0);
    b.add(tier, trs(0, y0, 0, 0, t * 0.7), { kind: PART.EVER, color, anchor, flex: 0.25 + k * 0.75, vertexPhase: true });
  }
  for (let t = 0; t < 7; t++) {
    const tierIndex = t % 4;
    const k = tierIndex / 5;
    const y = 0.45 + tierIndex * 0.56;
    const r = (1 - k * 0.7) * 0.75;
    const a = t * 2.3;
    const at = v3(Math.cos(a) * r, y - 0.05, Math.sin(a) * r);
    b.add(ellipsoid(0.045, 0.075, 0.045, 6, 5), trs(at.x, at.y - 0.05, at.z, 0.3, a, 0), {
      kind: PART.FRUIT,
      color: heightRamp(palette(`#5a3a24`, `#8a5a36`, `#b08050`), at.y - 0.12, at.y),
      anchor: at,
    });
  }
  return b.build();
}

export function buildWillow(): THREE.BufferGeometry { // _l (20670)
  const b = new PlantBuilder(67);
  const bark = barkColor(palette(`#43372b`, `#5f5040`, `#7c6a54`, `#94826a`), 2.2, { furrows: 6 });
  const trunk = new THREE.CatmullRomCurve3([v3(0, -0.05, 0), v3(0.1, 0.6, 0.05), v3(0.16, 1.2, 0), v3(0.12, 1.7, 0)]).getPoints(8);
  b.add(
    tube(
      trunk,
      trunk.map((_p, t) => 0.26 - (0.12 * t) / 8),
      8,
      false,
    ),
    null,
    { kind: PART.WOOD, color: bark, flat: true },
  );
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * TAU + 0.8;
    b.add(
      tube(
        quadBezier(
          v3(0, 0.35, 0),
          v3(Math.cos(a) * 0.22, 0.08, Math.sin(a) * 0.22),
          v3(Math.cos(a) * 0.45, -0.04, Math.sin(a) * 0.45),
          3,
        ),
        [0.11, 0.09, 0.06, 0.03],
        5,
      ),
      null,
      { kind: PART.WOOD, color: bark, flat: true },
    );
  }
  const blobs: Blob[] = [{ c: v3(0.05, 2.9, 0), r: 0.86, sy: 0.72 }];
  for (let t = 0; t < 7; t++) {
    const a = (t / 7) * TAU + 0.3;
    blobs.push({
      c: v3(Math.cos(a) * 0.68 + 0.05, 2.62 + (b.random() - 0.5) * 0.1, Math.sin(a) * 0.68),
      r: 0.5 + b.random() * 0.08,
      sy: 0.75,
    });
  }
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * TAU + 0.3;
    const end = v3(Math.cos(a) * 0.6, 2.6, Math.sin(a) * 0.6);
    addBranch(b, v3(0.12, 1.6, 0), v3(Math.cos(a) * 0.28, 2.4, Math.sin(a) * 0.28), end, 0.08, 0.035, bark, 1, 0.22);
  }
  const leaf = canopyColor(palette(`#557f3c`, `#76a44e`, `#9cc866`, `#cfe490`), v3(0, 2.7, 0), 1.2, 0.1, 0.08);
  addBlobs(b, blobs, PART.LEAF, leaf, { lumps: 0.1, fine: 0.03 });
  const strandColors = palette(`#557f3a`, `#76a44e`, `#9cc865`, `#c8e28a`, `#e0efae`);
  [
    ...Array.from({ length: 18 }, (_e, t) => ({
      a: (t / 18) * TAU,
      rad: 0.95,
      y: 2.6,
      L: 1.6 + ((t * 7) % 5) * 0.12,
      r: 0.25,
    })),
    ...Array.from({ length: 9 }, (_e, t) => ({
      a: ((t + 0.5) / 9) * TAU,
      rad: 0.62,
      y: 2.75,
      L: 1.35 + ((t * 3) % 4) * 0.1,
      r: 0.23,
    })),
  ].forEach((strand, n) => {
    const a = strand.a + (b.random() - 0.5) * 0.18;
    const length = strand.L + (b.random() - 0.5) * 0.2;
    const width = strand.r * (0.9 + b.random() * 0.25);
    const geometry = new THREE.SphereGeometry(1, 9, 8);
    geometry.deleteAttribute('uv');
    const position = geometry.getAttribute('position');
    for (let e = 0; e < position.count; e++) {
      let x = position.getX(e);
      let y = position.getY(e);
      let z = position.getZ(e);
      const s = (1 - y) / 2;
      const taper = (1 - 0.55 * s * s) * (0.75 + 0.25 * Math.sin(Math.min(1, s * 3) * Math.PI * 0.5));
      const lump = 1 + noise3(x * 2 + n, y * 3.5, z * 2) * 0.12;
      x *= width * taper * lump;
      z *= width * 0.8 * taper * lump;
      y = -s * length;
      x += 0.28 * s * s;
      position.setXYZ(e, x, y, z);
    }
    geometry.computeVertexNormals();
    const at = v3(Math.cos(a) * strand.rad + 0.05, strand.y, Math.sin(a) * strand.rad);
    const matrix = new THREE.Matrix4().makeRotationY(-a).premultiply(new THREE.Matrix4().makeTranslation(at.x, at.y, at.z));
    b.add(geometry, matrix, {
      kind: PART.LEAF,
      color: (p, nn, out) => {
        const t = (strand.y - p.y) / length;
        const s = noise3(p.x * 9, p.y * 0.9, p.z * 9) * 0.16;
        sampleRamp(strandColors, 0.15 + t * 0.7 + s + nn.y * 0.1, out);
      },
      anchor: at,
      flex: (p) => clamp01((strand.y - p.y) / length) * 0.95 + 0.05,
    });
  });
  for (let t = 0; t < 12; t++) {
    const a = (t / 12) * TAU + 0.1;
    const r = 0.62 + b.random() * 0.2;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const start = dir
      .clone()
      .multiplyScalar(r * 0.75)
      .setY(2.6);
    const end = dir
      .clone()
      .multiplyScalar(r + 0.25)
      .setY(1.2 + b.random() * 0.5);
    const points = quadBezier(
      start,
      dir
        .clone()
        .multiplyScalar(r + 0.2)
        .setY(2.45),
      end,
      4,
    );
    b.add(
      tube(
        points,
        points.map((_p, i) => 0.013 - i * 0.0022),
        3,
      ),
      null,
      { kind: PART.WOOD, color: heightRamp(palette(`#8a7a40`, `#c2ac5a`), 1.2, 2.5), flex: (p) => clamp01((2.6 - p.y) / 1.4) },
    );
  }
  return b.build();
}
