// Draws library objects (group nodes with metadata.resource) and the scene environment.
import { beginSceneFrame, nudgeAnimation, sceneDelta, sceneTime } from "@/lib/animation-clock";
import { useFrame, useThree } from "@react-three/fiber";
import type { DerivedGroupMarker } from "@theras/render-pipeline";
import { toTuple } from "@theras/shared";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { hasPendingReveal, revealStartOf } from "@/lib/build-reveal";
import { getResource } from "@/lib/resources/catalog";
import { createLittleHabitatsEnvironment } from "@/lib/resources/little-habitats/environment";
import { setFrameContext } from "@/lib/resources/little-habitats/props";
import { tickLittleHabitats } from "@/lib/resources/little-habitats/runtime";
import { createIslandTerrain } from "@/lib/resources/little-habitats/terrain";
import { getTerrain, registerTerrain, syncTerrainState } from "@/lib/resources/terrain-edit";
import type { ResourceFrame } from "@/lib/resources/types";

/** Ticks the shared Island kit clock and uniforms once per frame, before resource updates. */
export function ResourceTicker() {
  useFrame((_, dt) => {
    beginSceneFrame(dt);
    setFrameContext(tickLittleHabitats(Math.min(sceneDelta(dt), 0.1)));
  }, -1);
  return null;
}

const RISE_SECONDS = 0.75;

function easeOutBack(t: number) {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

export function ResourceNodeObject({
  group,
  interactive,
  onFocusNode,
  onSelectNodes,
  selected
}: {
  group: DerivedGroupMarker;
  interactive: boolean;
  onFocusNode: (nodeId: string) => void;
  onSelectNodes: (nodeIds: string[]) => void;
  selected: boolean;
}) {
  const resourceId = String(group.metadata?.resource ?? "");
  const seed = Number(group.metadata?.seed ?? 1);
  // Parametric entries read their shape from metadata.params (JSON text).
  const paramsText = typeof group.metadata?.params === "string" ? group.metadata.params : "";
  const params = useMemo(() => {
    if (!paramsText) return undefined;
    try {
      return JSON.parse(paramsText) as Record<string, unknown>;
    } catch {
      return undefined;
    }
  }, [paramsText]);
  const entry = getResource(resourceId);
  const holderRef = useRef<THREE.Group>(null);
  // A node marked for the build reveal rises in; other nodes (loaded scenes) appear at once.
  const justPlaced = useRef(hasPendingReveal(group.nodeId)).current;
  // Rise start in performance.now() time (honors a reveal delay, so templates build in order).
  const spawnRef = useRef<number | null>(justPlaced && !entry?.selfAnimates ? (revealStartOf(group.nodeId) ?? performance.now()) : null);

  const instance = useMemo(() => {
    if (!entry?.create) return null;
    if (justPlaced) nudgeAnimation(2500);
    try {
      return entry.create(seed, { appear: justPlaced, params });
    } catch (error) {
      console.warn(`[resources] could not build ${resourceId}:`, error);
      return null;
    }
  }, [entry, justPlaced, params, resourceId, seed]);

  useEffect(() => () => instance?.dispose?.(), [instance]);

  const [loadedTick, setLoadedTick] = useState(0);
  useEffect(() => {
    let alive = true;
    void instance?.ready?.then(() => alive && setLoadedTick((n) => n + 1));
    return () => {
      alive = false;
    };
  }, [instance]);
  const box = useMemo(() => {
    if (!instance) return null;
    return new THREE.Box3().setFromObject(instance.object);
  }, [instance, loadedTick]);

  useFrame((state, dt) => {
    if (!instance) return;
    const holder = holderRef.current;
    if (holder && spawnRef.current !== null) {
      const t = Math.max(0, Math.min(1, (performance.now() - spawnRef.current) / (RISE_SECONDS * 1000)));
      const s = Math.max(0.001, easeOutBack(t));
      holder.scale.set(s, s, s);
      holder.position.y = (1 - t) * -0.4;
      if (t >= 1) spawnRef.current = null;
    }
    const frame: ResourceFrame = { dt: sceneDelta(dt), time: sceneTime(state.clock.elapsedTime), night: 0 };
    instance.update?.(frame);
  });

  if (!instance) return null;

  return (
    <group
      name={`node:${group.nodeId}`}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onSelectNodes([group.nodeId]);
      }}
      onDoubleClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onFocusNode(group.nodeId);
      }}
      position={toTuple(group.position)}
      rotation={toTuple(group.rotation)}
      scale={toTuple(group.scale)}
    >
      <group ref={holderRef}>
        <primitive object={instance.object} />
      </group>
      {selected && box ? <box3Helper args={[box, new THREE.Color("#ffb35a")]} /> : null}
    </group>
  );
}

