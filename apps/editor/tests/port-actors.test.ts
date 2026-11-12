// Tests for the port machines: the rifle, the drone and the robot hound. The surfaces are
// drawn on the graphics card, so a test cannot build a model; it checks the library data, that
// an entry is safe with no renderer, and that the original scene module exports the builders it calls.
// Run: cd apps/editor && bun test tests/port-actors.test.ts
import { describe, expect, test } from "bun:test";
import { getResource } from "../src/lib/resources/catalog";
import { PROCEDURAL_TAG } from "../src/lib/resources/port";
import { PORT_ACTOR_ENTRIES } from "../src/lib/resources/port/actors";

const IDS = ["proc:rifle", "proc:drone", "proc:hound"];

describe("Port machines in the library", () => {
  test("the three entries are in the catalog with the tags and the credit", () => {
    expect(PORT_ACTOR_ENTRIES.map((e) => e.id)).toEqual(IDS);
    for (const id of IDS) {
      const entry = getResource(id);
      expect(entry, id).toBeDefined();
      expect(entry!.kind).toBe("feature");
      expect(entry!.category).toBe("Procedural: machines");
      expect(entry!.tags).toContain(PROCEDURAL_TAG);
      expect(entry!.tags).toContain("harbor");
      expect(entry!.source).toBe("local");
      expect(entry!.origin).toBe("Claude Fable 5.2");
      expect(entry!.creditUrl).toContain("claude.ai/artifact/");
      expect(entry!.license).toContain("Claude Fable 5.2");
      expect(entry!.footprint).toBeGreaterThan(0.3);
      expect(entry!.footprint).toBeLessThan(1);
    }
    expect(getResource("proc:rifle")!.name).toBe("Rifle PAC-9");
  });

  test("an entry with no renderer gives an empty object and does not throw", async () => {
    for (const id of IDS) {
      const instance = getResource(id)!.create!(3, { appear: false });
      expect(instance.object.children.length).toBe(0);
      await instance.ready;
      instance.update?.({ dt: 0.016, time: 1, night: 0 });
      instance.dispose?.();
    }
  });

  test("the game module exports the builders that the entries call", async () => {
    const game = await import("../src/vendor/port/game.js");
    for (const name of ["buildRifleGeometry", "patchRifleMaterial", "buildRifleMarkings", "buildRifleLens", "buildDroneRig", "buildHoundRig", "assembleRig", "solveHoundLeg"] as const) {
      expect(typeof game[name], name).toBe("function");
    }
    expect(game.RIFLE_RAIN.value).toBeTypeOf("number");
    expect(game.RIFLE_SPEC.magPos).toHaveLength(3);
    expect(game.DRONE_SPEC.rotors).toHaveLength(4);
    expect(game.HOUND_SPEC.legs).toEqual(["FL", "FR", "RL", "RR"]);
    expect(game.ROBOT_LENS_COLOR).toHaveLength(3);
  });

  test("the drone and the hound rigs build without a renderer, with new geometry each time", async () => {
    // The rig builders make geometry only (no texture, no canvas), so they run in a test.
    const game = await import("../src/vendor/port/game.js");
    const a = game.buildDroneRig();
    const b = game.buildDroneRig();
    expect(a.geometry).not.toBe(b.geometry);
    expect(a.slots).toEqual(["shell", "metal", "glow", "lens"]);
    expect(a.extra.slots).toEqual(["disc", "cone"]);
    expect(a.bones.map((x) => x.name)).toContain("rotor3");
    const hound = game.buildHoundRig();
    expect(hound.bones.map((x) => x.name)).toContain("shinRR");
    // A standing leg: the solver reaches the ground with the knee bent (not at full reach).
    const s = game.HOUND_SPEC;
    const ik = game.solveHoundLeg({ abd: 0, hip: 0, knee: 0, reach: 0 }, s.footX - s.hipX, s.footR * 0.6 - s.stand - s.hipY, s.footZ[0]! - s.hipZ, 1, s.l0, s.L1, s.L2 - s.footR * 0.6);
    expect(ik.reach).toBeLessThan(1);
    expect(ik.knee).toBeLessThan(0);
    for (const def of [a, a.extra, b, b.extra, hound]) def.geometry.dispose();
  });
});
