// Ports index-BwioI7A7.js 53283-53835: the world-code and gift-code codec.
//   53283-53343  byte packing (ByteWriter / ByteReader) and base64url
//   53344-53413  world code v1: bytes, optional deflate-raw (CompressionStream), base64url
//   53414-53816  world code v2: an arithmetic coder over the grid topology, 6 bits per base64url character
//   53817-53835  gift code: bytes + checksum, base64url
// The output must stay byte-compatible with the original, so links made on the original site open here.
// Do not change any constant, table, the order of the coder calls, or the hash steps.
import { buildGrid } from '../core/grid';
import type { CornerState, Material } from '../core/world';

/** One gift (a hung lantern) inside a world code. */
export interface WorldGift {
  corner: number;
  from: string;
}

/** The data a visit link carries. */
export interface WorldCode {
  seed: number;
  name: string;
  yearFrac: number;
  dayFrac: number;
  corners: CornerState[];
  gifts: WorldGift[];
}

/** The data a gift (lantern) link carries. */
export interface GiftCode {
  seed: number;
  corner: number;
  from: string;
  to: string;
}

const MATERIALS: Material[] = [`water`, `soil`, `stone`]; // HO (53283)
const encoder = new TextEncoder(); // UO (53284)
const decoder = new TextDecoder(); // WO (53285)
const ALPHABET = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_`; // GO (53286)
export const NAME_MAX = 32; // KO (53287)
export const FROM_MAX = 24; // qO (53288)
const GIFTS_MAX = 40; // JO (53289)

class ByteWriter { // YO (53290)
  bytes: number[] = [];
  u8(v: number): void {
    this.bytes.push(v & 255);
  }
  u16(v: number): void {
    this.u8(v >> 8);
    this.u8(v);
  }
  u32(v: number): void {
    this.u16(v >>> 16);
    this.u16(v & 65535);
  }
  str(s: string, max: number): void {
    const b = encoder.encode(s.slice(0, max));
    this.u8(Math.min(255, b.length));
    for (const v of b.slice(0, 255)) this.u8(v);
  }
}

class ByteReader { // XO (53307)
  b: Uint8Array;
  i = 0;
  constructor(b: Uint8Array) {
    this.b = b;
  }
  get left(): number {
    return this.b.length - this.i;
  }
  u8(): number {
    if (this.i >= this.b.length) throw Error(`eof`);
    return this.b[this.i++];
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  u32(): number {
    return ((this.u16() << 16) >>> 0) + this.u16();
  }
  str(): string {
    const n = this.u8();
    if (n > this.left) throw Error(`eof`);
    const s = decoder.decode(this.b.slice(this.i, this.i + n));
    this.i += n;
    return s;
  }
}

function toBase64Url(bytes: Uint8Array): string { // ZO (53333)
  let s = ``;
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, `-`).replace(/\//g, `_`).replace(/=+$/, ``);
}

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> { // QO (53338)
  const bin = atob(s.replace(/-/g, `+`).replace(/_/g, `/`) + `===`.slice((s.length + 3) % 4)),
    out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipeBytes(bytes: Uint8Array<ArrayBuffer>, stream: CompressionStream | DecompressionStream) { // $O (53344)
  const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
  return new Uint8Array(await res.arrayBuffer());
}

const hasCompression = typeof CompressionStream !== `undefined` && typeof DecompressionStream !== `undefined`; // ek (53348)

/** Encodes a world as a visit code: v2 when the grid matches the seed, else v1. */
export async function encodeWorld(world: WorldCode): Promise<string> { // tk (53349)
  return encodeWorldV2(world) ?? encodeWorldV1(world);
}

/** Decodes a visit code (v1 or v2). Null when it cannot be read. */
export async function decodeWorld(code: string): Promise<WorldCode | null> { // nk (53352)
  const s = code.trim(),
    first = ALPHABET.indexOf(s[0]);
  return first >= 32 ? decodeWorldV2(s) : first === 0 ? decodeWorldV1(s) : null;
}

async function encodeWorldV1(world: WorldCode): Promise<string> { // rk (53357)
  const w = new ByteWriter();
  w.u8(1);
  w.u32(world.seed >>> 0);
  w.u16(world.corners.length);
  w.u8(Math.round(world.yearFrac * 255));
  w.u8(Math.round(world.dayFrac * 255));
  w.str(world.name, NAME_MAX);
  w.u8(Math.min(GIFTS_MAX, world.gifts.length));
  for (const g of world.gifts.slice(0, GIFTS_MAX)) {
    w.u16(g.corner);
    w.str(g.from, FROM_MAX);
  }
  let acc = 0,
    bits = 0;
  for (const c of world.corners) {
    const v = (Math.min(7, c.height) << 3) | (MATERIALS.indexOf(c.material) << 1) | (c.sown ? 1 : 0);
    acc = (acc << 6) | v;
    bits += 6;
    for (; bits >= 8; ) {
      w.u8(acc >> (bits - 8));
      bits -= 8;
      acc &= (1 << bits) - 1;
    }
  }
  bits && w.u8(acc << (8 - bits));
  let body = new Uint8Array(w.bytes),
    flag = 0;
  hasCompression && ((body = await pipeBytes(body, new CompressionStream(`deflate-raw`))), (flag = 1));
  const out = new Uint8Array(body.length + 1);
  out[0] = flag;
  out.set(body, 1);
  return toBase64Url(out);
}

async function decodeWorldV1(code: string): Promise<WorldCode | null> { // ik (53380)
  try {
    const raw = fromBase64Url(code);
    let body = raw.slice(1);
    if (raw[0] === 1) {
      if (!hasCompression) return null;
      body = await pipeBytes(body, new DecompressionStream(`deflate-raw`));
    }
    const r = new ByteReader(body);
    if (r.u8() !== 1) return null;
    const seed = r.u32(),
      count = r.u16(),
      yearFrac = r.u8() / 255,
      dayFrac = r.u8() / 255,
      name = r.str(),
      gifts: WorldGift[] = [],
      giftCount = r.u8();
    for (let i = 0; i < giftCount; i++) gifts.push({ corner: r.u16(), from: r.str() });
    const corners: CornerState[] = [];
    let acc = 0,
      bits = 0;
    for (; corners.length < count; ) {
      acc = (acc << 8) | r.u8();
      bits += 8;
      for (; bits >= 6 && corners.length < count; ) {
        const v = (acc >> (bits - 6)) & 63;
        bits -= 6;
        acc &= (1 << bits) - 1;
        const height = Math.min(5, v >> 3),
          material = MATERIALS[(v >> 1) & 3] ?? `water`;
        corners.push({
          height,
          material: height === 0 ? `water` : material === `water` ? `soil` : material,
          sown: (v & 1) == 1,
        });
      }
    }
    return { seed, name: name || `A friend`, yearFrac, dayFrac, corners, gifts };
  } catch {
    return null;
  }
}

// ---- v2: arithmetic coder (32-bit range, bit output) ----

const HALF = 2 ** 31; // ak (53414)
const QUARTER = 2 ** 30; // ok (53415)
const THREE_QUARTERS = 3 * 2 ** 30; // sk (53416)

/** The encoder and the decoder share this interface, so one routine (codeWorld) does both directions.
 *  The encoder codes `value` and returns it; the decoder ignores `value` and returns the decoded one. */
interface Coder {
  bit(value: number, zero: number, one: number): number;
  sym(value: number, cum: number[]): number;
  uniform(value: number, range: number): number;
}

class ArithmeticEncoder implements Coder { // ck (53417)
  low = 0;
  high = 4294967295;
  pending = 0;
  bits: number[] = [1];
  put(b: number): void {
    for (this.bits.push(b); this.pending > 0; this.pending--) this.bits.push(b ^ 1);
  }
  code(lo: number, hi: number, total: number): void {
    const range = this.high - this.low + 1;
    this.high = this.low + Math.floor((range * hi) / total) - 1;
    this.low += Math.floor((range * lo) / total);
    for (;;) {
      if (this.high < HALF) this.put(0);
      else if (this.low >= HALF) {
        this.put(1);
        this.low -= HALF;
        this.high -= HALF;
      } else if (this.low >= QUARTER && this.high < THREE_QUARTERS) {
        this.pending++;
        this.low -= QUARTER;
        this.high -= QUARTER;
      } else break;
      this.low *= 2;
      this.high = this.high * 2 + 1;
    }
  }
  bit(value: number, zero: number, one: number): number {
    value ? this.code(zero, zero + one, zero + one) : this.code(0, zero, zero + one);
    return value;
  }
  sym(value: number, cum: number[]): number {
    this.code(cum[value], cum[value + 1], cum[cum.length - 1]);
    return value;
  }
  uniform(value: number, range: number): number {
    this.code(value, value + 1, range);
    return value;
  }
  finish(): number[] {
    for (this.put(1); this.bits[this.bits.length - 1] === 0; ) this.bits.pop();
    return this.bits;
  }
}

class ArithmeticDecoder implements Coder { // lk (53449)
  src: ArrayLike<number>;
  low = 0;
  high = 4294967295;
  value = 0;
  i: number;
  constructor(src: ArrayLike<number>, start: number) {
    this.src = src;
    this.i = start;
    for (let k = 0; k < 32; k++) this.value = this.value * 2 + this.next();
  }
  next(): number {
    return this.i < this.src.length ? this.src[this.i++] : 0;
  }
  target(total: number): number {
    return Math.floor(((this.value - this.low + 1) * total - 1) / (this.high - this.low + 1));
  }
  code(lo: number, hi: number, total: number): void {
    const range = this.high - this.low + 1;
    this.high = this.low + Math.floor((range * hi) / total) - 1;
    this.low += Math.floor((range * lo) / total);
    for (;;) {
      if (!(this.high < HALF)) {
        if (this.low >= HALF) {
          this.value -= HALF;
          this.low -= HALF;
          this.high -= HALF;
        } else if (this.low >= QUARTER && this.high < THREE_QUARTERS) {
          this.value -= QUARTER;
          this.low -= QUARTER;
          this.high -= QUARTER;
        } else break;
      }
      this.low *= 2;
      this.high = this.high * 2 + 1;
      this.value = this.value * 2 + this.next();
    }
  }
  bit(_value: number, zero: number, one: number): number {
    const b = this.target(zero + one) < zero ? 0 : 1;
    b ? this.code(zero, zero + one, zero + one) : this.code(0, zero, zero + one);
    return b;
  }
  sym(_value: number, cum: number[]): number {
    const t = this.target(cum[cum.length - 1]);
    let s = 0;
    for (; cum[s + 1] <= t; ) s++;
    this.code(cum[s], cum[s + 1], cum[cum.length - 1]);
    return s;
  }
  uniform(_value: number, range: number): number {
    const v = this.target(range);
    this.code(v, v + 1, range);
    return v;
  }
}

/** Codes `bits` raw bits of `value`, in chunks of at most 16 (high chunk first). */
function codeBits(c: Coder, value: number, bits: number): number { // uk (53491)
  if (bits <= 0) return 0;
  const lowBits = Math.min(bits, 16),
    highBits = bits - lowBits;
  return (
    (highBits ? c.uniform(Math.floor(value / 2 ** lowBits) % 2 ** highBits, 2 ** highBits) : 0) * 2 ** lowBits +
    c.uniform(value % 2 ** lowBits, 2 ** lowBits)
  );
}

/** Number of bits needed for `v` (0 for 0). */
function bitLength(v: number): number { // dk (53497)
  let n = 0;
  for (; v >= 2 ** n; ) n++;
  return n;
}

/** Codes a non-negative integer as its bit length (uniform in 0..maxBits) and the bits below the top bit. */
function codeNumber(c: Coder, value: number, maxBits: number): number { // fk (53502)
  const len = c.uniform(bitLength(value), maxBits + 1);
  return len ? 2 ** (len - 1) + codeBits(c, value - 2 ** (len - 1), len - 1) : 0;
}

interface Topology {
  n: number;
  boundary: Uint8Array;
  nb: number[][];
  ring2: number[][];
  order: number[];
  pos: Int32Array;
  fingerprint: number;
}

const topologyCache = new Map<number, Topology>(); // pk (53506)

/** The grid of a seed as the coder sees it: neighbors, second ring, coding order and a fingerprint. */
function topology(seed: number): Topology { // mk (53507)
  let t = topologyCache.get(seed);
  if (t) return t;
  const grid = buildGrid(seed),
    n = grid.corners.length,
    boundary = new Uint8Array(n);
  for (const c of grid.corners) boundary[c.id] = +!!c.boundary;
  const nb = grid.corners.map((c) => [...c.neighbors].sort((a, b) => a - b)),
    ring2 = nb.map((ring, self) => {
      const set = new Set<number>();
      for (const r of ring) for (const k of nb[r]) k !== self && !ring.includes(k) && set.add(k);
      return [...set].sort((a, b) => a - b);
    }),
    order = grid.corners
      .filter((c) => !c.boundary)
      .sort((a, b) => a.z - b.z || a.x - b.x)
      .map((c) => c.id),
    pos = new Int32Array(n).fill(-1);
  order.forEach((id, i) => (pos[id] = i));
  let fp = mixHash(2654435769, n);
  for (let i = 0; i < n; i++) {
    fp = mixHash(fp, boundary[i]);
    for (const k of nb[i]) fp = mixHash(fp, k);
  }
  for (const id of order) fp = mixHash(fp, id);
  t = { n, boundary, nb, ring2, order, pos, fingerprint: fp };
  topologyCache.size > 8 && topologyCache.clear();
  topologyCache.set(seed, t);
  return t;
}

function mixHash(h: number, v: number): number { // hk (53539)
  h = Math.imul(h ^ (v >>> 0), 1540483477);
  return (h ^ (h >>> 15)) >>> 0;
}

/** Per kind (see PASS_KIND): [scale, bias, weight, ratio, fine spread]. */
const MODEL_PARAMS = [ // gk (53542)
  [8, 0.05, 0.25, 1, 6],
  [6, 0.4, 0.5, 0.5, 6],
  [8, 0.4, 0.25, 2, 6],
  [8, 0.05, 0.5, 2, 4],
];
const RING_ONE_WEIGHT = [0.5, 0, 0.5, 1.5, 3]; // _k (53548)
const RING_ZERO_WEIGHT = [0.5, 3, 1.5, 0.5, 0]; // vk (53549)
const COUNT_STEP = 16; // yk (53550)
const PASS_LAND = 0; // bk (53551)
const PASS_LEVEL2 = 1; // xk (53552)
const PASS_LEVEL = 2; // Sk (53553)
const PASS_STONE = 3; // Ck (53554)
const PASS_SOWN = 4; // wk (53555)
const PASS_KIND = [0, 1, 1, 2, 3]; // Tk (53556)
const MAX_LEVEL = 7; // Ek (53557)

/** Adaptive bit model: a coarse context (pass kind, neighbor counts, second-ring mix) with a fine context below it. */
class ContextModel { // Dk (53558)
  coarse = new Map<number, number[]>();
  fine = new Map<number, number[]>();
  code(
    c: Coder,
    pass: number,
    ones: number,
    zeros: number,
    ring: number,
    extra: number,
    value: number,
  ): number {
    const kind = PASS_KIND[pass];
    ones = Math.min(ones, 3);
    zeros = Math.min(zeros, 3);
    const coarseKey = ((kind * 4 + ones) * 4 + zeros) * 5 + ring;
    let coarse = this.coarse.get(coarseKey);
    if (!coarse) {
      const [scale, bias, weight, ratio] = MODEL_PARAMS[kind],
        one = ones + weight * RING_ONE_WEIGHT[ring] + bias,
        zero = (zeros + weight * RING_ZERO_WEIGHT[ring] + bias) * ratio;
      coarse = [
        Math.floor(COUNT_STEP * (0.25 + (scale * zero) / (one + zero))),
        Math.floor(COUNT_STEP * (0.25 + (scale * one) / (one + zero))),
      ];
      this.coarse.set(coarseKey, coarse);
    }
    const fineKey = (coarseKey * 8 + pass) * 16 + extra;
    let fine = this.fine.get(fineKey);
    if (!fine) {
      const spread = MODEL_PARAMS[kind][4],
        p = coarse[1] / (coarse[0] + coarse[1]);
      fine = [Math.floor(COUNT_STEP * (0.25 + spread * (1 - p))), Math.floor(COUNT_STEP * (0.25 + spread * p))];
      this.fine.set(fineKey, fine);
    }
    const b = c.bit(value, fine[0], fine[1]);
    for (const m of [fine, coarse]) {
      m[b] += COUNT_STEP;
      m[0] + m[1] > 61440 && ((m[0] = Math.ceil(m[0] / 2)), (m[1] = Math.ceil(m[1] / 2)));
    }
    return b;
  }
}

interface CornerBits {
  h: Uint8Array;
  stone: Uint8Array;
  sown: Uint8Array;
}

/** Codes the corner heights, stone and sown flags. `src` is read when encoding; `dst` receives the result. */
function codeTerrain(c: Coder, topo: Topology, src: CornerBits, dst: CornerBits): void { // Ok (53586)
  const { n, boundary, nb, ring2, order, pos } = topo,
    model = new ContextModel();
  let edgeEmpty = 1;
  for (let i = 0; i < n; i++) boundary[i] && (src.h[i] || src.sown[i]) && (edgeEmpty = 0);
  if (!c.bit(edgeEmpty, 1, 4095))
    for (let i = 0; i < n; i++)
      boundary[i] &&
        ((dst.h[i] = c.uniform(src.h[i], 8)),
        (dst.stone[i] = dst.h[i] ? c.uniform(src.stone[i], 2) : 0),
        (dst.sown[i] = c.uniform(src.sown[i], 2)));
  const pass = (
    kind: number,
    include: (id: number) => boolean,
    known: (id: number, at: number) => number,
    isOne: (id: number) => number,
    extra: (id: number) => number,
    srcBit: (id: number) => number,
    store: (id: number, bit: number) => void,
  ) => {
    for (let at = 0; at < order.length; at++) {
      const id = order[at];
      if (!include(id)) continue;
      let ones = 0,
        zeros = 0;
      for (const k of nb[id]) known(k, at) === 1 && (isOne(k) ? ones++ : zeros++);
      let ones2 = 0,
        zeros2 = 0;
      for (const k of ring2[id]) known(k, at) === 1 && (isOne(k) ? ones2++ : zeros2++);
      const ring =
        ones2 + zeros2 === 0 ? 0 : ones2 === 0 ? 1 : zeros2 === 0 ? 4 : ones2 * 2 < zeros2 ? 2 : 3;
      store(id, model.code(c, kind, ones, zeros, ring, extra(id), srcBit(id)));
    }
  };
  const coded = (id: number, at: number) => (boundary[id] || pos[id] < at ? 1 : 0);
  pass(
    PASS_LAND,
    () => true,
    coded,
    (id) => +(dst.h[id] > 0),
    () => 0,
    (id) => +(src.h[id] > 0),
    (id, b) => (dst.h[id] = b),
  );
  const waterDist = new Int32Array(n).fill(99),
    queue: number[] = [];
  for (let i = 0; i < n; i++) dst.h[i] || ((waterDist[i] = 0), queue.push(i));
  for (let q = 0; q < queue.length; q++) {
    const id = queue[q];
    for (const k of nb[id]) waterDist[k] > waterDist[id] + 1 && ((waterDist[k] = waterDist[id] + 1), queue.push(k));
  }
  for (let level = 2; level <= MAX_LEVEL && order.some((id) => dst.h[id] >= level - 1); level++)
    pass(
      level === 2 ? PASS_LEVEL2 : PASS_LEVEL,
      (id) => dst.h[id] >= level - 1,
      (id, at) => (dst.h[id] < level - 1 ? 1 : coded(id, at)),
      (id) => +(dst.h[id] >= level),
      (id) => {
        let lower = 0;
        for (const k of nb[id]) dst.h[k] < level - 1 && lower++;
        return Math.min(lower, 2);
      },
      (id) => +(src.h[id] >= level),
      (id, b) => {
        b && (dst.h[id] = level);
      },
    );
  pass(
    PASS_STONE,
    (id) => dst.h[id] > 0,
    (id, at) => (dst.h[id] === 0 ? 2 : coded(id, at)),
    (id) => dst.stone[id],
    (id) => {
      let step = 0;
      for (const k of nb[id]) dst.h[k] && dst.h[k] !== dst.h[id] && (step = 1);
      return (dst.h[id] > 1 ? 2 : 0) + step;
    },
    (id) => src.stone[id],
    (id, b) => (dst.stone[id] = b),
  );
  pass(
    PASS_SOWN,
    () => true,
    coded,
    (id) => dst.sown[id],
    (id) =>
      dst.h[id]
        ? 2 + dst.stone[id] * 6 + (dst.h[id] > 1 ? 3 : 0) + Math.min(waterDist[id], 2)
        : +!!nb[id].some((k) => dst.h[k] > 0),
    (id) => src.sown[id],
    (id, b) => (dst.sown[id] = b),
  );
}

// ---- names ----

const LOWER = `abcdefghijklmnopqrstuvwxyz`; // kk (53667)
const UPPER = LOWER.toUpperCase(); // Ak (53668)
const DIGITS = `0123456789`; // jk (53669)
const PUNCT = `'’-.!&,`; // Mk (53670)
const LETTER_WEIGHTS = [90, 17, 25, 35, 115, 18, 20, 40, 70, 5, 12, 50, 30, 70, 70, 18, 1, 60, 55, 65, 25, 10, 15, 2, 20, 3]; // Nk (53671)
const SYM_END = 0; // Pk (53672)
const SYM_ESCAPE = 1; // Fk (53673)
const NAME_CHARS = ` ` + LOWER + UPPER + DIGITS + PUNCT; // Ik (53674)
const SYM_FIRST_CHAR = 2; // Lk (53675)

