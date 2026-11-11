// Ports bundle lines 21469-21939: ground and water recipes (grass_tuft, clover, fern, mushroom, lily_pad, water_lily,
// reeds, moss, succulent). The helpers jl (21445), Il (21687) and Ll (21705) are in ../geometry.ts.
import * as THREE from 'three';
import {
  PART,
  PlantBuilder,
  alignY,
  blobGeometry,
  bladeGeometry,
  clamp01,
  cup,
  ellipsoid,
  heightRamp,
  lathe,
  lilyPadColor,
  lilyPadGeometry,
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

export function buildGrassTuft(): THREE.BufferGeometry { // Ml (21469)
  const b = new PlantBuilder(223);
  const colors = palette(`#6a9c45`, `#86b552`, `#a8d066`, `#d0e88e`);
  for (let n = 0; n < 14; n++) {
    const a = n * 2.39996 + b.random() * 0.5;
    const h = 0.09 + b.random() * 0.1 + (n < 4 ? 0.05 : 0);
    const lean = 0.3 + b.random() * 0.55;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const sway = v3(-dir.z, 0, dir.x).multiplyScalar((b.random() - 0.5) * 0.05);
    const base = dir.clone().multiplyScalar(0.008 + b.random() * 0.04);
    const points = [
      base,
      base
        .clone()
        .addScaledVector(dir, lean * h * 0.25)
        .setY(h * 0.6),
      base
        .clone()
        .addScaledVector(dir, lean * h)
        .add(sway)
        .setY(h * (1 - lean * 0.35)),
    ];
    b.add(bladeGeometry(points, 0.009 + b.random() * 0.005), null, {
      kind: PART.EVER,
      color: (p, _n, out) => sampleRamp(colors, p.y / 0.2 + 0.1, out),
      anchor: v3(0, 0, 0),
      flex: (p) => clamp01(p.y / h),
      phase: n < 7 ? 0.55 + n * 0.05 : 0.02 + (n - 7) * 0.06,
    });
  }
  return b.build();
}

export function buildClover(): THREE.BufferGeometry { // Nl (21501)
  const b = new PlantBuilder(239);
  const leafColors = palette(`#2f6030`, `#4a8a3c`, `#6aa84c`, `#cfe0b0`);
  for (let n = 0; n < 5; n++) {
    const a = n * 2.39996;
    const r = 0.02 + b.random() * 0.05;
    const h = 0.045 + b.random() * 0.035;
    const top = v3(Math.cos(a) * r, h, Math.sin(a) * r);
    b.add(tube([v3(top.x * 0.3, 0, top.z * 0.3), top], [0.003, 0.0025], 3, false), null, {
      kind: PART.HERB,
      color: toColor(`#6a9a4a`),
      anchor: v3(0, 0, 0),
      flex: (p) => p.y / 0.1,
    });
    for (let k = 0; k < 3; k++) {
      const la = a + (k / 3) * TAU + 0.3;
      const dir = v3(Math.cos(la), 0.15, Math.sin(la));
      const points = quadBezier(top, top.clone().addScaledVector(dir, 0.015), top.clone().addScaledVector(dir, 0.03), 3);
      b.add(
        ribbon(points, (t) => 0.0165 * Math.sin(Math.PI * (0.08 + t * 0.8)) ** 0.5 * (1 - 0.25 * t ** 6), {
          up: v3(0, 1, 0),
          fold: 0.15,
        }),
        null,
        {
          kind: PART.HERB,
          color: (p, _n, out) => {
            const d = p.distanceTo(top) / 0.03;
            sampleRamp(leafColors, 0.35 + d * 0.35, out);
            if (d > 0.35 && d < 0.5) out.lerp(leafColors[3], 0.45);
          },
          anchor: v3(0, 0, 0),
          flex: (p) => p.y / 0.1,
          doubleSide: true,
        },
      );
    }
  }
  const flowerColors = palette(`#c8b8b8`, `#f0e8e8`, `#ffffff`);
  for (let t = 0; t < 2; t++) {
    const a = t * 2.8 + 0.6;
    const at = v3(Math.cos(a) * 0.035, 0.1 - t * 0.015, Math.sin(a) * 0.035);
    const phase = t === 0 ? 0.8 : 0.2;
    b.add(tube([v3(at.x * 0.3, 0, at.z * 0.3), at], [0.0028, 0.0024], 3, false), null, {
      kind: PART.HEAD,
      color: toColor(`#7aa058`),
      anchor: v3(0, 0, 0),
      flex: (p) => p.y / 0.1,
      phase,
    });
    b.add(
      blobGeometry(0.02, { detail: 1, lumps: 0.1, fine: 0.2, fineFreq: 9, seed: t }),
      trs(at.x, at.y + 0.012, at.z, 0, 0, 0, 1, 1.15, 1),
      {
        kind: PART.PETAL,
        color: (p, n, out) => sampleRamp(flowerColors, 0.2 + n.y * 0.6 + (p.y - at.y) * 20, out),
        anchor: v3(0, 0, 0),
        flex: (p) => p.y / 0.1,
        phase,
      },
    );
  }
  return b.build();
}

export function buildFern(): THREE.BufferGeometry { // Pl (21564)
  const b = new PlantBuilder(251);
  const colors = palette(`#2c5a30`, `#3f7a3f`, `#62a04c`, `#9ccc6a`);
  for (let n = 0; n < 7; n++) {
    const a = (n / 7) * TAU + b.random() * 0.4;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const side = v3(-dir.z, 0, dir.x);
    const reach = 0.36 + b.random() * 0.1;
    const h = 0.36 + b.random() * 0.1;
    const spine = quadBezier(
      dir.clone().multiplyScalar(0.01),
      dir
        .clone()
        .multiplyScalar(reach * 0.3)
        .setY(h * 1.2),
      dir
        .clone()
        .multiplyScalar(reach)
        .setY(h * 0.45),
      11,
    );
    const positions: number[] = [];
    const tri = (p: THREE.Vector3, q: THREE.Vector3, r: THREE.Vector3) =>
      positions.push(p.x, p.y, p.z, q.x, q.y, q.z, r.x, r.y, r.z);
    for (let e = 1; e < spine.length - 1; e++) {
      const t = e / (spine.length - 1);
      const w = 0.075 * Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.08)) ** 0.8;
      const p0 = spine[e];
      const p1 = spine[e + 1];
      const along = p1.clone().sub(p0).normalize();
      for (const s of [-1, 1]) {
        const tip = p0
          .clone()
          .addScaledVector(side, s * w)
          .addScaledVector(along, w * 0.45)
          .add(v3(0, -w * 0.25, 0));
        const mid = p0
          .clone()
          .lerp(p1, 0.5)
          .addScaledVector(side, s * w * 0.45)
          .add(v3(0, w * 0.08, 0));
        if (s > 0) {
          tri(p0, tip, mid);
          tri(mid, tip, p1);
          tri(p0, mid, p1);
        } else {
          tri(p0, mid, tip);
          tri(mid, p1, tip);
          tri(p0, p1, mid);
        }
      }
    }
    const frond = new THREE.BufferGeometry();
    frond.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    frond.computeVertexNormals();
    b.add(frond, null, {
      kind: PART.HERB,
      color: (p, nn, out) => sampleRamp(colors, 0.15 + (Math.hypot(p.x, p.z) / reach) * 0.75 + nn.y * 0.1, out),
      anchor: v3(0, 0, 0),
      flex: (p) => clamp01(Math.hypot(p.x, p.z) / reach),
      doubleSide: true,
    });
    b.add(
      tube(
        spine,
        spine.map((_p, t) => 0.005 * (1 - t / spine.length)),
        3,
        false,
      ),
      null,
      { kind: PART.HERB, color: toColor(`#4a6a35`), anchor: v3(0, 0, 0), flex: (p) => clamp01(Math.hypot(p.x, p.z) / reach) },
    );
  }
  return b.build();
}

