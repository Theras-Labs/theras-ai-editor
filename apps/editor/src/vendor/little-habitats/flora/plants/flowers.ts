// Ports bundle lines 21056-21444: flower recipes (tulip, daisy, poppy, sunflower, foxglove, bluebell).
// The basal leaf helper wl (21025) is in ../geometry.ts as addLeafBlade.
import * as THREE from 'three';
import {
  PART,
  PlantBuilder,
  addLeafBlade,
  alignY,
  cup,
  distanceRamp,
  ellipsoid,
  heightRamp,
  lathe,
  noise3,
  palette,
  quadBezier,
  ribbon,
  sampleRamp,
  TAU,
  toColor,
  trs,
  tube,
  v3,
} from '../geometry';

export function buildTulip(): THREE.BufferGeometry { // Tl (21056)
  const b = new PlantBuilder(131);
  const leafColors = palette(`#3f7550`, `#5a9463`, `#86b67a`);
  addLeafBlade(b, 0.3, 0.2, 0.034, 0.95, leafColors, { fold: 0.45 });
  addLeafBlade(b, 3.3, 0.17, 0.03, 1.1, leafColors, { fold: 0.45 });
  const top = v3(0.008, 0.25, 0);
  const stem = quadBezier(v3(0, 0, 0), v3(0.012, 0.12, 0), top, 4);
  b.add(
    tube(
      stem,
      stem.map(() => 0.008),
      5,
      true,
    ),
    null,
    { kind: PART.HEAD, color: heightRamp(palette(`#4f8a45`, `#7ab05a`), 0, 0.25), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.3 },
  );
  const at = v3(top.x, top.y - 0.005, top.z);
  const petalColors = palette(`#b89f8f`, `#e6d6cf`, `#fbf3ef`, `#ffffff`);
  const bloom = cup((t) => [0.012 + 0.052 * Math.sin(t * Math.PI * 0.62), 0.105 * t], {
    segments: 18,
    rings: 5,
    lobes: 6,
    lobeDepth: 0.22,
  });
  b.add(bloom, trs(at.x, at.y, at.z), { kind: PART.PETAL, color: heightRamp(petalColors, at.y, at.y + 0.09), anchor: at, flex: 1, doubleSide: true });
  b.add(ellipsoid(0.03, 0.052, 0.03, 7, 5), trs(at.x, at.y + 0.04, at.z), {
    kind: PART.BUD,
    color: heightRamp(palette(`#6f9f55`, `#a6c878`, `#d9c9a0`), at.y, at.y + 0.08),
    anchor: v3(0, 0, 0),
    flex: 1,
  });
  return b.build();
}

export function buildDaisy(): THREE.BufferGeometry { // El (21091)
  const b = new PlantBuilder(149);
  const leafColors = palette(`#3f7a3f`, `#5f9a4c`, `#86bb5c`);
  for (let n = 0; n < 6; n++) addLeafBlade(b, n * 1.05 + 0.2, 0.075 + b.random() * 0.02, 0.016, 0.35, leafColors, { fold: 0.2, segs: 3 });
  const heads = [
    { at: v3(0, 0.2, 0), tilt: 0.15 },
    { at: v3(0.05, 0.16, 0.03), tilt: 0.35 },
    { at: v3(-0.045, 0.135, 0.035), tilt: 0.4 },
    { at: v3(0.02, 0.175, -0.05), tilt: 0.3 },
  ];
  const petalColors = palette(`#e9e0d6`, `#fbf7ee`, `#fffdf8`, `#f6d3dc`);
  heads.forEach((head, n) => {
    const phase = n === 0 ? 0.75 : 0.1 + n * 0.08;
    const stem = quadBezier(v3(head.at.x * 0.2, 0, head.at.z * 0.2), v3(head.at.x * 0.4, head.at.y * 0.6, head.at.z * 0.4), head.at, 4);
    b.add(
      tube(
        stem,
        stem.map(() => 0.0035),
        3,
        true,
      ),
      null,
      { kind: PART.HEAD, color: toColor(`#6a9f4f`), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.2, phase },
    );
    const out = v3(head.at.x, 0, head.at.z).normalize();
    const up = v3(out.x * Math.sin(head.tilt), Math.cos(head.tilt), out.z * Math.sin(head.tilt));
    const m = alignY(head.at, up, 1, n);
    b.add(ellipsoid(0.02, 0.011, 0.02, 8, 4), m, {
      kind: PART.HEAD,
      color: (_p, nn, c) => sampleRamp(palette(`#d99a2a`, `#f2c14e`, `#f8d86a`), 0.3 + nn.y * 0.7, c),
      anchor: v3(0, 0, 0),
      flex: 1,
      phase,
    });
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * TAU;
      const dir = v3(Math.cos(a), 0.12, Math.sin(a));
      const points = quadBezier(
        v3(dir.x * 0.012, 0.002, dir.z * 0.012),
        v3(dir.x * 0.032, 0.007, dir.z * 0.032),
        v3(dir.x * 0.058, 0.005, dir.z * 0.058),
        2,
      );
      b.add(
        ribbon(points, (t) => 0.0085 * Math.sin(Math.PI * (0.25 + t * 0.75)), { up: v3(0, 1, 0), simple: true }),
        m,
        {
          kind: PART.PETAL,
          color: (p, _n, c) => sampleRamp(petalColors, p.distanceTo(head.at) / 0.058, c),
          anchor: head.at,
          flex: 1,
          phase,
          doubleSide: true,
        },
      );
    }
    b.add(ellipsoid(0.014, 0.018, 0.014, 5, 4), m, {
      kind: PART.BUD,
      color: toColor(`#8fb55a`),
      anchor: v3(0, 0, 0),
      flex: 1,
      phase,
    });
  });
  return b.build();
}

