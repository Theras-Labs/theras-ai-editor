# @theras/anim-runtime

Framework-agnostic animator instance and runtime graph evaluator.

```ts
import { createAnimatorInstance } from "@theras/anim-runtime";

const animator = createAnimatorInstance({ rig, graph, clips });
animator.setFloat("speed", 1);
const result = animator.update(dt);
```

The runtime evaluates into typed-array pose buffers and root motion deltas, not Three.js animation actions.