export function buildMushroom(): THREE.BufferGeometry { // Fl (21630)
  const b = new PlantBuilder(263);
  const capColors = palette(`#9a2a22`, `#c23a30`, `#d9483b`, `#ec6a50`);
  const addMushroom = (m: THREE.Matrix4, spin: number) => {
    b.add(
      lathe(
        [
          [0.001, 0],
          [0.021, 0],
          [0.024, 0.02],
          [0.02, 0.06],
          [0.016, 0.085],
          [0.001, 0.086],
        ],
        7,
      ),
      m,
      { kind: PART.WOOD, color: heightRamp(palette(`#cdbba0`, `#efe4cf`, `#fbf5ea`), 0, 0.08) },
    );
    const capMatrix = m.clone().multiply(trs(0, 0.075, 0));
    b.add(
      lathe(
        [
          [0.001, 0],
          [0.05, 0.004],
          [0.068, 0],
          [0.07, 0.014],
          [0.058, 0.036],
          [0.032, 0.052],
          [0.001, 0.056],
        ],
        12,
      ),
      capMatrix,
      {
        kind: PART.WOOD,
        color: (_p, n, out) => {
          if (n.y < -0.3) out.set(`#e8d6ba`);
          else sampleRamp(capColors, 0.3 + n.y * 0.5, out);
        },
      },
    );
    for (let t = 0; t < 8; t++) {
      const a = t * 2.39996 + spin;
      const el = t === 0 ? 1.45 : 0.55 + (t % 3) * 0.28;
      const dir = v3(Math.cos(a) * Math.cos(el), Math.sin(el), Math.sin(a) * Math.cos(el));
      const at = v3(dir.x * 0.066, 0.004 + dir.y * 0.05, dir.z * 0.066);
      const r = 0.009 + (t % 2) * 0.004;
      b.add(ellipsoid(r, 0.0035, r, 5, 2), capMatrix.clone().multiply(alignY(at, dir)), { kind: PART.WOOD, color: toColor(`#fbf6ec`) });
    }
  };
  addMushroom(trs(0, 0, 0, 0, 0, 0, 1.3), 0);
  addMushroom(trs(0.1, 0, 0.045, 0.12, 1.3, -0.15, 0.8), 1.3);
  addMushroom(trs(-0.065, 0, 0.08, -0.1, 0.4, 0.1, 0.55), 2.2);
  return b.build();
}