export function buildPoppy(): THREE.BufferGeometry { // Dl (21159)
  const b = new PlantBuilder(163);
  const leafColors = palette(`#4f7a48`, `#6f9a5a`, `#9cbf80`);
  for (let n = 0; n < 4; n++) addLeafBlade(b, n * 1.6 + 0.4, 0.12, 0.022, 0.6, leafColors, { jag: 0.45, fold: 0.2 });
  const top = v3(0.02, 0.36, 0.01);
  const stem = quadBezier(v3(0, 0, 0), v3(0.04, 0.2, 0), top, 6);
  b.add(
    tube(
      stem,
      stem.map(() => 0.0045),
      4,
      true,
    ),
    null,
    { kind: PART.HEAD, color: heightRamp(palette(`#5a8a45`, `#86aa5a`), 0, 0.36), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.36 },
  );
  const petalColors = palette(`#2b2226`, `#6a5555`, `#d8d2d0`, `#ffffff`, `#ffffff`);
  const bloom = cup((t) => [0.01 + 0.07 * Math.sin((t * Math.PI) / 2) ** 0.9, 0.05 * t ** 0.75], {
    segments: 20,
    rings: 5,
    lobes: 4,
    lobeDepth: 0.1,
    lobeFlare: 0.18,
  });
  b.add(bloom, trs(top.x, top.y, top.z, 0.1, 0, 0.05), {
    kind: PART.PETAL,
    color: distanceRamp(petalColors, top, 0.078, 4),
    anchor: top,
    flex: 1,
    doubleSide: true,
  });
  b.add(
    lathe(
      [
        [0.001, 0],
        [0.012, 0.004],
        [0.013, 0.016],
        [0.009, 0.024],
        [0.001, 0.025],
      ],
      7,
    ),
    trs(top.x, top.y, top.z),
    { kind: PART.HEAD, color: heightRamp(palette(`#5f7a55`, `#8fa272`, `#3a3040`), top.y, top.y + 0.025), anchor: v3(0, 0, 0), flex: 1 },
  );
  b.add(ellipsoid(0.017, 0.028, 0.017, 7, 5), trs(top.x + 0.012, top.y - 0.012, top.z, 0, 0, -1.1), {
    kind: PART.BUD,
    color: heightRamp(palette(`#5f8a45`, `#8fb065`), top.y - 0.03, top.y + 0.01),
    anchor: v3(0, 0, 0),
    flex: 1,
  });
  return b.build();
}

