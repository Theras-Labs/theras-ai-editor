// Tiling surface sets with normal and roughness maps: brick, plaster, setts,
// flagstones, planks and painted iron (pass 2).
import { ctx2d, cv, ell, circle, g, rng, sstep, wline, type Canvas } from './canvas'
import { blurField, canvasField, fieldCanvas, noiseField, normalCanvas, shadeBy, streaks } from './fields'
import { art, tiled } from './overrides'

type BrickOptions = {
  size?: number
  cols?: number
  rows?: number
  gap?: number
  base?: number
  vary?: number
  mortar?: number
  bump?: number
  /** The picture that may replace the albedo. */
  pic?: string
}

/** Running-bond brick. Returns { map, normal } canvases. */
export function brickSet(seed = 5, o: BrickOptions = {}) {
  const S = o.size || 1024, cols = o.cols || 10, rows = o.rows || 28, bw = S / cols, bh = S / rows, gap = o.gap ?? 4
  const map = cv(S, S), hgt = cv(S, S), c = ctx2d(map), hc = ctx2d(hgt), r = rng(seed)
  const base = o.base ?? 146, vary = o.vary ?? 22
  c.fillStyle = g(o.mortar ?? 96)
  c.fillRect(0, 0, S, S)
  hc.fillStyle = g(60)
  hc.fillRect(0, 0, S, S)
  for (let row = 0; row < rows; row++) {
    const off = row % 2 ? bw / 2 : 0
    for (let col = 0; col < cols; col++) {
      let tone = base + (r() - 0.5) * vary
      const q = r(), hv = 150 + r() * 80, chip = r() < 0.12, cx = r(), cy = r(), cw = 4 + r() * 14
      if (q < 0.08) tone -= 24
      else if (q > 0.93) tone += 16
      const x = col * bw + off + gap / 2, y = row * bh + gap / 2, w = bw - gap, h = bh - gap
      for (const ox of x + w > S ? [0, -S] : [0]) {
        c.fillStyle = g(tone)
        c.beginPath()
        c.roundRect(x + ox, y, w, h, 3)
        c.fill()
        c.fillStyle = 'rgba(255,255,255,.05)'
        c.fillRect(x + ox + 2, y + 1, w - 4, 2)
        c.fillStyle = 'rgba(0,0,0,.16)'
        c.fillRect(x + ox + 2, y + h - 3, w - 4, 3)
        if (chip) {
          c.fillStyle = 'rgba(0,0,0,.22)'
          c.fillRect(x + ox + cx * w * 0.7, y + cy * h * 0.5, cw, 3 + cy * 5)
        }
        hc.fillStyle = g(hv)
        hc.beginPath()
        hc.roundRect(x + ox, y, w, h, 3)
        hc.fill()
      }
    }
  }
  streaks(c, r, S, 20, 0.15)
  shadeBy(c, S, S, noiseField(S, seed + 9, 3, 5), 0.8, 1.1)
  return tiled(o.pic, { map, normal: normalCanvas(blurField(canvasField(hgt), S, S, 1), S, S, o.bump ?? 3.5) }, o.bump ?? 3.5, 2048)
}

