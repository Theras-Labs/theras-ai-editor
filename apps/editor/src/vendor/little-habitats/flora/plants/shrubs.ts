// Ports bundle lines 20808-21024: shrub recipes (rose_bush, lavender, hydrangea, hedge, berry_bush).
// The twig helper vl (20796) is in ../geometry.ts as addTwigs.
import * as THREE from 'three';
import {
  PART,
  PlantBuilder,
  addBlobs,
  addTwigs,
  alignY,
  blobGeometry,
  bladeGeometry,
  canopyColor,
  clamp01,
  cup,
  distanceRamp,
  ellipsoid,
  heightRamp,
  noise3,
  palette,
  quadBezier,
  roundedBlock,
  sampleRamp,
  scatterOnBlobs,
  TAU,
  toColor,
  trs,
  tube,
  v3,
  type Blob,
} from '../geometry';

export function buildRoseBush(): THREE.BufferGeometry { // yl (20808)
  const b = new PlantBuilder(71);
  addTwigs(b, 7, 0.62, 0.32, heightRamp(palette(`#4d3f2a`, `#6a6a3a`, `#7d8a45`), 0, 0.6));
  const blobs: Blob[] = [
    { c: v3(0, 0.44, 0), r: 0.27 },
    { c: v3(0.03, 0.62, 0.02), r: 0.19 },
  ];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * TAU + 0.3;
    blobs.push({
      c: v3(Math.cos(a) * 0.24, 0.3 + (b.random() - 0.5) * 0.1, Math.sin(a) * 0.24),
      r: 0.18 + b.random() * 0.05,
    });
  }
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#1f4029`, `#2f5a34`, `#477a3e`, `#6f9e4f`), v3(0, 0.4, 0), 0.42, 0.18), {
    lumps: 0.2,
    fine: 0.12,
    detail: 2,
  });
  const petalColors = palette(`#9a8a8a`, `#d6c9c9`, `#f3eded`, `#ffffff`);
  const spots = scatterOnBlobs(b, blobs, 11, 0, 0.05);
  for (const { p, n } of spots) {
    const s = 0.85 + b.random() * 0.35;
    const m = alignY(
      p,
      n
        .clone()
        .add(v3(0, 0.6, 0))
        .normalize(),
      s,
      b.random() * TAU,
    );
    b.add(
      cup((t) => [0.014 + 0.044 * Math.sin((t * Math.PI) / 2), 0.048 * t], {
        segments: 10,
        rings: 2,
        lobes: 5,
        lobeDepth: 0.18,
        lobeFlare: 0.15,
      }),
      m,
      { kind: PART.PETAL, color: distanceRamp(petalColors, p, 0.07), anchor: p, doubleSide: true },
    );
    b.add(ellipsoid(0.03, 0.032, 0.03, 6, 4), m.clone().multiply(trs(0, 0.022, 0)), {
      kind: PART.PETAL,
      color: petalColors[1],
      anchor: p,
    });
    b.add(ellipsoid(0.026, 0.034, 0.026, 5, 4), m.clone().multiply(trs(0, 0.015, 0)), {
      kind: PART.FRUIT,
      color: heightRamp(palette(`#b8402a`, `#e0643a`), p.y - 0.03, p.y + 0.03),
      anchor: p,
    });
  }
  return b.build();
}

export function buildLavender(): THREE.BufferGeometry { // bl (20864)
  const b = new PlantBuilder(83);
  const leafColors = palette(`#5f7a5c`, `#86a080`, `#abc2a2`, `#d0dcc4`);
  for (let n = 0; n < 44; n++) {
    const a = n * 2.39996 + b.random() * 0.3;
    const h = 0.2 + b.random() * 0.13;
    const lean = 0.35 + b.random() * 0.55;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const base = dir.clone().multiplyScalar(0.02 + b.random() * 0.05);
    const points = [
      base,
      base
        .clone()
        .addScaledVector(dir, lean * h * 0.35)
        .setY(h * 0.6),
      base
        .clone()
        .addScaledVector(dir, lean * h)
        .setY(h * (1 - lean * 0.3)),
    ];
    b.add(bladeGeometry(points, 0.012, 0.1), null, {
      kind: PART.EVER,
      color: (p, _n, out) => sampleRamp(leafColors, p.y / 0.26 + 0.1, out),
      doubleSide: true,
      flex: (p) => clamp01(p.y / h),
      anchor: v3(0, 0, 0),
    });
  }
  const flowerColors = palette(`#5a489a`, `#7a66c0`, `#a08ce0`, `#cbbdf4`);
  const stemColor = toColor(`#94ab86`);
  for (let t = 0; t < 28; t++) {
    const a = t * 2.39996 + 0.4;
    const reach = 0.06 + b.random() * 0.26;
    const h = 0.46 + b.random() * 0.14 - reach * 0.2;
    const dir = v3(Math.cos(a), 0, Math.sin(a));
    const base = dir.clone().multiplyScalar(0.03);
    const tip = dir.clone().multiplyScalar(reach).setY(h);
    const stem = quadBezier(
      base,
      dir
        .clone()
        .multiplyScalar(reach * 0.2)
        .setY(h * 0.55),
      tip,
      4,
    );
    const flex = (p: THREE.Vector3) => clamp01(p.y / h);
    const anchor = v3(0, 0, 0);
    b.add(
      tube(
        stem.slice(0, 4),
        stem.slice(0, 4).map(() => 0.004),
        3,
        false,
      ),
      null,
      { kind: PART.HEAD, color: stemColor, anchor, flex },
    );
    const up = tip.clone().sub(stem[3]).normalize();
    const spike: THREE.Vector3[] = [];
    const radii: number[] = [];
    for (let e = 0; e <= 6; e++) {
      const k = e / 6;
      spike.push(tip.clone().addScaledVector(up, -0.13 + k * 0.14));
      radii.push((e % 2 ? 0.024 : 0.017) * (1 - k * 0.5) + 0.002);
    }
    b.add(tube(spike, radii, 4, true), null, { kind: PART.HEAD, color: heightRamp(flowerColors, tip.y - 0.13, tip.y + 0.02), anchor, flex });
  }
  return b.build();
}

