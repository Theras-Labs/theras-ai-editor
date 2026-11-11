// Façade, shop-front, laundry and ground-decal atlases (drawn in code).
import { FONT, INK, circle, ctx2d, cv, ell, g, rng, snake, uvRect, type Ctx, type UvRect } from './canvas'
import { atlas, type AtlasCell, type GlassPane } from './overrides'

/** Head-and-shoulders silhouette, origin at the chin. */
function mouseSil(ctx: Ctx, x: number, y: number, s: number, col: string) {
  ctx.fillStyle = col
  circle(ctx, x - 17 * s, y - 44 * s, 12 * s)
  ctx.fill()
  circle(ctx, x + 17 * s, y - 44 * s, 12 * s)
  ctx.fill()
  circle(ctx, x, y - 24 * s, 21 * s)
  ctx.fill()
  ctx.beginPath()
  ctx.ellipse(x, y + 34 * s, 34 * s, 38 * s, 0, Math.PI, 0)
  ctx.lineTo(x + 34 * s, y + 80 * s)
  ctx.lineTo(x - 34 * s, y + 80 * s)
  ctx.closePath()
  ctx.fill()
}

/** Hats for shop-window displays: fedora, bowler or flat cap, drawn around the origin. */
function drawHat(ctx: Ctx, kind: string, col: string) {
  ctx.fillStyle = col
  ctx.strokeStyle = INK
  ctx.lineWidth = 4
  ctx.lineJoin = 'round'
  if (kind === 'fedora') {
    ell(ctx, 0, 0, 44, 9)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-25, -2)
    ctx.bezierCurveTo(-28, -28, -18, -40, -7, -34)
    ctx.quadraticCurveTo(0, -29, 7, -34)
    ctx.bezierCurveTo(18, -40, 28, -28, 25, -2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = INK
    ctx.fillRect(-25, -13, 50, 10)
  } else if (kind === 'bowler') {
    ell(ctx, 0, 0, 40, 8)
    ctx.fill()
    ctx.stroke()
    ctx.beginPath()
    ctx.moveTo(-26, -2)
    ctx.bezierCurveTo(-28, -44, 28, -44, 26, -2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = '#9a9a9a'
    ctx.fillRect(-25, -12, 50, 8)
  } else {
    // flat cap
    ctx.beginPath()
    ctx.moveTo(-32, 0)
    ctx.bezierCurveTo(-36, -26, 34, -30, 32, -2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ell(ctx, 6, 2, 34, 8, 0.05)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = INK
    circle(ctx, 0, -22, 4)
    ctx.fill()
  }
}

/** Upper-storey sash windows, 4x2 cells: four lit, four dark. */
export function windowAtlas(seed = 1) {
  const S = 1024, map = cv(S, S), glow = cv(S / 2, S / 2), c = ctx2d(map), e = ctx2d(glow)
  e.fillStyle = '#000'
  e.fillRect(0, 0, S / 2, S / 2)
  const LW = 250, LH = 400, kinds = ['curtain', 'mouse', 'blind', 'lamp', 'dark', 'darkCurtain', 'darkBlind', 'boards']
  const cells = kinds.map((_, i) => uvRect((i % 4) * 256, Math.floor(i / 4) * 512, 256, 512, S, S))
  kinds.forEach((kind, i) => {
    const lit = i < 4
    for (const em of [false, true]) {
      const ctx = em ? e : c, r = rng(seed * 31 + i), P = (v: number) => (em ? '#000' : g(v))
      ctx.save()
      if (em) ctx.scale(0.5, 0.5)
      ctx.translate((i % 4) * 256, Math.floor(i / 4) * 512)
      ctx.beginPath()
      ctx.rect(0, 0, 256, 512)
      ctx.clip()
      ctx.scale(256 / LW, 512 / LH)
      ctx.fillStyle = P(44)
      ctx.fillRect(0, 0, LW, LH) // sash frame
      const gx = 14, gy = 14, gw = LW - 28, gh = LH - 28
      ctx.save()
      ctx.beginPath()
      ctx.rect(gx, gy, gw, gh)
      ctx.clip()
      if (lit) {
        const gr = ctx.createLinearGradient(0, gy, 0, gy + gh)
        gr.addColorStop(0, g(236))
        gr.addColorStop(1, g(196))
        ctx.fillStyle = gr
        ctx.fillRect(gx, gy, gw, gh)
        if (kind === 'curtain' || kind === 'mouse') {
          const cw = kind === 'mouse' ? 46 : 78
          for (const sd of [0, 1]) {
            const x0 = sd ? gx + gw : gx, dir = sd ? -1 : 1
            ctx.fillStyle = g(150)
            ctx.beginPath()
            ctx.moveTo(x0, gy)
            ctx.lineTo(x0 + dir * cw, gy)
            ctx.quadraticCurveTo(x0 + dir * (cw + 16), gy + gh * 0.5, x0 + dir * cw * 0.5, gy + gh)
            ctx.lineTo(x0, gy + gh)
            ctx.closePath()
            ctx.fill()
            ctx.strokeStyle = g(108)
            ctx.lineWidth = 3
            for (let k = 1; k < 4; k++) {
              ctx.beginPath()
              ctx.moveTo(x0 + (dir * cw * k) / 4, gy)
              ctx.quadraticCurveTo(x0 + dir * ((cw * k) / 4 + 8), gy + gh * 0.5, x0 + (dir * cw * k) / 8, gy + gh)
              ctx.stroke()
            }
          }
          ctx.fillStyle = g(168)
          ctx.fillRect(gx, gy, gw, 26)
          if (kind === 'mouse') mouseSil(ctx, LW / 2 + 8, LH - 150, 1.25, g(20))
        } else if (kind === 'blind') {
          const bh = gh * (0.5 + r() * 0.2)
          ctx.fillStyle = g(172)
          ctx.fillRect(gx, gy, gw, bh)
          ctx.strokeStyle = g(132)
          ctx.lineWidth = 2
          for (let y = gy + 10; y < gy + bh; y += 13) {
            ctx.beginPath()
            ctx.moveTo(gx, y)
            ctx.lineTo(gx + gw, y)
            ctx.stroke()
          }
          ctx.fillStyle = g(90)
          ctx.fillRect(gx, gy + bh - 5, gw, 5)
          ctx.strokeStyle = g(60)
          ctx.beginPath()
          ctx.moveTo(LW / 2 + 30, gy + bh)
          ctx.lineTo(LW / 2 + 30, gy + bh + 34)
          ctx.stroke()
          circle(ctx, LW / 2 + 30, gy + bh + 40, 6)
          ctx.stroke()
        } else {
          // table lamp and a pot plant on the sill
          ctx.fillStyle = g(150)
          ctx.fillRect(gx, gy, 40, gh)
          ctx.fillRect(gx + gw - 40, gy, 40, gh)
          ctx.fillStyle = g(30)
          ctx.fillRect(84, LH - 86, 12, 72)
          ctx.fillRect(70, LH - 26, 40, 12)
          ctx.fillStyle = g(252)
          ctx.beginPath()
          ctx.moveTo(62, LH - 86)
          ctx.lineTo(118, LH - 86)
          ctx.lineTo(104, LH - 136)
          ctx.lineTo(76, LH - 136)
          ctx.closePath()
          ctx.fill()
          ctx.fillStyle = g(26)
          ctx.fillRect(150, LH - 46, 36, 32)
          for (const [dx, dy] of [[0, 0], [-14, -12], [16, -14], [2, -30], [-10, -40], [14, -44]]) {
            ell(ctx, 168 + dx, LH - 58 + dy, 13, 9, dx * 0.05)
            ctx.fill()
          }
        }
        if (!em) {
          // the picture lives in the glow map
          ctx.fillStyle = 'rgba(6,6,6,.84)'
          ctx.fillRect(gx, gy, gw, gh)
        }
      } else if (!em) {
        const gr = ctx.createLinearGradient(0, gy, 0, gy + gh)
        gr.addColorStop(0, g(30))
        gr.addColorStop(1, g(50))
        ctx.fillStyle = gr
        ctx.fillRect(gx, gy, gw, gh)
        if (kind === 'darkCurtain') {
          ctx.fillStyle = g(66)
          ctx.fillRect(gx, gy, 60, gh)
          ctx.fillRect(gx + gw - 60, gy, 60, gh)
          ctx.fillStyle = g(72)
          ctx.fillRect(gx, gy, gw, 24)
        }
        if (kind === 'darkBlind') {
          ctx.fillStyle = g(78)
          ctx.fillRect(gx, gy, gw, gh * 0.72)
          ctx.fillStyle = g(54)
          ctx.fillRect(gx, gy + gh * 0.72 - 5, gw, 5)
        }
        if (kind === 'boards') {
          ctx.fillStyle = g(104)
          ctx.strokeStyle = g(30)
          ctx.lineWidth = 3
          for (const [by, rot] of [[90, -0.12], [200, 0.09], [300, -0.05]]) {
            ctx.save()
            ctx.translate(LW / 2, by)
            ctx.rotate(rot)
            ctx.fillRect(-130, -22, 260, 44)
            ctx.strokeRect(-130, -22, 260, 44)
            ctx.restore()
          }
        }
        ctx.strokeStyle = 'rgba(255,255,255,.09)'
        ctx.lineWidth = 16
        ctx.lineCap = 'butt'
        ctx.beginPath()
        ctx.moveTo(gx + 20, gy + gh)
        ctx.lineTo(gx + 130, gy)
        ctx.stroke()
        ctx.lineWidth = 5
        ctx.beginPath()
        ctx.moveTo(gx + 60, gy + gh)
        ctx.lineTo(gx + 170, gy)
        ctx.stroke()
      }
      ctx.restore()
      ctx.fillStyle = P(40) // glazing bars
      ctx.fillRect(gx, LH / 2 - 6, gw, 12)
      if (kind !== 'boards') {
        ctx.fillRect(LW / 2 - 3, gy, 6, gh)
        if (i % 2) ctx.fillRect(gx, gy + gh * 0.25 - 2, gw, 4)
      }
      const sh = ctx.createLinearGradient(0, gy, 0, gy + 44) // shadow of the reveal
      sh.addColorStop(0, 'rgba(0,0,0,.5)')
      sh.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = sh
      ctx.fillRect(gx, gy, gw, 44)
      ctx.strokeStyle = P(16)
      ctx.lineWidth = 4
      ctx.strokeRect(gx, gy, gw, gh)
      ctx.restore()
    }
  })
  atlas(
    { map, glow, k: 2 },
    kinds.map((kind, i): AtlasCell => [
      'win_' + snake(kind),
      (i % 4) * 256,
      Math.floor(i / 4) * 512,
      256,
      512,
      i < 4 ? { glass: [[14 / LW, 14 / LH, 1 - 28 / LW, 1 - 28 / LH, 0.84]] } : {},
    ])
  )
  return { map, glow, lit: cells.slice(0, 4), dark: cells.slice(4) }
}

type PaintFn = (ctx: Ctx, P: (v: number) => string, em: boolean) => void

/**
 * Street-level atlas: shop windows, doors, shutters, fascia lettering, hanging
 * signs and prop faces. Returns { map, glow, uv: { name: [u0, v0, u1, v1] } }.
 */
export function shopAtlas() {
  const S = 2048, map = cv(S, S), glow = cv(S / 2, S / 2), c = ctx2d(map), e = ctx2d(glow)
  const uv: Record<string, UvRect> = {}
  c.fillStyle = '#2a2a2a'
  c.fillRect(0, 0, S, S)
  e.fillStyle = '#000'
  e.fillRect(0, 0, S / 2, S / 2)
  // fn(ctx, P, em): P(v) is ordinary paint (black in the glow map); plain g(v) tones are emissive
  const list: AtlasCell[] = [] // every cell and its veiled (lit) panes, for the picture overrides
  let panes: GlassPane[] = []
  const cell = (name: string, x: number, y: number, w: number, h: number, lw: number, lh: number, fn: PaintFn, noGlow?: boolean) => {
    uv[name] = uvRect(x, y, w, h, S, S, 2)
    const mine: GlassPane[] = (panes = [])
    for (const em of noGlow ? [false] : [false, true]) {
      const ctx = em ? e : c
      ctx.save()
      if (em) ctx.scale(0.5, 0.5)
      ctx.translate(x, y)
      ctx.beginPath()
      ctx.rect(0, 0, w, h)
      ctx.clip()
      ctx.scale(w / lw, h / lh)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      fn(ctx, (v) => (em ? '#000' : g(v)), em)
      ctx.restore()
    }
    list.push([snake(name), x, y, w, h, { glass: mine.map(([a, b, cc, d, v]): GlassPane => [a / lw, b / lh, cc / lw, d / lh, v]) }])
  }
  const veil = (ctx: Ctx, em: boolean, x: number, y: number, w: number, h: number, a = 0.84) => {
    if (!em) {
      panes.push([x, y, w, h, a])
      ctx.fillStyle = `rgba(6,6,6,${a})`
      ctx.fillRect(x, y, w, h)
    }
  }
  const glassText = (ctx: Ctx, t: string, x: number, y: number, px: number, mw: number) => {
    ctx.font = `${px}px ${FONT}`
    ctx.lineWidth = px * 0.16
    ctx.strokeStyle = g(250)
    ctx.strokeText(t, x, y, mw)
    ctx.fillStyle = g(22)
    ctx.fillText(t, x, y, mw)
  }
  const wheel = (ctx: Ctx, x: number, y: number, rx: number, h: number) => {
    // a cheese wheel seen slightly from above
    ctx.fillStyle = g(120)
    ctx.strokeStyle = g(20)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.ellipse(x, y, rx, rx * 0.3, 0, 0, Math.PI)
    ctx.lineTo(x - rx, y - h)
    ctx.lineTo(x + rx, y - h)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = g(168)
    ell(ctx, x, y - h, rx, rx * 0.3)
    ctx.fill()
    ctx.stroke()
  }
  const wedge = (ctx: Ctx, x: number, y: number, s: number) => {
    ctx.fillStyle = g(150)
    ctx.strokeStyle = g(20)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(x - 46 * s, y)
    ctx.lineTo(x + 46 * s, y)
    ctx.lineTo(x + 46 * s, y - 52 * s)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = g(60)
    for (const [dx, dy, q] of [[10, -12, 7], [30, -26, 9], [32, -8, 5]]) {
      circle(ctx, x + dx * s, y + dy * s, q * s)
      ctx.fill()
    }
  }
  const interior = (ctx: Ctx, x: number, y: number, w: number, h: number) => {
    const gr = ctx.createRadialGradient(x + w / 2, y + h * 0.4, 20, x + w / 2, y + h * 0.5, w * 0.72)
    gr.addColorStop(0, g(246))
    gr.addColorStop(0.55, g(204))
    gr.addColorStop(1, g(128))
    ctx.fillStyle = gr
    ctx.fillRect(x, y, w, h)
  }
  const shopWin = (kind: string, lit: boolean): PaintFn => (ctx, P, em) => {
    const X = 14, Y = 74, W = 472, H = 314
    ctx.fillStyle = P(46)
    ctx.fillRect(0, 0, 500, 400) // timber frame
    for (let i = 0; i < 5; i++) {
      // transom lights
      if (lit) {
        ctx.fillStyle = g(150 + (i % 2) * 24)
        ctx.fillRect(14 + i * 95.5, 12, 86, 50)
        veil(ctx, em, 14 + i * 95.5, 12, 86, 50, 0.8)
      } else {
        ctx.fillStyle = P(34 + (i % 2) * 8)
        ctx.fillRect(14 + i * 95.5, 12, 86, 50)
      }
    }
    ctx.save()
    ctx.beginPath()
    ctx.rect(X, Y, W, H)
    ctx.clip()
    if (lit) interior(ctx, X, Y, W, H)
    else {
      ctx.fillStyle = g(150)
      ctx.fillRect(X, Y, W, H)
    }
    if (kind === 'cheese') {
      ctx.fillStyle = g(64)
      ctx.fillRect(X, 300, W, 10)
      ctx.fillRect(X + 250, 212, 200, 8)
      wheel(ctx, 110, 298, 62, 34)
      wheel(ctx, 106, 252, 50, 30)
      wheel(ctx, 112, 212, 38, 24)
      wedge(ctx, 250, 298, 1)
      wheel(ctx, 390, 298, 54, 30)
      wedge(ctx, 320, 210, 0.7)
      wheel(ctx, 400, 210, 34, 22)
      ctx.fillStyle = g(40)
      ctx.fillRect(X, 372, W, 16)
      glassText(ctx, 'CHEESE', 250, 132, 70, 400)
    } else if (kind === 'hats') {
      ctx.fillStyle = g(64)
      ctx.fillRect(X, 330, W, 10)
      const stands: [number, number, string, string][] = [[100, 250, 'fedora', '#8d8d8d'], [250, 220, 'bowler', '#3a3a3a'], [400, 256, 'cap', '#a5a5a5']]
      for (const [hx, hy, hk, col] of stands) {
        ctx.fillStyle = g(50)
        ctx.fillRect(hx - 4, hy, 8, 330 - hy)
        ctx.fillRect(hx - 22, 322, 44, 8)
        circle(ctx, hx, hy - 4, 20)
        ctx.fill()
        ctx.save()
        ctx.translate(hx, hy - 16)
        ctx.scale(1.5, 1.5)
        drawHat(ctx, hk, col)
        ctx.restore()
      }
      glassText(ctx, 'HATS', 250, 126, 76, 300)
    } else if (kind === 'eats') {
      ctx.fillStyle = g(178)
      ctx.fillRect(X, Y, W, 110)
      ctx.strokeStyle = g(120)
      ctx.lineWidth = 3
      for (let y = Y + 8; y < Y + 110; y += 12) {
        ctx.beginPath()
        ctx.moveTo(X, y)
        ctx.lineTo(X + W, y)
        ctx.stroke()
      }
      for (const lx of [140, 360]) {
        ctx.strokeStyle = g(40)
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(lx, Y + 110)
        ctx.lineTo(lx, 222)
        ctx.stroke()
        ctx.fillStyle = g(40)
        ctx.beginPath()
        ctx.moveTo(lx - 26, 244)
        ctx.lineTo(lx + 26, 244)
        ctx.lineTo(lx + 10, 220)
        ctx.lineTo(lx - 10, 220)
        ctx.closePath()
        ctx.fill()
      }
      mouseSil(ctx, 190, 300, 1.05, g(24))
      mouseSil(ctx, 310, 306, 0.95, g(30))
      ctx.fillStyle = g(44)
      ctx.fillRect(X, 352, W, 36)
      ctx.fillStyle = g(30)
      ctx.fillRect(238, 330, 26, 22) // coffee pot on the counter
      glassText(ctx, 'EATS', 420, 300, 52, 120)
    } else {
      // pawn
      ctx.fillStyle = g(64)
      ctx.fillRect(X, 320, W, 10)
      ctx.fillStyle = g(34)
      ctx.strokeStyle = g(34)
      ctx.lineWidth = 5
      ctx.beginPath()
      ctx.moveTo(110, 318)
      ctx.lineTo(70, 240)
      ctx.lineTo(150, 210)
      ctx.closePath()
      ctx.fill()
      ctx.fillRect(84, 296, 60, 22) // gramophone
      ctx.fillStyle = g(232)
      circle(ctx, 250, 268, 46)
      ctx.fill()
      ctx.stroke() // clock
      ctx.beginPath()
      ctx.moveTo(250, 268)
      ctx.lineTo(250, 236)
      ctx.moveTo(250, 268)
      ctx.lineTo(272, 280)
      ctx.stroke()
      ctx.fillStyle = g(40)
      ell(ctx, 400, 290, 30, 34)
      ctx.fill()
      ell(ctx, 400, 248, 20, 22)
      ctx.fill()
      ctx.fillRect(395, 150, 10, 90)
      ctx.fillRect(388, 140, 24, 16) // guitar
      ctx.fillStyle = g(40)
      ctx.fillRect(X, 372, W, 16)
      glassText(ctx, 'PAWN', 250, 132, 70, 300)
    }
    ctx.restore()
    if (lit) veil(ctx, em, X, Y, W, H)
    else if (!em) {
      // closed for the night: dim stock behind dark glass and a card in the window
      ctx.fillStyle = 'rgba(8,8,8,.78)'
      ctx.fillRect(X, Y, W, H)
      ctx.save()
      ctx.translate(250, 250)
      ctx.rotate(-0.06)
      ctx.fillStyle = g(150)
      ctx.fillRect(-70, -26, 140, 52)
      ctx.fillStyle = g(26)
      ctx.font = `34px ${FONT}`
      ctx.fillText('CLOSED', 0, 2, 124)
      ctx.restore()
    }
    if (!em) {
      ctx.fillStyle = 'rgba(255,255,255,.06)'
      ctx.beginPath()
      ctx.moveTo(60, Y + H)
      ctx.lineTo(210, Y)
      ctx.lineTo(280, Y)
      ctx.lineTo(130, Y + H)
      ctx.fill()
      ctx.beginPath()
      ctx.moveTo(330, Y + H)
      ctx.lineTo(480, Y)
      ctx.lineTo(500, Y)
      ctx.lineTo(350, Y + H)
      ctx.fill()
    }
    ctx.fillStyle = P(44)
    ctx.fillRect(246, Y, 8, H)
    const sh = ctx.createLinearGradient(0, Y, 0, Y + 50)
    sh.addColorStop(0, 'rgba(0,0,0,.45)')
    sh.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = sh
    ctx.fillRect(X, Y, W, 50)
    ctx.strokeStyle = P(16)
    ctx.lineWidth = 5
    ctx.strokeRect(X, Y, W, H)
  }
  ;['cheese', 'hats', 'eats', 'pawn'].forEach((k, i) => cell('shop' + i, i * 512, 0, 512, 512, 500, 400, shopWin(k, true)))
  cell('shopDark0', 0, 512, 512, 512, 500, 400, shopWin('pawn', false), true)
  cell('shopDark1', 512, 512, 512, 512, 500, 400, shopWin('hats', false), true)

  cell('shutter', 1024, 512, 512, 512, 400, 400, (ctx, P) => {
    for (let y = 0; y < 400; y += 20) {
      const gr = ctx.createLinearGradient(0, y, 0, y + 20)
      gr.addColorStop(0, g(132))
      gr.addColorStop(0.7, g(92))
      gr.addColorStop(1, g(60))
      ctx.fillStyle = gr
      ctx.fillRect(0, y, 400, 20)
    }
    ctx.fillStyle = P(58)
    ctx.fillRect(0, 0, 14, 400)
    ctx.fillRect(386, 0, 14, 400)
    ctx.fillRect(0, 384, 400, 16)
    ctx.fillStyle = P(40)
    ctx.fillRect(186, 360, 28, 26)
    ctx.strokeStyle = P(40)
    ctx.lineWidth = 5
    ctx.beginPath()
    ctx.arc(200, 360, 10, Math.PI, 0)
    ctx.stroke()
    ctx.save()
    ctx.translate(270, 170)
    ctx.rotate(0.05)
    ctx.fillStyle = P(186)
    ctx.fillRect(-60, -80, 120, 160)
    ctx.fillStyle = P(30)
    ctx.font = `30px ${FONT}`
    ctx.fillText('NOTICE', 0, -52, 104)
    for (let k = 0; k < 6; k++) ctx.fillRect(-46, -26 + k * 16, 92 - (k % 3) * 14, 5)
    ctx.restore()
    ctx.strokeStyle = 'rgba(0,0,0,.25)'
    ctx.lineWidth = 6
    const r = rng(77)
    for (let k = 0; k < 8; k++) {
      const x = r() * 400
      ctx.beginPath()
      ctx.moveTo(x, r() * 200)
      ctx.lineTo(x + (r() - 0.5) * 8, 240 + r() * 160)
      ctx.stroke()
    }
  }, true)

  cell('garage', 1536, 512, 512, 512, 400, 400, (ctx, P) => {
    const r = rng(78)
    ctx.fillStyle = P(44)
    ctx.fillRect(0, 0, 400, 400)
    for (const x0 of [10, 204]) {
      for (let k = 0; k < 6; k++) {
        ctx.fillStyle = P(112 + r() * 26)
        ctx.fillRect(x0 + k * 31, 10, 30, 384)
      }
      ctx.fillStyle = P(38)
      ctx.fillRect(x0 + 16, 30, 154, 84)
      for (let a = 0; a < 2; a++)
        for (let b = 0; b < 2; b++) {
          ctx.fillStyle = P(58 + ((a + b) % 2) * 10)
          ctx.fillRect(x0 + 22 + a * 74, 36 + b * 39, 68, 33)
        }
      ctx.fillStyle = P(96)
      ctx.strokeStyle = P(36)
      ctx.lineWidth = 4
      for (const y of [130, 366]) {
        ctx.fillRect(x0, y, 186, 22)
        ctx.strokeRect(x0, y, 186, 22)
      }
      ctx.beginPath()
      ctx.moveTo(x0, 366)
      ctx.lineTo(x0 + 22, 366)
      ctx.lineTo(x0 + 186, 152)
      ctx.lineTo(x0 + 164, 152)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = P(46)
      for (const y of [136, 372]) ctx.fillRect(x0 === 10 ? x0 : x0 + 130, y, 56, 10)
    }
    ctx.fillStyle = P(30)
    ctx.fillRect(196, 0, 8, 400)
    ctx.fillStyle = 'rgba(222,222,222,.5)'
    ctx.font = `44px ${FONT}`
    ctx.fillText('DAIRY CO.', 200, 262, 300)
    ctx.fillStyle = P(34)
    circle(ctx, 184, 250, 7)
    ctx.fill()
    circle(ctx, 216, 250, 7)
    ctx.fill()
  }, true)

  // doors, 256x512 each
  const doorFrame = (ctx: Ctx, P: (v: number) => string) => {
    ctx.fillStyle = P(40)
    ctx.fillRect(0, 0, 200, 400)
  }
  cell('door0', 0, 1024, 256, 512, 200, 400, (ctx, P, em) => {
    // panelled door, lit transom
    doorFrame(ctx, P)
    ctx.fillStyle = g(214)
    ctx.fillRect(16, 12, 168, 56)
    ctx.fillStyle = g(40)
    ctx.font = `40px ${FONT}`
    ctx.fillText('12', 100, 42)
    veil(ctx, em, 16, 12, 168, 56, 0.8)
    ctx.fillStyle = P(40)
    ctx.fillRect(98, 12, 4, 56)
    ctx.fillStyle = P(104)
    ctx.fillRect(16, 80, 168, 320)
    for (const [px, py, pw, ph] of [[28, 94, 66, 130], [106, 94, 66, 130], [28, 240, 66, 144], [106, 240, 66, 144]]) {
      ctx.fillStyle = P(88)
      ctx.fillRect(px, py, pw, ph)
      ctx.strokeStyle = P(46)
      ctx.lineWidth = 4
      ctx.strokeRect(px, py, pw, ph)
      ctx.fillStyle = P(128)
      ctx.fillRect(px + 4, py + ph - 6, pw - 8, 3)
    }
    ctx.fillStyle = P(190)
    circle(ctx, 170, 236, 7)
    ctx.fill()
    ctx.fillStyle = P(36)
    ctx.fillRect(76, 230, 48, 8)
  })
  cell('door1', 256, 1024, 256, 512, 200, 400, (ctx, P, em) => {
    // half-glazed shop door
    doorFrame(ctx, P)
    ctx.fillStyle = P(34)
    ctx.fillRect(16, 12, 168, 56)
    ctx.fillStyle = P(98)
    ctx.fillRect(16, 80, 168, 320)
    ctx.fillStyle = g(224)
    ctx.fillRect(32, 96, 136, 160)
    ctx.fillStyle = g(176)
    ctx.fillRect(32, 96, 136, 44)
    ctx.strokeStyle = g(130)
    ctx.lineWidth = 2
    for (let y = 104; y < 140; y += 9) {
      ctx.beginPath()
      ctx.moveTo(32, y)
      ctx.lineTo(168, y)
      ctx.stroke()
    }
    ctx.save()
    ctx.translate(100, 196)
    ctx.rotate(-0.07)
    ctx.fillStyle = g(250)
    ctx.fillRect(-42, -18, 84, 36)
    ctx.fillStyle = g(24)
    ctx.font = `26px ${FONT}`
    ctx.fillText('OPEN', 0, 2, 74)
    ctx.restore()
    veil(ctx, em, 32, 96, 136, 160)
    ctx.strokeStyle = P(40)
    ctx.lineWidth = 4
    ctx.strokeRect(32, 96, 136, 160)
    ctx.fillStyle = P(82)
    ctx.fillRect(32, 276, 136, 108)
    ctx.strokeRect(32, 276, 136, 108)
    ctx.fillStyle = P(190)
    ctx.fillRect(160, 250, 10, 34)
  })
  cell('door2', 512, 1024, 256, 512, 200, 400, (ctx, P, em) => {
    // speakeasy: riveted steel and a peephole
    ctx.fillStyle = P(46)
    ctx.fillRect(0, 0, 200, 400)
    ctx.fillStyle = P(92)
    ctx.fillRect(12, 12, 176, 388)
    ctx.strokeStyle = P(58)
    ctx.lineWidth = 4
    ctx.strokeRect(24, 24, 152, 180)
    ctx.strokeRect(24, 216, 152, 172)
    ctx.fillStyle = P(140)
    for (let y = 22; y < 396; y += 26) {
      circle(ctx, 20, y, 3.5)
      ctx.fill()
      circle(ctx, 180, y, 3.5)
      ctx.fill()
    }
    for (let x = 46; x < 170; x += 26) {
      circle(ctx, x, 20, 3.5)
      ctx.fill()
      circle(ctx, x, 210, 3.5)
      ctx.fill()
    }
    ctx.fillStyle = P(20)
    ctx.fillRect(52, 108, 96, 30)
    ctx.fillStyle = g(26)
    ctx.fillRect(56, 112, 88, 22)
    for (const ex of [82, 118]) {
      ctx.fillStyle = g(250)
      ell(ctx, ex, 123, 11, 8)
      ctx.fill()
      ctx.fillStyle = g(10)
      circle(ctx, ex + 3, 124, 4)
      ctx.fill()
    }
    veil(ctx, em, 56, 112, 88, 22, 0.5)
    ctx.fillStyle = P(170)
    ctx.fillRect(156, 226, 10, 46)
    ctx.strokeStyle = 'rgba(0,0,0,.22)'
    ctx.lineWidth = 5
    const r = rng(79)
    if (!em)
      for (let k = 0; k < 6; k++) {
        const x = 20 + r() * 160
        ctx.beginPath()
        ctx.moveTo(x, r() * 200)
        ctx.lineTo(x, 200 + r() * 200)
        ctx.stroke()
      }
  })
  cell('door3', 768, 1024, 256, 512, 200, 400, (ctx, P, em) => {
    // hotel double doors
    doorFrame(ctx, P)
    ctx.fillStyle = g(206)
    ctx.beginPath()
    ctx.moveTo(16, 70)
    ctx.quadraticCurveTo(100, -30, 184, 70)
    ctx.closePath()
    ctx.fill()
    veil(ctx, em, 16, 12, 168, 58, 0.8)
    ctx.strokeStyle = P(40)
    ctx.lineWidth = 4
    for (const a of [-0.7, 0, 0.7]) {
      ctx.beginPath()
      ctx.moveTo(100, 70)
      ctx.lineTo(100 + Math.sin(a) * 80, 70 - Math.cos(a) * 60)
      ctx.stroke()
    }
    for (const x0 of [16, 102]) {
      ctx.fillStyle = P(100)
      ctx.fillRect(x0, 80, 82, 320)
      ctx.fillStyle = g(218)
      ctx.fillRect(x0 + 12, 96, 58, 190)
      ctx.strokeStyle = g(120)
      ctx.lineWidth = 2
      for (let k = -4; k < 5; k++) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x0 + 12, 96, 58, 190)
        ctx.clip()
        ctx.beginPath()
        ctx.moveTo(x0 + 12 + k * 30, 96)
        ctx.lineTo(x0 + 12 + k * 30 + 120, 286)
        ctx.moveTo(x0 + 70 - k * 30, 96)
        ctx.lineTo(x0 + 70 - k * 30 - 120, 286)
        ctx.stroke()
        ctx.restore()
      }
      veil(ctx, em, x0 + 12, 96, 58, 190)
      ctx.strokeStyle = P(46)
      ctx.lineWidth = 4
      ctx.strokeRect(x0 + 12, 96, 58, 190)
      ctx.fillStyle = P(84)
      ctx.fillRect(x0 + 12, 304, 58, 80)
      ctx.strokeRect(x0 + 12, 304, 58, 80)
    }
    ctx.fillStyle = P(196)
    ctx.fillRect(86, 200, 8, 70)
    ctx.fillRect(106, 200, 8, 70)
  })

  // painted fascia lettering, 1024x128 each
  const NAMES = ['CURDS & WHEY · FINE CHEESES', 'MAD HATTER & SONS', "MOE'S ALL-NITE EATS", 'UNCLE SQUEAK · PAWNBROKER', 'BRIE BROS. COLD STORAGE', 'TAILOR · CLEANERS · DYERS', 'CIGARS · NEWS · SODA', 'RATZ HOTEL · ROOMS 50¢']
  NAMES.forEach((t, i) =>
    cell('name' + i, 1024, i < 4 ? 1024 + i * 128 : 1536 + (i - 4) * 128, 1024, 128, 1024, 128, (ctx, P) => {
      ctx.fillStyle = P(52)
      ctx.fillRect(0, 0, 1024, 128)
      ctx.strokeStyle = P(168)
      ctx.lineWidth = 4
      ctx.strokeRect(12, 12, 1000, 104)
      ctx.fillStyle = P(214)
      ctx.font = `72px ${FONT}`
      ctx.fillText(t, 512, 68, 940)
      ctx.fillStyle = 'rgba(0,0,0,.14)'
      const r = rng(90 + i)
      for (let k = 0; k < 40; k++) ctx.fillRect(r() * 1024, r() * 128, 4 + r() * 30, 2 + r() * 4)
    }, true)
  )

  // hanging signs, 256x256
  const board = (ctx: Ctx, P: (v: number) => string, bg: number) => {
    ctx.fillStyle = P(bg)
    ctx.beginPath()
    ctx.roundRect(4, 4, 248, 248, 18)
    ctx.fill()
    ctx.strokeStyle = P(200)
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.roundRect(16, 16, 224, 224, 12)
    ctx.stroke()
  }
  cell('blade0', 0, 1536, 256, 256, 256, 256, (ctx, P) => {
    board(ctx, P, 50)
    ctx.save()
    ctx.translate(128, 130)
    ctx.scale(1.9, 1.9)
    drawHat(ctx, 'fedora', '#cfcdc2')
    ctx.restore()
    ctx.fillStyle = P(214)
    ctx.font = `60px ${FONT}`
    ctx.fillText('HATS', 128, 196, 190)
  }, true)
  cell('blade1', 256, 1536, 256, 256, 256, 256, (ctx, P) => {
    board(ctx, P, 50)
    ctx.lineWidth = 6
    ctx.strokeStyle = P(16)
    ctx.fillStyle = P(214)
    ctx.beginPath()
    ctx.moveTo(50, 150)
    ctx.lineTo(206, 150)
    ctx.lineTo(206, 62)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = P(110)
    for (const [x, y, q] of [[150, 126, 12], [186, 100, 9], [112, 138, 7]]) {
      circle(ctx, x, y, q)
      ctx.fill()
    }
    ctx.fillStyle = P(214)
    ctx.font = `46px ${FONT}`
    ctx.fillText('CHEESE', 128, 198, 196)
  }, true)
  cell('blade2', 512, 1536, 256, 256, 256, 256, (ctx, P, em) => {
    // lit box sign
    ctx.fillStyle = P(40)
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = g(232)
    ctx.beginPath()
    ctx.roundRect(14, 14, 228, 228, 14)
    ctx.fill()
    ctx.fillStyle = g(24)
    ctx.font = `92px ${FONT}`
    ctx.fillText('EATS', 128, 108, 200)
    ctx.beginPath()
    ctx.moveTo(46, 178)
    ctx.lineTo(170, 178)
    ctx.lineTo(170, 158)
    ctx.lineTo(214, 190)
    ctx.lineTo(170, 222)
    ctx.lineTo(170, 202)
    ctx.lineTo(46, 202)
    ctx.closePath()
    ctx.fill()
    veil(ctx, em, 14, 14, 228, 228, 0.7)
  })
  cell('blade3', 768, 1536, 256, 256, 256, 256, (ctx, P, em) => {
    // street clock
    ctx.fillStyle = P(40)
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = g(232)
    circle(ctx, 128, 128, 108)
    ctx.fill()
    ctx.strokeStyle = g(24)
    ctx.lineWidth = 7
    for (let k = 0; k < 12; k++) {
      const a = (k * Math.PI) / 6
      ctx.beginPath()
      ctx.moveTo(128 + Math.sin(a) * 88, 128 - Math.cos(a) * 88)
      ctx.lineTo(128 + Math.sin(a) * 102, 128 - Math.cos(a) * 102)
      ctx.stroke()
    }
    ctx.lineWidth = 10
    ctx.beginPath()
    ctx.moveTo(128, 128)
    ctx.lineTo(104, 76)
    ctx.stroke()
    ctx.lineWidth = 7
    ctx.beginPath()
    ctx.moveTo(128, 128)
    ctx.lineTo(120, 40)
    ctx.stroke()
    ctx.fillStyle = g(24)
    circle(ctx, 128, 128, 9)
    ctx.fill()
    veil(ctx, em, 0, 0, 256, 256, 0.7)
    ctx.strokeStyle = P(30)
    ctx.lineWidth = 12
    circle(ctx, 128, 128, 114)
    ctx.stroke()
  })

  // prop faces, 256x256
  cell('phone', 0, 1792, 256, 256, 128, 256, (ctx, P, em) => {
    ctx.fillStyle = P(48)
    ctx.fillRect(0, 0, 128, 256)
    ctx.fillStyle = g(240)
    ctx.fillRect(8, 8, 112, 34)
    ctx.fillStyle = g(22)
    ctx.font = `28px ${FONT}`
    ctx.fillText('PHONE', 64, 27, 100)
    ctx.fillStyle = g(222)
    ctx.fillRect(10, 50, 108, 150)
    ctx.fillStyle = g(40)
    ctx.fillRect(48, 86, 32, 46)
    circle(ctx, 64, 86, 16)
    ctx.fill()
    ctx.fillStyle = g(222)
    circle(ctx, 64, 88, 8)
    ctx.fill()
    veil(ctx, em, 8, 8, 112, 192, 0.8)
    ctx.fillStyle = P(48)
    ctx.fillRect(62, 50, 4, 150)
    for (const y of [98, 148]) ctx.fillRect(10, y, 108, 4)
    ctx.fillStyle = P(96)
    ctx.fillRect(10, 208, 108, 40)
    ctx.strokeStyle = P(40)
    ctx.lineWidth = 3
    ctx.strokeRect(16, 214, 96, 28)
  })
  cell('news', 256, 1792, 256, 256, 256, 256, (ctx, _P, em) => {
    // back wall of the news stand
    const r = rng(83)
    ctx.fillStyle = g(150)
    ctx.fillRect(0, 0, 256, 256)
    for (let row = 0; row < 4; row++)
      for (let col = 0; col < 6; col++) {
        const x = 6 + col * 41.5, y = 8 + row * 62
        ctx.fillStyle = g(150 + r() * 96)
        ctx.fillRect(x, y, 36, 50)
        ctx.fillStyle = g(30)
        ctx.fillRect(x + 3, y + 4, 30, 8)
        ctx.fillStyle = g(70 + r() * 70)
        ctx.fillRect(x + 5, y + 17, 26, 20)
        ctx.fillStyle = g(60)
        ctx.fillRect(x + 4, y + 41, 28, 3)
      }
    for (let row = 1; row < 4; row++) {
      ctx.fillStyle = g(50)
      ctx.fillRect(0, row * 62 + 2, 256, 5)
    }
    veil(ctx, em, 0, 0, 256, 256, 0.8)
  })
  cell('mail', 512, 1792, 256, 256, 256, 256, (ctx, P) => {
    ctx.fillStyle = P(86)
    ctx.fillRect(0, 0, 256, 256)
    ctx.strokeStyle = P(150)
    ctx.lineWidth = 5
    ctx.strokeRect(14, 14, 228, 228)
    ctx.fillStyle = P(20)
    ctx.fillRect(48, 56, 160, 20)
    ctx.fillStyle = P(206)
    ctx.font = `66px ${FONT}`
    ctx.fillText('MAIL', 128, 136, 196)
    ctx.font = `26px ${FONT}`
    ctx.fillText('NO CHEESE', 128, 198, 196)
  }, true)
  cell('paper', 768, 1792, 256, 256, 256, 256, (ctx, P) => {
    // a bundle of newspapers
    ctx.fillStyle = P(126)
    ctx.fillRect(0, 0, 256, 256)
    ctx.fillStyle = P(30)
    ctx.font = `44px ${FONT}`
    ctx.fillText('EXTRA!', 128, 44, 220)
    ctx.fillRect(16, 76, 224, 6)
    ctx.fillStyle = P(84)
    ctx.fillRect(16, 94, 100, 80)
    ctx.fillStyle = P(70)
    for (let k = 0; k < 9; k++) {
      ctx.fillRect(128, 96 + k * 16, 112 - (k % 3) * 12, 5)
      if (k < 4) ctx.fillRect(16, 186 + k * 16, 224, 5)
    }
    ctx.strokeStyle = P(70)
    ctx.lineWidth = 4
    ctx.beginPath()
    ctx.moveTo(0, 128)
    ctx.lineTo(256, 128)
    ctx.stroke()
  }, true)
  atlas({ map, glow, k: 2 }, list)
  return { map, glow, uv }
}