export function buildSunflower(): THREE.BufferGeometry { // Ol (21214)
  const b = new PlantBuilder(179);
  const stem = quadBezier(v3(0, 0, 0), v3(0.03, 0.5, 0), v3(0, 0.94, -0.01), 8);
  b.add(
    tube(
      stem,
      stem.map((_p, t) => 0.024 - t * 0.001),
      6,
      true,
    ),
    null,
    { kind: PART.STEM, color: heightRamp(palette(`#4a7a35`, `#6a9a45`, `#86b25a`), 0, 1), anchor: v3(0, 0, 0), flex: (p) => p.y / 1 },
  );
  const leafColors = palette(`#3d6e30`, `#56893f`, `#7fb05a`, `#a2c86e`);
  [0.18, 0.33, 0.48, 0.62, 0.76].forEach((y, r) => {
    const a = r * 2.5 + 0.3;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const base = v3(0.02, y, 0);
    const length = 0.2 - r * 0.022;
    const points = quadBezier(
      base,
      base
        .clone()
        .addScaledVector(dir, length * 0.5)
        .add(v3(0, length * 0.35, 0)),
      base
        .clone()
        .addScaledVector(dir, length)
        .add(v3(0, -length * 0.05, 0)),
      5,
    );
    b.add(
      ribbon(points, (t) => length * 0.36 * Math.sin(Math.PI * Math.min(1, t * 0.85 + 0.15)) ** 0.8, { up: v3(0, 1, 0), fold: 0.3 }),
      null,
      {
        kind: PART.STEM,
        color: (p, n, out) => sampleRamp(leafColors, 0.2 + (p.distanceTo(base) / length) * 0.7 + n.y * 0.1, out),
        anchor: v3(0, 0, 0),
        flex: (p) => p.y / 1,
        doubleSide: true,
      },
    );
  });
  const head = v3(0, 0.96, 0);
  const turn = PART.TURN;
  const discColors = palette(`#2e1c12`, `#4a2e1c`, `#6e4424`, `#8a5a2a`);
  b.add(
    lathe(
      [
        [0.1, 0],
        [0.105, 0.012],
        [0.09, 0.02],
        [0.05, 0.03],
        [0.001, 0.035],
      ],
      18,
    ),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(trs(head.x, head.y, head.z + 0.02)),
    {
      kind: PART.HEAD + turn,
      color: (p, _n, out) => {
        const d = Math.hypot(p.x - head.x, p.y - head.y) / 0.105;
        sampleRamp(discColors, d * 0.9 + noise3(p.x * 80, p.y * 80, 1) * 0.15, out);
      },
      anchor: head,
      flex: 1,
    },
  );
  b.add(
    lathe(
      [
        [0.001, -0.04],
        [0.02, -0.04],
        [0.06, -0.035],
        [0.095, -0.02],
        [0.1, 0],
      ],
      14,
    ),
    new THREE.Matrix4().makeRotationX(Math.PI / 2).premultiply(trs(head.x, head.y, head.z + 0.02)),
    { kind: PART.HEAD + turn, color: heightRamp(palette(`#4a7a35`, `#6a9a45`), head.y - 0.1, head.y + 0.1), anchor: head, flex: 1 },
  );
  const petalColors = palette(`#d98a1a`, `#f0b42a`, `#f7cc3a`, `#ffe070`);
  for (let t = 0; t < 2; t++)
    for (let n = 0; n < 17; n++) {
      const a = ((n + t * 0.5) / 17) * TAU;
      const dir = v3(Math.cos(a), Math.sin(a), 0);
      const length = t === 0 ? 0.095 : 0.08;
      const inner = 0.085;
      const z = head.z + 0.02 + (t === 0 ? 0.004 : 0.012);
      const points = quadBezier(
        v3(head.x + dir.x * inner, head.y + dir.y * inner, z),
        v3(head.x + dir.x * (inner + length * 0.5), head.y + dir.y * (inner + length * 0.5), z + 0.012),
        v3(head.x + dir.x * (inner + length), head.y + dir.y * (inner + length), z + 0.004 - t * 0.01),
        3,
      );
      b.add(
        ribbon(points, (k) => 0.02 * Math.sin(Math.PI * (0.2 + 0.8 * k)), { up: v3(0, 0, 1), fold: 0.25 }),
        null,
        {
          kind: PART.PETAL + turn,
          color: (p, _n, out) => sampleRamp(petalColors, (Math.hypot(p.x - head.x, p.y - head.y) - inner) / length + t * 0.1, out),
          anchor: head,
          flex: 1,
          doubleSide: true,
        },
      );
    }
  b.add(ellipsoid(0.06, 0.06, 0.04, 9, 6), trs(head.x, head.y, head.z + 0.015), {
    kind: PART.BUD + turn,
    color: heightRamp(palette(`#4f7f3a`, `#8ab45a`), head.y - 0.06, head.y + 0.06),
    anchor: head,
    flex: 1,
  });
  return b.build();
}

