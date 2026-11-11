# Animation Graph System TODOs

## Package Layout

- [x] Create `packages/anim-schema` as `@theras/anim-schema`
- [x] Create `packages/anim-core` as `@theras/anim-core`
- [x] Create `packages/anim-runtime` as `@theras/anim-runtime`
- [x] Create `packages/anim-three` as `@theras/anim-three`
- [x] Create `packages/anim-compiler` as `@theras/anim-compiler`
- [x] Create `packages/anim-exporter` as `@theras/anim-exporter`
- [x] Create `packages/anim-editor-core` as `@theras/anim-editor-core`
- [x] Create `packages/anim-editor-react` as `@theras/anim-editor-react`
- [x] Create `packages/anim-utils` as `@theras/anim-utils`
- [x] Wire root `tsconfig.base.json` path aliases for all new animation packages

## Runtime And Data Model

- [x] Implement editor document schema separate from runtime/export schema
- [x] Implement compiled runtime graph schema and versioned export artifact schema
- [x] Implement rig, pose buffer, bone mask, root motion delta, clip asset, and sampling primitives
- [x] Implement blending, additive blending, masking, and root motion helpers
- [x] Implement runtime parameter store for float, int, bool, and trigger parameters
- [x] Implement runtime graph evaluator for clip, subgraph, state machine, blend1d, blend2d, layers, and output
- [x] Implement state transitions with conditions, duration, exit time, and interruption policy
- [x] Implement layer evaluation with per-bone float masks and root motion policy

## Compiler And Export

- [x] Implement schema validation and semantic validation
- [x] Implement reference resolution and deterministic graph normalization
- [x] Implement mask compilation and rig-aware bone binding resolution
- [x] Implement compiled node emission and runtime indexing
- [x] Implement diagnostics for invalid references, transitions, masks, and graph topology
- [x] Implement exporter/importer for versioned JSON artifacts

## Three.js Bridge

- [x] Implement skeleton to rig helpers
- [x] Implement clip import helpers from `AnimationClip`
- [x] Implement pose application back to `Skeleton`/bones
- [x] Implement example runtime bridge usage for Three.js consumers

## Editor Core

- [x] Implement high-performance editor store independent from React
- [x] Implement command-based mutations, history, undo/redo, and clipboard support
- [x] Implement graph document editing, selection model, and graph validation hooks
- [x] Implement parameter, layer, mask, clip, and subgraph authoring primitives

## Editor UI

- [x] Implement React bindings/hooks over editor-core without making React the source of truth
- [x] Implement graph canvas shell, node rendering plumbing, edge editing, pan/zoom, and fit-to-view
- [x] Implement inspector, parameter panel, mask panel, layer panel, graph list, and diagnostics panel
- [x] Keep `apps/animation-editor` as a thin shell for layout, persistence, export, and preview composition

## Tests And Docs

- [x] Add focused tests for core math, masks, blending, runtime evaluation, and compiler diagnostics
- [x] Add package READMEs and a concise architecture summary
- [x] Document example exported artifact format and runtime consumption snippet
- [x] Capture deferred follow-up work for additive nodes, IK, event tracks, and binary export

## Deferred Follow-Up

- [ ] Add dedicated state machine graph editing UI beyond the current schema-backed baseline
- [ ] Add per-bone mask painting and hierarchy visualization tools
- [ ] Add live Three.js preview scene integration inside the app shell
- [ ] Add binary export and runtime streaming-friendly artifact variants
- [ ] Add advanced runtime nodes such as constraints, IK, aim, and event tracks

## Current Turn

- [x] Add explicit character/animation file import workflow in the app shell
- [x] Add preview viewport with playback controls and runtime graph evaluation
- [x] Sync imported rig and clip references into the editor document
- [x] Clarify in-app where assets live versus what the graph authoring layer does