export function buildLilyPad(): THREE.BufferGeometry { // Rl (21717)
  const b = new PlantBuilder(271);
  b.add(lilyPadGeometry(0.22), null, { kind: PART.HERB, color: lilyPadColor(0.22), anchor: v3(0, 0, 0) });
  const m = trs(0.23, 0.001, 0.14, 0, 2.1, 0, 0.55);
  b.add(lilyPadGeometry(0.22), m, { kind: PART.HERB, color: lilyPadColor(0.12, 0.23, 0.14), anchor: v3(0.23, 0, 0.14) });
  return b.build();
}

export function buildWaterLily(): THREE.BufferGeometry { // zl (21723)
  const b = new PlantBuilder(283);
  b.add(lilyPadGeometry(0.24), trs(0, 0, 0, 0, 0.8), { kind: PART.HERB, color: lilyPadColor(0.24), anchor: v3(0, 0, 0) });
  const center = v3(0.03, 0.02, 0.02);
  const petalColors = palette(`#fdf3f6`, `#fbe0ea`, `#f6aecb`, `#ef8fb4`);
  [
    { n: 9, len: 0.1, up: 0.3, off: 0 },
    { n: 8, len: 0.085, up: 0.75, off: 0.35 },
    { n: 6, len: 0.06, up: 1.15, off: 0.1 },
  ].forEach((row, i) => {
    for (let k = 0; k < row.n; k++) {
      const a = ((k + row.off) / row.n) * TAU;
      const dir = v3(Math.cos(a), 0, Math.sin(a));
      const tip = center
        .clone()
        .addScaledVector(dir, row.len * Math.cos(row.up * 0.8))
        .add(v3(0, row.len * Math.sin(row.up * 0.8) + 0.01, 0));
      const mid = center
        .clone()
        .addScaledVector(dir, row.len * 0.5 * Math.cos(row.up * 0.5))
        .add(v3(0, row.len * 0.5 * Math.sin(row.up * 0.5), 0));
      const points = quadBezier(center.clone().addScaledVector(dir, 0.008), mid, tip, 4);
      b.add(
        ribbon(points, (t) => 0.024 * (1 - i * 0.15) * Math.sin(Math.PI * (0.12 + 0.88 * t)) ** 0.75, {
          up: v3(0, 1, 0).addScaledVector(dir, -0.4),
          fold: 0.35,
        }),
        null,
        {
          kind: PART.PETAL,
          color: (p, _n, out) => sampleRamp(petalColors, (p.distanceTo(center) / row.len) * 0.95 + i * 0.05, out),
          anchor: center,
          doubleSide: true,
        },
      );
    }
  });
  b.add(
    blobGeometry(0.02, { detail: 1, lumps: 0.1, fine: 0.25, fineFreq: 12 }),
    trs(center.x, center.y + 0.012, center.z, 0, 0, 0, 1, 0.8, 1),
    { kind: PART.HEAD, color: heightRamp(palette(`#e0a030`, `#f2c14e`, `#fae08a`), center.y, center.y + 0.03), anchor: center },
  );
  b.add(ellipsoid(0.026, 0.05, 0.026, 7, 5), trs(center.x, center.y + 0.035, center.z), {
    kind: PART.BUD,
    color: heightRamp(palette(`#7aa050`, `#b5c88a`, `#f2a6c2`), center.y, center.y + 0.08),
    anchor: center,
  });
  return b.build();
}