/** Laundry on the lines plus awning canvas, alpha-cut. 4x2 cells of 128x256. */
export function clothAtlas() {
  const c = cv(512, 512), ctx = ctx2d(c), uv: Record<string, UvRect> = {}
  const names = ['shirt', 'longjohns', 'sheet', 'socks', 'trousers', 'towel', 'bloomers', 'awning']
  names.forEach((n, i) => {
    uv[n] = uvRect((i % 4) * 128, Math.floor(i / 4) * 256, 128, 256, 512, 512, 1)
  })
  uv.awning = uvRect(384, 256, 128, 180, 512, 512, 1)
  uv.valance = uvRect(384, 448, 128, 64, 512, 512, 1)
  const at = (i: number, fn: () => void) => {
    ctx.save()
    ctx.translate((i % 4) * 128, Math.floor(i / 4) * 256)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.strokeStyle = INK
    ctx.lineWidth = 4
    fn()
    ctx.restore()
  }
  const peg = (x: number) => {
    ctx.fillStyle = g(120)
    ctx.fillRect(x - 3, 0, 6, 14)
  }
  at(0, () => {
    // shirt
    ctx.fillStyle = g(214)
    ctx.beginPath()
    ctx.moveTo(34, 10)
    ctx.lineTo(54, 10)
    ctx.lineTo(64, 22)
    ctx.lineTo(74, 10)
    ctx.lineTo(94, 10)
    ctx.lineTo(124, 70)
    ctx.lineTo(104, 84)
    ctx.lineTo(96, 66)
    ctx.lineTo(98, 190)
    ctx.lineTo(30, 190)
    ctx.lineTo(32, 66)
    ctx.lineTo(24, 84)
    ctx.lineTo(4, 70)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(64, 22)
    ctx.lineTo(64, 188)
    ctx.stroke()
    ctx.fillStyle = INK
    for (const y of [50, 84, 118, 152]) {
      circle(ctx, 70, y, 2.5)
      ctx.fill()
    }
    peg(40)
    peg(88)
  })
  at(1, () => {
    // union suit
    ctx.fillStyle = g(190)
    ctx.beginPath()
    ctx.moveTo(42, 10)
    ctx.lineTo(86, 10)
    ctx.lineTo(122, 84)
    ctx.lineTo(106, 96)
    ctx.lineTo(88, 62)
    ctx.lineTo(90, 244)
    ctx.lineTo(68, 244)
    ctx.lineTo(64, 140)
    ctx.lineTo(60, 244)
    ctx.lineTo(38, 244)
    ctx.lineTo(40, 62)
    ctx.lineTo(22, 96)
    ctx.lineTo(6, 84)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(64, 12)
    ctx.lineTo(64, 136)
    ctx.stroke()
    ctx.strokeRect(50, 112, 28, 22)
    ctx.fillStyle = INK
    for (const y of [34, 58, 82]) {
      circle(ctx, 70, y, 2.5)
      ctx.fill()
    }
    peg(48)
    peg(80)
  })
  at(2, () => {
    // bed sheet with a patch
    ctx.fillStyle = g(224)
    ctx.beginPath()
    ctx.moveTo(6, 8)
    ctx.lineTo(122, 8)
    ctx.lineTo(120, 226)
    ctx.quadraticCurveTo(92, 240, 64, 228)
    ctx.quadraticCurveTo(34, 216, 8, 232)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.lineWidth = 2
    ctx.strokeStyle = 'rgba(0,0,0,.3)'
    for (const x of [34, 70, 100]) {
      ctx.beginPath()
      ctx.moveTo(x, 12)
      ctx.quadraticCurveTo(x + 8, 120, x - 4, 222)
      ctx.stroke()
    }
    ctx.fillStyle = g(170)
    ctx.fillRect(70, 130, 30, 30)
    ctx.strokeStyle = INK
    ctx.setLineDash([4, 4])
    ctx.strokeRect(70, 130, 30, 30)
    ctx.setLineDash([])
    peg(14)
    peg(64)
    peg(114)
  })
  at(3, () => {
    // odd socks
    for (const [x, tone, len] of [[18, 206, 120], [72, 150, 96]]) {
      ctx.fillStyle = g(tone)
      ctx.beginPath()
      ctx.moveTo(x, 10)
      ctx.lineTo(x + 26, 10)
      ctx.lineTo(x + 26, len)
      ctx.quadraticCurveTo(x + 46, len + 6, x + 44, len + 26)
      ctx.quadraticCurveTo(x + 20, len + 36, x, len + 22)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.fillStyle = g(tone - 80)
      ctx.fillRect(x + 2, 24, 22, 8)
      ctx.fillRect(x + 2, 40, 22, 8)
      peg(x + 13)
    }
  })
  at(4, () => {
    // trousers
    ctx.fillStyle = g(120)
    ctx.beginPath()
    ctx.moveTo(30, 10)
    ctx.lineTo(98, 10)
    ctx.lineTo(104, 240)
    ctx.lineTo(74, 240)
    ctx.lineTo(64, 70)
    ctx.lineTo(54, 240)
    ctx.lineTo(24, 240)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = g(150)
    ctx.fillRect(31, 12, 66, 14)
    ctx.lineWidth = 2.5
    ctx.strokeRect(31, 12, 66, 14)
    ctx.fillStyle = g(190)
    ctx.fillRect(76, 60, 20, 22)
    ctx.strokeRect(76, 60, 20, 22)
    peg(38)
    peg(90)
  })
  at(5, () => {
    // striped towel
    ctx.fillStyle = g(214)
    ctx.fillRect(24, 8, 80, 160)
    ctx.strokeRect(24, 8, 80, 160)
    ctx.fillStyle = g(120)
    for (const y of [30, 46, 128, 144]) ctx.fillRect(26, y, 76, 8)
    ctx.lineWidth = 2
    for (let x = 28; x < 104; x += 7) {
      ctx.beginPath()
      ctx.moveTo(x, 168)
      ctx.lineTo(x, 180)
      ctx.stroke()
    }
    peg(32)
    peg(96)
  })
  at(6, () => {
    // polka-dot bloomers
    ctx.fillStyle = g(226)
    ctx.beginPath()
    ctx.moveTo(22, 10)
    ctx.lineTo(106, 10)
    ctx.quadraticCurveTo(128, 70, 108, 116)
    ctx.lineTo(72, 116)
    ctx.lineTo(64, 70)
    ctx.lineTo(56, 116)
    ctx.lineTo(20, 116)
    ctx.quadraticCurveTo(0, 70, 22, 10)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = g(110)
    for (const [x, y] of [[36, 36], [62, 30], [90, 40], [30, 70], [50, 92], [96, 76], [80, 98], [74, 54]]) {
      circle(ctx, x, y, 5)
      ctx.fill()
    }
    peg(30)
    peg(98)
  })
  at(7, () => {
    // awning stripes with a scalloped valance underneath
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = g(k % 2 ? 108 : 208)
      ctx.fillRect(k * 16, 0, 16, 184)
    }
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = g(k % 2 ? 108 : 208)
      ctx.fillRect(k * 16, 192, 16, 40)
      ctx.beginPath()
      ctx.arc(k * 16 + 8, 232, 8, 0, Math.PI)
      ctx.fill()
    }
  })
  atlas({ map: c, k: 4 }, [
    ...names.slice(0, 7).map((n, i): AtlasCell => ['wash_' + n, (i % 4) * 128, Math.floor(i / 4) * 256, 128, 256, { cut: true }]),
    ['awning', 384, 256, 128, 184],
    ['valance', 384, 448, 128, 64],
  ])
  return { map: c, uv }
}