/** Cumulative frequencies for [end, escape, space, a-z, A-Z, 0-9, punctuation]. */
function nameModel(
  end: number,
  escape: number,
  space: number,
  lower: (w: number) => number,
  upper: (w: number) => number,
  digit: number,
  punct: number,
): number[] { // Rk (53676)
  const weights = [
      end,
      escape,
      space,
      ...LETTER_WEIGHTS.map((w) => lower(w)),
      ...LETTER_WEIGHTS.map((w) => upper(w)),
      ...[...DIGITS].map(() => digit),
      ...[...PUNCT].map(() => punct),
    ],
    cum = [0];
  for (const w of weights) cum.push(cum[cum.length - 1] + w);
  return cum;
}

/** Name models: at the start, after a space, after any other character. */
const NAME_MODELS = [ // zk (53682)
  nameModel(
    300,
    60,
    2,
    (e) => Math.max(1, e >> 2),
    (e) => e * 2,
    8,
    2,
  ),
  nameModel(
    5,
    30,
    2,
    (e) => Math.max(1, e >> 1),
    (e) => e * 2,
    8,
    2,
  ),
  nameModel(
    180,
    12,
    130,
    (e) => e,
    (e) => Math.max(1, Math.floor(e / 10)),
    3,
    6,
  ),
];

