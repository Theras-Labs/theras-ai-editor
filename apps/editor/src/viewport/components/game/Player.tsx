// The player in game mode: the Ecctrl controller body, mouse look, the camera (first person at
// eye height by default, third person with a wall check as an option), the push (left click
// while the pointer is captured) and the pose that the AI reads. The figure itself is in
// PlayerCharacter.tsx.
//
// While gameControlsActive() is false (the wrap phase, the tools view) the player stands still,
// reads no input, does not touch the camera (the editor camera rig owns it) and is drawn also
// in first person, so the user sees it from the editor camera.
import { useFrame, useThree } from "@react-three/fiber";
import { useRapier } from "@react-three/rapier";
import { Ecctrl, type EcctrlHandle } from "ecctrl";
import { useEffect, useMemo, useRef } from "react";
import { useSnapshot } from "valtio";
import * as THREE from "three";
import { gameInput, installGameKeys } from "@/lib/game/game-input";
import { gameControlsActive, gameStore, playerPose } from "@/lib/game/game-store";
import { PlayerCharacter, preloadPerson } from "./PlayerCharacter";

/** Player body: 1.6 m capsule floating 0.15 m above the ground (about 1.75 m tall in all). */
const CAPSULE_HALF = 0.5;
const CAPSULE_RADIUS = 0.3;
const FLOAT_HEIGHT = 0.15;
/** From the body center down to the feet. */
export const FOOT_OFFSET = CAPSULE_HALF + CAPSULE_RADIUS + FLOAT_HEIGHT;
/** Eye height above the body center (about 1.6 m above the feet). */
const EYE_OFFSET = 0.62;

/** Camera lens while the player has the camera. */
const GAME_NEAR = 0.05;
const FOV_FIRST = 75;
const FOV_THIRD = 60;

/** Head bob in first person: meters of travel per step and the largest vertical offset. */
const BOB_STEP_LENGTH = 0.75;
const BOB_HEIGHT = 0.03;
const BOB_SIDE = 0.015;

/** Push: ray length (m) and the speed a light object gets (m/s). */
const PUSH_RANGE = 30;
const PUSH_SPEED = 7;
/** Mass (kg) at which a push gives half of PUSH_SPEED. */
const PUSH_HEAVY = 60;

/**
 * Impulse (N s) of one push on a body of this mass: a crate moves clearly, a heavy thing moves
 * a little. The speed change is PUSH_SPEED / (1 + mass / PUSH_HEAVY).
 */
export function pushImpulse(mass: number) {
  if (!(mass > 0)) return 0;
  return (mass * PUSH_SPEED) / (1 + mass / PUSH_HEAVY);
}

const NO_MOVE = { forward: false, backward: false, leftward: false, rightward: false, run: false, jump: false };
const move = { ...NO_MOVE };

const tmpHead = new THREE.Vector3();
const tmpDir = new THREE.Vector3();
const tmpCam = new THREE.Vector3();
const tmpPivot = new THREE.Vector3();
const tmpBack = new THREE.Vector3();
const tmpBob = new THREE.Vector3();
const fireOrigin = new THREE.Vector3();
const fireDir = new THREE.Vector3();
const fireImpulse = { x: 0, y: 0, z: 0 };
const firePoint = { x: 0, y: 0, z: 0 };

/**
 * spawn = the body center at the start (feet + FOOT_OFFSET + a small drop). spawnYaw = the
 * direction the player looks at the start (radians, 0 = toward -z); default: the editor camera's.
 */
