// Props, signs, posters and light sprites drawn for the alley arena (built
// from the art module).
import { FONT, INK, PAPER, circle, ctx2d, cv, ell, g, mottle, rng, sstep, star, wline, type Ctx } from './canvas'
import { noiseField } from './fields'
import { art } from './overrides'

export function crateCanvas() {
  const c = cv(256, 256), ctx = ctx2d(c), r = rng(21)
  ctx.fillStyle = '#6f6f6f'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = 'rgba(0,0,0,.22)'
  ctx.lineWidth = 2
  for (let i = 0; i < 60; i++) wline(ctx, r, r() * 256, r() * 256, r() * 256, r() * 256 + 0, 1)
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 4
  for (let x = 51; x < 256; x += 51) wline(ctx, r, x, 0, x, 256, 1)
  // diagonal brace
  ctx.save()
  ctx.translate(128, 128)
  ctx.rotate(-Math.PI / 4)
  ctx.fillStyle = '#7d7d7d'
  ctx.fillRect(-170, -16, 340, 32)
  ctx.strokeStyle = '#1a1a1a'
  ctx.strokeRect(-170, -16, 340, 32)
  ctx.restore()
  // frame
  ctx.fillStyle = '#858585'
  ctx.fillRect(0, 0, 256, 26)
  ctx.fillRect(0, 230, 256, 26)
  ctx.fillRect(0, 0, 26, 256)
  ctx.fillRect(230, 0, 26, 256)
  ctx.lineWidth = 5
  ctx.strokeRect(26, 26, 204, 204)
  ctx.lineWidth = 8
  ctx.strokeRect(0, 0, 256, 256)
  ctx.fillStyle = '#1a1a1a'
  for (const [x, y] of [[13, 13], [243, 13], [13, 243], [243, 243]]) {
    circle(ctx, x, y, 4)
    ctx.fill()
  }
  mottle(ctx, r, 256, 256, 20, 20, 120, 0.12)
  return art(c, 'crate', { level: true, max: 1024 })
}

export function barrelCanvas() {
  const c = cv(256, 256), ctx = ctx2d(c), r = rng(31)
  ctx.fillStyle = '#676767'
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = '#1c1c1c'
  ctx.lineWidth = 3
  for (let x = 0; x <= 256; x += 32) wline(ctx, r, x, 0, x, 256, 0.8)
  for (const y of [34, 128, 222]) {
    ctx.fillStyle = '#2c2c2c'
    ctx.fillRect(0, y - 11, 256, 22)
    ctx.fillStyle = 'rgba(255,255,255,.12)'
    ctx.fillRect(0, y - 9, 256, 3)
  }
  mottle(ctx, r, 256, 256, 20, 20, 120, 0.12)
  return art(c, 'barrel', { level: true, max: 1024 })
}

export function cheeseCanvas() {
  const c = cv(256, 256), ctx = ctx2d(c), r = rng(41)
  ctx.fillStyle = '#c9c7bd'
  ctx.fillRect(0, 0, 256, 256)
  for (let i = 0; i < 14; i++) {
    const x = r() * 256, y = r() * 256, s = 8 + r() * 20
    ctx.fillStyle = '#77756e'
    ell(ctx, x, y, s, s * 0.8, r())
    ctx.fill()
    ctx.strokeStyle = INK
    ctx.lineWidth = 3
    ctx.stroke()
  }
  return art(c, 'cheese', { level: true, max: 1024 })
}

