// The alley arena: a cobbled night street, 44 m square, ringed by tenements.
// WebGL build of the world builder and its static set pieces
//. Everything is static dressing.
//
// Almost all geometry is merged into one mesh per material (see Batch), so the
// whole street (facades, fire escapes, shop fronts, street furniture) costs a
// few dozen draw calls. The kegs are one instanced mesh, the bulb glows are
// one instanced quad mesh.
//
// Not included: the sky dome, moon, moonlight, hero spot and fog (the editor's
// sky gives these), the far skyline blocks, rain, mist, steam, splashes,
// ripples, the film pipeline, and all gameplay.
//
// The street lamps, light cones, light pools on the ground and bulb glows
// follow the editor's time of day: off by day, full at night (see setNight).
import * as THREE from "three";
import * as Art from "./art";
import {
  A,
  BARRELS,
  BARRICADES,
  CRATES,
  DOOR,
  FL,
  G0,
  GATES,
  HOTEL_PLANTERS,
  HYDRANTS,
  KEG,
  LAMPS,
  MANHOLES,
  SACKS,
  TNT_SPOTS,
  TRASH_CANS,
  TYRES,
  WALL_RY,
  wallBase,
  type WallKey
} from "./layout";

/** Look values from the original. Light values are scaled for the editor's renderer (LIGHT_SCALE). */
export const LOOK = {
  lamp: 165, // street-lamp point light (candela)
  lampRange: 14,
  cobble: 0.8, // tint on the setts
  windowGlow: 0.9, // emissive strength of lit upper windows (night)
  shopGlow: 0.7, // emissive strength of shop windows, door glass, lit signs (night)
  litWindows: 0.2, // chance that an upper window is lit
  spill: 0.2, // light pools on the ground in front of doors and shop windows (additive)
  cone: 0.085, // light cones under the lamps and van headlamps (additive)
  halo: 1, // bulb glow sprites
  wetReflect: 0.15, // street reflection on the cobbles
  puddleReflect: 0.45 // street reflection in the puddles
};

/** The original's lights were set for a film curve with a near-black ambient; this brings them to the editor's tone mapping. */
const LIGHT_SCALE = 0.8;
/** Emissive strength by day, as a fraction of the night value. */
const DAY_GLOW = 0.35;
/** Puddle opacity by day: the puddles mirror a night street, so by day they are only damp patches. */
const DAY_PUDDLE = 0.6;

// ───────────────────────── merged geometry ─────────────────────────
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _nm = new THREE.Matrix3();
const _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

type BatchOptions = {
  /** Vertex tint. */
  shade?: number;
  /** [y0, s0, y1, s1]: tint by world height. */
  shadeY?: readonly [number, number, number, number];
  /** Box-projected UVs, meters per repeat. */
  tile?: number;
  /** [u0, v0, u1, v1]: an atlas rect. */
  cell?: Art.UvRect;
  /** [su, sv]: UV scale. */
  uv?: readonly [number, number];
};

/** Collects transformed geometry; becomes a single mesh. */
class Batch {
  p: number[] = [];
  n: number[] = [];
  u: number[] = [];
  c: number[] = [];
  tris = 0;

  add(geo: THREE.BufferGeometry, m: THREE.Matrix4, o: BatchOptions = {}) {
    const P = geo.attributes.position, N = geo.attributes.normal, U = geo.attributes.uv, I = geo.index;
    const count = I ? I.count : P.count, { tile, cell, uv, shadeY } = o, shade = o.shade ?? 1;
    _nm.getNormalMatrix(m);
    for (let k = 0; k < count; k++) {
      const i = I ? I.getX(k) : k;
      _v.fromBufferAttribute(P, i).applyMatrix4(m);
      _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      this.p.push(_v.x, _v.y, _v.z);
      this.n.push(_n.x, _n.y, _n.z);
      let s = U ? U.getX(i) : 0, t = U ? U.getY(i) : 0;
      if (tile) {
        const ax = Math.abs(_n.x), ay = Math.abs(_n.y), az = Math.abs(_n.z);
        if (ay > ax && ay > az) {
          s = _v.x / tile;
          t = _v.z / tile;
        } else if (ax > az) {
          s = _v.z / tile;
          t = _v.y / tile;
        } else {
          s = _v.x / tile;
          t = _v.y / tile;
        }
      } else if (cell) {
        s = cell[0] + s * (cell[2] - cell[0]);
        t = cell[1] + t * (cell[3] - cell[1]);
      } else if (uv) {
        s *= uv[0];
        t *= uv[1];
      }
      this.u.push(s, t);
      let c = shade;
      if (shadeY) {
        const f = Math.max(0, Math.min(1, (_v.y - shadeY[0]) / (shadeY[2] - shadeY[0])));
        c *= shadeY[1] + (shadeY[3] - shadeY[1]) * f;
      }
      this.c.push(c, c, c);
    }
    return this;
  }

  build(mat: THREE.Material, cast = true, receive = true) {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g, mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    this.tris = this.p.length / 9;
    this.p = this.n = this.u = this.c = [];
    return mesh;
  }
}

type O = BatchOptions | undefined;
type N = number | undefined;

/** Unit shapes shared by every placement during one build (disposed after the build). */
function shapeKit() {
  const BOX = new THREE.BoxGeometry(1, 1, 1), PLANE = new THREE.PlaneGeometry(1, 1);
  const cache = new Map<string, THREE.BufferGeometry>();
  const cached = (k: string, f: () => THREE.BufferGeometry) => {
    let g = cache.get(k);
    if (!g) cache.set(k, (g = f()));
    return g;
  };
  return {
    BOX,
    PLANE,
    cylGeo: (rt: number, rb: number, seg = 10) => cached(`c${rt}|${rb}|${seg}`, () => new THREE.CylinderGeometry(rt, rb, 1, seg)),
    sphGeo: (ws = 10, hs = 7) => cached(`s${ws}|${hs}`, () => new THREE.SphereGeometry(0.5, ws, hs)),
    coneGeo: (seg = 16) => cached(`k${seg}`, () => new THREE.ConeGeometry(1, 1, seg)),
    torusGeo: (r: number, t: number) => cached(`t${r}|${t}`, () => new THREE.TorusGeometry(r, t, 7, 16)),
    dispose() {
      BOX.dispose();
      PLANE.dispose();
      for (const g of cache.values()) g.dispose();
      cache.clear();
    }
  };
}
type Shapes = ReturnType<typeof shapeKit>;

