// Picture overrides for the drawn art (built from the
// picture-override module).
//
// A picture in the asset folder takes the place of the code-drawn canvas of
// the same name. manifest.json there is { "<name>": { "file", "v", ... } }; an
// entry may add "level" (false or a mean tone 0-255), "relief" (tiling sets:
// the normal map is rebuilt from the picture) and "max" (longest side kept).
// Pictures are reduced to luminance on the way in, so the set stays black and
// white.
//
// Every picture is loaded first (loadArt is awaited), then useArt selects that
// folder's pictures, and then the canvases are drawn. Each canvas is repainted
// synchronously while it is created, before any texture exists.
import { ctx2d, cv, type Canvas, type Ctx } from './canvas'
import { blurField, canvasField, normalCanvas } from './fields'

export type ArtManifestEntry = {
  file?: string
  v?: number
  level?: boolean | number
  relief?: boolean
  max?: number
}

type PicOptions = {
  w?: number
  h?: number
  max?: number
  level?: boolean | number
  /** Measure the mean tone over this top fraction of the picture only. */
  band?: number
  /** 'cut': the file must carry alpha; 'luma': an opaque file takes its alpha from its brightness. */
  key?: 'cut' | 'luma'
}

export type ArtOptions = PicOptions & {
  /** Finishes the repainted canvas (m is the manifest entry). */
  after?: (x: Ctx, w: number, h: number, m: ArtManifestEntry) => void
}

type Painter = (img: ImageBitmap, m: ArtManifestEntry) => void
type PicSet = Map<string, { img: ImageBitmap; m: ArtManifestEntry }>

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return (await res.json()) as T
  } catch {
    return null
  }
}

/** Decodes a picture with straight alpha, so drawImage gets the same pixels as an <img>. */
async function fetchBitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return createImageBitmap(await res.blob(), { premultiplyAlpha: 'none' })
}

const SETS = new Map<string, Promise<PicSet>>()
/** The pictures that art() and atlas() use now (set by useArt). */
let PICS: PicSet = new Map()

/** The folder URL with one trailing slash. */
const folder = (base: string) => (base.endsWith('/') ? base : base + '/')

/**
 * Loads every picture that the manifest in `base` lists. Memoized per folder.
 * A missing manifest or picture is not an error: the drawn canvas stays.
 */
export function loadArt(base: string): Promise<PicSet> {
  const dir = folder(base)
  let job = SETS.get(dir)
  if (!job) {
    job = (async () => {
      const man = await fetchJson<Record<string, ArtManifestEntry | null>>(`${dir}manifest.json`)
      const set: PicSet = new Map()
      const got = await Promise.all(
        Object.entries(man || {}).map(async ([name, m]) => {
          if (!m || !m.file) return null
          try {
            const img = await fetchBitmap(dir + m.file + (m.v != null ? '?v=' + m.v : ''))
            return [name, { img, m }] as const
          } catch {
            return null
          }
        })
      )
      for (const entry of got) if (entry) set.set(entry[0], entry[1])
      return set
    })()
    SETS.set(dir, job)
  }
  return job
}

/** Selects the pictures of one folder for the drawing that follows (call it after loadArt resolves). */
export function useArt(set: PicSet) {
  PICS = set
}

// A picture that cannot be used (no alpha where the cell is cut out) leaves the drawing as it was.
const paint = (name: string, fn: Painter) => {
  try {
    const p = PICS.get(name)
    if (p) fn(p.img, p.m)
  } catch (error) {
    console.warn('alley arena art: ' + name + ' kept as drawn.', error)
  }
}

const onPic = (name: string, fn: Painter) => {
  if (PICS.has(name)) paint(name, fn)
}

const mean = (c: Canvas) => {
  const d = ctx2d(c).getImageData(0, 0, c.width, c.height).data
  let s = 0
  let n = 0
  for (let i = 0; i < d.length; i += 4) {
    s += d[i] * d[i + 3]
    n += d[i + 3]
  }
  return n ? s / n : 0
}

/**
 * A loaded picture as a greyscale canvas. o: w, h (exact size) or max (longest
 * side), level (mean tone to bring it to; band: measured over that top
 * fraction only), key ('cut': the file must carry alpha; 'luma': an opaque file
 * takes its alpha from its brightness, paint on a wall).
 */
function pic(img: ImageBitmap, o: PicOptions = {}) {
  const k = Math.min(1, (o.max || 2048) / Math.max(img.width, img.height))
  const w = o.w || Math.max(1, Math.round(img.width * k))
  const h = o.h || Math.max(1, Math.round(img.height * k))
  const c = cv(w, h), x = ctx2d(c)
  x.drawImage(img, 0, 0, w, h)
  const im = x.getImageData(0, 0, w, h), d = im.data
  let sum = 0
  let wt = 0
  let clear = false
  const end = o.band ? Math.max(1, Math.round(h * o.band)) * w * 4 : d.length
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11, a = d[i + 3]
    d[i] = l
    if (i < end) {
      sum += l * a
      wt += a
    }
    if (a < 250) clear = true
  }
  if (o.key === 'cut' && !clear) throw new Error('the file needs an alpha channel')
  const gain =
    typeof o.level === 'number' && o.level > 0 && sum > 0 ? Math.max(0.25, Math.min(4, (o.level * wt) / sum)) : 1
  const luma = o.key === 'luma' && !clear
  for (let i = 0; i < d.length; i += 4) {
    const l = d[i] * gain
    d[i] = d[i + 1] = d[i + 2] = luma ? 240 : l
    if (luma) d[i + 3] = l
  }
  x.putImageData(im, 0, 0)
  return c
}