export function buildReeds(): THREE.BufferGeometry { // Bl (21774)
  const b = new PlantBuilder(293);
  const colors = palette(`#46703a`, `#5f8a42`, `#8aa84a`, `#b9c46a`);
  for (let n = 0; n < 10; n++) {
    const a = n * 2.39996 + b.random() * 0.4;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const h = 0.5 + b.random() * 0.4;
    const lean = 0.1 + b.random() * 0.3;
    const base = dir.clone().multiplyScalar(0.02 + b.random() * 0.06);
    const points = quadBezier(
      base,
      base
        .clone()
        .addScaledVector(dir, h * lean * 0.2)
        .setY(h * 0.6),
      base
        .clone()
        .addScaledVector(dir, h * lean)
        .setY(h * (1 - lean * lean)),
      4,
    );
    b.add(
      ribbon(points, (t) => 0.014 * (1 - t * 0.85), { up: dir, fold: 0.3 }),
      null,
      {
        kind: PART.EVER,
        color: (p, _n, out) => sampleRamp(colors, p.y / 0.9, out),
        anchor: v3(0, 0, 0),
        flex: (p) => clamp01(p.y / h),
        doubleSide: true,
      },
    );
  }
  const headColors = palette(`#4a2e20`, `#6e4a32`, `#8a5e3e`);
  for (let r = 0; r < 3; r++) {
    const a = r * 2.2 + 0.5;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const h = 0.8 + r * 0.07;
    const base = dir.clone().multiplyScalar(0.03);
    const top = base.clone().addScaledVector(dir, 0.05).setY(h);
    b.add(
      tube(
        [
          base,
          base
            .clone()
            .addScaledVector(dir, 0.02)
            .setY(h * 0.5),
          top,
        ],
        [0.006, 0.005, 0.004],
        4,
        false,
      ),
      null,
      { kind: PART.EVER, color: heightRamp(colors, 0, 0.9), anchor: v3(0, 0, 0), flex: (p) => clamp01(p.y / h) },
    );
    const at = top.clone().add(v3(0, -0.08, 0));
    b.add(new THREE.CapsuleGeometry(0.022, 0.085, 3, 7).deleteAttribute('uv'), trs(at.x, at.y, at.z), {
      kind: PART.WOOD,
      color: (p, n, out) => sampleRamp(headColors, 0.3 + n.y * 0.3 + noise3(p.x * 60, p.y * 60, p.z * 60) * 0.15, out),
      anchor: at,
      flex: 0.95,
    });
    b.add(tube([top.clone().add(v3(0, -0.02, 0)), top.clone().add(v3(0.004, 0.07, 0))], [0.003, 0.001], 3), null, {
      kind: PART.WOOD,
      color: toColor(`#8a7a4a`),
      flex: 1,
    });
  }
  return b.build();
}