export function buildFoxglove(): THREE.BufferGeometry { // kl (21332)
  const b = new PlantBuilder(191);
  const leafColors = palette(`#3f6f45`, `#5c8a55`, `#86ad70`);
  for (let n = 0; n < 6; n++) addLeafBlade(b, n * 1.05, 0.15, 0.04, 0.4, leafColors, { fold: 0.25 });
  const stem = quadBezier(v3(0, 0, 0), v3(0.012, 0.35, 0), v3(0, 0.7, 0.01), 8);
  b.add(
    tube(
      stem,
      stem.map((_p, t) => 0.009 - t * 6e-4),
      5,
      true,
    ),
    null,
    { kind: PART.HEAD, color: heightRamp(palette(`#4f7a40`, `#7aa05a`), 0, 0.7), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.7 },
  );
  const bellColors = palette(`#8a7a8a`, `#cfc6cf`, `#f4eef4`, `#ffffff`);
  const spotColor = toColor(`#5a2a4a`);
  for (let t = 0; t < 13; t++) {
    const k = t / 12;
    const y = 0.28 + k * 0.36;
    const a = -1.6 + (t % 2 ? 0.9 : -0.9) + k * 0.8 + (b.random() - 0.5) * 0.4;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const s = 1 - k * 0.45;
    const at = v3(0.006, y, 0.005).addScaledVector(dir, 0.008);
    const down = dir
      .clone()
      .multiplyScalar(0.55)
      .add(v3(0, -0.8, 0))
      .normalize();
    const bell = cup((v) => [(0.011 + 0.013 * v ** 1.6) * s, 0.052 * s * v], {
      segments: 8,
      rings: 3,
      lobes: 5,
      lobeDepth: 0.08,
      lobeFlare: 0.2,
    });
    const m = alignY(at.clone().addScaledVector(down, 0.004), down, 1, b.random() * TAU);
    b.add(bell, m, {
      kind: PART.PETAL,
      color: (p, _n, out) => {
        const d = p.distanceTo(at) / (0.052 * s);
        sampleRamp(bellColors, 0.2 + d * 0.8, out);
        if (d > 0.5 && noise3(p.x * 250, p.y * 250, p.z * 250) > 0.35) out.lerp(spotColor, 0.6);
      },
      anchor: at,
      flex: (p) => p.y / 0.7,
      doubleSide: true,
      faceColor: true,
    });
    b.add(ellipsoid(0.011 * s, 0.02 * s, 0.011 * s, 4, 3), alignY(at.clone().addScaledVector(down, 0.014 * s), down), {
      kind: PART.BUD,
      color: toColor(`#8aaa64`),
      anchor: v3(0, 0, 0),
      flex: (p) => p.y / 0.7,
    });
  }
  for (let t = 0; t < 6; t++) {
    const y = 0.645 + t * 0.012;
    const a = t * 2.1;
    const at = v3(Math.cos(a) * 0.01, y, Math.sin(a) * 0.01);
    b.add(ellipsoid(0.008 - t * 8e-4, 0.012, 0.008 - t * 8e-4, 5, 4), trs(at.x, at.y, at.z), {
      kind: PART.HEAD,
      color: toColor(`#8aa860`),
      anchor: v3(0, 0, 0),
      flex: 1,
    });
  }
  return b.build();
}

export function buildBluebell(): THREE.BufferGeometry { // Al (21400)
  const b = new PlantBuilder(211);
  const leafColors = palette(`#3a6a45`, `#558a55`, `#7fae6c`);
  for (let n = 0; n < 4; n++) addLeafBlade(b, n * 1.55 + 0.6, 0.17, 0.012, 0.5, leafColors, { fold: 0.4 });
  const stem = quadBezier(v3(0, 0, 0), v3(0, 0.33, 0), v3(0.1, 0.2, 0), 10);
  b.add(
    tube(
      stem,
      stem.map(() => 0.004),
      4,
      true,
    ),
    null,
    { kind: PART.HEAD, color: heightRamp(palette(`#4f7a45`, `#7aa060`), 0, 0.25), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.25 },
  );
  const bellColors = palette(`#9aa0c0`, `#d8dcef`, `#ffffff`);
  for (let t = 0; t < 6; t++) {
    const i = 4 + t;
    const at = stem[Math.min(stem.length - 1, i)];
    const s = 1 - t * 0.07;
    const side = t % 2 ? 1 : -1;
    const down = v3(0.25, -1, side * 0.35).normalize();
    const bell = cup((v) => [(0.007 + 0.015 * v ** 1.3) * s, 0.034 * s * v], {
      segments: 10,
      rings: 4,
      lobes: 6,
      lobeDepth: -0.1,
      lobeFlare: 0.45,
    });
    b.add(bell, alignY(at.clone().add(v3(0, -0.006, side * 0.006)), down), {
      kind: PART.PETAL,
      color: (p, _n, out) => sampleRamp(bellColors, p.distanceTo(at) / (0.03 * s), out),
      anchor: at,
      flex: (p) => p.y / 0.25,
      doubleSide: true,
    });
    b.add(ellipsoid(0.007 * s, 0.012 * s, 0.007 * s, 5, 3), alignY(at.clone().add(v3(0, -0.012, side * 0.006)), down), {
      kind: PART.BUD,
      color: toColor(`#7a9f6a`),
      anchor: v3(0, 0, 0),
      flex: (p) => p.y / 0.25,
    });
  }
  return b.build();
}