/** Stucco / dressed stone for trims, cornices, kerbs and rendered façades. */
export function plasterSet(seed = 8) {
  const S = 512, map = cv(S, S), c = ctx2d(map), r = rng(seed)
  c.fillStyle = g(168)
  c.fillRect(0, 0, S, S)
  for (let i = 0; i < 1400; i++) {
    c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.05})`
    c.fillRect(r() * S, r() * S, 1 + r() * 3, 1 + r() * 3)
  }
  c.strokeStyle = 'rgba(0,0,0,.28)'
  c.lineWidth = 1.5
  for (let i = 0; i < 7; i++) {
    // hairline cracks
    let x = 40 + r() * (S - 80), y = 40 + r() * (S - 80)
    c.beginPath()
    c.moveTo(x, y)
    for (let k = 0; k < 7; k++) {
      x += (r() - 0.5) * 50
      y += 10 + r() * 26
      if (x < 6 || x > S - 6 || y > S - 6) break
      c.lineTo(x, y)
    }
    c.stroke()
  }
  streaks(c, r, S, 9, 0.12)
  const n = noiseField(S, seed + 1, 4, 5)
  shadeBy(c, S, S, n, 0.78, 1.12)
  const fine = noiseField(S, seed + 2, 32, 4)
  return tiled('plaster', { map, normal: normalCanvas(fine, S, S, 1.6) }, 1.6)
}

/** Rounded setts, mid-dark and matte (the puddles are the shiny bits). Returns { map, normal, rough }. */
export function cobbleSet(seed = 12) {
  const S = 1024, cols = 12, rows = 16, sw = S / cols, sh = S / rows
  const map = cv(S, S), hgt = cv(S, S), c = ctx2d(map), hc = ctx2d(hgt), r = rng(seed)
  c.fillStyle = g(48)
  c.fillRect(0, 0, S, S)
  hc.fillStyle = '#000'
  hc.fillRect(0, 0, S, S)
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const w = sw - 9 - r() * 5, h = sh - 9 - r() * 4
      const x = col * sw + (row % 2 ? sw / 2 : 0) + (sw - w) / 2 + (r() - 0.5) * 4, y = row * sh + (sh - h) / 2 + (r() - 0.5) * 3
      const tone = 76 + r() * 22 - (r() < 0.1 ? 8 : 0), rad = 12 + r() * 8
      for (const ox of x + w > S ? [0, -S] : [0]) {
        c.fillStyle = g(tone)
        c.beginPath()
        c.roundRect(x + ox, y, w, h, rad)
        c.fill()
        c.lineWidth = 3
        c.lineCap = 'round'
        c.strokeStyle = 'rgba(0,0,0,.1)'
        c.beginPath()
        c.arc(x + ox + w * 0.55, y + h * 0.48, Math.min(w, h) * 0.36, 0.1, Math.PI * 0.55)
        c.stroke()
        hc.fillStyle = g(130)
        hc.beginPath()
        hc.roundRect(x + ox, y, w, h, rad)
        hc.fill()
        hc.fillStyle = g(200)
        hc.beginPath()
        hc.roundRect(x + ox + 7, y + 7, w - 14, h - 14, rad * 0.7)
        hc.fill()
        hc.fillStyle = g(245)
        hc.beginPath()
        hc.roundRect(x + ox + 16, y + 16, w - 32, h - 32, rad * 0.5)
        hc.fill()
      }
    }
  const hf = blurField(canvasField(hgt), S, S, 3), wetN = noiseField(S, seed + 3, 3, 4), tone = noiseField(S, seed + 5, 4, 5)
  const im = c.getImageData(0, 0, S, S), d = im.data, rough = new Float32Array(S * S)
  for (let i = 0; i < hf.length; i++) {
    const wet = sstep(0.48, 0.68, wetN[i]), pool = wet * sstep(0.8, 0.25, hf[i]) // water finds the joints first
    const k = (0.9 + tone[i] * 0.18) * (1 - 0.1 * wet)
    d[i * 4] *= k
    d[i * 4 + 1] *= k
    d[i * 4 + 2] *= k
    rough[i] = Math.max(0.68, 0.95 - 0.15 * wet - 0.1 * pool) // damp, never glossy
    hf[i] += (0.82 - hf[i]) * wet * wet * 0.4 // wet stones read a little flatter
  }
  c.putImageData(im, 0, 0)
  return tiled('cobbles', { map, normal: normalCanvas(hf, S, S, 4), rough: fieldCanvas(rough, S, S) }, 4, 2048)
}

/** Sidewalk flagstones. Returns { map, normal, rough }. */
export function paveSet(seed = 14) {
  const S = 512, map = cv(S, S), hgt = cv(S, S), c = ctx2d(map), hc = ctx2d(hgt), r = rng(seed)
  c.fillStyle = g(74)
  c.fillRect(0, 0, S, S)
  hc.fillStyle = g(40)
  hc.fillRect(0, 0, S, S)
  const rows = 4, cols = 2, sw = S / cols, sh = S / rows
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < cols; col++) {
      const x = col * sw + (row % 2 ? sw / 2 : 0) + 3, y = row * sh + 3, w = sw - 6, h = sh - 6, tone = 132 + r() * 22
      for (const ox of x + w > S ? [0, -S] : [0]) {
        c.fillStyle = g(tone)
        c.beginPath()
        c.roundRect(x + ox, y, w, h, 5)
        c.fill()
        c.fillStyle = 'rgba(255,255,255,.04)'
        c.fillRect(x + ox + 4, y + 2, w - 8, 2)
        hc.fillStyle = g(205 + r() * 30)
        hc.beginPath()
        hc.roundRect(x + ox, y, w, h, 5)
        hc.fill()
      }
    }
  c.strokeStyle = 'rgba(0,0,0,.3)'
  c.lineWidth = 1.5
  for (let i = 0; i < 5; i++) {
    let x = 30 + r() * 450, y = 30 + r() * 450
    c.beginPath()
    c.moveTo(x, y)
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 60
      y += (r() - 0.5) * 60
      c.lineTo(x, y)
    }
    c.stroke()
  }
  for (let i = 0; i < 26; i++) {
    c.fillStyle = `rgba(0,0,0,${0.08 + r() * 0.14})`
    ell(c, r() * S, r() * S, 2 + r() * 7, 2 + r() * 5, r() * 3)
    c.fill()
  }
  const tone = noiseField(S, seed + 1, 4, 5), wetN = noiseField(S, seed + 2, 3, 4)
  shadeBy(c, S, S, tone, 0.78, 1.12)
  const hf = blurField(canvasField(hgt), S, S, 1), rough = new Float32Array(S * S)
  for (let i = 0; i < rough.length; i++) rough[i] = Math.max(0.62, 0.93 - 0.2 * sstep(0.5, 0.74, wetN[i]) - 0.08 * (1 - hf[i]))
  return tiled('pavement', { map, normal: normalCanvas(hf, S, S, 3), rough: fieldCanvas(rough, S, S) }, 3)
}

/** Weathered vertical planks. Returns { map, normal }. */
export function woodSet(seed = 23) {
  const S = 512, n = 8, pw = S / n, map = cv(S, S), hgt = cv(S, S), c = ctx2d(map), hc = ctx2d(hgt), r = rng(seed)
  hc.fillStyle = g(40)
  hc.fillRect(0, 0, S, S)
  for (let i = 0; i < n; i++) {
    const x = i * pw
    c.fillStyle = g(112 + r() * 34)
    c.fillRect(x, 0, pw, S)
    hc.fillStyle = g(190 + r() * 50)
    hc.fillRect(x + 3, 0, pw - 6, S)
    c.lineWidth = 1.2
    for (let k = 0; k < 9; k++) {
      c.strokeStyle = `rgba(0,0,0,${0.08 + r() * 0.16})`
      const gx = x + 5 + r() * (pw - 10)
      wline(c, r, gx, 0, gx + (r() - 0.5) * 6, S, 1.2)
    }
    if (r() < 0.6) {
      const kx = x + 14 + r() * (pw - 28), ky = r() * S
      c.strokeStyle = 'rgba(0,0,0,.35)'
      c.lineWidth = 2
      ell(c, kx, ky, 5 + r() * 4, 8 + r() * 6)
      c.stroke()
      c.fillStyle = 'rgba(0,0,0,.25)'
      ell(c, kx, ky, 3, 5)
      c.fill()
    }
    c.fillStyle = g(34)
    c.fillRect(x - 1.5, 0, 3, S)
    c.fillStyle = 'rgba(255,255,255,.08)'
    c.fillRect(x + 2, 0, 2, S)
    c.fillStyle = g(40)
    for (const ny of [22, S / 2, S - 22]) {
      circle(c, x + pw / 2, ny, 2.5)
      c.fill()
    }
  }
  c.fillStyle = g(34)
  c.fillRect(S - 1.5, 0, 1.5, S)
  shadeBy(c, S, S, noiseField(S, seed + 1, 4, 4), 0.8, 1.12)
  return tiled('wood', { map, normal: normalCanvas(blurField(canvasField(hgt), S, S, 1), S, S, 3) }, 3)
}

/** Painted / cast iron with rain streaks. */
export function metalCanvas(seed = 27): Canvas {
  const S = 256, c = cv(S, S), ctx = ctx2d(c), r = rng(seed)
  ctx.fillStyle = g(150)
  ctx.fillRect(0, 0, S, S)
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(${r() < 0.6 ? '0,0,0' : '255,255,255'},${0.03 + r() * 0.07})`
    ctx.fillRect(r() * S, 0, 1 + r() * 5, S)
  }
  shadeBy(ctx, S, S, noiseField(S, seed + 1, 4, 4), 0.8, 1.1)
  return art(c, 'metal', { level: true, max: 512 })
}