export function buildMoss(): THREE.BufferGeometry { // Vl (21846)
  const b = new PlantBuilder(307);
  const colors = palette(`#3f5f28`, `#56782f`, `#74963e`, `#9db85a`);
  for (let n = 0; n < 9; n++) {
    const a = n * 2.39996;
    const d = n === 0 ? 0 : 0.05 + b.random() * 0.08;
    const r = 0.055 + b.random() * 0.035 - d * 0.12;
    const at = v3(Math.cos(a) * d, -0.012, Math.sin(a) * d);
    b.add(blobGeometry(r, { detail: 1, lumps: 0.2, fine: 0.16, fineFreq: 14, seed: n, sy: 0.36 }), trs(at.x, at.y, at.z), {
      kind: PART.EVER,
      color: (p, nn, out) => sampleRamp(colors, 0.2 + nn.y * 0.5 + noise3(p.x * 40, p.y * 40, p.z * 40) * 0.2, out),
      anchor: at,
    });
  }
  for (let t = 0; t < 9; t++) {
    const a = t * 1.7 + 0.3;
    const d = b.random() * 0.12;
    const base = v3(Math.cos(a) * d, 0.02, Math.sin(a) * d);
    const tip = base.clone().add(v3((b.random() - 0.5) * 0.01, 0.035 + b.random() * 0.02, 0));
    b.add(tube([base, tip], [0.0015, 0.001], 3, false), null, {
      kind: PART.EVER,
      color: toColor(`#a08a4a`),
      anchor: v3(0, 0, 0),
      flex: 0.5,
    });
    b.add(ellipsoid(0.004, 0.007, 0.004, 4, 3), trs(tip.x, tip.y, tip.z), {
      kind: PART.EVER,
      color: toColor(`#c2703a`),
      anchor: v3(0, 0, 0),
      flex: 0.5,
    });
  }
  return b.build();
}

export function buildSucculent(): THREE.BufferGeometry { // Hl (21880)
  const b = new PlantBuilder(317);
  const colors = palette(`#4f7f75`, `#6f9f8f`, `#8fbfaa`, `#d99aa8`);
  const leafGeometry = (length: number, width: number) => {
    const geometry = new THREE.SphereGeometry(1, 6, 5);
    geometry.deleteAttribute('uv');
    geometry.translate(0, 0, 1);
    const position = geometry.getAttribute('position');
    for (let k = 0; k < position.count; k++) {
      const z = position.getZ(k) / 2;
      const taper = 1 - z ** 2.2 * 0.75;
      position.setXYZ(k, position.getX(k) * width * taper, position.getY(k) * width * 0.45 * taper + z * z * 0.25 * width, z * length);
    }
    geometry.computeVertexNormals();
    return geometry;
  };
  [
    { n: 9, len: 0.075, w: 0.024, tilt: 0.35 },
    { n: 7, len: 0.062, w: 0.022, tilt: 0.7 },
    { n: 5, len: 0.045, w: 0.018, tilt: 1.05 },
    { n: 3, len: 0.028, w: 0.013, tilt: 1.3 },
  ].forEach((row, i) => {
    for (let k = 0; k < row.n; k++) {
      const a = ((k + i * 0.5) / row.n) * TAU;
      const m = trs(0, 0.012 + i * 0.008, 0, -row.tilt, -a + Math.PI / 2, 0);
      b.add(leafGeometry(row.len, row.w), m, {
        kind: PART.EVER,
        color: (p, n, out) => {
          const d = Math.hypot(p.x, p.z) / (row.len * Math.cos(row.tilt) + 0.001);
          sampleRamp(colors, 0.15 + d * 0.55 + n.y * 0.15 + (d > 0.85 ? 0.3 : 0), out);
        },
        anchor: v3(0, 0, 0),
      });
    }
  });
  const stem = quadBezier(v3(0.005, 0.03, 0), v3(0.02, 0.17, 0), v3(0.07, 0.19, 0.01), 5);
  b.add(
    tube(
      stem,
      stem.map(() => 0.0028),
      3,
      false,
    ),
    null,
    { kind: PART.HEAD, color: toColor(`#b58a7a`), anchor: v3(0, 0, 0), flex: (p) => p.y / 0.2 },
  );
  for (let t = 0; t < 3; t++) {
    const at = stem[3 + Math.min(2, t)].clone().add(v3(0.006 * t, -0.004, 0));
    b.add(
      cup((v) => [0.004 + 0.007 * v, 0.014 * v], { segments: 8, rings: 2, lobes: 5, lobeFlare: 0.3 }),
      alignY(at, v3(0.3, -1, 0.1).normalize()),
      {
        kind: PART.PETAL,
        color: heightRamp(palette(`#e0604a`, `#f59a7a`, `#ffd0a0`), at.y - 0.015, at.y),
        anchor: v3(0, 0, 0),
        flex: (p) => p.y / 0.2,
        doubleSide: true,
      },
    );
  }
  return b.build(1.35);
}
