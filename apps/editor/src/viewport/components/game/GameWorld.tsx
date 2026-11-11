// Game mode inside the viewport canvas: a Rapier world built from the live scene (the wrap),
// the start point, and the player (Player.tsx). Mounted only while game mode is on; unmounting
// removes every body and puts loose objects back.
//
// The wrap (phase "wrapping"): new units are marked ready by the scan and built a few per tick
// (lib/game/wrap-plan.ts: terrain first, then near to far from the start hint), each with a
// sweep (WrapSweep.ts). When all are built, the start point is chosen (lib/game/spawn.ts), the
// phase becomes "playing" and the player is mounted. While playing, the scan runs every 400 ms
// as before, and new units get their sweep too.
import { useFrame, useThree } from "@react-three/fiber";
import { Physics, useAfterPhysicsStep, useRapier } from "@react-three/rapier";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { gameStore, type BodyInfo } from "@/lib/game/game-store";
import { chooseSpawn } from "@/lib/game/spawn";
import { orderWrap, wrapBudget, wrapFinished, WRAP_TICK_MS, type WrapState } from "@/lib/game/wrap-plan";
import { preloadPerson } from "@/lib/resources/models/people";
import { GameSky } from "./GameSky";
import { FOOT_OFFSET, Player } from "./Player";
import { plainId, SceneColliders, type NodeInfo } from "./scene-colliders";
import { WrapSweeps } from "./WrapSweep";

const SCAN_MS = 400;
/** During the wrap the full scan runs every few wrap ticks (it walks the whole scene). */
const WRAP_SCAN_EVERY = 3;

type Vec3 = { x: number; y: number; z: number };

/** The "Player start" marker of the scene: feet position and the direction to face (radians, 0 = toward -z). */
export type PlayerStart = { x: number; y: number; z: number; yaw: number };

export type GameWorldProps = {
  infoOf: (nodeId: string) => NodeInfo | undefined;
  /** Where the editor camera looks: the start is open ground near it when the scene has no marker. */
  spawnHint: Vec3;
  hasTerrain: boolean;
  /** The marker node, when the scene has one. It wins over spawnHint. */
  playerStart?: PlayerStart | null;
  /** The scene has no sky of its own: game mode draws a plain day sky while the user plays. */
  needsSky?: boolean;
};

export function GameWorld({ infoOf, spawnHint, hasTerrain, playerStart, needsSky }: GameWorldProps) {
  const game = useSnapshot(gameStore);
  return (
    <>
    {needsSky ? <GameSky /> : null}
    <Physics
      debug={game.showColliders}
      gravity={[0, -game.gravity, 0]}
      interpolate
      paused={game.paused}
      timeStep={1 / 60}
      updatePriority={-10}
    >
      <GameScene hasTerrain={hasTerrain} infoOf={infoOf} playerStart={playerStart ?? null} spawnHint={spawnHint} />
    </Physics>
    </>
  );
}

function sameBodies(a: Record<string, BodyInfo>, b: Record<string, BodyInfo>) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  for (const key of keys) {
    const x = a[key]!;
    const y = b[key];
    if (!y || x.mode !== y.mode || x.shape !== y.shape) return false;
  }
  return true;
}

type Spawn = { position: [number, number, number]; yaw?: number };