export function Player({ spawn, spawnYaw, groundY }: { spawn: [number, number, number]; spawnYaw?: number; groundY: number }) {
  const game = useSnapshot(gameStore);
  const ecctrl = useRef<EcctrlHandle>(null);
  const anchor = useRef<THREE.Object3D>(null);
  const { world, rapier } = useRapier();
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const gl = useThree((s) => s.gl);
  // Look angles: yaw around y (0 = looking toward -z), pitch up and down.
  const look = useRef({ yaw: 0, pitch: -0.12, distance: 4.5 });
  const firstPerson = game.view === "first";
  const controls = gameControlsActive(game);
  // Head bob phase (radians) and its current strength (0..1).
  const bob = useRef({ phase: 0, amount: 0 });
  // The player had the camera in the last frame (false = snap at once when play resumes).
  const hadCamera = useRef(false);
  // A left click while the pointer was captured, handled in the next frame.
  const firePending = useRef(false);
  // The editor's lens, saved while the game lens is set.
  const editorLens = useRef<{ near: number; fov: number } | null>(null);

  // Reused rays (they keep references to the vectors).
  const rays = useMemo(
    () => ({ wall: new rapier.Ray(tmpPivot, tmpBack), fire: new rapier.Ray(fireOrigin, fireDir) }),
    [rapier]
  );

  useEffect(() => preloadPerson(), []);

  // Start looking the way the editor camera looked.
  useEffect(() => {
    camera.getWorldDirection(tmpDir);
    look.current.yaw = spawnYaw ?? Math.atan2(-tmpDir.x, -tmpDir.z);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  // The game lens while the player has the camera; the editor's lens in the tools view.
  useEffect(() => {
    if (controls) {
      if (!editorLens.current) editorLens.current = { near: camera.near, fov: camera.fov };
      camera.near = GAME_NEAR;
      camera.fov = firstPerson ? FOV_FIRST : FOV_THIRD;
      camera.updateProjectionMatrix();
    } else if (editorLens.current) {
      camera.near = editorLens.current.near;
      camera.fov = editorLens.current.fov;
      editorLens.current = null;
      camera.updateProjectionMatrix();
    }
  }, [camera, controls, firstPerson]);
  useEffect(
    () => () => {
      if (!editorLens.current) return;
      camera.near = editorLens.current.near;
      camera.fov = editorLens.current.fov;
      editorLens.current = null;
      camera.updateProjectionMatrix();
    },
    [camera]
  );

  useEffect(() => installGameKeys(), []);

  // Mouse look: click the scene to capture the pointer; dragging also turns the view. A click
  // while the pointer is captured pushes. Nothing here runs while the editor has the mouse.
  useEffect(() => {
    const el = gl.domElement;
    let dragging = false;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || !gameControlsActive()) return;
      if (document.pointerLockElement === el) {
        firePending.current = true;
        return;
      }
      // This click only captures the pointer: no push.
      dragging = true;
      try {
        const request = el.requestPointerLock() as unknown as Promise<void> | undefined;
        request?.catch?.(() => undefined);
      } catch {
        // pointer lock not allowed here: dragging still turns the view
      }
    };
    const onUp = () => {
      dragging = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!gameControlsActive()) return;
      if (document.pointerLockElement === el || dragging) {
        gameInput.lookX += e.movementX;
        gameInput.lookY += e.movementY;
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (!gameControlsActive()) return;
      e.preventDefault();
      gameInput.zoom += Math.sign(e.deltaY);
    };
    const onLockChange = () => {
      gameStore.pointerLocked = document.pointerLockElement === el;
    };
    el.addEventListener("pointerdown", onDown);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointermove", onMove);
    el.addEventListener("wheel", onWheel, { passive: false });
    document.addEventListener("pointerlockchange", onLockChange);
    return () => {
      el.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointermove", onMove);
      el.removeEventListener("wheel", onWheel);
      document.removeEventListener("pointerlockchange", onLockChange);
      if (document.pointerLockElement === el) document.exitPointerLock();
      gameStore.pointerLocked = false;
    };
  }, [gl]);

  // Respawn (R key, the panel, or a fall off the world).
  const respawn = () => {
    const body = ecctrl.current?.body;
    if (!body) return;
    body.setTranslation({ x: spawn[0], y: spawn[1], z: spawn[2] }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    body.setAngvel({ x: 0, y: 0, z: 0 }, true);
  };
  useEffect(() => {
    if (game.respawnTick > 0) respawn();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game.respawnTick]);

  /** Push: a ray from the camera through the screen center; a dynamic body gets an impulse. */
  const fire = (handle: EcctrlHandle) => {
    camera.getWorldPosition(fireOrigin);
    camera.getWorldDirection(fireDir);
    let hit = false;
    const result = world.castRay(rays.fire, PUSH_RANGE, true, rapier.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, handle.body);
    const body = result?.collider.parent();
    if (result && body && body.isDynamic()) {
      const strength = pushImpulse(body.mass());
      firePoint.x = fireOrigin.x + fireDir.x * result.timeOfImpact;
      firePoint.y = fireOrigin.y + fireDir.y * result.timeOfImpact;
      firePoint.z = fireOrigin.z + fireDir.z * result.timeOfImpact;
      fireImpulse.x = fireDir.x * strength;
      fireImpulse.y = fireDir.y * strength;
      fireImpulse.z = fireDir.z * strength;
      body.applyImpulseAtPoint(fireImpulse, firePoint, true);
      hit = true;
    }
    gameStore.fire = { tick: gameStore.fire.tick + 1, hit };
  };

  // Runs after the physics step (Physics updates at priority -10), so the camera never lags.
  useFrame((_, rawDt) => {
    const handle = ecctrl.current;
    if (!handle || !anchor.current) return;
    const dt = Math.min(rawDt, 0.1);
    const l = look.current;
    const active = gameControlsActive();

    if (active) {
      l.yaw -= gameInput.lookX * 0.0024;
      l.pitch = THREE.MathUtils.clamp(l.pitch - gameInput.lookY * 0.002, firstPerson ? -1.45 : -1.2, firstPerson ? 1.45 : 0.75);
      l.distance = THREE.MathUtils.clamp(l.distance * (1 + gameInput.zoom * 0.12), 1.6, 14);
      move.forward = gameInput.forward;
      move.backward = gameInput.backward;
      move.leftward = gameInput.leftward;
      move.rightward = gameInput.rightward;
      move.run = gameInput.run;
      move.jump = gameInput.jump;
    }
    gameInput.lookX = gameInput.lookY = gameInput.zoom = 0;
    handle.setMovement(active ? move : NO_MOVE);
    // In first person the body turns with the view; otherwise it keeps its facing (in the tools
    // view the editor camera must not turn it).
    handle.setLockForward(active && firstPerson);

    // Direction the player looks (from yaw and pitch).
    tmpDir.set(-Math.sin(l.yaw) * Math.cos(l.pitch), Math.sin(l.pitch), -Math.cos(l.yaw) * Math.cos(l.pitch));

    if (active) {
      anchor.current.getWorldPosition(tmpHead);
      const snap = !hadCamera.current;
      if (firstPerson) {
        // Head bob: only while walking on the ground, linked to the speed.
        const b = bob.current;
        const speed = handle.isOnGround ? handle.moveSpeed : 0;
        const target = speed > 0.5 && !game.paused ? Math.min(1, speed / 3) : 0;
        b.amount += (target - b.amount) * (1 - Math.exp(-dt * 10));
        b.phase = (b.phase + (dt * speed * Math.PI) / BOB_STEP_LENGTH) % (Math.PI * 4);
        const side = Math.sin(b.phase * 0.5) * BOB_SIDE * b.amount;
        tmpBob.set(Math.cos(l.yaw) * side, (Math.abs(Math.sin(b.phase)) - 0.5) * BOB_HEIGHT * b.amount, -Math.sin(l.yaw) * side);
        camera.position.copy(tmpHead).add(tmpBob);
        camera.lookAt(tmpCam.copy(camera.position).add(tmpDir));
      } else {
        // Behind and a little above the head; pulled in when a wall is between.
        tmpPivot.copy(tmpHead);
        tmpPivot.y += 0.25;
        tmpBack.copy(tmpDir).negate();
        let distance = l.distance;
        const hit = world.castRay(rays.wall, distance, true, undefined, undefined, undefined, handle.body);
        if (hit) distance = Math.max(0.4, hit.timeOfImpact - 0.25);
        tmpCam.copy(tmpPivot).addScaledVector(tmpBack, distance);
        if (snap) camera.position.copy(tmpCam);
        else camera.position.lerp(tmpCam, 1 - Math.exp(-dt * 30));
        camera.lookAt(tmpPivot);
      }
      hadCamera.current = true;
      if (firePending.current) {
        firePending.current = false;
        fire(handle);
      }
    } else {
      hadCamera.current = false;
      firePending.current = false;
      bob.current.amount = 0;
    }

    // Pose for the AI ("build here", "in front of me").
    const p = handle.currPos;
    playerPose.valid = true;
    playerPose.position.x = p.x;
    playerPose.position.y = p.y - FOOT_OFFSET;
    playerPose.position.z = p.z;
    const len = Math.hypot(tmpDir.x, tmpDir.z) || 1;
    playerPose.forward.x = tmpDir.x / len;
    playerPose.forward.z = tmpDir.z / len;

    // A fall off the world puts the player back.
    if (p.y < groundY - 40) respawn();
  });

  useEffect(() => () => void (playerPose.valid = false), []);

  return (
    <Ecctrl
      ref={ecctrl}
      position={spawn}
      capsuleHalfHeight={CAPSULE_HALF}
      capsuleRadius={CAPSULE_RADIUS}
      floatHeight={FLOAT_HEIGHT}
      maxWalkVel={3}
      maxRunVel={6.5}
      jumpVel={5.5}
      enableToggleRun={false}
      enable={!game.paused}
      lockForward={firstPerson}
      canSleep={false}
    >
      <object3D position={[0, EYE_OFFSET, 0]} ref={anchor} />
      {/* In first person the figure is not drawn for the player camera (no clipping into the head). */}
      <PlayerCharacter ecctrl={ecctrl} footOffset={FOOT_OFFSET} visible={!firstPerson || !controls} />
    </Ecctrl>
  );
}