/** Things lying on the ground, alpha-cut. 4x2 cells of 256. */
export function decalAtlas() {
  const c = cv(1024, 512), ctx = ctx2d(c), uv: Record<string, UvRect> = {}, r = rng(97)
  const names = ['news0', 'news1', 'flyer', 'scraps', 'manhole', 'grate', 'hopscotch', 'tar']
  names.forEach((n, i) => {
    uv[n] = uvRect((i % 4) * 256, Math.floor(i / 4) * 256, 256, 256, 1024, 512, 2)
  })
  const at = (i: number, fn: () => void) => {
    ctx.save()
    ctx.translate((i % 4) * 256 + 128, Math.floor(i / 4) * 256 + 128)
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    fn()
    ctx.restore()
  }
  const lines = (x: number, y: number, w: number, n: number, gap: number) => {
    for (let k = 0; k < n; k++) ctx.fillRect(x, y + k * gap, w - (k % 3 === 2 ? w * 0.3 : 0), 3)
  }
  at(0, () => {
    // an open spread
    ctx.rotate(-0.12)
    ctx.fillStyle = g(196)
    ctx.fillRect(-112, -78, 224, 156)
    ctx.strokeStyle = g(60)
    ctx.lineWidth = 3
    ctx.strokeRect(-112, -78, 224, 156)
    ctx.beginPath()
    ctx.moveTo(0, -78)
    ctx.lineTo(0, 78)
    ctx.stroke()
    ctx.fillStyle = g(40)
    ctx.font = `22px ${FONT}`
    ctx.fillText('DAILY SQUEAK', -56, -60, 96)
    ctx.fillStyle = g(110)
    ctx.fillRect(-104, -44, 50, 44)
    ctx.fillStyle = g(100)
    lines(-48, -42, 40, 5, 9)
    lines(-104, 10, 96, 7, 9)
    lines(10, -66, 94, 15, 9)
  })
  at(1, () => {
    // folded, headline up
    ctx.rotate(0.3)
    ctx.fillStyle = g(204)
    ctx.fillRect(-70, -90, 140, 180)
    ctx.strokeStyle = g(60)
    ctx.lineWidth = 3
    ctx.strokeRect(-70, -90, 140, 180)
    ctx.fillStyle = g(30)
    ctx.font = `40px ${FONT}`
    ctx.fillText('EXTRA!', 0, -62, 124)
    ctx.fillRect(-60, -38, 120, 4)
    ctx.fillStyle = g(120)
    ctx.fillRect(-60, -26, 120, 54)
    ctx.fillStyle = g(100)
    lines(-60, 38, 120, 5, 9)
  })
  at(2, () => {
    // torn handbill
    ctx.rotate(-0.5)
    ctx.fillStyle = g(176)
    ctx.beginPath()
    ctx.moveTo(-60, -84)
    ctx.lineTo(56, -80)
    ctx.lineTo(62, 30)
    ctx.lineTo(30, 52)
    ctx.lineTo(8, 40)
    ctx.lineTo(-22, 70)
    ctx.lineTo(-58, 58)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = g(40)
    ctx.font = `30px ${FONT}`
    ctx.fillText('WANTED', 0, -56, 104)
    ctx.fillStyle = g(96)
    ctx.fillRect(-36, -34, 72, 50)
  })
  at(3, () => {
    // scraps, butts and a crushed can
    for (let k = 0; k < 9; k++) {
      ctx.save()
      ctx.translate((r() - 0.5) * 170, (r() - 0.5) * 170)
      ctx.rotate(r() * 6)
      ctx.fillStyle = g(150 + r() * 60)
      ctx.fillRect(-8 - r() * 12, -5 - r() * 8, 16 + r() * 24, 10 + r() * 16)
      ctx.restore()
    }
    ctx.fillStyle = g(120)
    ctx.strokeStyle = g(30)
    ctx.lineWidth = 3
    ctx.save()
    ctx.translate(40, 30)
    ctx.rotate(0.6)
    ctx.fillRect(-18, -11, 36, 22)
    ctx.strokeRect(-18, -11, 36, 22)
    ctx.restore()
  })
  at(4, () => {
    // manhole cover
    ctx.fillStyle = g(54)
    circle(ctx, 0, 0, 124)
    ctx.fill()
    ctx.fillStyle = g(112)
    circle(ctx, 0, 0, 112)
    ctx.fill()
    ctx.strokeStyle = g(60)
    ctx.lineWidth = 7
    for (const q of [96, 62]) {
      circle(ctx, 0, 0, q)
      ctx.stroke()
    }
    ctx.lineWidth = 6
    for (let k = 0; k < 16; k++) {
      const a = (k * Math.PI) / 8
      ctx.beginPath()
      ctx.moveTo(Math.cos(a) * 66, Math.sin(a) * 66)
      ctx.lineTo(Math.cos(a) * 92, Math.sin(a) * 92)
      ctx.stroke()
    }
    for (let x = -42; x <= 42; x += 21)
      for (let y = -42; y <= 42; y += 21)
        if (Math.hypot(x, y) < 52) {
          ctx.fillStyle = g(72)
          ctx.fillRect(x - 7, y - 7, 14, 14)
        }
    ctx.fillStyle = g(26)
    for (const a of [0.6, 3.74]) {
      ell(ctx, Math.cos(a) * 78, Math.sin(a) * 78, 8, 5, a)
      ctx.fill()
    }
  })
  at(5, () => {
    // gutter grate
    ctx.fillStyle = g(60)
    ctx.fillRect(-120, -70, 240, 140)
    ctx.fillStyle = g(118)
    ctx.fillRect(-110, -60, 220, 120)
    ctx.fillStyle = g(14)
    for (let k = 0; k < 9; k++) ctx.fillRect(-100 + k * 23, -50, 13, 100)
    ctx.fillStyle = g(118)
    ctx.fillRect(-110, -5, 220, 10)
  })
  at(6, () => {
    // chalk hopscotch
    ctx.strokeStyle = g(214)
    ctx.lineWidth = 6
    ctx.fillStyle = g(214)
    ctx.font = `32px ${FONT}`
    const sq = [[-25, 70, 1], [-25, 20, 2], [-50, -30, 3], [0, -30, 4], [-25, -80, 5]]
    for (const [x, y, n] of sq) {
      ctx.setLineDash([14, 3, 6, 2])
      ctx.strokeRect(x, y, 50, 50)
      ctx.setLineDash([])
      ctx.fillText(String(n), x + 25, y + 27)
    }
    ctx.beginPath()
    ctx.arc(0, -80, 25, Math.PI, 0)
    ctx.stroke()
  })
  at(7, () => {
    // tar patch
    ctx.fillStyle = g(34)
    for (let k = 0; k < 9; k++) {
      ell(ctx, (r() - 0.5) * 90, (r() - 0.5) * 70, 30 + r() * 30, 20 + r() * 24, r() * 3)
      ctx.fill()
    }
  })
  atlas({ map: c, k: 2 }, names.map((n, i): AtlasCell => ['decal_' + n, (i % 4) * 256, Math.floor(i / 4) * 256, 256, 256, { cut: true }]))
  return { map: c, uv }
}