/** Codes a name of at most `max` UTF-16 units; characters outside NAME_CHARS are escaped as 21-bit code points. */
function codeName(c: Coder, name: string, max: number, hash: { h: number }): string { // Bk (53711)
  const points = [...name.slice(0, max)].map((ch) => ch.codePointAt(0)!);
  let out = ``,
    model = 0;
  for (let i = 0; ; i++) {
    if (i > max) throw Error(`name too long`);
    const cp = points[i] as number | undefined,
      idx = cp === void 0 ? -1 : NAME_CHARS.indexOf(String.fromCodePoint(cp)),
      sym = c.sym(cp === void 0 ? SYM_END : idx >= 0 ? SYM_FIRST_CHAR + idx : SYM_ESCAPE, NAME_MODELS[model]);
    if (sym === SYM_END) break;
    const point = sym === SYM_ESCAPE ? codeNumber(c, cp ?? 0, 21) : NAME_CHARS.codePointAt(sym - SYM_FIRST_CHAR)!;
    const ch = String.fromCodePoint(point);
    out += ch;
    hash.h = mixHash(hash.h, point);
    model = ch === ` ` ? 1 : 2;
  }
  hash.h = mixHash(hash.h, 511);
  return out;
}

const DEFAULT_SEED = 7; // Vk (53728)
const TIME_STEPS = 32; // Hk (53729)
const quantizeFrac = (f: number) => Math.min(31, Math.max(0, Math.floor((((f % 1) + 1) % 1) * TIME_STEPS))) || 0; // Uk (53730)
const GIFT_COUNT_MODEL = [0, 3, 4]; // Wk (53731)
const GIFT_CORNER_MODEL = [0, 28, 31, 32]; // Gk (53732)

