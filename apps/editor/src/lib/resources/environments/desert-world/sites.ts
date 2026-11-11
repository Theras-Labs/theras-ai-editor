// Named places of the desert world, in the world coordinates (meters, y up).
// The library entry shows one crop of this world (see REGION in region.ts).
import * as THREE from "three";

export const ROSE_HOUSE = { x: 550, z: 376, r: 34 };

export type DesertSite = { x: number; z: number; r: number; yaw?: number; calm?: boolean };

/** Landmark sites. Calm sites flatten the dunes. The key order is the scatter order. */
export const DESERT_SITES: Record<"carcass" | "wreck" | "camp" | "sails" | "canyon" | "umbrellas" | "petals" | "lagoons" | "dishes", DesertSite> = {
  carcass: { x: -700, z: -660, r: 100, yaw: 0.55 },
  wreck: { x: -110, z: 760, r: 85, yaw: -0.5 },
  camp: { x: -44, z: 30, r: 9, yaw: 0.4 },
  sails: { x: -170, z: 360, r: 42, yaw: 2.4 },
  canyon: { x: 620, z: 690, r: 150, yaw: 0.35, calm: true },
  umbrellas: { x: 1060, z: 420, r: 70, yaw: 0, calm: true },
  petals: { x: -850, z: 120, r: 52, yaw: 0.2, calm: true },
  lagoons: { x: -1060, z: 520, r: 150 },
  dishes: { x: 640, z: -1070, r: 90, yaw: 0, calm: true }
};

export const TELEGRAPH: [[number, number], [number, number]] = [
  [-885, 165],
  [-1010, 430]
];

/** The oasis city and the places around it. The city itself is not part of this port. */
export const QANAT_SITES = {
  city: { x: 230, z: 400, r: 66, yaw: Math.atan2(-230, -400) },
  camps: { x: 168, z: 292, r: 40 },
  giant: { x: 318, z: 530, r: 30, yaw: Math.atan2(-88, -130) },
  pilgrim: { x: 8, z: 218 },
  drum: { x: 156.65, z: -187.6 },
  bike: { x: 132, z: 150, yaw: 2.3 },
  lookout: { x: 165, z: 182 },
  rag: { x: 115, z: 172, h: 28, w: 5, fh: 10, pennant: 11 },
  hearth: { x: 1650, z: -450, r: 46, yaw: 0 }
};

/** The observatory east of the camp (it only calms the dunes here). */
export const OBSERVATORY = { x: 800, z: 200, radius: 65 };

/** The marked stones from the city toward the hearth, every 150 m from 340 m. */
export function markedStones(): [number, number][] {
  const a = QANAT_SITES.city;
  const b = QANAT_SITES.hearth;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const out: [number, number][] = [];
  for (let d = 340; d < len - 90; d += 150) {
    const f = d / len;
    const side = Math.sin(d * 0.011) * 14;
    out.push([a.x + dx * f - (dz / len) * side, a.z + dz * f + (dx / len) * side]);
  }
  return out;
}

const WAY_SPEC: Record<string, { stone: number; side: number; along?: number }> = {
  bowl: { stone: 1, side: 2.8 },
  camp: { stone: 4, side: -5.5 },
  bell: { stone: 7, side: 3.4, along: 18 }
};

export function keepersWay(): { x: number; z: number }[] {
  const a = QANAT_SITES.city;
  const b = QANAT_SITES.hearth;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const stones = markedStones();
  return Object.values(WAY_SPEC).map((s) => {
    const [x, z] = stones[s.stone];
    const along = s.along ?? 0;
    return { x: x + (dx / len) * along - (dz / len) * s.side, z: z + (dz / len) * along + (dx / len) * s.side };
  });
}

export const RIDE_SPEC: Record<string, { f: number; side: number }> = {
  shade: { f: 0.3, side: 9 },
  anchor: { f: 0.455, side: -7 },
  wreck: { f: 0.61, side: -12 },
  tusks: { f: 0.81, side: 0 }
};

export function ridePoints(): { x: number; z: number }[] {
  const a = QANAT_SITES.bike;
  const b = QANAT_SITES.hearth;
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  return Object.values(RIDE_SPEC).map((s) => ({ x: a.x + dx * s.f - (dz / len) * s.side, z: a.z + dz * s.f + (dx / len) * s.side }));
}

export type ChannelSpec = { points: [number, number][]; bed: number; bank: number; depth: number; fade?: number; step?: number };

