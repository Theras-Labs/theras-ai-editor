import { useMemo } from "react";
import type { BrushCreateState } from "@/viewport/types";
import { createIndexedGeometry } from "@/viewport/utils/geometry";
import { buildBrushCreatePreviewPositions } from "@/viewport/utils/brush-create-session";

export function BrushCreatePreview({ snapSize, state }: { snapSize: number; state: BrushCreateState }) {
  const geometry = useMemo(() => createIndexedGeometry(buildBrushCreatePreviewPositions(state, snapSize)), [snapSize, state]);

  return (
    <lineSegments geometry={geometry} renderOrder={12}>
      <lineBasicMaterial color="#7dd3fc" depthWrite={false} opacity={0.94} toneMapped={false} transparent />
    </lineSegments>
  );
}
