# @theras/runtime-physics-rapier

Optional Rapier bindings for Theras runtime physics data.

This package owns:

- Rapier world creation from runtime scene settings
- collider and rigid-body helpers for derived render meshes
- renderer-agnostic physics descriptor consumption from `runtime-format`

## Install

```bash
bun add @theras/runtime-physics-rapier @dimforge/rapier3d-compat
```

## Example

```ts
import {
  createDynamicRigidBody,
  createRapierPhysicsWorld,
  createStaticRigidBody,
  ensureRapierRuntimePhysics
} from "@theras/runtime-physics-rapier";

await ensureRapierRuntimePhysics();

const world = createRapierPhysicsWorld({ world: { gravity: { x: 0, y: -9.81, z: 0 } } });
const floorBody = createStaticRigidBody(world, floorMesh);
const crateBody = createDynamicRigidBody(world, crateMesh);
```

The host application still owns the Rapier world lifecycle, stepping, and disposal.
