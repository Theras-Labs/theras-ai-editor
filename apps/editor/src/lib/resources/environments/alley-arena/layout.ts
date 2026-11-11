// The alley arena's fixed layout: arena size, wall frames and prop placements.
// Built from the layout module.
// Collision boxes are not part of this port.
import { Matrix4 } from "three";

/** Arena half-size (m): the street square runs from -A to A on x and z. */
export const A = 22;
/** Ground storey and upper storey heights (m). */
export const G0 = 4.2;
export const FL = 3.3;
/** Manhole covers [x, z]. */
export const MANHOLES: readonly (readonly [number, number])[] = [[4.5, -7], [-7.5, 4.6], [13, 13.5]];

export type WallKey = "N" | "S" | "W" | "E";

/** Wall frames: u runs along the wall (left to right as you face it), d points into the alley. */
export const WALL_RY: Readonly<Record<WallKey, number>> = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

/** The matrix of one wall frame. */
export const wallBase = (key: WallKey): Matrix4 => {
  switch (key) {
    case "N":
      return new Matrix4().makeTranslation(0, 0, -A); // u = x
    case "S":
      return new Matrix4().makeRotationY(Math.PI).setPosition(0, 0, A); // u = -x
    case "W":
      return new Matrix4().makeRotationY(Math.PI / 2).setPosition(-A, 0, 0); // u = -z
    case "E":
      return new Matrix4().makeRotationY(-Math.PI / 2).setPosition(A, 0, 0); // u = z
  }
};

/** Hotel entrance planters on the west wall (u along the wall). */
export const HOTEL_PLANTERS: readonly number[] = [4.35, 7.65];
/** Street lamps [x, z]. */
export const LAMPS: readonly (readonly [number, number])[] = [[-11, -11], [11, -11], [-11, 11], [11, 11]];
/** Crates [x, z, size, y, ry]. The order sets the tint that each crate gets from the seeded stream. */
export const CRATES: readonly (readonly [number, number, number, number, number])[] = [
  [-8, -6, 1.5, 0, 0], [-6.4, -6.4, 1.1, 0, 0], [9, 5, 1.6, 0, 0], [10.5, 6.3, 1.2, 0, 0], [6, -13, 1.5, 0, 0], [-12, 9, 1.6, 0, 0],
  [-13.4, 10.1, 1.1, 0, 0], [15, -4, 1.4, 0, 0], [-3, 15, 1.5, 0, 0], [3, -17, 1.2, 0, 0], [17, 14, 1.6, 0, 0],
  [-7.6, -6.2, 1.0, 1.5, 0.4], [9.4, 5.3, 1.0, 1.6, 0.7], [-12.3, 9.3, 0.9, 1.6, 0.2],
  // stacks against the walls
  [-21.15, -21.3, 1.0, 0, 0], [-21.15, -21.3, 0.7, 1.0, 0.3],
  [20.7, 21.2, 1.1, 0, 0], [20.75, 21.15, 0.8, 1.1, -0.25], [19.6, 21.35, 0.8, 0, 0],
  [-19.4, 21.35, 0.9, 0, 0], [21.3, 19.2, 0.9, 0, 0]
];
/** Barrels [x, z]: the open ones, then those against the walls. */
export const BARRELS: readonly (readonly [number, number])[] = [
  [-10, -7.4], [8, 7.6], [12, -10], [-15, 3], [4, 13], [-5, -16], [16, 11.6], [12.9, -9.2],
  [-1.75, -21.72], [1.75, -21.72], [20.9, -21.3], [-21.4, 15.2], [-21.3, 16.25]
];
/** Plank barricades [x, z, ry]. */
export const BARRICADES: readonly (readonly [number, number, number])[] = [[0, 9, 0], [-4, -10, 0], [7, -4, Math.PI / 2], [-9, 2, Math.PI / 2]];
/** Trash cans [x, z, tipped]: a tipped one lies on its side about that yaw. */
export const TRASH_CANS: readonly (readonly [number, number, number])[] = [
  [-9.6, -21.4, 0], [-8.8, -21.35, 0], [-7.9, -20.55, 0.5], [21.4, 16.5, 0], [21.35, 17.35, 0],
  [-11.6, 21.4, 0], [-21.35, 13.7, 0], [12.45, 21.4, 0], [-21.4, 6.6, 0]
];
export const HYDRANTS: readonly (readonly [number, number])[] = [[16.3, -19.75]];
export const SACKS: readonly (readonly [number, number])[] = [[13.8, -21.2], [-20.7, 21.2]];
/** Tyre stacks [x, z, count]. */
export const TYRES: readonly (readonly [number, number, number])[] = [[21.3, 20.15, 3], [20.3, 20.05, 1]];

/** Spawn doors [x, z, wide]: each stands on one of the doorways; the wall it is on gives the facing. */
export const GATES: readonly (readonly [number, number, number?])[] = [
  [0, -A], [A, 2.3], [-A, -6, 1], [3.05, A], [-A, 17.9], [A, -8.5], [-A, -17.4], [17.25, A]
];
/** h: leaf height; tint: the leaf's shade. */
export const DOOR = { h: 2.72, tint: 0.56 } as const;

/** Powder keg spots [x, z]. */
export const TNT_SPOTS: readonly (readonly [number, number])[] = [
  [5, 5], [-6.5, 7.5], [12.5, -2], [-13, -5], [2, -9], [-2, 18], [7.4, 2.6], [-15.6, -7.4], [4.4, -10.8]
];
export const KEG = { radius: 0.42, height: 1.05 } as const;