/** The "dry wash" channel. */
export const DRY_WASH: ChannelSpec = {
  points: [
    [1085, -175],
    [1015, -140],
    [945, -100],
    [880, -62],
    [815, -60],
    [735, -40],
    [655, 45],
    [575, 85],
    [495, 120],
    [415, 150],
    [340, 168]
  ],
  bed: 6,
  bank: 28,
  depth: 4.5
};

/** The giants' road pieces. */
export const GIANTS = { hand: { x: 432, z: 192, yaw: 0.35 } };

/** The "hollow" channel. */
export const HOLLOW: ChannelSpec = {
  points: [
    [170, 100],
    [255, 45],
    [340, -45],
    [430, -72],
    [520, -66],
    [600, -45]
  ],
  bed: 7,
  bank: 14,
  depth: 1.2
};

/** Ruins that the walking dunes let go of. */
export const DUNE_RUINS = [
  { id: "stair", x: 305, z: 46, yaw: -1 },
  { id: "tower", x: 480, z: -125, yaw: 0.3 },
  { id: "caravan", x: 900, z: -232, yaw: 1.1 },
  { id: "arcade", x: 1180, z: -382, yaw: 0.6 }
];
/** The dune that covers a ruin sits this far downwind of an open ruin. */
export const RUIN_OFFSET = { dx: 32, dz: 12 };

export const SANDFALL_MESAS = [
  { mesa: [605, 194] as [number, number], toward: [640, 60] as [number, number], w: 18, seed: 3 },
  { mesa: [791, -197] as [number, number], toward: [800, -100] as [number, number], w: 18, seed: 7 }
];

/** The salt pan disc. */
export const SALT_PAN = { x: 295, z: 195, r: 48, fade: 60 };

/** Qanat well points from the giant's hand toward the city, at 26 to 202 m. */
export const HAND_TO_CITY: [number, number][] = (() => {
  const a = GIANTS.hand;
  const b = QANAT_SITES.city;
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  return [26, 70, 114, 158, 202].map((d) => [a.x + ((b.x - a.x) * d) / len, a.z + ((b.z - a.z) * d) / len] as [number, number]);
})();

/** Stranded boats in the dry wash: [distance along the wash, side offset, turn]. */
export const BOATS: [number, number, number][] = [
  [300, 8.5, 0.5],
  [610, -9, 2.2]
];

const PROCESSION: [number, number][] = [
  [100, 252],
  [62, 330],
  [40, 420],
  [70, 520],
  [150, 600],
  [262, 640],
  [372, 610],
  [420, 520],
  [400, 418],
  [376, 306],
  [330, 222],
  [228, 196],
  [170, 206],
  [125, 222]
];

/** The procession loop round the city, sampled every `step` m on a closed centripetal curve. */
export function processionLoop(step = 3): [number, number][] {
  const curve = new THREE.CatmullRomCurve3(
    PROCESSION.map(([x, z]) => new THREE.Vector3(x, 0, z)),
    true,
    "centripetal"
  );
  const n = Math.ceil(curve.getLength() / step);
  return curve
    .getSpacedPoints(n)
    .slice(0, n)
    .map((p) => [p.x, p.z] as [number, number]);
}

/** An elliptic wedge in front of and behind a heading. True inside. */
export function vistaWedge(at: { x: number; z: number; heading: number }, { width = 120, front = 240, back = 160 } = {}) {
  const s = Math.sin(at.heading);
  const c = Math.cos(at.heading);
  return (x: number, z: number, pad = 0) => {
    const dx = x - at.x;
    const dz = z - at.z;
    const side = dx * c - dz * s;
    const along = dx * s + dz * c;
    return (side / (width + pad)) ** 2 + (along / ((along > 0 ? front : back) + pad)) ** 2 < 1;
  };
}

/** The ship's landing site: the start point of the world. */
export const START = (() => {
  const x = 140.7;
  const z = 244.6;
  const heading = Math.atan2(195.1 - 140.7, 339.3 - 244.6);
  return { x: x + Math.sin(heading) * 8, z: z + Math.cos(heading) * 8, heading };
})();

/** The pilgrims' road cairns (after the controlled landing) and the resting stone. */
export const ROAD_POINTS: [number, number][] = [
  [168, 352],
  [128, 340],
  [90, 318],
  [55, 290],
  [28, 255],
  [16, 226],
  [4, 192],
  [36, 214],
  [70, 238],
  [100, 256],
  [114, 266]
];
export const REST_STONE = { x: 10, z: 178 };

/** The field-stone site (after the controlled landing). */
export const FIELD_STONE = { x: 406, z: 392, toward: [518, 378] as [number, number] };