export function signCanvas(text: string, sub?: string, w = 1024, h = 320) {
  const c = cv(w, h), ctx = ctx2d(c)
  ctx.fillStyle = '#101010'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#d8d8d8'
  ctx.lineWidth = 8
  ctx.strokeRect(22, 22, w - 44, h - 44)
  ctx.fillStyle = '#fff'
  for (let x = 46; x < w - 30; x += 46) {
    circle(ctx, x, 22, 9)
    ctx.fill()
    circle(ctx, x, h - 22, 9)
    ctx.fill()
  }
  for (let y = 60; y < h - 40; y += 44) {
    circle(ctx, 22, y, 9)
    ctx.fill()
    circle(ctx, w - 22, y, 9)
    ctx.fill()
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `${sub ? h * 0.42 : h * 0.5}px ${FONT}`
  ctx.fillText(text, w / 2, sub ? h * 0.42 : h * 0.52, w - 110)
  if (sub) {
    ctx.font = `${h * 0.15}px ${FONT}`
    ctx.fillStyle = '#bdbdbd'
    ctx.fillText(sub, w / 2, h * 0.76, w - 140)
  }
  return c
}

export function billboardCanvas() {
  const c = cv(1024, 576), ctx = ctx2d(c)
  ctx.fillStyle = '#b9b7ad'
  ctx.fillRect(0, 0, 1024, 576)
  ctx.strokeStyle = INK
  ctx.lineWidth = 18
  ctx.strokeRect(9, 9, 1006, 558)
  // sunburst
  ctx.save()
  ctx.translate(250, 330)
  for (let i = 0; i < 16; i++) {
    ctx.fillStyle = i % 2 ? '#d8d6cc' : '#a4a298'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.arc(0, 0, 330, (i * Math.PI) / 8, ((i + 1) * Math.PI) / 8)
    ctx.fill()
  }
  ctx.restore()
  ctx.strokeRect(9, 9, 1006, 558)
  // wedge of cheese
  ctx.lineJoin = 'round'
  ctx.lineWidth = 10
  ctx.fillStyle = PAPER
  ctx.beginPath()
  ctx.moveTo(90, 400)
  ctx.lineTo(410, 240)
  ctx.lineTo(410, 440)
  ctx.lineTo(90, 470)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#dedcd2'
  ctx.beginPath()
  ctx.moveTo(90, 400)
  ctx.lineTo(410, 240)
  ctx.lineTo(300, 220)
  ctx.closePath()
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = '#8d8b83'
  for (const [x, y, s] of [[200, 410, 20], [300, 370, 28], [360, 420, 14], [250, 350, 12]]) {
    ell(ctx, x, y, s, s * 0.8)
    ctx.fill()
    ctx.lineWidth = 5
    ctx.stroke()
  }
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.font = `120px ${FONT}`
  ctx.fillText('EAT MORE', 690, 190, 520)
  ctx.font = `170px ${FONT}`
  ctx.fillText('CHEESE', 690, 360, 540)
  ctx.font = `44px ${FONT}`
  ctx.fillText("— it's the big cheese! —", 690, 460, 520)
  return c
}

/** Light-cone gradient for street-lamp and headlamp beams. */
export function coneCanvas() {
  const c = cv(64, 256), ctx = ctx2d(c)
  const gr = ctx.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, 'rgba(255,255,255,.95)')
  gr.addColorStop(0.5, 'rgba(255,255,255,.3)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, 64, 256)
  return c
}

export function graffitiCanvas(lines: string[]) {
  const c = cv(1024, 512), ctx = ctx2d(c)
  ctx.textAlign = 'center'
  ctx.fillStyle = 'rgba(235,233,224,.62)'
  lines.forEach((t, i) => {
    ctx.save()
    ctx.translate(512, 190 + i * 210)
    ctx.rotate(-0.04 + i * 0.05)
    ctx.font = `190px ${FONT}`
    ctx.fillText(t, 0, 0, 960)
    ctx.restore()
  })
  ctx.globalCompositeOperation = 'destination-out' // weathering
  const r = rng(7)
  for (let i = 0; i < 500; i++) {
    ctx.globalAlpha = r() * 0.8
    ctx.fillRect(r() * 1024, r() * 512, 2 + r() * 26, 1 + r() * 5)
  }
  return c
}

/** Bulb glow. */
export function haloCanvas() {
  const c = cv(128, 128), ctx = ctx2d(c), gr = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  gr.addColorStop(0, 'rgba(255,255,255,1)')
  gr.addColorStop(0.12, 'rgba(255,255,255,.55)')
  gr.addColorStop(0.4, 'rgba(255,255,255,.14)')
  gr.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, 128, 128)
  return c
}

/** Pool of light thrown across the ground from a doorway or shop window (top edge = the wall). */
export function spillCanvas() {
  const S = 128, c = cv(S, S), ctx = ctx2d(c), im = ctx.createImageData(S, S), d = im.data
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = y / (S - 1), u = Math.abs(x / (S - 1) - 0.5) * 2, w = 0.5 + 0.5 * v, i = (y * S + x) * 4
      d[i] = d[i + 1] = d[i + 2] = 255
      d[i + 3] = 255 * Math.pow(1 - v, 1.6) * (1 - sstep(w * 0.55, w, u)) * sstep(0, 0.04, v)
    }
  ctx.putImageData(im, 0, 0)
  return c
}

