// How each library entry is made (resources/make.ts): by code ("Procedural") or from asset files ("Sample file").
import { describe, expect, test } from "bun:test";
import { RESOURCES, getResource } from "../src/lib/resources/catalog";
import { assetMake, countByMake, makeLabel } from "../src/lib/resources/make";
import { PROCEDURAL_TAG, PORT_PLACE_ENTRIES, PORT_PROP_ENTRIES, PORT_SKY_ENTRIES } from "../src/lib/resources/port";
import { KIT_ENTRIES } from "../src/lib/resources/models/kits";
import { CREATURE_ENTRIES } from "../src/lib/resources/models/creatures";
import { LH_FEATURE_ENTRIES, LH_LANDMARK_ENTRIES } from "../src/lib/resources/little-habitats/props";
import { FOLIO_TREE_ENTRIES } from "../src/lib/resources/nature/folio-trees";
import { GENERATED_ENTRIES } from "../src/lib/resources/generated";

function entry(id: string) {
  const e = getResource(id);
  if (!e) throw new Error(`no entry ${id}`);
  return e;
}

describe("assetMake", () => {
  test("every Port entry is code", () => {
    const port = [...PORT_PROP_ENTRIES, ...PORT_PLACE_ENTRIES, ...PORT_SKY_ENTRIES];
    expect(port.length).toBeGreaterThan(30);
    for (const e of port) expect({ id: e.id, make: assetMake(e) }).toEqual({ id: e.id, make: "code" });
  });

  test("the tag procedural always gives code", () => {
    const e = { ...entry("polyhaven:hdri:satara_night_no_lamps"), tags: [PROCEDURAL_TAG] };
    expect(assetMake(e)).toBe("code");
  });

  test("model kits, people, creatures and external skies are files", () => {
    expect(KIT_ENTRIES.length).toBeGreaterThan(0);
    for (const e of KIT_ENTRIES) expect({ id: e.id, make: assetMake(e) }).toEqual({ id: e.id, make: "files" });
    for (const e of CREATURE_ENTRIES) expect({ id: e.id, make: assetMake(e) }).toEqual({ id: e.id, make: "files" });
    expect(assetMake(entry("creature:person"))).toBe("files");
    expect(assetMake(entry("vehicle:caravan-ship"))).toBe("files");
    expect(assetMake(entry("polyhaven:hdri:satara_night_no_lamps"))).toBe("files");
    expect(assetMake(entry("env:alley-arena"))).toBe("files");
  });

  test("external entries are files", () => {
    for (const e of RESOURCES.filter((r) => r.source === "external")) expect(assetMake(e)).toBe("files");
  });

  test("Island kit props, base trees and generated entries are code", () => {
    for (const e of [...LH_LANDMARK_ENTRIES, ...LH_FEATURE_ENTRIES, ...FOLIO_TREE_ENTRIES, ...GENERATED_ENTRIES]) {
      expect({ id: e.id, make: assetMake(e) }).toEqual({ id: e.id, make: "code" });
    }
    expect(assetMake(entry("env:desert-ruins"))).toBe("code");
  });

  test("the counts add up to the catalog size", () => {
    const counts = countByMake(RESOURCES);
    expect(counts.code + counts.files).toBe(RESOURCES.length);
    expect(counts.code).toBeGreaterThan(0);
    expect(counts.files).toBeGreaterThan(0);
  });

  test("labels", () => {
    expect(makeLabel("code")).toBe("Procedural");
    expect(makeLabel("files")).toBe("Sample file");
  });
});
