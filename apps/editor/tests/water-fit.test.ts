// fitWater: a water disk on uneven ground must keep its rim on or under the ground.
import { describe, expect, test } from "bun:test";
import { fitWater, WATER_LEVEL } from "../src/lib/resources/layout";

describe("fitWater", () => {
  test("flat ground: a thin sheet at full size", () => {
    const fit = fitWater(0, 0, 16, () => -13.5);
    expect(fit).not.toBeNull();
    expect(fit!.scale).toBe(1);
    expect(fit!.y).toBeCloseTo(-13.485, 3);
  });

  test("a bowl: the level is under the lowest rim point, and the middle is deeper", () => {
    const bowl = (x: number, z: number) => 0.02 * (x * x + z * z) - 2;
    const fit = fitWater(0, 0, 8, bowl)!;
    expect(fit.scale).toBe(1);
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      expect(bowl(Math.sin(a) * 8, Math.cos(a) * 8)).toBeGreaterThanOrEqual(fit.y);
    }
    expect(fit.y).toBeGreaterThan(bowl(0, 0));
  });

  test("a plain slope has no hollow: no water", () => {
    expect(fitWater(0, 0, 16, (x) => x * 0.2)).toBeNull();
  });

  test("a small hollow on a slope: a smaller water", () => {
    const ground = (x: number, z: number) => x * 0.2 - 1.5 * Math.exp(-(x * x + z * z) / 8);
    const fit = fitWater(0, 0, 16, ground)!;
    expect(fit.scale).toBeLessThan(1);
    expect(fit.y).toBeGreaterThan(ground(0, 0));
  });

  test("no land under the anchor: the lake level", () => {
    expect(fitWater(0, 0, 16, () => null)).toEqual({ y: WATER_LEVEL, scale: 1 });
  });
});
