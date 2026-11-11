# Animation Graph Architecture

## Overview

The animation stack is split into reusable packages under `@theras/*` with three hard boundaries:

1. Authoring lives in the editor document model.
2. Shipping/runtime data lives in a compiled graph format.
3. Evaluation happens in pure runtime packages with no React dependency.

The editor app is only a shell that hosts the React workspace. Compiler, schema, runtime, and bridge logic live in packages.

## Package Tree

```text
apps/
  animation-editor/

packages/
  anim-utils/
  anim-schema/
  anim-core/
  anim-runtime/
  anim-three/
  anim-compiler/
  anim-exporter/
  anim-editor-core/
  anim-editor-react/
```

## Responsibilities

- `@theras/anim-schema`
  Defines the stable editor document schema, compiled graph schema, and versioned export artifact schema with Zod validation.
- `@theras/anim-core`
  Owns rigs, pose buffers, bone masks, clip sampling, pose blending, additive blending, and root motion helpers.
- `@theras/anim-runtime`
  Evaluates compiled graphs into typed-array pose buffers. Supports parameters, clip nodes, subgraphs, state machines, 1D/2D blend nodes, layers, masks, and root motion output.
- `@theras/anim-three`
  Bridges Three.js `Skeleton` and `AnimationClip` into the core/runtime model and applies evaluated poses back to bones.
- `@theras/anim-compiler`
  Validates editor documents, resolves references, compiles masks, indexes runtime nodes, assigns state machine runtime ids, and emits deterministic compiled graphs plus diagnostics.
- `@theras/anim-exporter`
  Wraps compiled graphs in a versioned artifact format and converts rig/clip data to and from JSON-safe structures.
- `@theras/anim-editor-core`
  Provides the React-independent editor store, selection model, history, clipboard, compile trigger, and document editing actions.
- `@theras/anim-editor-react`
  Binds the external store into React, renders the graph canvas and side panels, and exposes an `AnimationEditorWorkspace`.

## Data Flow

```text
Editor Document
  -> @theras/anim-compiler
Compiled Graph
  -> @theras/anim-exporter
Versioned Artifact JSON
  -> @theras/anim-runtime
PoseBuffer + RootMotionDelta
  -> @theras/anim-three
Three.js Skeleton/Bones
```

## Editor State Model

`@theras/anim-editor-core` uses an explicit external store instead of React state or Zustand:

- topic-based subscriptions
- command-style mutations
- snapshot-based undo/redo
- clipboard and selection outside React
- compile results and diagnostics stored alongside the document

React only subscribes to the slices it renders.

## Runtime API

```ts
import { createAnimatorInstance } from "@theras/anim-runtime";
import { applyPoseToSkeleton, createRigFromSkeleton } from "@theras/anim-three";

const rig = createRigFromSkeleton(skeleton);
const animator = createAnimatorInstance({
  rig,
  graph: compiledGraph,
  clips,
});

animator.setFloat("speed", 0.8);
animator.setBool("grounded", true);

const result = animator.update(deltaTime);
applyPoseToSkeleton(animator, skeleton);

console.log(result.rootMotion.translation, result.rootMotion.yaw);
```

## Artifact Example

```json
{
  "format": "theras.animation.artifact",
  "version": 1,
  "graph": {
    "version": 1,
    "name": "Locomotion",
    "parameters": [
      { "name": "speed", "type": "float", "defaultValue": 0 }
    ],
    "clipSlots": [
      { "id": "idle", "name": "Idle", "duration": 1 },
      { "id": "walk", "name": "Walk", "duration": 1 }
    ],
    "masks": [],
    "graphs": [
      {
        "name": "Main",
        "rootNodeIndex": 2,
        "nodes": [
          { "type": "clip", "clipIndex": 0, "speed": 1, "loop": true },
          { "type": "clip", "clipIndex": 1, "speed": 1, "loop": true },
          {
            "type": "blend1d",
            "parameterIndex": 0,
            "children": [
              { "nodeIndex": 0, "threshold": 0 },
              { "nodeIndex": 1, "threshold": 1 }
            ]
          }
        ]
      }
    ],
    "layers": [
      {
        "name": "Base",
        "graphIndex": 0,
        "weight": 1,
        "blendMode": "override",
        "rootMotionMode": "full",
        "enabled": true
      }
    ],
    "entryGraphIndex": 0
  }
}
```

## Current Tradeoffs

- State machine runtime is implemented, but the editor UI for authoring nested state content is still minimal.
- Root motion modes are supported in the runtime contract, but the editor does not yet expose full per-layer policy UX.
- The editor workspace ships with a graph canvas, panels, compile, diagnostics, and export preview, but not a full preview scene shell yet.
- History is snapshot-based today. It is explicit and reliable, but patch-based history would scale better for very large documents.

## Deferred Work

- richer state machine and transition authoring UI
- per-bone weight painting and branch visualization
- live Three.js preview scene integration in the app
- binary artifact export
- advanced runtime nodes such as additive motion nodes, IK, constraints, and event tracks