/** Dark water, soft-edged irregular alpha. */
export function puddleMaskCanvas(seed = 141) {
  const S = 256, c = cv(S, S), ctx = ctx2d(c), im = ctx.createImageData(S, S), d = im.data, n = noiseField(S, seed, 3, 4)
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const q = Math.hypot((x - 127.5) / 128, (y - 127.5) / 128), i = (y * S + x) * 4
      d[i] = d[i + 1] = d[i + 2] = 16
      d[i + 3] = 235 * sstep(0.02, 0.16, (1 - q) * 0.9 + (n[y * S + x] - 0.5) * 0.5 - 0.3)
    }
  ctx.putImageData(im, 0, 0)
  return c
}

/** Equirectangular stand-in for the street, reflected by puddles and wet stone. */
export function reflectionCanvas(seed = 151) {
  const c = cv(512, 256), ctx = ctx2d(c), r = rng(seed)
  const gr = ctx.createLinearGradient(0, 0, 0, 256)
  gr.addColorStop(0, '#1c1c1c')
  gr.addColorStop(0.3, '#484848')
  gr.addColorStop(0.47, '#8a8a8a')
  gr.addColorStop(0.5, '#5a5a5a')
  gr.addColorStop(0.56, '#2a2a2a')
  gr.addColorStop(1, '#161616')
  ctx.fillStyle = gr
  ctx.fillRect(0, 0, 512, 256)
  let x = 0
  while (x < 512) {
    // tenement silhouettes with a few lit windows
    const w = 26 + r() * 40, h = 30 + r() * 46
    ctx.fillStyle = g(52 + r() * 22)
    ctx.fillRect(x, 128 - h, w, h)
    for (let wy = 128 - h + 8; wy < 120; wy += 12)
      for (let wx = x + 5; wx < x + w - 6; wx += 10)
        if (r() < 0.16) {
          ctx.fillStyle = g(230)
          ctx.fillRect(wx, wy, 5, 8)
        }
    x += w
  }
  for (let k = 0; k < 4; k++) {
    const lx = 64 + k * 128
    const lg = ctx.createRadialGradient(lx, 108, 0, lx, 108, 12)
    lg.addColorStop(0, 'rgba(255,255,255,1)')
    lg.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = lg
    ctx.fillRect(lx - 12, 96, 24, 24)
  }
  return c
}

/** Wraps a cylinder: dark staves, two hoops, a hazard diamond with a burst. */
export function kegCanvas() {
  const c = cv(512, 256), ctx = ctx2d(c), r = rng(131)
  ctx.fillStyle = '#3a3a3c'
  ctx.fillRect(0, 0, 512, 256)
  ctx.strokeStyle = '#1a1a1a'
  ctx.lineWidth = 3
  for (let x = 0; x <= 512; x += 32) wline(ctx, r, x, 0, x, 256, 0.8)
  for (const y of [28, 228]) {
    ctx.fillStyle = '#8a8a86'
    ctx.fillRect(0, y - 12, 512, 24)
    ctx.fillStyle = INK
    ctx.fillRect(0, y - 14, 512, 3)
    ctx.fillRect(0, y + 11, 512, 3)
  }
  for (const x of [128, 384]) {
    ctx.save()
    ctx.translate(x, 128)
    ctx.lineJoin = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = 8
    ctx.fillStyle = PAPER
    ctx.beginPath()
    ctx.moveTo(0, -70)
    ctx.lineTo(70, 0)
    ctx.lineTo(0, 70)
    ctx.lineTo(-70, 0)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = INK
    star(ctx, 0, 0, 44, 18, 9, 0.3)
    ctx.fill()
    ctx.fillStyle = PAPER
    circle(ctx, 0, 0, 9)
    ctx.fill()
    ctx.restore()
  }
  return art(c, 'keg', { max: 1024 })
}

/**
 * A wanted poster without a mugshot. The picture of the same name (for example
 * poster_boss.jpg) replaces it when it loads.
 */
