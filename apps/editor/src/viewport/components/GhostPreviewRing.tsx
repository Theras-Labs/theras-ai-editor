// Ghost preview ring (plan 5.10): a soft pulsing ring at the anchor while a prompt waits
// for the model. State: src/lib/copilot/ghost-preview.ts. The ring mounts only while it is
// visible, so useFrame runs only then. Same color as the build reveal edge (#5cf2b0).
import { useFrame } from "@react-three/fiber";
import { useRef, useSyncExternalStore } from "react";
import { AdditiveBlending, type Group, type MeshBasicMaterial } from "three";
import { getGhost, subscribeGhost, type GhostState } from "@/lib/copilot/ghost-preview";

const GHOST_COLOR = "#5cf2b0";
const FADE_IN_MS = 180;

export function GhostPreviewRing() {
  const ghost = useSyncExternalStore(subscribeGhost, getGhost, getGhost);
  if (!ghost.visible) return null;
  return <GhostRing ghost={ghost} />;
}

function GhostRing({ ghost }: { ghost: GhostState }) {
  const group = useRef<Group>(null);
  const ring = useRef<MeshBasicMaterial>(null);
  const fill = useRef<MeshBasicMaterial>(null);

  useFrame(() => {
    const now = performance.now();
    const fade = Math.min(1, Math.max(0, (now - ghost.shownAt) / FADE_IN_MS));
    const wave = 0.5 + 0.5 * Math.sin(now * 0.005);
    if (group.current) group.current.scale.setScalar(ghost.radius * (0.94 + 0.08 * wave));
    if (ring.current) ring.current.opacity = fade * (0.45 + 0.35 * wave);
    if (fill.current) fill.current.opacity = fade * (0.06 + 0.06 * wave);
  });

  const { x, y, z } = ghost.position;
  return (
    <group ref={group} position={[x, y + 0.05, z]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={999}>
      <mesh renderOrder={999} raycast={() => null}>
        <ringGeometry args={[0.9, 1, 64]} />
        <meshBasicMaterial ref={ring} color={GHOST_COLOR} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
      <mesh renderOrder={998} raycast={() => null}>
        <circleGeometry args={[0.9, 48]} />
        <meshBasicMaterial ref={fill} color={GHOST_COLOR} transparent opacity={0} depthWrite={false} depthTest={false} toneMapped={false} blending={AdditiveBlending} />
      </mesh>
    </group>
  );
}
