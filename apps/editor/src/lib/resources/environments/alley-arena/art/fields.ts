// Scalar fields for the tiling surface sets: noise, blur, height-to-normal and
// shading passes (set dressing, pass 2).
import { ctx2d, cv, rng, type Canvas, type Ctx, type Rng } from './canvas'

/** Tileable fractal value noise, contrast-stretched to roughly 0..1. */
export function noiseField(size: number, seed: number, base = 4, oct = 5) {
  const r = rng(seed)
  const out = new Float32Array(size * size)
  let amp = 1
  let tot = 0
  for (let o = 0, n = base; o < oct && n <= size; o++, n *= 2, amp *= 0.55) {
    const gr = new Float32Array(n * n)
    for (let i = 0; i < gr.length; i++) gr[i] = r()
    const s = n / size
    for (let y = 0; y < size; y++) {
      const fy = y * s, y0 = Math.floor(fy), ty = fy - y0, sy = ty * ty * (3 - 2 * ty), ya = (y0 % n) * n, yb = ((y0 + 1) % n) * n
      for (let x = 0; x < size; x++) {
        const fx = x * s, x0 = Math.floor(fx), tx = fx - x0, sx = tx * tx * (3 - 2 * tx), xa = x0 % n, xb = (x0 + 1) % n
        const a = gr[ya + xa], b = gr[ya + xb], c = gr[yb + xa], d = gr[yb + xb]
        out[y * size + x] += amp * (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy)
      }
    }
    tot += amp
  }
  for (let i = 0; i < out.length; i++) out[i] = Math.max(0, Math.min(1, (out[i] / tot - 0.5) * 2.1 + 0.5))
  return out
}

export function canvasField(c: Canvas) {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  const f = new Float32Array(c.width * c.height)
  for (let i = 0; i < f.length; i++) f[i] = d[i * 4] / 255
  return f
}

export function fieldCanvas(f: Float32Array, w: number, h: number) {
  const c = cv(w, h), ctx = ctx2d(c), im = ctx.createImageData(w, h), d = im.data
  for (let i = 0; i < f.length; i++) {
    const v = Math.max(0, Math.min(255, f[i] * 255))
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v
    d[i * 4 + 3] = 255
  }
  ctx.putImageData(im, 0, 0)
  return c
}

/** Wrapping box blur. */
export function blurField(a: Float32Array, w: number, h: number, rad: number) {
  const t = new Float32Array(a.length), out = new Float32Array(a.length), n = rad * 2 + 1
  for (let y = 0; y < h; y++) {
    const o = y * w
    let s = 0
    for (let k = -rad; k <= rad; k++) s += a[o + ((k + w) % w)]
    for (let x = 0; x < w; x++) {
      t[o + x] = s / n
      s += a[o + ((x + rad + 1) % w)] - a[o + ((x - rad + w) % w)]
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0
    for (let k = -rad; k <= rad; k++) s += t[((k + h) % h) * w + x]
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n
      s += t[((y + rad + 1) % h) * w + x] - t[((y - rad + h) % h) * w + x]
    }
  }
  return out
}

/** Tangent-space normals from a wrapping height field. */
export function normalCanvas(f: Float32Array, w: number, h: number, strength: number) {
  const c = cv(w, h), ctx = ctx2d(c), im = ctx.createImageData(w, h), d = im.data
  for (let y = 0; y < h; y++) {
    const yu = ((y + h - 1) % h) * w, yd = ((y + 1) % h) * w, yo = y * w
    for (let x = 0; x < w; x++) {
      const nx = -(f[yo + ((x + 1) % w)] - f[yo + ((x + w - 1) % w)]) * strength
      const ny = (f[yd + x] - f[yu + x]) * strength
      const l = 1 / Math.hypot(nx, ny, 1), i = (yo + x) * 4
      d[i] = (nx * l * 0.5 + 0.5) * 255
      d[i + 1] = (ny * l * 0.5 + 0.5) * 255
      d[i + 2] = (l * 0.5 + 0.5) * 255
      d[i + 3] = 255
    }
  }
  ctx.putImageData(im, 0, 0)
  return c
}

/** Multiply a canvas by a noise field. */
export function shadeBy(ctx: Ctx, w: number, h: number, f: Float32Array, lo: number, hi: number) {
  const im = ctx.getImageData(0, 0, w, h), d = im.data
  for (let i = 0; i < f.length; i++) {
    const k = lo + f[i] * (hi - lo)
    d[i * 4] *= k
    d[i * 4 + 1] *= k
    d[i * 4 + 2] *= k
  }
  ctx.putImageData(im, 0, 0)
}

/** Soot and damp running down a wall. */
export function streaks(ctx: Ctx, r: Rng, S: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const x = r() * S, y = r() * S * 0.7, len = 70 + r() * S * 0.26, w = 5 + r() * 26
    const gr = ctx.createLinearGradient(0, y, 0, y + len)
    gr.addColorStop(0, `rgba(0,0,0,${a * (0.5 + r() * 0.5)})`)
    gr.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gr
    ctx.fillRect(x, y, w, len)
  }
}
