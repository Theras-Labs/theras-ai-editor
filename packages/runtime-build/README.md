# @theras/runtime-build

Headless runtime build utilities for Theras.

This package owns:

- compiling `.whmap` snapshots into `RuntimeScene`
- asset externalization
- runtime bundle packing and unpacking
- world-index creation
- a CLI for manifest and bundle output

## Install

```bash
bun add @theras/runtime-build
```

## Build From A `.whmap` Snapshot

```ts
import {
  buildRuntimeBundleFromSnapshot,
  buildRuntimeSceneFromSnapshot
} from "@theras/runtime-build";

const runtimeScene = await buildRuntimeSceneFromSnapshot(snapshot);
const runtimeBundle = await buildRuntimeBundleFromSnapshot(snapshot, {
  assetDir: "assets"
});
```

## CLI

```bash
theras-runtime-build manifest --input level.whmap --output scene.runtime.json
theras-runtime-build bundle --input level.whmap --output scene.runtime.zip
theras-runtime-build world-index --chunks hub:/world/chunks/hub/scene.runtime.json --output world-index.json
```

Use this package from editor workers, CI, or a content-build step. It does not depend on Three runtime scene instantiation.