export function buildHydrangea(): THREE.BufferGeometry { // xl (20933)
  const b = new PlantBuilder(97);
  addTwigs(b, 5, 0.45, 0.2, heightRamp(palette(`#4d3f2e`, `#6a5a40`), 0, 0.5), 0.018);
  const blobs: Blob[] = [{ c: v3(0, 0.33, 0), r: 0.28 }];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * TAU + 0.2;
    blobs.push({
      c: v3(Math.cos(a) * 0.26, 0.24 + (b.random() - 0.5) * 0.08, Math.sin(a) * 0.26),
      r: 0.2 + b.random() * 0.05,
    });
  }
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#264a2c`, `#3a6b3a`, `#5a9148`, `#8cc063`), v3(0, 0.3, 0), 0.45, 0.14), {
    lumps: 0.25,
    fine: 0.1,
  });
  const heads: Blob[] = [{ c: v3(0.02, 0.63, 0), r: 0.165 }];
  for (let t = 0; t < 5; t++) {
    const a = (t / 5) * TAU + 0.5;
    heads.push({
      c: v3(Math.cos(a) * 0.27, 0.5 + (b.random() - 0.3) * 0.08, Math.sin(a) * 0.27),
      r: 0.13 + b.random() * 0.03,
    });
  }
  const headColors = palette(`#9aa0b8`, `#cfd3e4`, `#f0f2f8`, `#ffffff`);
  heads.forEach((head, n) => {
    const geometry = blobGeometry(head.r, { detail: 2, lumps: 0.08, fine: 0.16, fineFreq: 10, seed: n * 4.1 });
    b.add(geometry, trs(head.c.x, head.c.y, head.c.z), {
      kind: PART.HEAD,
      color: (p, nn, out) => {
        sampleRamp(headColors, 0.4 + nn.y * 0.35 + noise3(p.x * 30, p.y * 30, p.z * 30) * 0.2, out);
      },
      anchor: head.c,
    });
  });
  return b.build();
}

export function buildHedge(): THREE.BufferGeometry { // Sl (20971)
  const b = new PlantBuilder(101);
  const block = roundedBlock(0.92, 0.7, 0.92, 0.25, 9, 0.022, 1.3);
  const colors = palette(`#2a5532`, `#3a6e3c`, `#4f8f45`, `#70ae55`, `#9ccb6e`);
  b.add(block, trs(0, 0.36, 0), {
    kind: PART.EVER,
    color: (p, n, out) => sampleRamp(colors, 0.12 + p.y * 0.8 + n.y * 0.18 + noise3(p.x * 16, p.y * 16, p.z * 16) * 0.16, out),
    anchor: v3(0, 0.36, 0),
    flex: (p) => clamp01(p.y / 0.7) * 0.6,
    vertexPhase: true,
  });
  return b.build();
}

export function buildBerryBush(): THREE.BufferGeometry { // Cl (20986)
  const b = new PlantBuilder(113);
  addTwigs(b, 6, 0.55, 0.28, heightRamp(palette(`#4a3528`, `#6e4a35`), 0, 0.6));
  const blobs: Blob[] = [
    { c: v3(0, 0.42, 0), r: 0.28 },
    { c: v3(0, 0.6, 0.02), r: 0.18 },
  ];
  for (let n = 0; n < 6; n++) {
    const a = (n / 6) * TAU + 0.1;
    blobs.push({
      c: v3(Math.cos(a) * 0.26, 0.3 + (b.random() - 0.5) * 0.1, Math.sin(a) * 0.26),
      r: 0.2 + b.random() * 0.04,
    });
  }
  addBlobs(b, blobs, PART.LEAF, canopyColor(palette(`#27492d`, `#3b6e3a`, `#5c9447`, `#8fbd5c`), v3(0, 0.4, 0), 0.45, 0.14), {
    lumps: 0.2,
    fine: 0.1,
  });
  for (const { p, n } of scatterOnBlobs(b, blobs, 18, -0.2, 0.03))
    b.add(ellipsoid(0.032, 0.012, 0.032, 6, 3), alignY(p, n), {
      kind: PART.BLOSSOM,
      color: distanceRamp(palette(`#f7e9c8`, `#fffaf2`), p, 0.03),
      anchor: p,
    });
  const berryColors = palette(`#2c2250`, `#4a3a7a`, `#6a5aa8`, `#9a8fd0`);
  for (const { p, n } of scatterOnBlobs(b, blobs, 12, -0.4, 0.05))
    for (let t = 0; t < 3; t++) {
      const at = p
        .clone()
        .add(v3((b.random() - 0.5) * 0.05, -t * 0.025, (b.random() - 0.5) * 0.05))
        .addScaledVector(n, 0.01);
      b.add(ellipsoid(0.024, 0.024, 0.024, 6, 5), trs(at.x, at.y, at.z), {
        kind: PART.FRUIT,
        color: (_q, nn, out) => sampleRamp(berryColors, 0.3 + nn.y * 0.5, out),
        anchor: p,
      });
    }
  return b.build();
}