/** Codes a whole world. Encoding: pass the world. Decoding: pass null and a decoder. */
function codeWorld(c: Coder, world: WorldCode | null): WorldCode { // Kk (53733)
  const hash = { h: 625341585 },
    srcSeed = (world?.seed ?? 0) >>> 0,
    seed = c.bit(srcSeed === DEFAULT_SEED ? 0 : 1, 1, 1) ? codeNumber(c, srcSeed, 32) : DEFAULT_SEED,
    topo = topology(seed);
  hash.h = mixHash(mixHash(hash.h, topo.fingerprint), seed);
  const year = c.uniform(quantizeFrac(world?.yearFrac ?? 0), TIME_STEPS),
    day = c.uniform(quantizeFrac(world?.dayFrac ?? 0), TIME_STEPS);
  hash.h = mixHash(mixHash(hash.h, year), day);
  const name = codeName(c, world?.name ?? ``, NAME_MAX, hash),
    { n } = topo,
    src: CornerBits = { h: new Uint8Array(n), stone: new Uint8Array(n), sown: new Uint8Array(n) };
  world &&
    world.corners.forEach((corner, i) => {
      const h = Math.min(MAX_LEVEL, Math.max(0, Math.round(corner.height))) || 0;
      src.h[i] = h;
      src.stone[i] = +(h > 0 && corner.material === `stone`);
      src.sown[i] = +!!corner.sown;
    });
  const dst: CornerBits = { h: new Uint8Array(n), stone: new Uint8Array(n), sown: new Uint8Array(n) };
  codeTerrain(c, topo, src, dst);
  const corners: CornerState[] = [],
    land: number[] = [];
  for (let i = 0; i < n; i++) {
    hash.h = mixHash(hash.h, dst.h[i] * 4 + dst.stone[i] * 2 + dst.sown[i]);
    corners.push({
      height: dst.h[i],
      material: dst.h[i] ? (dst.stone[i] ? `stone` : `soil`) : `water`,
      sown: dst.sown[i] === 1,
    });
    dst.h[i] && land.push(i);
  }
  const srcGifts = (world?.gifts ?? []).slice(0, GIFTS_MAX),
    giftCount = c.sym(+!!srcGifts.length, GIFT_COUNT_MODEL) ? 1 + codeNumber(c, srcGifts.length - 1, 6) : 0;
  if (giftCount > GIFTS_MAX) throw Error(`too many gifts`);
  const gifts: WorldGift[] = [],
    names = [`A friend`];
  for (let g = 0; g < giftCount; g++) {
    const gift = srcGifts[g] as WorldGift | undefined,
      srcCorner = gift ? gift.corner : 0,
      landIndex = gift ? land.indexOf(srcCorner) : -1,
      cornerKind = c.sym(
        landIndex >= 0 ? 0 : Number.isInteger(srcCorner) && srcCorner >= 0 && srcCorner < n ? 1 : 2,
        GIFT_CORNER_MODEL,
      );
    if (cornerKind === 0 && !land.length) throw Error(`no land`);
    const corner =
        cornerKind === 0
          ? land[c.uniform(landIndex, land.length)]
          : cornerKind === 1
            ? c.uniform(srcCorner, n)
            : codeBits(c, srcCorner & 65535, 16),
      srcFrom = gift ? gift.from.slice(0, FROM_MAX) : ``,
      cum = [0, 4];
    for (let k = 0; k < names.length; k++) cum.push(cum[cum.length - 1] + 3);
    const known = names.indexOf(srcFrom),
      which = c.sym(known >= 0 ? known + 1 : 0, cum);
    let from: string;
    which === 0
      ? ((from = codeName(c, srcFrom, FROM_MAX, hash)), names.includes(from) || names.push(from))
      : ((from = names[which - 1]), (hash.h = mixHash(hash.h, which)));
    hash.h = mixHash(hash.h, corner);
    gifts.push({ corner, from });
  }
  const check = hash.h >>> 20;
  if (c.uniform(check, 4096) !== check) throw Error(`check`);
  return {
    seed,
    name,
    yearFrac: (year + 0.5) / TIME_STEPS,
    dayFrac: (day + 0.5) / TIME_STEPS,
    corners,
    gifts,
  };
}