/**
 * Tags a canvas as replaceable by the picture `name` and returns it. level:
 * true holds the drawn canvas' own mean tone, so the lighting knobs in
 * world.ts stay true; after(ctx, w, h, m) finishes the repainted canvas.
 */
export function art(c: Canvas, name: string, o: ArtOptions = {}): Canvas {
  onPic(name, (img, m) => {
    const lv = m.level ?? o.level
    const p = pic(img, { ...o, max: Math.min(4096, m.max || o.max || 2048), level: lv === true ? mean(c) : lv })
    const x = ctx2d(c)
    // Resizing also clears the canvas and resets the context.
    c.width = p.width
    c.height = p.height
    x.drawImage(p, 0, 0)
    if (o.after) o.after(x, p.width, p.height, m)
  })
  return c
}

export type TiledSet = { map: Canvas; normal: Canvas; rough?: Canvas }

/**
 * A tiling set whose albedo can be a picture. The drawn normal map (and
 * roughness) stays unless the manifest entry asks for "relief": then the
 * picture's own tones become the height, ink joints low and lit faces high.
 */
export function tiled<T extends TiledSet>(name: string | undefined, set: T, bump: number, max = 1024): T {
  if (!name) return set
  art(set.map, name, {
    level: true,
    max,
    after: (_x, w, h, m) => {
      if (!m.relief) return
      // The drawn normals are no finer than 1024 either.
      const n = set.normal, q = Math.min(1, 1024 / Math.max(w, h)), nw = Math.round(w * q), nh = Math.round(h * q), small = cv(nw, nh)
      ctx2d(small).drawImage(set.map, 0, 0, nw, nh)
      const f = canvasField(small)
      let lo = 1
      let hi = 0
      for (let i = 0; i < f.length; i++) {
        if (f[i] < lo) lo = f[i]
        if (f[i] > hi) hi = f[i]
      }
      const s = 1 / Math.max(0.05, hi - lo)
      for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) * s
      // The same slope per metre at any size.
      const nc = normalCanvas(blurField(f, nw, nh, 1), nw, nh, (bump * nw) / n.width)
      n.width = nw
      n.height = nh
      ctx2d(n).drawImage(nc, 0, 0)
    },
  })
  return set
}

export type ArtAtlas = { map: Canvas; glow?: Canvas; k: number; big?: boolean }
/** [x, y, w, h, veil] as fractions of the cell: a lit pane. */
export type GlassPane = [number, number, number, number, number]
export type CellOptions = { glass?: GlassPane[]; cut?: boolean }
export type AtlasCell = [name: string, x: number, y: number, w: number, h: number, o?: CellOptions]

/**
 * One cell of an atlas from the picture `name`; x, y, w, h is the cell in the
 * atlas' drawn pixels. The first picture into an atlas redraws all of it k
 * times larger so the cells can hold the detail; uv rects are fractions, so
 * nothing else moves. o.glass: the lit panes, which go into the glow map as
 * painted and are veiled on the albedo, the way the drawn cells are.
 */
// Longest side an atlas may grow to when its cells take pictures. The authored
// factors (shop atlas 2048 × 2, sign atlas 1024 × 4) reached 4096, and one
// 4096² RGBA texture with mips is ~85 MB of GPU memory plus a 64 MB canvas
// copy: on its own a large share of what made iOS Safari kill the tab. 2048
// keeps every picture cell at or above the size it covers on screen. Raise it
// only for a compressed (KTX2) atlas, never for an RGBA canvas.
const ATLAS_MAX_SIDE = 2048

function cellPic(name: string, A: ArtAtlas, x: number, y: number, w: number, h: number, o: CellOptions = {}) {
  onPic(name, (img, m) => {
    // Fixed by the first picture (A.big): every later cell must use the same factor the atlas was resized by.
    if (!A.big) A.k = Math.max(1, Math.min(A.k || 1, ATLAS_MAX_SIDE / Math.max(A.map.width, A.map.height)))
    const k = A.k, first = !A.big && k > 1
    const p = pic(img, {
      w: Math.round(w * k),
      h: Math.round(h * k),
      key: o.cut ? 'cut' : undefined,
      level: typeof m.level === 'number' ? m.level : undefined,
    })
    if (first) {
      for (const c of [A.map, A.glow]) {
        if (!c) continue
        const old = cv(c.width, c.height)
        ctx2d(old).drawImage(c, 0, 0)
        c.width *= k
        c.height *= k
        ctx2d(c).drawImage(old, 0, 0, c.width, c.height)
      }
    }
    A.big = true
    const c = ctx2d(A.map), e = A.glow ? ctx2d(A.glow) : null
    const s = e && A.glow ? (A.glow.width / A.map.width) * k : 0
    c.clearRect(x * k, y * k, w * k, h * k)
    c.drawImage(p, x * k, y * k)
    if (e) {
      e.fillStyle = '#000'
      e.fillRect(x * s, y * s, w * s, h * s)
    }
    for (const [gx, gy, gw, gh, a] of (e && o.glass) || []) {
      e!.drawImage(p, gx * p.width, gy * p.height, gw * p.width, gh * p.height, (x + gx * w) * s, (y + gy * h) * s, gw * w * s, gh * h * s)
      c.fillStyle = `rgba(6,6,6,${a})`
      c.fillRect((x + gx * w) * k, (y + gy * h) * k, gw * w * k, gh * h * k)
    }
  })
}

/** Registers an atlas' cells. Called last by the atlas, when its own drawing is done. */
export const atlas = (A: ArtAtlas, list: AtlasCell[]) => {
  for (const [name, x, y, w, h, o] of list) cellPic(name, A, x, y, w, h, o)
}
