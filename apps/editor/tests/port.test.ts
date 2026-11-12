// Tests for the port scene: the procedural props, the yard, the dusk sky and the template.
// The surfaces are drawn on the graphics card, so a test cannot build a prop; it checks that the
// library data agrees with the original table and that an entry is safe with no renderer.
// Run: cd apps/editor && bun test tests/port.test.ts
import { describe, expect, test } from "bun:test";
import { getResource, searchResources } from "../src/lib/resources/catalog";
import { PROCEDURAL_TAG, PORT_PLACE_ENTRIES, PORT_PROP_ENTRIES, PORT_SKY_ENTRIES, PORT_SKY_ID, PORT_YARD_ID, portId } from "../src/lib/resources/port";
import { YARD_GROUND, YARD_PLAY, YARD_START } from "../src/lib/resources/port/yard";
import { PROCEDURAL_GROUP, SCENE_TEMPLATES, templateAvailable } from "../src/lib/resources/templates";

describe("Port props in the library", () => {
  test("each prop of the game's table is an entry with the same size", async () => {
    const game = await import("../src/vendor/port/game.js");
    const names = Object.keys(game.PROP_SIZES);
    expect(names.length).toBe(36);
    expect(PORT_PROP_ENTRIES.length).toBe(names.length);
    for (const name of names) {
      const entry = getResource(portId(name));
      expect(entry, name).toBeDefined();
      const [x, y, z] = game.PROP_SIZES[name]!;
      expect(entry!.description).toContain(`${x} x ${y} x ${z} m`);
      expect(entry!.footprint).toBeCloseTo(Math.hypot(x, z) / 2, 1);
    }
  });

  test("entries are marked as made by code, with the credit", () => {
    const ids = new Set(PORT_PROP_ENTRIES.map((e) => e.id));
    expect(ids.size).toBe(PORT_PROP_ENTRIES.length);
    for (const entry of [...PORT_PROP_ENTRIES, ...PORT_PLACE_ENTRIES, ...PORT_SKY_ENTRIES]) {
      expect(entry.tags).toContain(PROCEDURAL_TAG);
      expect(entry.source).toBe("local");
      expect(entry.origin).toBe("Claude Fable 5.2");
      expect(entry.creditUrl).toContain("claude.ai/artifact/");
      expect(entry.license).toContain("Claude Fable 5.2");
    }
  });

  test("search finds the props by plain words", () => {
    const first = (query: string) => searchResources(query, {}, 5).map((e) => e.id);
    expect(first("shipping container")).toContain("proc:container40");
    expect(first("traffic cone")).toContain("proc:traffic-cone");
    expect(first("forklift")).toContain("proc:forklift");
    expect(first("flood light")).toContain("proc:floodlight-stand");
  });

  test("an entry with no renderer gives an empty object and does not throw", async () => {
    const entry = getResource("proc:container40")!;
    const instance = entry.create!(7, { appear: false });
    expect(instance.object.children.length).toBe(0);
    await instance.ready;
    instance.update?.({ dt: 0.016, time: 0, night: 0 });
    instance.dispose?.();
  });
});

describe("the port yard, sky and template", () => {
  test("the yard is a place and the sky is a sky that builds itself", () => {
    const yard = getResource(PORT_YARD_ID)!;
    expect(yard.kind).toBe("environment");
    expect(yard.create).toBeDefined();
    const sky = getResource(PORT_SKY_ID)!;
    expect(sky.kind).toBe("sky");
    expect(sky.sky).toBeDefined();
    expect(sky.environment).toBeUndefined();
  });

  test("the land is inside the apron, and the start looks down the lane toward the sun (+x)", () => {
    expect(YARD_PLAY.x0).toBeGreaterThanOrEqual(YARD_GROUND.x0);
    expect(YARD_PLAY.z0).toBeGreaterThanOrEqual(YARD_GROUND.z0);
    expect(YARD_PLAY.z1).toBeLessThanOrEqual(YARD_GROUND.z1);
    expect(YARD_START.target.x).toBeGreaterThan(YARD_START.position.x);
  });

  test("the procedural template is the first one and it is ready", () => {
    const first = SCENE_TEMPLATES[0]!;
    expect(first.id).toBe("port-yard");
    expect(first.group).toBe(PROCEDURAL_GROUP);
    expect(first.sky).toBe(PORT_SKY_ID);
    expect(first.environment?.resource).toBe(PORT_YARD_ID);
    expect(templateAvailable(first)).toBe(true);
    // The sun and the lamps are very bright values: a strong bloom whites out the view.
    expect(first.postFx?.bloom).toBeLessThan(0.1);
  });
});
