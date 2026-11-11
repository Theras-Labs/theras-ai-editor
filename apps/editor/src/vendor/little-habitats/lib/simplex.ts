// Ports index-BwioI7A7.js 12846-12995: the bundled copy of simplex-noise (2D and 3D only).
// wa createNoise2D, Ta createNoise3D. Same permutation build, so a seeded `random` gives the same field.

export type NoiseFunction2D = (x: number, y: number) => number;
export type NoiseFunction3D = (x: number, y: number, z: number) => number;

const SQRT3 = Math.sqrt(3); // ha (12846)
// ga (12847) = Math.sqrt(5) and the 4D skew factors F4, G4 (12852) are unused in the bundle.
const F2 = 0.5 * (SQRT3 - 1); // _a (12848)
const G2 = (3 - SQRT3) / 6; // va (12849)
const F3 = 1 / 3; // ya (12850)
const G3 = 1 / 6; // ba (12851)

const fastFloor = (x: number) => Math.floor(x) | 0; // xa (12853)

const grad2 = new Float64Array([1, 1, -1, 1, 1, -1, -1, -1, 1, 0, -1, 0, 1, 0, -1, 0, 0, 1, 0, -1, 0, 1, 0, -1]); // Sa (12854)

const grad3 = new Float64Array([ // Ca (12855)
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1,
  -1,
]);

export function createNoise2D(random: () => number = Math.random): NoiseFunction2D { // wa (12859)
  const perm = buildPermutationTable(random);
  const permGrad2x = new Float64Array(perm).map((v) => grad2[(v % 12) * 2]);
  const permGrad2y = new Float64Array(perm).map((v) => grad2[(v % 12) * 2 + 1]);
  return function noise2D(x: number, y: number): number {
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const s = (x + y) * F2;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const t = (i + j) * G2;
    const X0 = i - t;
    const Y0 = j - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    let i1: number;
    let j1: number;
    if (x0 > y0) {
      i1 = 1;
      j1 = 0;
    } else {
      i1 = 0;
      j1 = 1;
    }
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gi0 = ii + perm[jj];
      const g0x = permGrad2x[gi0];
      const g0y = permGrad2y[gi0];
      t0 *= t0;
      n0 = t0 * t0 * (g0x * x0 + g0y * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gi1 = ii + i1 + perm[jj + j1];
      const g1x = permGrad2x[gi1];
      const g1y = permGrad2y[gi1];
      t1 *= t1;
      n1 = t1 * t1 * (g1x * x1 + g1y * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gi2 = ii + 1 + perm[jj + 1];
      const g2x = permGrad2x[gi2];
      const g2y = permGrad2y[gi2];
      t2 *= t2;
      n2 = t2 * t2 * (g2x * x2 + g2y * y2);
    }
    return 70 * (n0 + n1 + n2);
  };
}

export function createNoise3D(random: () => number = Math.random): NoiseFunction3D { // Ta (12908)
  const perm = buildPermutationTable(random);
  const permGrad3x = new Float64Array(perm).map((v) => grad3[(v % 12) * 3]);
  const permGrad3y = new Float64Array(perm).map((v) => grad3[(v % 12) * 3 + 1]);
  const permGrad3z = new Float64Array(perm).map((v) => grad3[(v % 12) * 3 + 2]);
  return function noise3D(x: number, y: number, z: number): number {
    let n0: number;
    let n1: number;
    let n2: number;
    let n3: number;
    const s = (x + y + z) * F3;
    const i = fastFloor(x + s);
    const j = fastFloor(y + s);
    const k = fastFloor(z + s);
    const t = (i + j + k) * G3;
    const X0 = i - t;
    const Y0 = j - t;
    const Z0 = k - t;
    const x0 = x - X0;
    const y0 = y - Y0;
    const z0 = z - Z0;
    let i1: number;
    let j1: number;
    let k1: number;
    let i2: number;
    let j2: number;
    let k2: number;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1;
        j1 = 0;
        k1 = 0;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 1;
        j2 = 0;
        k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0;
        j1 = 0;
        k1 = 1;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else if (x0 < z0) {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 0;
        j2 = 1;
        k2 = 1;
      } else {
        i1 = 0;
        j1 = 1;
        k1 = 0;
        i2 = 1;
        j2 = 1;
        k2 = 0;
      }
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0;
    else {
      const gi0 = ii + perm[jj + perm[kk]];
      t0 *= t0;
      n0 = t0 * t0 * (permGrad3x[gi0] * x0 + permGrad3y[gi0] * y0 + permGrad3z[gi0] * z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0;
    else {
      const gi1 = ii + i1 + perm[jj + j1 + perm[kk + k1]];
      t1 *= t1;
      n1 = t1 * t1 * (permGrad3x[gi1] * x1 + permGrad3y[gi1] * y1 + permGrad3z[gi1] * z1);
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0;
    else {
      const gi2 = ii + i2 + perm[jj + j2 + perm[kk + k2]];
      t2 *= t2;
      n2 = t2 * t2 * (permGrad3x[gi2] * x2 + permGrad3y[gi2] * y2 + permGrad3z[gi2] * z2);
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0;
    else {
      const gi3 = ii + 1 + perm[jj + 1 + perm[kk + 1]];
      t3 *= t3;
      n3 = t3 * t3 * (permGrad3x[gi3] * x3 + permGrad3y[gi3] * y3 + permGrad3z[gi3] * z3);
    }
    return 32 * (n0 + n1 + n2 + n3);
  };
}

/** Shuffled 0..255, repeated to 512 entries. Calls `random` 255 times. */
function buildPermutationTable(random: () => number): Uint8Array { // Ea (12985)
  const p = new Uint8Array(512);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 0; i < 255; i++) {
    const r = i + ~~(random() * (256 - i));
    const aux = p[i];
    p[i] = p[r];
    p[r] = aux;
  }
  for (let i = 256; i < 512; i++) p[i] = p[i - 256];
  return p;
}