/** The active environment: Island kit sky or an external HDR image. */
export function EnvironmentObject({ group }: { group: DerivedGroupMarker }) {
  const entry = getResource(String(group.metadata?.resource ?? ""));
  const { scene, camera, gl } = useThree();

  const lh = useMemo(() => (entry?.environment ? createLittleHabitatsEnvironment(entry.environment) : null), [entry]);

  useEffect(() => {
    if (!lh) return;
    scene.add(lh.object);
    const prevFog = scene.fog;
    return () => {
      scene.remove(lh.object);
      if (scene.fog === lh.fog) scene.fog = prevFog ?? null;
      lh.dispose();
    };
  }, [lh, scene]);

  // External HDR sky: background and image-based lighting.
  useEffect(() => {
    if (!entry?.url || entry.kind !== "hdri") return;
    let disposed = false;
    let texture: THREE.Texture | null = null;
    new HDRLoader().load(
      entry.url,
      (tex) => {
        if (disposed) {
          tex.dispose();
          return;
        }
        tex.mapping = THREE.EquirectangularReflectionMapping;
        texture = tex;
        scene.background = tex;
        scene.environment = tex;
      },
      undefined,
      (error) => console.warn(`[resources] could not load ${entry.url}:`, error)
    );
    return () => {
      disposed = true;
      if (texture && scene.background === texture) scene.background = null;
      if (texture && scene.environment === texture) scene.environment = null;
      texture?.dispose();
    };
  }, [entry, scene]);

  useFrame(() => {
    if (!lh) return;
    // The editor's world settings may reset fog and background; keep the sky's values.
    scene.fog = lh.fog;
    scene.background = null;
    lh.update(camera);
    gl.toneMappingExposure = 1;
  });

  return null;
}

/** The editable Island kit island. Its world state is in metadata.world. */
export function TerrainNodeObject({
  group,
  hasLake,
  interactive,
  landVisible = true,
  onSelectNodes
}: {
  group: DerivedGroupMarker;
  /** Hidden in the scene tree: the land is not drawn, but the island stays alive for its lake. */
  landVisible?: boolean;
  /** A separate lake node draws the water; otherwise this node draws it (older scenes). */
  hasLake: boolean;
  interactive: boolean;
  onSelectNodes: (nodeIds: string[]) => void;
}) {
  const seed = Number(group.metadata?.seed ?? 1);
  const state = typeof group.metadata?.world === "string" ? group.metadata.world : undefined;
  const initialState = useRef(state);

  // Built once per node and seed; later state changes are loaded into the same terrain.
  const shape = group.metadata?.starter === "meadow" ? "meadow" : "island";
  const terrain = useMemo(() => createIslandTerrain(seed, initialState.current, 8, shape), [seed, shape]);
  // A new island (no saved state) rises from the water: that reveal needs about 3 s of scene time,
  // also while Animate is off.
  useEffect(() => {
    if (!initialState.current) nudgeAnimation(3500);
  }, [terrain]);

  useEffect(() => {
    const unregister = registerTerrain(group.nodeId, terrain, initialState.current);
    return () => {
      unregister();
      terrain.dispose();
    };
  }, [group.nodeId, terrain]);

  useEffect(() => {
    syncTerrainState(group.nodeId, state);
  }, [group.nodeId, state]);

  useFrame((_, dt) => terrain.update(sceneDelta(dt)));

  return (
    <group
      name={`node:${group.nodeId}`}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onSelectNodes([group.nodeId]);
      }}
      position={toTuple(group.position)}
      rotation={toTuple(group.rotation)}
      scale={toTuple(group.scale)}
    >
      <primitive object={terrain.object} visible={landVisible} />
      {hasLake ? null : <primitive object={terrain.water} visible={landVisible} />}
    </group>
  );
}

/** The lake of an island, drawn at the island's place so it moves with it. */
export function LakeNodeObject({
  lake,
  island,
  interactive,
  onSelectNodes
}: {
  lake: DerivedGroupMarker;
  island: DerivedGroupMarker | undefined;
  interactive: boolean;
  onSelectNodes: (nodeIds: string[]) => void;
}) {
  const islandId = String(lake.metadata?.lakeOf ?? "");
  const [water, setWater] = useState<THREE.Group | null>(() => getTerrain(islandId)?.water ?? null);
  // The island may mount after the lake; pick its water up when it is there.
  useFrame(() => {
    const current = getTerrain(islandId)?.water ?? null;
    if (current !== water) setWater(current);
  });
  if (!water || !island) return null;
  return (
    <group
      name={`node:${lake.nodeId}`}
      onClick={(event) => {
        if (!interactive) return;
        event.stopPropagation();
        onSelectNodes([lake.nodeId]);
      }}
      position={toTuple(island.position)}
      rotation={toTuple(island.rotation)}
      scale={toTuple(island.scale)}
    >
      <primitive object={water} />
    </group>
  );
}