function encodeWorldV2(world: WorldCode): string | null { // qk (53784)
  try {
    const topo = topology(world.seed >>> 0);
    if (world.corners.length !== topo.n) return null;
    const enc = new ArithmeticEncoder();
    codeWorld(enc, world);
    const bits = enc.finish();
    let out = ``;
    for (let i = 0; i < bits.length; i += 6) {
      let v = 0;
      for (let k = 0; k < 6; k++) v = v * 2 + (bits[i + k] ?? 0);
      out += ALPHABET[v];
    }
    return out;
  } catch {
    return null;
  }
}

function decodeWorldV2(code: string): WorldCode | null { // Jk (53802)
  try {
    const bits = new Uint8Array(code.length * 6);
    for (let i = 0; i < code.length; i++) {
      const v = ALPHABET.indexOf(code[i]);
      if (v < 0) return null;
      for (let k = 0; k < 6; k++) bits[i * 6 + k] = (v >> (5 - k)) & 1;
    }
    if (bits[0] !== 1) return null;
    const world = codeWorld(new ArithmeticDecoder(bits, 1), null);
    return { ...world, name: world.name || `A friend` };
  } catch {
    return null;
  }
}

/** Encodes a gift (lantern) code: bytes with a checksum byte, base64url. */
export function encodeGift(gift: GiftCode): string { // Yk (53817)
  const w = new ByteWriter();
  w.u8(1);
  w.u32(gift.seed >>> 0);
  w.u16(gift.corner);
  w.str(gift.from, FROM_MAX);
  w.str(gift.to, NAME_MAX);
  let sum = 0;
  for (const b of w.bytes) sum = (sum * 31 + b) & 255;
  w.u8(sum);
  return toBase64Url(new Uint8Array(w.bytes));
}

/** Decodes a gift code. Null when the checksum or the version is wrong. */
export function decodeGift(code: string): GiftCode | null { // Xk (53824)
  try {
    const bytes = fromBase64Url(code.trim());
    let sum = 0;
    for (let i = 0; i < bytes.length - 1; i++) sum = (sum * 31 + bytes[i]) & 255;
    if (sum !== bytes[bytes.length - 1]) return null;
    const r = new ByteReader(bytes.slice(0, -1));
    return r.u8() === 1 ? { seed: r.u32(), corner: r.u16(), from: r.str() || `A friend`, to: r.str() } : null;
  } catch {
    return null;
  }
}