function GameScene({
  infoOf,
  spawnHint,
  hasTerrain,
  playerStart
}: {
  infoOf: (nodeId: string) => NodeInfo | undefined;
  spawnHint: Vec3;
  hasTerrain: boolean;
  playerStart: PlayerStart | null;
}) {
  const { world, rapier } = useRapier();
  const scene = useThree((s) => s.scene);
  const infoRef = useRef(infoOf);
  infoRef.current = infoOf;
  const colliders = useMemo(() => new SceneColliders(world, rapier, (id) => infoRef.current(id)), [world, rapier]);
  const sweepsRef = useRef<WrapSweeps | null>(null);
  const [spawn, setSpawn] = useState<Spawn | null>(null);
  const groundY = hasTerrain ? -1.2 : 0;

  useEffect(() => () => colliders.dispose(), [colliders]);
  // The character file (6.6 MB) starts to load when the wrap starts, so the figure is ready
  // when the player appears.
  useEffect(() => preloadPerson(), []);
  useEffect(() => colliders.setGround(groundY), [colliders, groundY]);
  useEffect(() => {
    const sweeps = new WrapSweeps(scene);
    sweepsRef.current = sweeps;
    return () => {
      sweeps.dispose();
      if (sweepsRef.current === sweeps) sweepsRef.current = null;
    };
  }, [scene]);

  // The wrap, then the scan. One timer, in the browser only, mounted only while game mode is on.
  useEffect(() => {
    const started = performance.now();
    // The start hint: the marker when there is one, else the editor camera target. Read once.
    const marker = playerStart;
    const hint = marker ? { x: marker.x, y: marker.y, z: marker.z } : spawnHint;
    let spawned = false;
    let settling = false;
    let done = 0;
    let current: string | null = null;
    let ticks = 0;
    const skipAtStart = gameStore.skipWrapTick;
    let timer = 0;
    let stopped = false;

    const publish = () => {
      const pending = colliders.pendingCount();
      const stats = colliders.stats();
      const building = pending > 0;
      if (gameStore.stats.solid !== stats.solid || gameStore.stats.loose !== stats.loose || gameStore.stats.building !== building) {
        gameStore.stats = { ...stats, building };
      }
      const bodies = colliders.bodyInfos();
      if (!sameBodies(bodies, gameStore.bodies)) gameStore.bodies = bodies;
      const sweeps = sweepsRef.current;
      for (const unit of colliders.takeBuilt()) sweeps?.add(unit);
    };

    const startPlaying = () => {
      const point = chooseSpawn(
        {
          groundBelow: (x, z, from) => colliders.groundBelow(x, z, from),
          isWet: (x, z, y) => colliders.isWet(x, z, y),
          castRay: (origin, dir, max) => colliders.castRay(origin, dir, max)
        },
        { hint: spawnHint, marker, groundY, slope: hasTerrain ? 0.12 : 0 }
      );
      setSpawn({ position: [point.x, point.y + FOOT_OFFSET + 0.3, point.z], yaw: point.yaw });
      spawned = true;
      if (gameStore.active) gameStore.phase = "playing";
    };

    const wrapTick = (now: number) => {
      if (settling) {
        // The colliders of the last builds are in the ray queries after one physics step.
        startPlaying();
        return;
      }
      const skip = gameStore.skipWrapTick !== skipAtStart;
      if (ticks % WRAP_SCAN_EVERY === 0 || skip) {
        const { scope, looseDefault, overrides } = gameStore;
        colliders.scan(scene, { scope, looseDefault, overrides }, now, true);
      }
      ticks += 1;
      const ready = orderWrap(colliders.heldItems(), hint);
      const state: WrapState = { elapsedMs: now - started, done, ready: ready.length, waiting: colliders.waitingCount(), skip };
      const budget = wrapBudget(state);
      for (let i = 0; i < budget; i++) {
        const id = ready[i]!.id;
        if (colliders.buildHeld(id)) {
          done += 1;
          current = plainId(id);
        }
      }
      let waiting = state.waiting;
      if (wrapFinished({ ...state, done, ready: ready.length - budget })) {
        // Skip, time cap, or all built: build what is left (not ready yet) at once.
        const rest = colliders.buildAllPending();
        done += rest.count;
        if (rest.last) current = plainId(rest.last);
        waiting = 0;
        settling = true;
      }
      const total = done + (settling ? 0 : ready.length - budget + waiting);
      const w = gameStore.wrap;
      if (w.done !== done || w.total !== total || w.current !== current) gameStore.wrap = { done, total, current };
    };

    const tick = () => {
      if (stopped) return;
      const now = performance.now();
      if (!spawned) {
        wrapTick(now);
      } else {
        const { scope, looseDefault, overrides } = gameStore;
        colliders.scan(scene, { scope, looseDefault, overrides }, now, false);
      }
      publish();
      timer = window.setTimeout(tick, spawned ? SCAN_MS : WRAP_TICK_MS);
    };
    tick();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
    // spawnHint and playerStart are read once, when game mode starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colliders, scene]);

  // A changed panel setting (scope, loose, an override) is applied at the next scan.
  const resetTick = useSnapshot(gameStore).resetTick;
  useEffect(() => {
    if (resetTick > 0) colliders.resetLoose();
  }, [colliders, resetTick]);

  useAfterPhysicsStep(() => colliders.syncLoose());

  // The sweeps: nothing to do while none is alive.
  useFrame(() => {
    const sweeps = sweepsRef.current;
    if (sweeps && sweeps.alive > 0) sweeps.update();
  });

  return spawn ? <Player groundY={groundY} spawn={spawn.position} spawnYaw={spawn.yaw} /> : null;
}
