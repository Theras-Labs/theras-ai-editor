import { describe, expect, test } from "bun:test";
import { localizeTransform, makeTransform, resolveSceneGraph, vec3 } from "./utils";
import type { Entity, GeometryNode } from "./types";

describe("scene graph transforms", () => {
  test("resolves nested node and entity world transforms recursively", () => {
    const root = {
      data: {},
      id: "node:group:root",
      kind: "group",
      name: "Root Group",
      transform: {
        position: vec3(10, 0, 0),
        rotation: vec3(0, Math.PI / 2, 0),
        scale: vec3(2, 2, 2)
      }
    } satisfies GeometryNode;
    const child = {
      data: {},
      id: "node:group:child",
      kind: "group",
      name: "Child Group",
      parentId: root.id,
      transform: makeTransform(vec3(1, 0, 0))
    } satisfies GeometryNode;
    const entity = {
      id: "entity:spawn",
      name: "Spawn",
      parentId: child.id,
      properties: {},
      transform: makeTransform(vec3(0, 0, 3)),
      type: "player-spawn"
    } satisfies Entity;

    const resolved = resolveSceneGraph([root, child], [entity]);
    const childWorld = resolved.nodeWorldTransforms.get(child.id)!;
    const entityWorld = resolved.entityWorldTransforms.get(entity.id)!;

    expect(childWorld.position.x).toBeCloseTo(10, 5);
    expect(childWorld.position.y).toBeCloseTo(0, 5);
    expect(childWorld.position.z).toBeCloseTo(-2, 5);
    expect(entityWorld.position.x).toBeCloseTo(16, 5);
    expect(entityWorld.position.y).toBeCloseTo(0, 5);
    expect(entityWorld.position.z).toBeCloseTo(-2, 5);
  });

  test("re-localizes a dragged child transform against its parent", () => {
    const parent = {
      position: vec3(5, 0, -3),
      rotation: vec3(0, Math.PI / 2, 0),
      scale: vec3(2, 2, 2)
    };
    const childWorld = {
      position: vec3(5, 4, -5),
      rotation: vec3(0, Math.PI / 2, 0),
      scale: vec3(2, 2, 2)
    };

    const local = localizeTransform(childWorld, parent);

    expect(local.position.x).toBeCloseTo(1, 5);
    expect(local.position.y).toBeCloseTo(2, 5);
    expect(local.position.z).toBeCloseTo(0, 5);
  });
});