/** A placer writes primitives into batches in some local frame (identity, a wall, a prop). */
function placer(S: Shapes, base: THREE.Matrix4 | null) {
  const m = new THREE.Matrix4();
  const at = (x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    return base ? m.premultiply(base) : m;
  };
  const self = {
    at,
    box: (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, o?: O, rx?: N, ry?: N, rz?: N) =>
      b.add(S.BOX, at(x, y, z, sx, sy, sz, rx, ry, rz), o),
    /** A box from its extents. */
    slab(b: Batch, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, o?: O) {
      const sx = Math.abs(x1 - x0), sy = Math.abs(y1 - y0), sz = Math.abs(z1 - z0);
      if (sx < 1e-3 || sy < 1e-3 || sz < 1e-3) return;
      b.add(S.BOX, at((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, sx, sy, sz), o);
    },
    cyl: (b: Batch, x: number, y: number, z: number, rt: number, rb: number, h: number, o?: O, seg?: N, rx?: N, ry?: N, rz?: N) =>
      b.add(S.cylGeo(rt, rb, seg), at(x, y, z, 1, h, 1, rx, ry, rz), o),
    sph: (b: Batch, x: number, y: number, z: number, sx: number, sy: number, sz: number, o?: O, rx?: N, ry?: N, rz?: N) =>
      b.add(S.sphGeo(), at(x, y, z, sx, sy, sz, rx, ry, rz), o),
    quad: (b: Batch, x: number, y: number, z: number, w: number, h: number, o?: O, rx?: N, ry?: N, rz?: N) =>
      b.add(S.PLANE, at(x, y, z, w, h, 1, rx, ry, rz), o),
    geo: (b: Batch, g: THREE.BufferGeometry, x: number, y: number, z: number, o?: O, sx?: N, sy?: N, sz?: N, rx?: N, ry?: N, rz?: N) =>
      b.add(g, at(x, y, z, sx, sy, sz, rx, ry, rz), o),
    sub: (x: number, y: number, z: number, ry = 0) => placer(S, new THREE.Matrix4().copy(at(x, y, z, 1, 1, 1, 0, ry, 0))),
    world: (x: number, y: number, z: number) => {
      const v = new THREE.Vector3(x, y, z);
      return base ? v.applyMatrix4(base) : v;
    }
  };
  return self;
}
type Placer = ReturnType<typeof placer>;

/** A building's ground storey, bay by bay: [width, type, { name, aw }]. */
type Bay = readonly [number, string, { name?: number; aw?: number }?];
type BuildingExtras = {
  tint?: number;
  h?: number;
  lit?: number;
  blank?: (f: number, i: number) => boolean;
  fe?: readonly [number, number, number];
  pipe?: readonly number[];
  blade?: readonly [number, string];
  tower?: readonly [number, number];
  chim?: readonly (readonly [number, number, number])[];
  hut?: readonly [number, number];
  ped?: number;
};
type BuildingPlan = readonly [u0: number, u1: number, floors: number, style: "a" | "b" | "p", ground: readonly Bay[], extras: BuildingExtras];

/**
 * The four walls, left to right as you face each one: [u0, u1, storeys, style,
 * ground bays, extras]. Styles: 'a' brick with stone dressings, 'b' darker
 * brick with pilasters and hoods, 'p' rendered with shutters.
 */
const PLAN: Record<WallKey, readonly BuildingPlan[]> = {
  N: [
    [-22, -14, 3, "b", [[1.6, "wall"], [4.4, "garage", { name: 4 }], [2.0, "door0"]], { tint: 0.92, tower: [-15.6, -2.5], pipe: [-14.3], chim: [[-20.5, -1.2, 2.6]] }],
    [-14, -7, 3, "a", [[3.6, "shop1", { aw: 1 }], [3.4, "wall"]], { tint: 1.02, h: 0.5, fe: [-13.5, -7.5, -7.75], blade: [-10.4, "blade0"], chim: [[-9, -1.5, 2.2]] }],
    [-7, 7, 4, "p", [[4.2, "wall"], [5.6, "speak"], [4.2, "wall"]], { tint: 0.95, blank: (f, i) => f === 0 && i >= 1 && i <= 3, hut: [4, -2.2], chim: [[-5, -1.3, 2.4]] }],
    [7, 15, 5, "a", [[1.9, "door0"], [3.8, "shop0", { name: 0 }], [2.3, "shutter"]], { tint: 0.9, fe: [9.8, 14.8, 14.3], blade: [8.9, "blade1"], pipe: [7.3], chim: [[9, -1.4, 2.4], [13.5, -3, 2]] }],
    [15, 22, 3, "b", [[3.6, "shopDark0", { name: 6 }], [3.4, "wall"]], { tint: 1.0, tower: [18.5, -2.6], ped: 1 }]
  ],
  E: [
    [-22, -13, 4, "a", [[1.9, "door1"], [4.0, "shop2", { aw: 1 }], [3.1, "wall"]], { tint: 1.0, blade: [-16.1, "blade2"], pipe: [-13.3], chim: [[-18, -1.4, 2.4]] }],
    [-13, -3, 3, "p", [[3.6, "shopDark1", { name: 5 }], [1.8, "door0"], [4.6, "wall"]], { tint: 0.9, fe: [-12.6, -6.6, -7.1], hut: [-8, -2.4] }],
    [-3, 10, 5, "b", [[4.4, "garage"], [1.8, "door0"], [3.6, "shutter"], [3.2, "wall"]], { tint: 0.95, blank: (f, i) => f < 2 && i >= 1, chim: [[-1.5, -1.3, 2.5], [8.5, -1.5, 2.2]], pipe: [9.7] }],
    [10, 22, 4, "a", [[3.8, "shop3", { name: 3 }], [1.8, "door1"], [3.0, "wall"], [3.4, "shutter"]], { tint: 1.04, tower: [16, -2.6], blade: [13.8, "blade3"], chim: [[20, -1.3, 2.3]] }]
  ],
  S: [
    [-22, -12, 3, "b", [[3.8, "shutter"], [1.9, "door0"], [4.3, "wall"]], { tint: 1.0, chim: [[-19, -1.4, 2.4]], ped: 1 }],
    [-12, -4, 5, "a", [[3.4, "wall"], [4.6, "shop0", { aw: 1 }]], { tint: 0.93, fe: [-11.6, -6.6, -11.1], pipe: [-4.3], blade: [-8.6, "blade1"] }],
    [-4, 6, 4, "p", [[1.9, "door1"], [3.9, "shopDark0"], [4.2, "shopDark1"]], { tint: 1.0, hut: [1, -2.3], chim: [[4.5, -1.3, 2.4]] }],
    [6, 14, 3, "a", [[6.2, "wall"], [1.8, "door0"]], { tint: 1.05, h: 0.4, chim: [[8, -1.4, 2.6], [12, -1.4, 2.2]] }],
    [14, 22, 5, "b", [[4.4, "garage"], [3.6, "wall"]], { tint: 0.9, tower: [18, -2.6], pipe: [14.3] }]
  ],
  W: [
    [-22, -14, 4, "a", [[3.2, "shutter"], [1.8, "door0"], [3.0, "wall"]], { tint: 0.95, fe: [-21.6, -16.6, -21.1], chim: [[-16, -1.4, 2.4]] }],
    [-14, -4, 3, "b", [[6.4, "wall"], [3.6, "shopDark1", { name: 1 }]], { tint: 1.03, tower: [-9, -2.6], pipe: [-4.3], h: 0.3 }],
    [-4, 12, 5, "p", [[4.6, "shop2", { aw: 1 }], [3.4, "wall"], [4, "door3"], [4, "wall"]], { tint: 0.97, blank: (f, i) => f === 0 && i >= 2 && i <= 4, chim: [[-2, -1.3, 2.5], [10, -1.3, 2.5]] }],
    [12, 22, 4, "a", [[4.4, "garage"], [2.0, "door0"], [3.6, "wall"]], { tint: 1.0, pipe: [12.3], chim: [[20, -1.4, 2.3]] }]
  ]
};

type MaterialKey =
  | "brickA" | "brickB" | "stone" | "metal" | "wood" | "pave" | "win" | "shop" | "crate" | "barrel"
  | "cheese" | "cloth" | "decal" | "bulb" | "cone" | "spill" | "puddle" | "leafNarrow" | "leafWide";

/** A light whose strength follows the night (base intensity at full night). */
type NightLight = { light: THREE.PointLight | THREE.SpotLight; base: number; target?: THREE.Vector3 };

export type AlleyKit = {
  /** The whole set; clone it for each placement (geometry and materials are shared). */
  template: THREE.Group;
  /** Sets the time-of-day factor on the shared materials (0 day, 1 night). */
  setNight: (nf: number) => void;
  /** Washing-line sway clock (seconds). */
  swayTime: { value: number };
  stats: { tris: number; meshes: number; lights: number };
  dispose: () => void;
};

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** 0 by day, 1 at night, for a night value 0..1. */
export const nightFactor = (night: number) => smoothstep(0.3, 0.75, night);

const HALO_VERTEX = /* glsl */ `
attribute vec4 aHalo; // xyz: centre, w: size
attribute float aBright;
varying vec2 vUv;
varying float vBright;
void main() {
  vUv = uv;
  vBright = aBright;
  vec4 mv = modelViewMatrix * vec4(aHalo.xyz, 1.0);
  // Keep the size in step with the node's scale (the editor's rise-in animation scales the holder).
  float s = length(modelMatrix[0].xyz);
  mv.xy += position.xy * aHalo.w * s;
  gl_Position = projectionMatrix * mv;
}
`;
const HALO_FRAGMENT = /* glsl */ `
uniform sampler2D map;
uniform float uOpacity;
varying vec2 vUv;
varying float vBright;
void main() {
  vec4 t = texture2D(map, vUv);
  gl_FragColor = vec4(vec3(vBright * uOpacity), t.a);
}
`;

/**
 * Builds the alley once. The art pictures of one folder must already be
 * loaded and selected (Art.loadArt, then Art.useArt), so each canvas has its
 * final pixels before its texture exists.
 */
export function buildAlleyKit(): AlleyKit {
  const root = new THREE.Group();
  root.name = "alley-arena";
  const textures: THREE.Texture[] = [];
  const materials: THREE.Material[] = [];
  const geometries: THREE.BufferGeometry[] = [];
  const own = <T extends THREE.Texture>(t: T) => (textures.push(t), t);
  const ownMat = <T extends THREE.Material>(m: T) => (materials.push(m), m);
  const std = (o: THREE.MeshStandardMaterialParameters) => ownMat(new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, ...o }));
  const addMesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => {
    geometries.push(geo);
    const mesh = new THREE.Mesh(geo, mat);
    root.add(mesh);
    return mesh;
  };
  const nightLights: NightLight[] = [];
  const addLight = (light: THREE.PointLight | THREE.SpotLight, base: number, target?: THREE.Vector3) => {
    light.intensity = 0;
    light.userData.alleyBase = base;
    if (target) light.userData.alleyTarget = target.toArray();
    root.add(light);
    nightLights.push({ light, base, target });
  };

  const S = shapeKit();
  const R = Art.rng(101); // the layout is the same on every build
  const Wd = placer(S, null);
  const WALLS: Record<WallKey, Placer> = {
    N: placer(S, wallBase("N")),
    S: placer(S, wallBase("S")),
    W: placer(S, wallBase("W")),
    E: placer(S, wallBase("E"))
  };

  // ───────────────────────── textures and materials ─────────────────────────
  const brickA = Art.brickSet(5, { pic: "brick_a" }), brickB = Art.brickSet(6, { pic: "brick_b", cols: 8, rows: 22, base: 136, mortar: 90, vary: 20 });
  const plaster = Art.plasterSet(), wood = Art.woodSet(), pave = Art.paveSet(), cob = Art.cobbleSet();
  const winA = Art.windowAtlas(3), shopA = Art.shopAtlas(), cloth = Art.clothAtlas(), decal = Art.decalAtlas();
  const rep = (c: Art.Canvas) => own(Art.tex(c, [1, 1])), repData = (c: Art.Canvas) => own(Art.dataTex(c, [1, 1]));
  const reflTex = own(Art.tex(Art.reflectionCanvas()));
  reflTex.mapping = THREE.EquirectangularReflectionMapping;
  const T = {
    crate: own(Art.tex(Art.crateCanvas())),
    barrel: own(Art.tex(Art.barrelCanvas(), [2, 1])),
    cheese: own(Art.tex(Art.cheeseCanvas(), [0.6, 0.6])),
    cone: own(Art.tex(Art.coneCanvas()))
  };
  const clothMap = own(Art.tex(cloth.map));
  const M: Record<MaterialKey, THREE.Material> = {
    brickA: std({ map: rep(brickA.map), normalMap: repData(brickA.normal), vertexColors: true }),
    brickB: std({ map: rep(brickB.map), normalMap: repData(brickB.normal), vertexColors: true }),
    stone: std({ map: rep(plaster.map), normalMap: repData(plaster.normal), vertexColors: true, roughness: 0.88 }),
    metal: std({ map: rep(Art.metalCanvas()), vertexColors: true, roughness: 0.5, metalness: 0.2 }),
    wood: std({ map: rep(wood.map), normalMap: repData(wood.normal), vertexColors: true }),
    pave: std({ map: rep(pave.map), normalMap: repData(pave.normal), roughnessMap: repData(pave.rough!), roughness: 1, vertexColors: true }),
    win: std({ map: own(Art.tex(winA.map)), emissiveMap: own(Art.tex(winA.glow)), emissive: 0xffffff, emissiveIntensity: LOOK.windowGlow, roughness: 0.35 }),
    shop: std({ map: own(Art.tex(shopA.map)), emissiveMap: own(Art.tex(shopA.glow!)), emissive: 0xffffff, emissiveIntensity: LOOK.shopGlow, roughness: 0.4 }),
    crate: std({ map: T.crate, vertexColors: true }),
    barrel: std({ map: T.barrel, vertexColors: true }),
    cheese: std({ map: T.cheese, roughness: 0.6, vertexColors: true }),
    cloth: std({ map: clothMap, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true }),
    decal: std({ map: own(Art.tex(decal.map)), color: 0x7a7a7a, alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    bulb: ownMat(new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false })),
    cone: ownMat(new THREE.MeshBasicMaterial({ map: T.cone, transparent: true, opacity: LOOK.cone, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false })),
    spill: ownMat(new THREE.MeshBasicMaterial({ map: own(Art.tex(Art.spillCanvas())), transparent: true, opacity: LOOK.spill, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })),
    puddle: std({ map: own(Art.tex(Art.puddleMaskCanvas())), transparent: true, depthWrite: false, roughness: 0.06, envMap: reflTex, envMapIntensity: LOOK.puddleReflect, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    // spawn-door leaves (two widths)
    leafNarrow: std({ map: own(Art.tex(Art.doorCanvas(1.3))), vertexColors: true, roughness: 0.85 }),
    leafWide: std({ map: own(Art.tex(Art.doorCanvas(2.1))), vertexColors: true, roughness: 0.85 })
  };
  const B = {} as Record<MaterialKey, Batch>;
  for (const k of Object.keys(M) as MaterialKey[]) B[k] = new Batch();

  // shared tints
  const IRON: BatchOptions = { shade: 0.16, tile: 2 }, IRONC: BatchOptions = { shade: 0.2, uv: [1, 4] };
  const TRIM: BatchOptions = { tile: 3.2, shade: 0.72 }, DARKSTONE: BatchOptions = { tile: 3.2, shade: 0.38 };
  const TIMBER: BatchOptions = { tile: 2, shade: 0.5 };
  const halos: [number, number, number, number, number][] = []; // [x, y, z, size, brightness]
  const spills: [WallKey, number, number, number, number][] = []; // light pools, wall-local: [key, u, width, length, d0]
  const wires: number[] = []; // line segment endpoints
  const halo = (v: THREE.Vector3, size: number, b: number) => halos.push([v.x, v.y, v.z, size, b]);

  // ───────────────────────── ground, sidewalks, kerbs ─────────────────────────
  {
    const size = 2 * (A + 9), rp: [number, number] = [size / 2.5, size / 2.5]; // 2.5 m per tile: setts about 21 x 16 cm
    const ground = addMesh(
      new THREE.PlaneGeometry(size, size),
      std({
        map: own(Art.tex(cob.map, rp)),
        color: new THREE.Color().setScalar(LOOK.cobble),
        normalMap: own(Art.dataTex(cob.normal, rp)),
        roughnessMap: own(Art.dataTex(cob.rough!, rp)),
        roughness: 1,
        envMap: reflTex,
        envMapIntensity: LOOK.wetReflect
      })
    );
    ground.name = "cobbles";
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    // Sidewalks are flush; the kerb stones give the edge.
    const K = A - 2.7, flat = -Math.PI / 2, pv: BatchOptions = { tile: 2.5, shade: 0.36 }, ks: BatchOptions = { tile: 3.2, shade: 0.32 };
    for (const s of [-1, 1]) {
      Wd.quad(B.pave, 0, 0.018, s * (K + 1.7), 2 * A + 1.4, 3.4, pv, flat);
      Wd.quad(B.pave, s * (K + 1.7), 0.018, 0, 3.4, 2 * K, pv, flat);
      Wd.slab(B.stone, -K, K, 0, 0.1, s * K - 0.24 * (s > 0 ? 1 : 0), s * K + 0.24 * (s > 0 ? 0 : 1), ks);
      Wd.slab(B.stone, s * K - 0.24 * (s > 0 ? 1 : 0), s * K + 0.24 * (s > 0 ? 0 : 1), 0, 0.1, -K + 0.24, K - 0.24, ks);
    }
  }

  // ───────────────────────── facade kit ─────────────────────────
  function fireEscape(P: Placer, ua: number, ub: number, floors: number, ladderU: number) {
    const D0 = 0.02, D1 = 1.18, I = IRON;
    for (let f = 0; f < floors; f++) {
      const y = G0 + f * FL + 0.72;
      P.slab(B.metal, ua, ub, y - 0.05, y, D0, D1, I); // deck
      P.slab(B.metal, ua, ub, y - 0.16, y - 0.05, D1 - 0.05, D1, I); // edge beam
      for (const u of [ua + 0.03, ub - 0.03]) {
        P.slab(B.metal, u - 0.03, u + 0.03, y - 0.16, y - 0.05, D0, D1 - 0.05, I);
        P.box(B.metal, u, y - 0.55, 0.57, 0.05, 0.05, 1.4, I, -0.68); // bracket back to the wall
        P.slab(B.metal, u - 0.025, u + 0.025, y, y + 1.02, D1 - 0.055, D1 - 0.005, I); // corner post
        for (const h of [0.5, 1.0]) P.slab(B.metal, u - 0.015, u + 0.015, y + h - 0.02, y + h + 0.02, D0, D1 - 0.05, I);
      }
      for (const h of [0.5, 1.0]) P.slab(B.metal, ua, ub, y + h - 0.02, y + h + 0.02, D1 - 0.045, D1 - 0.015, I);
      for (let u = ua + 0.2; u < ub - 0.1; u += 0.2) P.slab(B.metal, u - 0.011, u + 0.011, y, y + 0.98, D1 - 0.041, D1 - 0.019, I); // balusters
      if (f < floors - 1) {
        // stair up to the next landing, alternating direction
        const dir = f % 2 ? -1 : 1, uc = (ua + ub) / 2, run = 2.3, len = Math.hypot(run, FL), ang = Math.atan2(FL, run * dir);
        for (const d of [0.3, 0.86]) P.box(B.metal, uc, y + FL / 2, d, len, 0.14, 0.04, I, 0, 0, ang);
        P.box(B.metal, uc, y + FL / 2 + 0.85, 0.88, len, 0.035, 0.035, I, 0, 0, ang);
        for (let k = 0; k < 11; k++) {
          const t = (k + 0.5) / 11, u = uc + dir * run * (t - 0.5), yy = y + FL * t;
          P.slab(B.metal, u - 0.12, u + 0.12, yy - 0.015, yy + 0.015, 0.3, 0.86, I);
        }
      }
    }
    const y0 = G0 + 0.72, d = D1 + 0.06; // drop ladder
    for (const s of [-0.21, 0.21]) P.slab(B.metal, ladderU + s - 0.02, ladderU + s + 0.02, 2.9, y0 + 1.0, d - 0.02, d + 0.02, I);
    for (let yy = 3.05; yy < y0 + 0.9; yy += 0.3) P.slab(B.metal, ladderU - 0.21, ladderU + 0.21, yy - 0.012, yy + 0.012, d - 0.012, d + 0.012, I);
  }

  function drainpipe(P: Placer, u: number, H: number) {
    const d = 0.38;
    P.cyl(B.metal, u, (0.3 + H - 0.9) / 2, d, 0.065, 0.065, H - 1.2, IRONC, 8);
    for (let y = 1.3; y < H - 1.2; y += 2.4) P.slab(B.metal, u - 0.1, u + 0.1, y, y + 0.06, 0, d + 0.02, IRON);
    P.slab(B.metal, u - 0.17, u + 0.17, H - 0.92, H - 0.62, 0.1, 0.52, IRON); // hopper head
    P.box(B.metal, u, 0.24, d + 0.1, 0.13, 0.13, 0.34, IRON, 0.7); // shoe
  }

  function awning(P: Placer, a: number, b: number, y1 = 3.95, d1 = 0.1, y2 = 3.12, d2 = 1.55) {
    const L = Math.hypot(y1 - y2, d2 - d1), al = -Math.atan2(d2 - d1, y1 - y2);
    P.quad(B.cloth, (a + b) / 2, (y1 + y2) / 2, (d1 + d2) / 2, b - a, L, { cell: cloth.uv.awning, shade: 0.34 }, al);
    P.quad(B.cloth, (a + b) / 2, y2 - 0.13, d2, b - a, 0.28, { cell: cloth.uv.valance, shade: 0.34 });
    for (const u of [a + 0.02, b - 0.02]) P.slab(B.metal, u - 0.015, u + 0.015, y2 - 0.02, y2 + 0.01, d1 - 0.05, d2, IRON);
  }

  function bladeSign(P: Placer, u: number, y: number, name: string) {
    // board hung from a bracket, readable from both sides
    P.slab(B.metal, u - 0.02, u + 0.02, y + 0.5, y + 0.54, 0, 1.15, IRON);
    P.box(B.metal, u, y + 0.3, 0.27, 0.025, 0.025, 0.7, IRON, 0.75);
    for (const d of [0.4, 0.96]) P.slab(B.metal, u - 0.01, u + 0.01, y + 0.4, y + 0.5, d - 0.01, d + 0.01, IRON);
    P.slab(B.metal, u - 0.03, u + 0.03, y - 0.42, y + 0.42, 0.26, 1.1, IRON);
    P.quad(B.shop, u + 0.036, y, 0.68, 0.8, 0.8, { cell: shopA.uv[name] }, 0, Math.PI / 2);
    P.quad(B.shop, u - 0.036, y, 0.68, 0.8, 0.8, { cell: shopA.uv[name] }, 0, -Math.PI / 2);
  }

  function wallLamp(P: Placer, u: number, y: number, d: number, size = 1.3) {
    // bare bulb on a short bracket
    P.slab(B.metal, u - 0.015, u + 0.015, y + 0.12, y + 0.15, d - 0.3, d, IRON);
    P.geo(B.metal, S.coneGeo(10), u, y + 0.1, d, { shade: 0.2, uv: [1, 1] }, 0.17, 0.14, 0.17);
    P.sph(B.bulb, u, y, d, 0.15, 0.15, 0.15);
    halo(P.world(u, y, d), size, 0.4);
  }

  function waterTower(P: Placer, u: number, H: number, d: number) {
    for (const [a, b] of [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]]) P.slab(B.metal, u + a - 0.06, u + a + 0.06, H, H + 2.6, d + b - 0.06, d + b + 0.06, IRON);
    for (const s of [-1, 1]) {
      P.box(B.metal, u, H + 1.3, d + 0.85, 2.5, 0.05, 0.05, IRON, 0, 0, s * 0.81);
      P.box(B.metal, u + s * 0.85, H + 1.3, d, 0.05, 0.05, 2.5, IRON, s * 0.81);
    }
    P.slab(B.wood, u - 1.3, u + 1.3, H + 2.6, H + 2.72, d - 1.3, d + 1.3, TIMBER);
    P.cyl(B.wood, u, H + 2.72 + 1.25, d, 1.1, 1.2, 2.5, { uv: [4, 1], shade: 0.7 }, 20); // staved tank
    for (const hy of [0.3, 1.0, 1.7, 2.3]) P.cyl(B.metal, u, H + 2.72 + hy, d, 1.215 - hy * 0.04, 1.22 - hy * 0.04, 0.07, IRONC, 20);
    P.geo(B.metal, S.coneGeo(20), u, H + 5.22 + 0.45, d, { shade: 0.24, uv: [3, 1] }, 1.42, 0.9, 1.42);
    P.sph(B.metal, u, H + 6.15, d, 0.16, 0.16, 0.16, IRON);
    for (const s of [-0.18, 0.18]) P.slab(B.metal, u + s - 0.02, u + s + 0.02, H, H + 4.4, d + 1.24, d + 1.28, IRON); // ladder
    for (let y = H + 0.3; y < H + 4.3; y += 0.32) P.slab(B.metal, u - 0.18, u + 0.18, y - 0.012, y + 0.012, d + 1.25, d + 1.27, IRON);
  }

  function chimney(P: Placer, u: number, H: number, d: number, tall: number) {
    P.slab(B.brickA, u - 0.45, u + 0.45, H, H + tall, d - 0.35, d + 0.35, { tile: 4.8, shade: 0.8 });
    P.slab(B.stone, u - 0.55, u + 0.55, H + tall, H + tall + 0.14, d - 0.45, d + 0.45, TRIM);
    for (const s of [-0.2, 0.2]) P.cyl(B.stone, u + s, H + tall + 0.38, d, 0.1, 0.13, 0.5, { shade: 0.45, uv: [1, 1] }, 8);
  }

  function roofHut(P: Placer, u: number, H: number, d: number) {
    // stair bulkhead with a lit window
    P.slab(B.brickA, u - 1.2, u + 1.2, H, H + 2.3, d - 1.1, d + 1.1, { tile: 4.8, shade: 0.85 });
    P.slab(B.stone, u - 1.35, u + 1.35, H + 2.3, H + 2.42, d - 1.25, d + 1.25, DARKSTONE);
    P.quad(B.win, u + 0.45, H + 1.45, d + 1.11, 0.62, 0.98, { cell: winA.lit[2] });
    P.slab(B.stone, u + 0.08, u + 0.82, H + 0.88, H + 0.96, d + 1.1, d + 1.2, TRIM);
  }

  // One tenement: recessed shop-front storey, storeys of real window openings, cornice, parapet, roof clutter.
  function building(key: WallKey, u0: number, u1: number, floors: number, style: "a" | "b" | "p", ground: readonly Bay[], x: BuildingExtras = {}) {
    const P = WALLS[key], W = u1 - u0, H = G0 + floors * FL + 0.6 + (x.h || 0), tint = x.tint ?? 1;
    const wb = style === "p" ? B.stone : style === "b" ? B.brickB : B.brickA;
    const wo: BatchOptions = { tile: style === "p" ? 3.2 : 4.8, shadeY: [0, 0.76 * tint * (style === "p" ? 0.78 : 1), H, 1.04 * tint * (style === "p" ? 0.78 : 1)] };
    const tr: BatchOptions = style === "p" ? { tile: 3.2, shade: 0.5 } : TRIM;

    // cores (the facade skin in front of them is built from piers and spandrels, so openings are real)
    P.slab(wb, u0, u1, 0, G0, -9, -0.7, wo);
    P.slab(wb, u0, u1, G0, H, -9, -0.3, wo);

    // upper storeys
    const nb = Math.max(2, Math.round(W / 2.9)), bw = W / nb, ww = style === "b" ? 1.15 : style === "p" ? 1.4 : 1.25, wh = 1.95;
    const litP = x.lit ?? LOOK.litWindows;
    let prevHead = G0;
    let below: boolean[] = [];
    for (let f = 0; f < floors; f++) {
      const sill = G0 + f * FL + 0.95, head = sill + wh, row: boolean[] = [];
      P.slab(wb, u0, u1, prevHead, sill, -0.3, 0, wo);
      let left = u0;
      for (let i = 0; i < nb; i++) {
        if (x.blank && x.blank(f, i)) continue;
        const uc = u0 + (i + 0.5) * bw, a = uc - ww / 2, b = uc + ww / 2;
        P.slab(wb, left, a, sill, head, -0.3, 0, wo);
        left = b;
        row[i] = R() < litP && !row[i - 1] && !below[i]; // never two lit windows side by side or stacked
        const set = row[i] ? winA.lit : winA.dark, cell = set[Math.floor(R() * set.length)];
        if (style === "p") {
          // paired casements, stone mullion, shutters
          const pw = (ww - 0.14) / 2;
          for (const s of [-1, 1]) P.quad(B.win, uc + s * (pw / 2 + 0.07), sill + wh / 2, -0.24, pw, wh, { cell });
          P.slab(B.stone, uc - 0.07, uc + 0.07, sill, head, -0.3, -0.06, tr);
          for (const s of [-1, 1]) P.slab(B.stone, uc + s * (ww / 2 + 0.07) - 0.07, uc + s * (ww / 2 + 0.07) + 0.07, sill, head, 0, 0.05, tr);
          P.slab(B.stone, uc - 0.12, uc + 0.12, head, head + 0.36, 0.05, 0.11, tr); // keystone
          if (R() < 0.65) for (const s of [-1, 1]) P.box(B.wood, uc + s * (ww / 2 + 0.39), sill + wh / 2, 0.07, 0.46, wh, 0.05, { tile: 1.4, shade: 0.5 }, 0, s * 0.3);
        } else P.quad(B.win, uc, sill + wh / 2, -0.24, ww, wh, { cell });
        P.slab(B.stone, a - 0.14, b + 0.14, sill - 0.11, sill + 0.03, -0.3, 0.13, tr); // sill
        P.slab(B.stone, a - 0.16, b + 0.16, head, head + 0.26, 0, 0.05, tr); // lintel
        if (style === "b") P.slab(B.stone, a - 0.22, b + 0.22, head + 0.26, head + 0.34, 0, 0.2, tr); // hood
        if (style === "a" && R() < 0.14) {
          // window box
          P.slab(B.wood, a + 0.1, b - 0.1, sill + 0.03, sill + 0.22, 0.02, 0.24, TIMBER);
          for (let k = 0; k < 4; k++) P.sph(B.stone, a + 0.25 + (k * (ww - 0.5)) / 3, sill + 0.3 + (k % 2) * 0.05, 0.13, 0.3, 0.24, 0.24, { shade: 0.2, uv: [1, 1] });
        }
      }
      P.slab(wb, left, u1, sill, head, -0.3, 0, wo);
      prevHead = head;
      below = row;
    }
    P.slab(wb, u0, u1, prevHead, H, -0.3, 0, wo);
    if (style === "a") {
      // stone quoins up both edges
      for (let y = G0 + 0.2, k = 0; y < H - 1.2; y += 0.42, k++)
        for (const s of [0, 1]) {
          const q = k % 2 ? 0.5 : 0.32;
          P.slab(B.stone, s ? u1 - q : u0, s ? u1 : u0 + q, y, y + 0.36, 0, 0.045, tr);
        }
    }
    if (style === "p") for (let f = 1; f < floors; f++) P.slab(B.stone, u0, u1, G0 + f * FL + 0.28, G0 + f * FL + 0.42, 0, 0.06, tr); // band courses
    if (style === "b") {
      // pilaster strips between bays, continuous sill courses
      for (let i = 0; i <= nb; i++) {
        const ub = u0 + i * bw, a = Math.max(u0, ub - 0.26), b = Math.min(u1, ub + 0.26);
        P.slab(wb, a, b, G0 + 0.16, H - 0.95, 0, 0.14, wo);
        P.slab(B.stone, a, b, H - 0.95, H - 0.78, 0, 0.2, tr);
      }
      for (let f = 0; f < floors; f++) P.slab(B.stone, u0, u1, G0 + f * FL + 0.72, G0 + f * FL + 0.84, 0, 0.07, tr);
    }

    // cornice and parapet
    P.slab(B.stone, u0, u1, H - 0.78, H - 0.6, 0, 0.07, tr);
    for (let i = 0, n = Math.floor(W / 0.46); i < n; i++) {
      const uc = u0 + (i + 0.5) * (W / n);
      P.slab(B.stone, uc - 0.1, uc + 0.1, H - 0.5, H - 0.3, 0, 0.26, tr);
    }
    P.slab(B.stone, u0, u1, H - 0.3, H - 0.1, 0, 0.42, tr);
    P.slab(B.stone, u0, u1, H - 0.1, H + 0.06, 0, 0.6, tr);
    P.slab(wb, u0, u1, H, H + 0.8, -0.4, 0, wo);
    P.slab(B.stone, u0, u1, H + 0.8, H + 0.92, -0.46, 0.07, tr);
    P.slab(wb, u0, u0 + 0.35, H, H + 0.8, -9, -0.4, wo);
    P.slab(wb, u1 - 0.35, u1, H, H + 0.8, -9, -0.4, wo);
    if (x.ped) {
      // stepped centre block with a round plaque
      const uc = (u0 + u1) / 2;
      P.slab(wb, uc - 1.8, uc + 1.8, H + 0.92, H + 1.75, -0.4, 0, wo);
      P.slab(B.stone, uc - 1.9, uc + 1.9, H + 1.75, H + 1.87, -0.46, 0.07, tr);
      P.cyl(B.stone, uc, H + 1.33, 0.03, 0.3, 0.3, 0.08, tr, 16, Math.PI / 2);
    }

    // ground storey: fascia beam, string course, piers, then whatever fills each bay
    P.slab(B.stone, u0, u1, 3.45, G0 - 0.04, -0.7, 0.08, DARKSTONE);
    P.slab(B.stone, u0, u1, G0 - 0.04, G0 + 0.16, -0.3, 0.3, tr);
    P.slab(B.stone, u0, u1, G0 - 0.16, G0 - 0.04, 0.08, 0.18, tr);
    const bounds = [u0];
    for (const seg of ground) bounds.push(bounds[bounds.length - 1] + seg[0]);
    bounds[bounds.length - 1] = u1;
    for (const ub of bounds) {
      const a = Math.max(u0, ub - 0.3), b = Math.min(u1, ub + 0.3), ea = a > u0 ? 0.05 : 0, eb = b < u1 ? 0.05 : 0;
      P.slab(wb, a, b, 0, 3.45, -0.7, 0.05, wo);
      P.slab(B.stone, a - ea, b + eb, 0, 0.55, -0.7, 0.12, tr);
      P.slab(B.stone, a - ea, b + eb, 3.2, 3.45, -0.7, 0.11, tr);
    }
    ground.forEach(([, type, so = {}], i) => {
      const a = bounds[i] + 0.3, b = bounds[i + 1] - 0.3, uc = (a + b) / 2, w = b - a;
      if (type === "wall") {
        P.slab(wb, a, b, 0, 3.45, -0.7, -0.1, wo);
        P.slab(B.stone, a, b, 0, 0.55, -0.1, -0.03, tr);
      } else if (type.startsWith("shop")) {
        P.slab(B.wood, a, b, 0, 0.6, -0.7, -0.42, TIMBER); // stall riser
        P.slab(B.stone, a, b, 0.6, 0.68, -0.7, -0.36, tr);
        P.quad(B.shop, uc, 0.68 + 1.385, -0.5, w, 2.77, { cell: shopA.uv[type] });
        if (!type.startsWith("shopDark")) spills.push([key, uc, w + 1.4, 3.8, 0]);
      } else if (type.startsWith("door") || type === "speak") {
        const speak = type === "speak", name = speak ? "door2" : type, dw = name === "door3" ? 2.1 : 1.3, dh = name === "door3" ? 3.0 : 2.75, back = speak ? -0.35 : -0.5;
        P.quad(B.shop, uc, 0.1 + dh / 2, back - 0.12, dw, dh, { cell: shopA.uv[name] });
        P.slab(wb, a, uc - dw / 2, 0, 3.45, -0.7, back, wo);
        P.slab(wb, uc + dw / 2, b, 0, 3.45, -0.7, back, wo);
        P.slab(wb, uc - dw / 2, uc + dw / 2, 0.1 + dh, 3.45, -0.7, back, wo);
        P.slab(B.stone, uc - dw / 2 - 0.12, uc + dw / 2 + 0.12, 0, 0.1, -0.7, back + 0.3, tr); // step
        P.slab(B.stone, uc - dw / 2 - 0.1, uc + dw / 2 + 0.1, 0.1 + dh, 0.24 + dh, back, back + 0.06, tr); // door head
        if (speak) {
          for (const s of [-1, 1]) wallLamp(P, uc + s * 1.15, 2.55, back + 0.32, 1.5);
          spills.push([key, uc, 4.4, 4.6, 0]);
        } else if (name !== "door2") {
          wallLamp(P, uc, 3.02, back + 0.34, name === "door3" ? 1.6 : 1.2);
          spills.push([key, uc, dw + 1.6, name === "door3" ? 4.2 : 3, 0]);
        }
      } else {
        // 'shutter' | 'garage'
        P.quad(B.shop, uc, 1.65, type === "garage" ? -0.55 : -0.5, w, 3.3, { cell: shopA.uv[type] });
        P.slab(B.metal, a, b, 3.3, 3.45, -0.7, -0.44, { shade: 0.3, tile: 2 });
      }
      if (so.name != null) {
        const nw = Math.min(w + 0.3, 4.3);
        P.quad(B.shop, uc, 3.75, 0.095, nw, nw / 8, { cell: shopA.uv["name" + so.name] });
      }
      if (so.aw) awning(P, a - 0.1, b + 0.1);
    });

    // hardware and roof clutter
    if (x.fe) fireEscape(P, x.fe[0], x.fe[1], floors, x.fe[2]);
    for (const u of x.pipe || []) drainpipe(P, u, H);
    if (x.blade) bladeSign(P, x.blade[0], 3.32, x.blade[1]);
    if (x.tower) waterTower(P, x.tower[0], H, x.tower[1]);
    for (const [u, d, tall] of x.chim || []) chimney(P, u, H, d, tall);
    if (x.hut) roofHut(P, x.hut[0], H, x.hut[1]);
    return H;
  }

  for (const key of Object.keys(PLAN) as WallKey[]) for (const b of PLAN[key]) building(key, ...b);

  // corner blocks close the ring
  for (const [sx, sz, h, bk] of [[-1, -1, 19.5, B.brickB], [1, -1, 23.5, B.brickA], [1, 1, 17.5, B.brickB], [-1, 1, 22, B.brickA]] as const) {
    const x0 = sx < 0 ? -A - 9 : A, z0 = sz < 0 ? -A - 9 : A;
    Wd.slab(bk, x0, x0 + 9, 0, h, z0, z0 + 9, { tile: 4.8, shadeY: [0, 0.7, h, 0.95] });
    Wd.slab(B.stone, x0 - 0.1, x0 + 9.1, h, h + 0.2, z0 - 0.1, z0 + 9.1, TRIM);
  }

  // The original's hazy far blocks (50-64 m out) are not built. Their draws
  // from the seeded stream stay, so every prop after them keeps its tint.
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2 + 0.17, r = 50 + R() * 14, x = Math.sin(a) * r, z = Math.cos(a) * r;
    R();
    R();
    R();
    if (z < -30 && x > -70 && x < 12) continue;
    if (R() < 0.5) R();
  }

  // ───────────────────────── signs ─────────────────────────
  function signMesh(cnv: Art.Canvas, w: number, h: number, key: WallKey, u: number, y: number, d: number, lit = true) {
    const P = WALLS[key], map = own(Art.tex(cnv));
    const m = addMesh(
      new THREE.PlaneGeometry(w, h),
      lit
        ? ownMat(new THREE.MeshBasicMaterial({ map, fog: true }))
        : std({ map, color: 0x888888, emissiveMap: map, emissive: 0xffffff, emissiveIntensity: 0.22 })
    );
    m.position.copy(P.world(u, y, d));
    m.rotation.y = WALL_RY[key];
    m.receiveShadow = !lit;
    P.slab(B.metal, u - w / 2 - 0.15, u + w / 2 + 0.15, y - h / 2 - 0.15, y + h / 2 + 0.15, d - 0.24, d - 0.02, IRON);
    for (const s of [-0.3, 0.3]) for (const t of [-0.3, 0.3]) P.slab(B.metal, u + s * w - 0.04, u + s * w + 0.04, y + t * h - 0.04, y + t * h + 0.04, 0, d - 0.24, IRON); // stand-offs
    return m;
  }
  signMesh(Art.art(Art.signCanvas("SQUEAKEASY", "jazz nightly · no cats"), "sign_squeakeasy"), 7.6, 2.375, "N", 0, 5.75, 0.5).name = "sign-speakeasy";
  signMesh(Art.art(Art.signCanvas("HOTEL RATZ"), "sign_hotel"), 7, 2.19, "W", 6, 5.85, 0.5).name = "sign-hotel";
  {
    // billboard on the east wall, lit from above by gooseneck lamps
    const P = WALLS.E;
    signMesh(Art.art(Art.billboardCanvas(), "billboard", { level: true }), 9, 5.06, "E", 5, 8.0, 0.55, false).name = "billboard";
    for (const u of [2, 5, 8]) {
      P.slab(B.metal, u - 0.02, u + 0.02, 10.66, 11.3, 0.3, 0.34, IRON);
      P.slab(B.metal, u - 0.02, u + 0.02, 11.26, 11.3, 0.3, 1.5, IRON);
      P.geo(B.metal, S.coneGeo(10), u, 11.16, 1.5, { shade: 0.2, uv: [1, 1] }, 0.2, 0.24, 0.2);
      P.sph(B.bulb, u, 11.04, 1.5, 0.14, 0.14, 0.14);
      halo(P.world(u, 11.04, 1.5), 1.6, 0.4);
    }
    for (const u of [1.2, 8.8]) P.box(B.metal, u, 5.0, 0.3, 0.07, 1.4, 0.07, IRON, -0.4); // struts under the frame
  }
  {
    // speakeasy: canopy over the door, bulbs under it, the door light
    const P = WALLS.N;
    P.slab(B.metal, -1.5, 1.5, 3.02, 3.14, -0.35, 1.0, { shade: 0.22, tile: 2 });
    P.slab(B.metal, -1.5, 1.5, 2.9, 3.02, 0.94, 1.0, { shade: 0.3, tile: 2 });
    for (const u of [-1.44, 1.44]) P.box(B.metal, u, 3.55, 0.5, 0.02, 0.02, 1.25, IRON, 0.72); // tie rods
    for (let i = -2; i <= 2; i++) {
      P.sph(B.bulb, i * 0.6, 2.86, 0.97, 0.1, 0.1, 0.1);
      halo(P.world(i * 0.6, 2.86, 0.97), 0.7, 0.3);
    }
    const l = new THREE.PointLight(0xffffff, 0, 16, 2);
    l.position.set(0, 2.6, -A + 2);
    addLight(l, 40);
  }
  {
    // hotel entrance: marquee with a row of bulbs, carpet, potted shrubs
    const P = WALLS.W;
    P.slab(B.metal, 4.3, 7.7, 3.3, 3.5, 0.05, 2.0, { shade: 0.24, tile: 2 });
    P.slab(B.stone, 4.3, 7.7, 3.5, 3.56, 0.05, 2.06, TRIM);
    for (const u of [4.36, 7.64]) P.box(B.metal, u, 4.0, 1.0, 0.02, 0.02, 2.2, IRON, 0.5);
    for (let i = 0; i < 6; i++) {
      const u = 4.6 + i * 0.56;
      P.sph(B.bulb, u, 3.25, 1.92, 0.1, 0.1, 0.1);
      halo(P.world(u, 3.25, 1.92), 0.7, 0.3);
    }
    P.quad(B.stone, 6, 0.028, 1.1, 2.0, 3.0, { shade: 0.26, uv: [1, 2] }, -Math.PI / 2); // carpet runner
    for (const u of HOTEL_PLANTERS) {
      P.cyl(B.stone, u, 0.24, 0.42, 0.3, 0.21, 0.48, { shade: 0.42, uv: [2, 1] }, 12);
      for (const [dx, dy, s] of [[0, 0.82, 0.62], [0.12, 1.12, 0.46], [-0.1, 1.3, 0.34]]) P.sph(B.stone, u + dx, dy, 0.42, s, s, s, { shade: 0.17, uv: [1, 1] });
    }
    const l = new THREE.PointLight(0xffffff, 0, 13, 2);
    l.position.copy(P.world(6, 2.7, 1.6));
    addLight(l, 26);
  }
  // pawnbroker's three balls
  {
    const P = WALLS.N, u = 18.6;
    P.slab(B.metal, u - 0.02, u + 0.02, 3.72, 3.76, 0, 0.95, IRON);
    for (const [du, dy] of [[0, 0], [-0.2, -0.3], [0.2, -0.3]]) {
      P.slab(B.metal, u + du - 0.008, u + du + 0.008, 3.2 + dy, 3.74, 0.84, 0.856, IRON);
      P.sph(B.metal, u + du, 3.1 + dy, 0.85, 0.26, 0.26, 0.26, { shade: 0.5, uv: [1, 1] });
    }
  }

  // wanted posters and painted lettering
  function wallArt(cnv: Art.Canvas, w: number, h: number, key: WallKey, u: number, y: number, o: { paint?: boolean; tilt?: number } = {}) {
    const m = addMesh(new THREE.PlaneGeometry(w, h), std({ map: own(Art.tex(cnv)), color: o.paint ? 0xaaaaaa : 0x9a9a9a, transparent: !!o.paint, depthWrite: !o.paint }));
    m.position.copy(WALLS[key].world(u, y, o.paint ? -0.092 : -0.085));
    m.rotation.y = WALL_RY[key];
    m.rotation.z = o.tilt || 0;
    m.receiveShadow = true;
  }
  // White paint on black will do: the black lets the wall through.
  const daub = (pic: string, lines: string[]) => Art.art(Art.graffitiCanvas(lines), pic, { key: "luma" });
  wallArt(Art.posterCanvas("poster_boss", "WANTED", "BIG CHEESE", "$1000 REWARD"), 1.9, 2.67, "N", -4.9, 2.05, { tilt: 0.04 });
  wallArt(Art.posterCanvas("poster_gunner", "WANTED", "SLIM BRIE", "ARMED & CHEESY"), 1.9, 2.67, "N", 4.9, 2.05, { tilt: -0.05 });
  wallArt(Art.posterCanvas("poster_goon", "BEWARE", "THE CURD MOB", "THEY BONK"), 1.9, 2.67, "E", -14.55, 2.05, { tilt: 0.03 });
  wallArt(Art.posterCanvas("poster_boss2", "WANTED", "BIG CHEESE", "$1000 REWARD"), 1.9, 2.67, "S", -10.3, 2.05, { tilt: -0.03 });
  wallArt(daub("graffiti_no_rats", ["NO RATS", "ALLOWED"]), 5.2, 2.6, "W", -10.8, 2.0, { paint: true });
  wallArt(daub("graffiti_gouda", ["GOUDA", "STINKS"]), 5, 2.5, "S", 9.1, 2.0, { paint: true });

  // ───────────────────────── street lamps ─────────────────────────
  {
    const LP: BatchOptions = { shade: 0.14, uv: [1, 2] }, cone = new THREE.ConeGeometry(3.4, 4.3, 28, 1, true);
    for (const [x, z] of LAMPS) {
      const sg = -Math.sign(x), dx = sg * 0.8;
      Wd.cyl(B.metal, x, 0.12, z, 0.3, 0.36, 0.24, LP, 8);
      Wd.cyl(B.metal, x, 0.5, z, 0.17, 0.26, 0.52, LP, 8);
      Wd.cyl(B.metal, x, 0.8, z, 0.21, 0.21, 0.08, LP, 8);
      Wd.cyl(B.metal, x, 2.7, z, 0.065, 0.11, 3.8, LP, 8);
      Wd.cyl(B.metal, x, 4.62, z, 0.12, 0.12, 0.08, LP, 8);
      // swan neck
      const pts = [[0, 4.6], [0.22, 4.86], [0.6, 4.86], [0.8, 4.6]];
      for (let i = 0; i < 3; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
        Wd.box(B.metal, x + (sg * (ax + bx)) / 2, (ay + by) / 2, z, Math.hypot(bx - ax, by - ay) + 0.04, 0.06, 0.06, LP, 0, 0, Math.atan2(by - ay, (bx - ax) * sg));
      }
      Wd.geo(B.metal, S.coneGeo(12), x + dx, 4.47, z, LP, 0.36, 0.26, 0.36);
      Wd.cyl(B.metal, x + dx, 4.04, z, 0.2, 0.2, 0.03, LP, 12);
      for (let k = 0; k < 4; k++) {
        const a = (k * Math.PI) / 2 + 0.78;
        Wd.slab(B.metal, x + dx + Math.cos(a) * 0.19 - 0.01, x + dx + Math.cos(a) * 0.19 + 0.01, 4.04, 4.36, z + Math.sin(a) * 0.19 - 0.01, z + Math.sin(a) * 0.19 + 0.01, LP);
      }
      Wd.sph(B.bulb, x + dx, 4.22, z, 0.3, 0.3, 0.3);
      Wd.geo(B.cone, cone, x + dx, 2.15, z);
      halo(new THREE.Vector3(x + dx, 4.22, z), 2.8, 0.45);
      // The source sits a little above the bulb, so the pool is flatter (about 8 m across).
      const light = new THREE.PointLight(0xffffff, 0, LOOK.lampRange, 2);
      light.position.set(x + dx, 5.0, z);
      addLight(light, LOOK.lamp);
    }
    cone.dispose();
  }

  // ───────────────────────── overhead: string lights, wires, washing ─────────────────────────
  function catenary(a: readonly number[], b: readonly number[], sag: number, n: number, each?: (p: THREE.Vector3, i: number, t: number) => void) {
    let prev: THREE.Vector3 | null = null;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = new THREE.Vector3(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * sag, a[2] + (b[2] - a[2]) * t);
      if (prev) wires.push(prev.x, prev.y, prev.z, p.x, p.y, p.z);
      if (each) each(p, i, t);
      prev = p;
    }
  }
  for (const [a, b] of [[[-A, 9, -8], [A, 10, 2]], [[-A, 10, 12], [A, 8.5, 15]], [[-9, 9.5, -A], [-14, 9, A]]])
    catenary(a, b, 2.4, 26, (p, i) => {
      if (i % 2 === 1) Wd.sph(B.bulb, p.x, p.y - 0.12, p.z, 0.18, 0.18, 0.18);
    });
  for (const [a, b] of [[[-A, 16.5, -17], [A, 19, -9]], [[-A, 17, 9], [A, 18.5, 17]], [[6, 21, -A], [14, 17.5, A]]]) catenary(a, b, 1.6, 18);

  // The washing sways in the vertex shader (onBeforeCompile), as in the original's WebGL version.
  const swayTime = { value: 0 };
  {
    // washing lines strung across the corners
    const pos: number[] = [], nrm: number[] = [], uvs: number[] = [], col: number[] = [], sway: number[] = [];
    const SIZE: Record<string, [number, number]> = { shirt: [0.75, 1.5], longjohns: [0.8, 1.6], sheet: [1.05, 2.1], socks: [0.5, 1.0], trousers: [0.7, 1.4], towel: [0.65, 1.3], bloomers: [0.75, 1.5] };
    const names = Object.keys(SIZE);
    const lines = [
      [[-12.5, 8.4, -A], [-A, 7.9, -10.5]], [[13, 11.6, -A], [A, 11.0, -12]],
      [[14, 8.2, A], [A, 8.6, 13.5]], [[-12, 9.0, A], [-A, 9.5, 12]], [[-A, 12.6, 1], [-11, 12.9, A]]
    ];
    for (const [a, b] of lines) {
      const dir = new THREE.Vector3(b[0] - a[0], 0, b[2] - a[2]), len = dir.length(), nx = -dir.z / len, nz = dir.x / len, ux = dir.x / len, uz = dir.z / len;
      const n = Math.round(len / 0.75);
      let next = 2 + Math.floor(R() * 2);
      catenary(a, b, 0.55, n, (p, i) => {
        if (i !== next || i > n - 2) return;
        const name = names[Math.floor(R() * names.length)], [w, h] = SIZE[name], c = cloth.uv[name], ph = R() * 6.28, sh = 0.42 + R() * 0.16;
        next += Math.ceil((w + 0.35) / 0.75) + (R() < 0.3 ? 1 : 0);
        const vert = (su: number, tv: number) => {
          // su: -0.5..0.5 across, tv: 0 at the line .. 1 at the hem
          pos.push(p.x + ux * su * w, p.y + 0.03 - tv * h, p.z + uz * su * w);
          nrm.push(nx, 0, nz);
          uvs.push(c[0] + (su + 0.5) * (c[2] - c[0]), c[3] - tv * (c[3] - c[1]));
          col.push(sh, sh, sh);
          sway.push(nx, nz, tv * tv, ph);
        };
        for (let row = 0; row < 3; row++) {
          const t0 = row / 3, t1 = (row + 1) / 3;
          vert(-0.5, t0);
          vert(-0.5, t1);
          vert(0.5, t0);
          vert(0.5, t0);
          vert(-0.5, t1);
          vert(0.5, t1);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute("aSway", new THREE.Float32BufferAttribute(sway, 4));
    const mat = std({ map: clothMap, alphaTest: 0.5, side: THREE.DoubleSide, vertexColors: true });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uSwayTime = swayTime;
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute vec4 aSway;\nuniform float uSwayTime;")
        .replace(
          "#include <begin_vertex>",
          [
            "#include <begin_vertex>",
            "float swing = sin(uSwayTime * 1.6 + aSway.w) * 0.2 + sin(uSwayTime * 2.9 + aSway.w * 1.7) * 0.08;",
            "transformed.xz += aSway.xy * aSway.z * swing;"
          ].join("\n")
        );
    };
    mat.customProgramCacheKey = () => "alley-arena-washing";
    const mesh = addMesh(g, mat);
    mesh.name = "washing";
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  }

  // ───────────────────────── props ─────────────────────────
  for (const [x, z, s, y, ry] of CRATES) Wd.box(B.crate, x, y + s / 2, z, s, s, s, { shade: 0.74 + R() * 0.12 }, 0, ry);

  const barrelGeo = new THREE.LatheGeometry([[0.001, 0], [0.36, 0], [0.45, 0.28], [0.48, 0.55], [0.45, 0.82], [0.36, 1.1], [0.001, 1.1]].map(([x, y]) => new THREE.Vector2(x, y)), 18);
  for (const [x, z] of BARRELS) Wd.geo(B.barrel, barrelGeo, x, 0, z, { shade: 0.74 + R() * 0.12 }, 1, 1, 1, 0, R() * 6);
  barrelGeo.dispose();

  // plank barricades
  for (const [x, z, ry] of BARRICADES) {
    const Q = Wd.sub(x, 0, z, ry), wd: BatchOptions = { uv: [1, 0.25], shade: 0.8 }, post: BatchOptions = { uv: [0.2, 1], shade: 0.8 };
    for (const px of [-1.5, 1.5]) {
      Q.box(B.wood, px, 0.65, 0, 0.16, 1.3, 0.16, post);
      Q.box(B.wood, px, 0.36, -0.2, 0.1, 0.8, 0.1, post, 0.5); // back stay
    }
    for (const [py, rz] of [[0.45, 0.05], [0.95, -0.04]]) Q.box(B.wood, 0, py, 0.1, 3.6, 0.3, 0.08, wd, 0, 0, rz);
  }

  // the monument: a giant wedge of cheese on a stepped plinth
  {
    Wd.slab(B.stone, -1.6, 1.6, 0, 0.28, -1.6, 1.6, { tile: 3.2, shade: 0.5 });
    Wd.slab(B.stone, -1.42, 1.42, 0.28, 0.9, -1.42, 1.42, { tile: 3.2, shade: 0.58 });
    Wd.slab(B.stone, -1.52, 1.52, 0.9, 1.04, -1.52, 1.52, { tile: 3.2, shade: 0.64 });
    Wd.slab(B.metal, -0.7, 0.7, 0.42, 0.78, 1.42, 1.45, { shade: 0.3, tile: 2 }); // plaque
    const sh = new THREE.Shape();
    sh.moveTo(-1.3, 0);
    sh.lineTo(1.3, 0);
    sh.lineTo(1.3, 1.5);
    sh.closePath();
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 1.4, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    geo.translate(0, 0, -0.7);
    Wd.geo(B.cheese, geo, 0, 1.1, 0, { shade: 0.42 }, 1, 1, 1, 0, 0.5);
    geo.dispose();
  }

  // delivery van with its headlamps left on
  {
    const V = Wd.sub(-16, 0, -14), PAINT: BatchOptions = { shade: 0.36, tile: 2 }, BLK: BatchOptions = { shade: 0.07, tile: 2 }, TRIMV: BatchOptions = { shade: 0.6, tile: 2 };
    V.slab(B.metal, -1, 1, 0.5, 2.4, -2.5, 0.7, PAINT); // cargo box
    V.slab(B.metal, -1.06, 1.06, 2.4, 2.48, -2.56, 1.05, { shade: 0.2, tile: 2 }); // roof and visor
    V.slab(B.metal, -0.75, 0.75, 0.55, 1.35, 0.7, 2.35, PAINT); // bonnet
    V.slab(B.metal, -0.6, 0.6, 0.6, 1.3, 2.35, 2.41, BLK); // radiator
    for (let i = -3; i <= 3; i++) V.slab(B.metal, i * 0.16 - 0.02, i * 0.16 + 0.02, 0.64, 1.26, 2.41, 2.43, TRIMV);
    V.slab(B.metal, -0.66, 0.66, 1.3, 1.36, 2.3, 2.44, TRIMV);
    V.slab(B.metal, -0.85, 0.85, 1.5, 2.3, 0.7, 0.73, { shade: 0.1, tile: 2 }); // windscreen
    V.slab(B.metal, -0.03, 0.03, 1.5, 2.3, 0.73, 0.75, PAINT);
    V.slab(B.metal, -1.1, 1.1, 0.43, 0.57, 2.42, 2.56, { shade: 0.25, tile: 2 }); // bumper
    V.slab(B.metal, -0.012, 0.012, 0.6, 2.3, -2.52, -2.5, BLK); // rear door seam
    const beam = new THREE.ConeGeometry(2.2, 11, 24, 1, true);
    for (const sx of [-1, 1]) {
      for (const wz of [1.5, -1.7]) {
        V.cyl(B.metal, sx * 1.0, 0.46, wz, 0.46, 0.46, 0.28, { shade: 0.07, uv: [1, 1] }, 16, 0, 0, Math.PI / 2);
        V.cyl(B.metal, sx * 1.15, 0.46, wz, 0.2, 0.2, 0.04, { shade: 0.55, uv: [1, 1] }, 12, 0, 0, Math.PI / 2);
        V.slab(B.metal, sx * 1.0 - 0.21, sx * 1.0 + 0.21, 0.93, 1.07, wz - 0.65, wz + 0.65, BLK); // mudguard
      }
      V.slab(B.metal, sx * 1.1 - 0.15, sx * 1.1 + 0.15, 0.4, 0.46, -0.9, 0.8, BLK); // running board
      V.cyl(B.metal, sx * 0.62, 1.1, 2.34, 0.21, 0.21, 0.16, { shade: 0.1, uv: [1, 1] }, 12, Math.PI / 2);
      V.sph(B.bulb, sx * 0.62, 1.1, 2.42, 0.34, 0.34, 0.34);
      V.geo(B.cone, beam, sx * 0.62, 1.0, 2.42 + 5.5, undefined, 1, 1, 1, -Math.PI / 2);
      halo(V.world(sx * 0.62, 1.1, 2.46), 1.7, 0.45);
    }
    beam.dispose();
    const side = Art.cv(512, 256), sc = Art.ctx2d(side);
    sc.fillStyle = "#6a6a6a";
    sc.fillRect(0, 0, 512, 256);
    sc.fillStyle = Art.PAPER;
    sc.textAlign = "center";
    sc.font = `84px ${Art.FONT}`;
    sc.fillText("FROMAGE", 256, 120);
    sc.font = `48px ${Art.FONT}`;
    sc.fillText("& SONS · DAIRY", 256, 190);
    const st = std({ map: own(Art.tex(Art.art(side, "van_side", { level: true, max: 1024 }))) });
    const sideGeo = new THREE.PlaneGeometry(2.8, 1.4);
    geometries.push(sideGeo);
    for (const sx of [-1, 1]) {
      const p = new THREE.Mesh(sideGeo, st);
      p.position.set(-16 + sx * 1.01, 1.5, -14.9);
      p.rotation.y = (sx * Math.PI) / 2;
      p.receiveShadow = true;
      root.add(p);
    }
    const spot = new THREE.SpotLight(0xffffff, 0, 30, 0.42, 0.7, 2);
    spot.position.set(-16, 1.1, -11.5);
    addLight(spot, 260, new THREE.Vector3(-16, 0.2, 2));
  }

  // ───────────────────────── street furniture ─────────────────────────
  function trashCan(x: number, z: number, tipped = 0) {
    const o: BatchOptions = { shade: 0.42, uv: [3, 1] };
    if (tipped) {
      Wd.cyl(B.metal, x, 0.3, z, 0.3, 0.26, 0.8, o, 12, 0, tipped, Math.PI / 2);
      Wd.cyl(B.metal, x + 0.75, 0.05, z + 0.5, 0.33, 0.33, 0.06, o, 12);
      return;
    }
    Wd.cyl(B.metal, x, 0.4, z, 0.3, 0.26, 0.8, o, 12);
    for (const y of [0.2, 0.62]) Wd.cyl(B.metal, x, y, z, 0.272 + y * 0.05, 0.272 + y * 0.05, 0.04, { shade: 0.3, uv: [3, 1] }, 12);
    Wd.cyl(B.metal, x, 0.84, z, 0.25, 0.33, 0.08, { shade: 0.48, uv: [3, 1] }, 12);
    Wd.cyl(B.metal, x, 0.91, z, 0.05, 0.05, 0.06, o, 6);
  }
  function hydrant(x: number, z: number) {
    const o: BatchOptions = { shade: 0.45, uv: [1, 1] };
    Wd.cyl(B.metal, x, 0.03, z, 0.18, 0.18, 0.06, o, 10);
    Wd.cyl(B.metal, x, 0.33, z, 0.12, 0.14, 0.55, o, 10);
    Wd.cyl(B.metal, x, 0.5, z, 0.16, 0.16, 0.05, o, 10);
    Wd.sph(B.metal, x, 0.61, z, 0.26, 0.24, 0.26, o);
    Wd.cyl(B.metal, x, 0.76, z, 0.04, 0.04, 0.08, o, 6);
    Wd.cyl(B.metal, x, 0.4, z, 0.06, 0.06, 0.42, o, 8, 0, 0, Math.PI / 2);
    Wd.cyl(B.metal, x, 0.36, z + 0.13, 0.075, 0.075, 0.14, o, 8, Math.PI / 2);
  }
  function sacks(x: number, z: number) {
    const o: BatchOptions = { shade: 0.4, uv: [2, 1] };
    for (const [dx, dy, dz, ry] of [[-0.35, 0.19, 0, 0.2], [0.35, 0.19, 0.08, -0.3], [0, 0.19, -0.3, 1.5], [0.02, 0.52, -0.05, 0.5], [-0.3, 0.5, -0.22, 2.2]]) Wd.sph(B.stone, x + dx, dy, z + dz, 0.78, 0.4, 0.52, o, 0, ry);
  }
  function tyres(x: number, z: number, n: number) {
    const o: BatchOptions = { shade: 0.09, uv: [4, 1] };
    for (let i = 0; i < n; i++) Wd.geo(B.metal, S.torusGeo(0.3, 0.12), x + (i % 2) * 0.04, 0.12 + i * 0.235, z, o, 1, 1, 1, Math.PI / 2);
  }

  for (const [x, z, tipped] of TRASH_CANS) trashCan(x, z, tipped);
  for (const [x, z] of HYDRANTS) hydrant(x, z);
  for (const [x, z] of SACKS) sacks(x, z);
  for (const [x, z, n] of TYRES) tyres(x, z, n);
  {
    // cheese wheels waiting for the van
    const o: BatchOptions = { uv: [2, 1], shade: 0.42 };
    for (let i = 0; i < 3; i++) Wd.cyl(B.cheese, -20.9 + (i % 2) * 0.05, 0.11 + i * 0.22, -19.6, 0.45, 0.45, 0.22, o, 16);
    Wd.cyl(B.cheese, -20.25, 0.44, -19.75, 0.45, 0.45, 0.22, o, 16, 0, 0, 1.25);
  }
  {
    // mailbox by the kerb on the east side
    const Q = Wd.sub(19.85, 0, 2.4, -Math.PI / 2), o: BatchOptions = { shade: 0.4, tile: 2 };
    for (const sx of [-0.2, 0.2]) for (const sz of [-0.15, 0.15]) Q.slab(B.metal, sx - 0.025, sx + 0.025, 0, 0.4, sz - 0.025, sz + 0.025, IRON);
    Q.slab(B.metal, -0.26, 0.26, 0.4, 1.05, -0.2, 0.2, o);
    Q.cyl(B.metal, 0, 1.05, 0, 0.2, 0.2, 0.52, { shade: 0.4, uv: [1, 1] }, 12, 0, 0, Math.PI / 2);
    Q.quad(B.shop, 0, 0.74, 0.205, 0.44, 0.44, { cell: shopA.uv.mail });
  }
  {
    // news stand against the east wall, lit from inside
    const K = WALLS.E.sub(8.4, 0, 0), wd: BatchOptions = { tile: 1.6, shade: 0.55 }, bundle: BatchOptions = { cell: shopA.uv.paper };
    K.slab(B.wood, -1.25, 1.25, 0, 1.0, 0.5, 1.05, wd);
    K.slab(B.wood, -1.32, 1.32, 1.0, 1.08, 0.4, 1.2, { tile: 1.6, shade: 0.62 });
    K.slab(B.wood, -1.25, -1.15, 0, 2.5, -0.08, 1.05, wd);
    K.slab(B.wood, 1.15, 1.25, 0, 2.5, -0.08, 1.05, wd);
    K.slab(B.wood, -1.36, 1.36, 2.5, 2.6, -0.08, 1.22, wd);
    K.slab(B.wood, -1.15, 1.15, 1.0, 2.5, -0.08, -0.03, wd);
    K.quad(B.shop, 0, 1.76, -0.02, 2.3, 1.4, { cell: shopA.uv.news });
    awning(K, -1.4, 1.4, 2.6, 1.2, 2.28, 1.85);
    for (const [u, y, d, s] of [[-0.8, 1.17, 0.85, 0.2], [-0.3, 1.14, 0.9, 0.12], [0.35, 1.19, 0.82, 0.22], [0.85, 1.14, 0.9, 0.12]]) K.box(B.shop, u, y, d, 0.4, s, 0.3, bundle, 0, (u * 7) % 0.4);
    K.box(B.shop, -1.62, 0.16, 0.8, 0.45, 0.32, 0.34, bundle, 0, 0.3);
    K.sph(B.bulb, 0, 2.36, 0.6, 0.13, 0.13, 0.13);
    halo(K.world(0, 2.36, 0.6), 1.3, 0.4);
    spills.push(["E", 8.4, 3.6, 3.2, 1.1]);
  }
  {
    // telephone box on the south sidewalk
    const Q = Wd.sub(-5.4, 0, 21.1, Math.PI), wd: BatchOptions = { tile: 1.6, shade: 0.4 }, glass: BatchOptions = { cell: shopA.uv.phone };
    for (const sx of [-0.46, 0.46]) for (const sz of [-0.46, 0.46]) Q.slab(B.wood, sx - 0.05, sx + 0.05, 0, 2.3, sz - 0.05, sz + 0.05, wd);
    Q.slab(B.wood, -0.5, 0.5, 0, 0.08, -0.5, 0.5, wd);
    Q.slab(B.wood, -0.58, 0.58, 2.3, 2.44, -0.58, 0.58, wd);
    Q.slab(B.wood, -0.3, 0.3, 2.44, 2.52, -0.3, 0.3, wd);
    Q.slab(B.wood, -0.46, 0.46, 0.08, 2.3, -0.46, -0.42, wd);
    Q.quad(B.shop, 0, 1.19, 0.45, 0.84, 2.2, glass);
    Q.quad(B.shop, 0.45, 1.19, 0, 0.84, 2.2, glass, 0, Math.PI / 2);
    Q.quad(B.shop, -0.45, 1.19, 0, 0.84, 2.2, glass, 0, -Math.PI / 2);
    spills.push(["S", 5.4, 2.6, 2.6, 1.45]);
  }
  {
    // bench under the east wall
    const Q = WALLS.E.sub(-5.3, 0, 0.5), wd: BatchOptions = { tile: 1.6, shade: 0.7 };
    for (const d of [-0.14, 0, 0.14]) Q.slab(B.wood, -0.9, 0.9, 0.44, 0.48, d - 0.06, d + 0.06, wd);
    for (const y of [0.72, 0.9]) Q.slab(B.wood, -0.9, 0.9, y - 0.06, y + 0.06, -0.26, -0.22, wd);
    for (const u of [-0.75, 0.75]) {
      Q.slab(B.metal, u - 0.03, u + 0.03, 0, 0.44, -0.2, 0.2, IRON);
      Q.slab(B.metal, u - 0.03, u + 0.03, 0.44, 1.0, -0.3, -0.24, IRON);
    }
  }
  {
    // hand cart on the south side
    const Q = Wd.sub(14.7, 0, 20.0, 0.3), wd: BatchOptions = { tile: 1.6, shade: 0.75 }, dk: BatchOptions = { shade: 0.3, uv: [1, 1] };
    Q.slab(B.wood, -0.8, 0.8, 0.62, 0.7, -0.5, 0.5, wd);
    for (const sz of [-0.5, 0.5]) Q.slab(B.wood, -0.8, 0.8, 0.7, 0.9, sz - 0.02, sz + 0.02, wd);
    Q.slab(B.wood, -0.82, -0.78, 0.7, 0.9, -0.5, 0.5, wd);
    for (const sz of [-0.42, 0.42]) Q.slab(B.wood, 0.8, 1.75, 0.6, 0.66, sz - 0.03, sz + 0.03, wd); // handles
    Q.slab(B.wood, -0.7, -0.62, 0, 0.62, -0.04, 0.04, wd); // rest leg
    for (const sz of [-0.58, 0.58]) {
      Q.geo(B.metal, S.torusGeo(0.42, 0.04), 0, 0.46, sz, dk);
      Q.cyl(B.metal, 0, 0.46, sz, 0.07, 0.07, 0.1, dk, 8, Math.PI / 2);
      for (let k = 0; k < 4; k++) Q.box(B.wood, 0, 0.46, sz, 0.82, 0.04, 0.03, { tile: 1.6, shade: 0.5 }, 0, 0, (k * Math.PI) / 4);
    }
    Q.box(B.crate, -0.3, 1.0, 0, 0.6, 0.6, 0.6, { shade: 0.78 }, 0, 0.2);
    Q.cyl(B.cheese, 0.42, 0.81, 0.05, 0.3, 0.3, 0.2, { uv: [2, 1], shade: 0.42 }, 14);
  }
  {
    // ladder leaning on the south wall, planks on the north
    const Q = WALLS.S.sub(-13.2, 0, 0), wd: BatchOptions = { tile: 1.6, shade: 0.8 }, al = -0.3, c = Math.cos(al), s = Math.sin(al);
    for (const u of [-0.22, 0.22]) Q.box(B.wood, u, 1.53, 0.45, 0.05, 3.2, 0.05, wd, al);
    for (let t = -1.35; t <= 1.4; t += 0.3) Q.box(B.wood, 0, 1.53 + t * c, 0.45 + t * s, 0.44, 0.035, 0.035, wd, al);
    const Nw = WALLS.N;
    for (const [u, ry, len] of [[19.4, 0.05, 2.9], [19.75, -0.04, 2.5], [20.1, 0.08, 3.1]]) Nw.box(B.wood, u, (len / 2) * 0.96, 0.32, 0.28, len, 0.05, { tile: 1.6, shade: 0.7 + (u % 1) * 0.2 }, -0.27, 0, ry);
  }
  // meter boxes and junction boxes on a few piers
  for (const [key, u, y] of [["N", -20.4, 1.7], ["N", 12.7, 1.9], ["E", -7.6, 1.8], ["E", 6.8, 1.7], ["S", -16.3, 1.8], ["S", 12.2, 1.9], ["W", -17, 1.7], ["W", 16.4, 1.8]] as const) {
    const P = WALLS[key];
    P.slab(B.metal, u - 0.17, u + 0.17, y - 0.25, y + 0.25, 0.05, 0.17, { shade: 0.3, tile: 2 });
    P.cyl(B.metal, u, y + 1.0, 0.1, 0.025, 0.025, 1.5, IRONC, 6);
  }

  // ───────────────────────── spawn doors (static, shut) ─────────────────────────
  for (const [x, z, wide] of GATES) {
    const nx = Math.abs(x) === A ? -Math.sign(x) : 0, nz = nx ? 0 : -Math.sign(z), w = wide ? 2.1 : 1.3, h = DOOR.h;
    const Q = Wd.sub(x, 0, z, Math.atan2(nx, nz)), frame: BatchOptions = { shade: 0.12, tile: 2 }; // local +z points into the alley
    // the case runs from the recessed doorway (0.5 behind the wall line) out past the piers
    for (const s of [-1, 1]) Q.box(B.metal, s * (w / 2 + 0.085), (h + 0.18) / 2, -0.115, 0.17, h + 0.18, 0.77, frame);
    Q.box(B.metal, 0, h + 0.09, -0.115, w, 0.18, 0.77, frame);
    Q.quad(wide ? B.leafWide : B.leafNarrow, 0, (h + 0.03) / 2, 0.22, w, h - 0.03, { shade: DOOR.tint });
  }

  // ───────────────────────── ground dressing ─────────────────────────
  {
    const flat = -Math.PI / 2, D = decal.uv;
    const lay = (name: string, x: number, z: number, w: number, h: number, spin: number) => Wd.quad(B.decal, x, Math.max(Math.abs(x), Math.abs(z)) > A - 2.7 ? 0.03 : 0.012, z, w, h, { cell: D[name] }, flat, 0, spin);
    for (const [x, z] of MANHOLES) lay("manhole", x, z, 1.15, 1.15, R() * 6);
    for (const [x, z, spin] of [[-6, -18.55, 0], [9, -18.55, 0], [3, 18.55, 0], [-12, 18.55, 0], [18.55, -8, 1.5708], [-18.55, 8, 1.5708]]) lay("grate", x, z, 0.95, 0.95, spin);
    lay("hopscotch", -9, 20.5, 1.7, 1.7, 1.5708);
    for (const [x, z] of [[2.5, -4.5], [-12, -3], [10, 10.5], [-4, 12.5]]) lay("tar", x, z, 2.2 + R(), 2.2 + R(), R() * 6);
    const kinds = ["news0", "news1", "flyer", "scraps", "scraps", "news0"];
    for (let i = 0; i < 24; i++) {
      const x = (R() - 0.5) * 42, z = (R() - 0.5) * 42, m = Math.max(Math.abs(x), Math.abs(z));
      if (Math.abs(m - (A - 2.82)) < 0.6 || Math.hypot(x, z) < 2.6) continue;
      const k = kinds[Math.floor(R() * kinds.length)], s = k === "scraps" ? 0.9 + R() * 0.5 : 0.55 + R() * 0.3;
      lay(k, x, z, s, s, R() * 6.28);
    }
    // puddles: dark mirrors for the lamps and lit windows
    for (const [x, z, w, h, spin] of [[3, 5, 4.2, 2.6, 0.3], [-5, -4, 3.4, 2.4, 1.2], [9, -9, 3.8, 2.6, 2.1], [-11, -14, 3, 2, 0.5], [-13, 5, 3.6, 2.4, 2.6], [6, 15, 4, 2.4, 0.2], [14, 1, 3, 2.2, 1.4],
      [-2, -15, 3.6, 2.2, 0], [16, -15, 3, 2, 0.8], [-16, 14, 3.4, 2.2, 2.2], [0, 17.5, 3, 1.8, 0.1], [-10, -18.55, 9, 1.0, 0], [12, 18.55, 10, 1.0, 0], [18.55, 6, 9, 1.0, 1.5708], [-18.55, -4, 8, 1.0, 1.5708]])
      Wd.quad(B.puddle, x, 0.014, z, w, h, undefined, flat, 0, spin);
    for (const [key, u, w, len, d0] of spills) WALLS[key].quad(B.spill, u, 0.05, d0 + len / 2, w, len, undefined, flat);
  }

  // ───────────────────────── compile the batches ─────────────────────────
  const NO_SHADOW = new Set<MaterialKey>(["win", "shop", "pave", "decal", "bulb", "cone", "spill", "puddle"]);
  const stats = { tris: 0, meshes: 0, lights: nightLights.length };
  for (const k of Object.keys(B) as MaterialKey[]) {
    const flatK = k === "bulb" || k === "cone" || k === "spill";
    const mesh = B[k].build(M[k], !NO_SHADOW.has(k), !flatK);
    if (!mesh) continue;
    mesh.name = `alley-${k}`;
    geometries.push(mesh.geometry);
    root.add(mesh);
    stats.tris += B[k].tris;
    stats.meshes++;
    if (k === "puddle") mesh.renderOrder = -3;
    if (k === "spill") mesh.renderOrder = -2;
  }
  {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(wires, 3));
    geometries.push(g);
    const lines = new THREE.LineSegments(g, ownMat(new THREE.LineBasicMaterial({ color: 0x050505 })));
    lines.name = "alley-wires";
    root.add(lines);
  }

  // ───────────────────────── powder kegs (one instanced mesh) ─────────────────────────
  {
    const kegGeo = new THREE.CylinderGeometry(KEG.radius, KEG.radius, KEG.height, 20);
    geometries.push(kegGeo);
    const kegMat = std({ map: own(Art.tex(Art.kegCanvas())), roughness: 0.6 });
    const kegs = new THREE.InstancedMesh(kegGeo, kegMat, TNT_SPOTS.length);
    const spin = Art.rng(211), mtx = new THREE.Matrix4();
    TNT_SPOTS.forEach(([x, z], i) => {
      kegs.setMatrixAt(i, mtx.compose(_p.set(x, KEG.height / 2, z), _q.setFromEuler(_e.set(0, spin() * 6, 0)), _s.set(1, 1, 1)));
    });
    kegs.instanceMatrix.needsUpdate = true;
    kegs.computeBoundingSphere();
    kegs.castShadow = true;
    kegs.receiveShadow = true;
    kegs.name = "alley-kegs";
    root.add(kegs);
    stats.tris += (kegGeo.index ? kegGeo.index.count / 3 : 0) * TNT_SPOTS.length;
  }

  // ───────────────────────── bulb glows (one instanced quad mesh) ─────────────────────────
  const haloMat = ownMat(
    new THREE.ShaderMaterial({
      uniforms: { map: { value: own(Art.tex(Art.haloCanvas())) }, uOpacity: { value: 0 } },
      vertexShader: HALO_VERTEX,
      fragmentShader: HALO_FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false
    })
  );
  {
    const quad = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute("position", quad.getAttribute("position"));
    g.setAttribute("uv", quad.getAttribute("uv"));
    const centre = new Float32Array(halos.length * 4), bright = new Float32Array(halos.length);
    halos.forEach(([x, y, z, size, b], i) => {
      centre.set([x, y, z, size], i * 4);
      bright[i] = b * LOOK.halo;
    });
    g.setAttribute("aHalo", new THREE.InstancedBufferAttribute(centre, 4));
    g.setAttribute("aBright", new THREE.InstancedBufferAttribute(bright, 1));
    g.instanceCount = halos.length;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 6, 0), A * 1.6);
    geometries.push(g);
    const mesh = new THREE.Mesh(g, haloMat);
    mesh.name = "alley-halos";
    mesh.renderOrder = 1;
    root.add(mesh);
  }

  S.dispose();
  // Draw calls of one copy (without shadow passes): every mesh and line object.
  stats.meshes = 0;
  root.traverse((o) => {
    if ((o as THREE.Mesh).isMesh || (o as THREE.LineSegments).isLineSegments) stats.meshes++;
  });

  const win = M.win as THREE.MeshStandardMaterial, shop = M.shop as THREE.MeshStandardMaterial;
  const cone = M.cone as THREE.MeshBasicMaterial, spill = M.spill as THREE.MeshBasicMaterial, puddle = M.puddle as THREE.MeshStandardMaterial;
  const setNight = (nf: number) => {
    const glow = DAY_GLOW + (1 - DAY_GLOW) * nf;
    win.emissiveIntensity = LOOK.windowGlow * glow;
    shop.emissiveIntensity = LOOK.shopGlow * glow;
    cone.opacity = LOOK.cone * nf;
    spill.opacity = LOOK.spill * nf;
    puddle.opacity = DAY_PUDDLE + (1 - DAY_PUDDLE) * nf;
    haloMat.uniforms.uOpacity.value = nf;
  };
  setNight(0);

  return {
    template: root,
    setNight,
    swayTime,
    stats,
    dispose() {
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    }
  };
}

