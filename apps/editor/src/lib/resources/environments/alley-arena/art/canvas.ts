// Drawing primitives for the alley arena's canvas art (built from the
// art module). Canvases are
// OffscreenCanvas.
import * as THREE from 'three'

/** Ink tone of every outline. */
export const INK = '#0b0b0b'
/** Lettering font. The editor does not load Limelight, so Georgia is the usual result. */
export const FONT = '"Limelight", Georgia, serif'
/** Drawn paper tone. */
export const PAPER = '#f3f2ec'

export type Canvas = OffscreenCanvas
export type Ctx = OffscreenCanvasRenderingContext2D
export type Rng = () => number
/** [u0, v0, u1, v1]: a cell of an atlas in texture coordinates (v up). */
export type UvRect = [number, number, number, number]

/** mulberry32: every drawing is seeded, so the set looks the same on every load. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function cv(w: number, h: number): Canvas {
  return new OffscreenCanvas(w, h)
}

export function ctx2d(c: Canvas): Ctx {
  const x = c.getContext('2d')
  if (!x) throw new Error('alley arena: 2D canvas context unavailable')
  return x
}

/** A grey from 0-255, as a CSS colour. */
export const g = (v: number) => {
  v = Math.max(0, Math.min(255, Math.round(v)))
  return `rgb(${v},${v},${v})`
}

export const sstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

export const uvRect = (x: number, y: number, w: number, h: number, W: number, H: number, inset = 1.5): UvRect => [
  (x + inset) / W,
  1 - (y + h - inset) / H,
  (x + w - inset) / W,
  1 - (y + inset) / H,
]

export const snake = (s: string) => s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())

export function wline(ctx: Ctx, r: Rng, x1: number, y1: number, x2: number, y2: number, amp = 1.5) {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 24))
  ctx.beginPath()
  ctx.moveTo(x1, y1)
  for (let i = 1; i <= n; i++) {
    const t = i / n
    ctx.lineTo(x1 + (x2 - x1) * t + (r() - 0.5) * amp * 2, y1 + (y2 - y1) * t + (r() - 0.5) * amp * 2)
  }
  ctx.stroke()
}

export function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

export function ell(ctx: Ctx, x: number, y: number, rx: number, ry: number, rot = 0) {
  ctx.beginPath()
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2)
}

export function star(ctx: Ctx, x: number, y: number, ro: number, ri: number, n: number, rot = 0) {
  ctx.beginPath()
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n
    const r = i % 2 ? ri : ro
    if (i) ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
    else ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r)
  }
  ctx.closePath()
}

/** Soft painterly mottling so flat surfaces don't look digital. */
export function mottle(ctx: Ctx, r: Rng, w: number, h: number, n: number, lo: number, hi: number, alpha: number) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = g(lo + r() * (hi - lo))
    ctx.globalAlpha = alpha * r()
    ell(ctx, r() * w, r() * h, 10 + r() * 50, 6 + r() * 30, r() * 3)
    ctx.fill()
  }
  ctx.globalAlpha = 1
}

/**
 * An sRGB colour texture over a canvas. The canvas stays in memory: the editor
 * can upload the same texture again (a second viewport, a lost context).
 */
export function tex(canvas: Canvas, repeat?: readonly [number, number]): THREE.CanvasTexture<Canvas> {
  const t = new THREE.CanvasTexture<Canvas>(canvas)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 8
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping
    t.repeat.set(repeat[0], repeat[1])
  }
  return t
}

/** Non-colour data (normals, roughness): sampled as stored, never sRGB-decoded. */
export function dataTex(canvas: Canvas, repeat?: readonly [number, number]) {
  const t = tex(canvas, repeat)
  t.colorSpace = THREE.NoColorSpace
  return t
}
