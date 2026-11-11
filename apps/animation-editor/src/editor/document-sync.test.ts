import type { ImportedPreviewClip } from "./preview-assets";
import { synchronizeAnimationDocument } from "./document-sync";

declare const describe: (name: string, body: () => void) => void;
declare const it: (name: string, body: () => void) => void;
declare const expect: (value: unknown) => {
  toEqual(expected: unknown): void;
};

function createImportedClip(id: string, name: string): ImportedPreviewClip {
  return {
    id,
    name,
    duration: 1,
    source: "character.glb",
    asset: {
      id,
      name,
      duration: 1,
      tracks: []
    },
    reference: {
      id,
      name,
      duration: 1,
      source: "character.glb"
    }
  };
}

describe("synchronizeAnimationDocument", () => {
  it("backfills clip ids for nodes from imported clips", () => {
    const document = synchronizeAnimationDocument(
      {
        version: 1,
        name: "Locomotion",
        entryGraphId: "graph-main",
        parameters: [],
        clips: [],
        masks: [],
        graphs: [
          {
            id: "graph-main",
            name: "Main",
            outputNodeId: "out",
            edges: [],
            nodes: [
              {
                id: "walk-node",
                name: "Walk",
                kind: "clip",
                clipId: "",
                speed: 1,
                loop: true,
                inPlace: false,
                position: { x: 0, y: 0 }
              },
              {
                id: "run-node",
                name: "Run",
                kind: "clip",
                clipId: "",
                speed: 1,
                loop: true,
                inPlace: false,
                position: { x: 0, y: 80 }
              },
              {
                id: "out",
                name: "Output",
                kind: "output",
                sourceNodeId: "walk-node",
                position: { x: 120, y: 0 }
              }
            ]
          }
        ],
        layers: [
          {
            id: "layer-base",
            name: "Base",
            graphId: "graph-main",
            weight: 1,
            blendMode: "override",
            rootMotionMode: "full",
            enabled: true
          }
        ]
      },
      [createImportedClip("walk", "Walk"), createImportedClip("run", "Run")]
    );

    expect(document.clips).toEqual([
      { id: "walk", name: "Walk", duration: 1, source: "character.glb" },
      { id: "run", name: "Run", duration: 1, source: "character.glb" }
    ]);
    expect(document.graphs[0]?.nodes[0]).toEqual({
      id: "walk-node",
      name: "Walk",
      kind: "clip",
      clipId: "walk",
      speed: 1,
      loop: true,
      inPlace: false,
      position: { x: 0, y: 0 }
    });
    expect(document.graphs[0]?.nodes[1]).toEqual({
      id: "run-node",
      name: "Run",
      kind: "clip",
      clipId: "run",
      speed: 1,
      loop: true,
      inPlace: false,
      position: { x: 0, y: 80 }
    });
  });

  it("repairs stale clip ids when the node name still matches an imported clip", () => {
    const document = synchronizeAnimationDocument(
      {
        version: 1,
        name: "Locomotion",
        entryGraphId: "graph-main",
        parameters: [],
        clips: [{ id: "old-walk", name: "Walk", duration: 0.5 }],
        masks: [],
        graphs: [
          {
            id: "graph-main",
            name: "Main",
            outputNodeId: "out",
            edges: [],
            nodes: [
              {
                id: "walk-node",
                name: "Walk",
                kind: "clip",
                clipId: "old-walk",
                speed: 1,
                loop: true,
                inPlace: false,
                position: { x: 0, y: 0 }
              },
              {
                id: "out",
                name: "Output",
                kind: "output",
                sourceNodeId: "walk-node",
                position: { x: 120, y: 0 }
              }
            ]
          }
        ],
        layers: [
          {
            id: "layer-base",
            name: "Base",
            graphId: "graph-main",
            weight: 1,
            blendMode: "override",
            rootMotionMode: "full",
            enabled: true
          }
        ]
      },
      [createImportedClip("walk", "Walk")]
    );

    expect(document.clips).toEqual([
      { id: "old-walk", name: "Walk", duration: 0.5 },
      { id: "walk", name: "Walk", duration: 1, source: "character.glb" }
    ]);
    expect(document.graphs[0]?.nodes[0]).toEqual({
      id: "walk-node",
      name: "Walk",
      kind: "clip",
      clipId: "walk",
      speed: 1,
      loop: true,
      inPlace: false,
      position: { x: 0, y: 0 }
    });
  });
});