/** Lights of one placed copy, with their night strength. */
export type AlleyLights = { light: THREE.PointLight | THREE.SpotLight; base: number }[];

/** A copy of the set for one placement. Geometry and materials are shared with the kit. */
export function instantiateAlley(kit: AlleyKit): { object: THREE.Group; lights: AlleyLights; nightMeshes: THREE.Object3D[] } {
  const object = kit.template.clone(true);
  const lights: AlleyLights = [];
  const nightMeshes: THREE.Object3D[] = [];
  const targets: [THREE.SpotLight, number[]][] = [];
  object.traverse((o) => {
    const light = o as THREE.PointLight | THREE.SpotLight;
    if ((light as THREE.Light).isLight && typeof light.userData.alleyBase === "number") {
      lights.push({ light, base: light.userData.alleyBase * LIGHT_SCALE });
      const t = light.userData.alleyTarget as number[] | undefined;
      if (t && (light as THREE.SpotLight).isSpotLight) targets.push([light as THREE.SpotLight, t]);
    }
    if (o.name === "alley-cone" || o.name === "alley-spill" || o.name === "alley-halos") nightMeshes.push(o);
  });
  // A spot light aims at its target object, which must move with the set.
  for (const [spot, t] of targets) {
    const target = new THREE.Object3D();
    target.position.fromArray(t);
    object.add(target);
    spot.target = target;
  }
  return { object, lights, nightMeshes };
}