export function posterCanvas(pic: string, top: string, name: string, bottom: string) {
  const c = cv(512, 720), ctx = ctx2d(c), r = rng(name.length * 13 + top.length)
  ctx.fillStyle = '#c9c7bb'
  ctx.fillRect(0, 0, 512, 720)
  mottle(ctx, r, 512, 720, 40, 120, 230, 0.18)
  ctx.strokeStyle = INK
  ctx.lineWidth = 14
  ctx.strokeRect(18, 18, 476, 684)
  ctx.fillStyle = INK
  ctx.textAlign = 'center'
  ctx.font = `110px ${FONT}`
  ctx.fillText(top, 256, 130, 430)
  ctx.fillStyle = '#8f8d84'
  ctx.fillRect(70, 160, 372, 340)
  ctx.lineWidth = 8
  ctx.strokeRect(70, 160, 372, 340)
  ctx.fillStyle = INK
  ctx.font = `78px ${FONT}`
  ctx.fillText(name, 256, 580, 430)
  ctx.font = `44px ${FONT}`
  ctx.fillText(bottom, 256, 650, 430)
  return art(c, pic, { level: true, max: 1536 })
}

const disc = (x: Ctx, cx: number, cy: number, r: number) => {
  x.beginPath()
  x.arc(cx, cy, r, 0, 6.2832)
}

/** A plain skull over crossed bones: the mark on each spawn door. */
function skullMark(x: Ctx, cx: number, cy: number, s: number) {
  x.save()
  x.translate(cx, cy)
  x.scale(s, s)
  x.fillStyle = INK
  disc(x, 0, 0, 56)
  x.fill()
  x.strokeStyle = x.fillStyle = '#f2f2f2'
  x.lineWidth = 9
  x.lineCap = 'round'
  for (const d of [-1, 1]) {
    x.beginPath()
    x.moveTo(-34 * d, -24)
    x.lineTo(34 * d, 30)
    x.stroke()
    for (const [px, py] of [[-34 * d, -24], [34 * d, 30]])
      for (const o of [-1, 1]) {
        disc(x, px - o * 3.1, py + o * 3.9 * d, 6.5)
        x.fill()
      }
  }
  x.fillStyle = INK
  disc(x, 0, -6, 31)
  x.fill()
  x.fillRect(-19, 6, 38, 30) // ink gap so the skull sits in front of the bones
  x.fillStyle = '#f2f2f2'
  disc(x, 0, -6, 26)
  x.fill()
  x.beginPath()
  x.roundRect(-15, 8, 30, 23, 6)
  x.fill()
  x.fillStyle = INK
  for (const d of [-1, 1]) {
    disc(x, 10.5 * d, -6, 7.5)
    x.fill()
  }
  x.beginPath()
  x.moveTo(0, 5)
  x.lineTo(-4.5, 13)
  x.lineTo(4.5, 13)
  x.closePath()
  x.fill()
  for (const tx of [-8, -1.25, 5.5]) x.fillRect(tx, 20, 2.5, 11)
  x.restore()
}

/** Spawn-door leaf, w metres wide: pale planks, two ledges, a knob, the mark near the top. */
export function doorCanvas(w: number) {
  const W = Math.round(w * 190), H = 512, c = cv(W, H), x = ctx2d(c), r = rng(77 + W), n = Math.round(w / 0.26)
  x.fillStyle = '#c8c8c4'
  x.fillRect(0, 0, W, H)
  x.strokeStyle = '#8f8f8b'
  x.lineWidth = 3
  for (let i = 1; i < n; i++) {
    const px = (i / n) * W + (r() - 0.5) * 3
    x.beginPath()
    x.moveTo(px, 10)
    x.lineTo(px, H - 10)
    x.stroke()
  }
  x.strokeStyle = INK
  for (const y of [168, 424]) {
    x.fillStyle = '#a9a9a5'
    x.fillRect(8, y, W - 16, 26)
    x.strokeRect(8, y, W - 16, 26)
  }
  x.lineWidth = 12
  x.strokeRect(6, 6, W - 12, H - 12)
  x.fillStyle = INK
  disc(x, W - 30, 300, 11)
  x.fill()
  x.fillStyle = '#e9e9e9'
  disc(x, W - 31, 299, 5)
  x.fill()
  skullMark(x, W / 2, 92, 0.95)
  return c
}
