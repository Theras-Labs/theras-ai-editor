// The base trees (nature/folio-trees.ts): data integrity, library order and the ids other code names.
import { describe, expect, test } from "bun:test";
import { FOLIO_TREE_MODELS } from "../src/lib/resources/nature/folio-tree-data";
import { FOLIO_TREE_ENTRIES } from "../src/lib/resources/nature/folio-trees";
import { RESOURCES, getResource, searchResources } from "../src/lib/resources/catalog";
import { DEFAULT_STREET_TREE, TREE_ALIASES } from "../src/lib/generators/city/params";
import { composeChoices, validateCompose, type ComposeParams } from "../src/lib/copilot/director/compose";

describe("base tree data", () => {
  test("each trunk mesh is complete: positions, normals and an index inside the vertex range", () => {
    for (const [name, model] of Object.entries(FOLIO_TREE_MODELS)) {
      const vertices = model.trunk.position.length / 3;
      expect({ name, whole: Number.isInteger(vertices) && vertices > 100 }).toEqual({ name, whole: true });
      expect(model.trunk.normal.length).toBe(model.trunk.position.length);
      expect(model.trunk.index.length % 3).toBe(0);
      expect(Math.max(...model.trunk.index)).toBeLessThan(vertices);
      expect(Math.min(...model.trunk.index)).toBe(0);
      // The trunk stands on the ground and is a tree, not a shrub.
      const ys = model.trunk.position.filter((_, i) => i % 3 === 1);
      expect(Math.min(...ys)).toBeGreaterThan(-0.1);
      expect(Math.max(...ys)).toBeCloseTo(model.height, 1);
      expect(model.height).toBeGreaterThan(5);
      expect(model.leaves.length).toBe(6);
      for (const [, y, , scale] of model.leaves) {
        expect(y).toBeGreaterThan(1.5);
        expect(scale).toBeGreaterThan(0.3);
      }
    }
  });
});

describe("base trees in the library", () => {
  test("entries: unique ids, placeable, credited", () => {
    const ids = FOLIO_TREE_ENTRIES.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(RESOURCES.filter((e) => ids.includes(e.id)).length).toBe(ids.length);
    for (const e of FOLIO_TREE_ENTRIES) {
      expect(typeof e.create).toBe("function");
      expect(e.kind).toBe("plant");
      expect(e.license).toBe("MIT");
      expect(e.origin).toContain("Bruno Simon");
      expect(e.footprint).toBeGreaterThan(0.5);
    }
  });

  test("an id is used once in the whole library (the game trees moved to painted ids)", () => {
    const all = RESOURCES.map((e) => e.id);
    expect(new Set(all).size).toBe(all.length);
    expect(getResource("nature:tree:oak-round")?.name).toBe("Oak tree");
    expect(getResource("nature:tree:painted-oak")?.name).toBe("Painted broadleaf tree");
    expect(getResource("nature:tree:painted-birch")).toBeDefined();
  });

  test("'tree' and 'trees' find the base trees first, not the treehouse", () => {
    for (const query of ["tree", "trees"]) {
      const top = searchResources(query, {}, 4);
      expect(top.every((e) => e.tags.includes("basic") && e.tags.includes("tree"))).toBe(true);
      expect(top[0].id).toBe("nature:tree:oak-round");
    }
    expect(searchResources("cherry blossom tree", {}, 1)[0].id).toBe("nature:tree:cherry-blossom");
    expect(searchResources("bush", {}, 1)[0].id).toBe("nature:bush:round");
  });

  test("'Which trees?' offers the base trees first", () => {
    const params = validateCompose({ items: [{ id: "nature:tree:oak-round", count: 5 }] }) as ComposeParams;
    const question = composeChoices(params, {})[0];
    expect(question.id).toBe("tree");
    expect(question.suggested).toBe("nature:tree:oak-round");
    expect(question.options.slice(0, 4).map((o) => o.id)).toEqual(["nature:tree:oak-round", "nature:tree:birch", "nature:tree:cherry-blossom", "nature:tree:fir"]);
  });

  test("every street tree word of the city names a tree that exists", () => {
    expect(getResource(DEFAULT_STREET_TREE)?.tags).toContain("basic");
    for (const [word, id] of Object.entries(TREE_ALIASES)) {
      expect({ word, found: !!getResource(id) }).toEqual({ word, found: true });
    }
    expect(TREE_ALIASES.cherry).toBe("nature:tree:cherry-blossom");
    expect(TREE_ALIASES.pine).toBe("nature:tree:fir");
  });
});
