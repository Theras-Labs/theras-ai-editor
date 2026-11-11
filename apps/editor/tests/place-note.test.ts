// The object builder says where it put a thing when the asked place was not free.
import { describe, expect, test } from "bun:test";
import { placeNote } from "../src/lib/copilot/director/generators/object";

describe("placeNote", () => {
  test("no sentence when the object stands at the asked place or right beside it", () => {
    expect(placeNote({ x: 0, z: 0 }, { x: 0, z: 0 }, 1)).toBe("");
    expect(placeNote({ x: 0, z: 0 }, { x: 2, z: 1 }, 1)).toBe("");
    // A big object may stand farther from the point: its own size counts.
    expect(placeNote({ x: 0, z: 0 }, { x: 7, z: 0 }, 5)).toBe("");
  });

  test("distance and direction when it stands away (north is -z, east is +x)", () => {
    expect(placeNote({ x: 0, z: 0 }, { x: 12, z: 0 }, 1)).toContain("12 m to the east");
    expect(placeNote({ x: 0, z: 0 }, { x: 0, z: 9 }, 1)).toContain("9 m to the south");
    expect(placeNote({ x: 0, z: 0 }, { x: 0, z: -9 }, 1)).toContain("9 m to the north");
    expect(placeNote({ x: 5, z: 5 }, { x: -5, z: -5 }, 1)).toContain("14 m to the north-west");
    expect(placeNote({ x: 0, z: 0 }, { x: -20, z: 0 }, 1)).toContain("was not free");
  });
});
