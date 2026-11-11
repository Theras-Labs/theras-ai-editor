// The player figure: the rigged, animated person of the library (people.ts). The animation
// follows the Ecctrl controller state each frame (idle, walk, jog, sprint, jump, land) with
// crossfades. Faces +z, the controller's forward (Ecctrl turns the body, the figure turns with it).
import { useFrame } from "@react-three/fiber";
import type { EcctrlHandle } from "ecctrl";
import { useEffect, useRef, useState, type RefObject } from "react";
import * as THREE from "three";
import { clonePerson, findPersonClip, loadPerson, type PersonClip, type PersonCopy } from "@/lib/resources/models/people";

export { preloadPerson } from "@/lib/resources/models/people";

/** The clips the player uses. */
export const PLAYER_CLIPS = ["Idle_Loop", "Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop", "Jump_Start", "Jump_Loop", "Jump_Land"] as const satisfies readonly PersonClip[];
export type PlayerClip = (typeof PLAYER_CLIPS)[number];

/** Below this horizontal speed (m/s) the figure stands. */
export const IDLE_SPEED = 0.35;
/** With Shift, above this speed the figure jogs. */
export const JOG_SPEED = 2.2;
/** Above this speed the figure sprints. */
export const SPRINT_SPEED = 5.8;
/** Jump_Start plays for this long after a jump, then Jump_Loop. */
export const JUMP_START_TIME = 0.3;
/** Short ground losses (bumps, steps) do not count as air until this air time. */
export const AIR_GRACE = 0.15;
/** Jump_Land plays this long after a landing (only when the figure does not walk on). */
export const LAND_TIME = 0.35;
/** A landing after less air time than this is a step, not a landing. */
export const MIN_LAND_AIR_TIME = 0.3;

export type MotionState = {
  onGround: boolean;
  /** Horizontal speed in m/s. */
  speed: number;
  /** Shift is held. */
  run: boolean;
  /** The current air time left the ground with a jump (moving up). */
  jumped: boolean;
  /** Seconds since the feet left the ground (0 while on the ground). */
  airTime: number;
  /** Seconds since the last real landing (Infinity when none). */
  sinceLanded: number;
};

/** The clip for one controller state (pure, for tests). */
export function chooseClip(s: MotionState): PlayerClip {
  if (!s.onGround && (s.jumped || s.airTime > AIR_GRACE)) {
    return s.jumped && s.airTime < JUMP_START_TIME ? "Jump_Start" : "Jump_Loop";
  }
  if (s.sinceLanded < LAND_TIME && s.speed < 1) return "Jump_Land";
  if (s.speed < IDLE_SPEED) return "Idle_Loop";
  if (s.speed >= SPRINT_SPEED) return "Sprint_Loop";
  if (s.run && s.speed > JOG_SPEED) return "Jog_Fwd_Loop";
  return "Walk_Loop";
}

/** Speed in m/s at which each locomotion clip plays at time scale 1 (estimated from the foot motion). */
const NATURAL_SPEED: Partial<Record<PlayerClip, number>> = {
  Walk_Loop: 1.3,
  Jog_Fwd_Loop: 3.8,
  Sprint_Loop: 6.5
};

/** Time scale of a clip at a speed: locomotion follows the real speed so the feet slide less. */
export function clipTimeScale(clip: PlayerClip, speed: number) {
  const natural = NATURAL_SPEED[clip];
  if (natural) return THREE.MathUtils.clamp(speed / natural, 0.7, clip === "Walk_Loop" ? 2.2 : 1.6);
  return clip === "Jump_Start" || clip === "Jump_Land" ? 1.6 : 1;
}

const LOCOMOTION = new Set<PlayerClip>(["Walk_Loop", "Jog_Fwd_Loop", "Sprint_Loop"]);

function fadeTime(from: PlayerClip, to: PlayerClip) {
  if (to === "Jump_Start" || from === "Jump_Start") return 0.15;
  if (LOCOMOTION.has(from) && LOCOMOTION.has(to)) return 0.25;
  return 0.2;
}

type Rig = { copy: PersonCopy; mixer: THREE.AnimationMixer; actions: Map<PlayerClip, THREE.AnimationAction> };

export function PlayerCharacter({ ecctrl, footOffset, visible }: { ecctrl: RefObject<EcctrlHandle | null>; footOffset: number; visible: boolean }) {
  const [rig, setRig] = useState<Rig | null>(null);
  const current = useRef<PlayerClip>("Idle_Loop");
  const motion = useRef<MotionState>({ onGround: true, speed: 0, run: false, jumped: false, airTime: 0, sinceLanded: Infinity });

  // Load (shared, once per page) and make this player's copy. Nothing is drawn until then.
  useEffect(() => {
    let alive = true;
    let made: Rig | null = null;
    loadPerson()
      .then((source) => {
        if (!alive) return;
        const copy = clonePerson(source);
        const mixer = new THREE.AnimationMixer(copy.object);
        const actions = new Map<PlayerClip, THREE.AnimationAction>();
        for (const name of PLAYER_CLIPS) {
          const clip = findPersonClip(source, name);
          if (!clip) continue;
          const action = mixer.clipAction(clip);
          if (name === "Jump_Start" || name === "Jump_Land") {
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
          }
          actions.set(name, action);
        }
        actions.get("Idle_Loop")?.play();
        mixer.update(0);
        current.current = "Idle_Loop";
        made = { copy, mixer, actions };
        setRig(made);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      if (made) {
        made.mixer.stopAllAction();
        made.mixer.uncacheRoot(made.copy.object);
        made.copy.dispose();
      }
    };
  }, []);

  useFrame((_, rawDt) => {
    const handle = ecctrl.current;
    if (!rig || !handle) return;
    const dt = Math.min(rawDt, 0.1);
    const m = motion.current;
    const onGround = handle.isOnGround;
    if (onGround) {
      if (!m.onGround && m.airTime >= MIN_LAND_AIR_TIME) m.sinceLanded = 0;
      else m.sinceLanded += dt;
      m.airTime = 0;
      m.jumped = false;
    } else {
      if (m.onGround) m.jumped = handle.verticalSpeed > 1;
      m.airTime += dt;
      m.sinceLanded = Infinity;
    }
    m.onGround = onGround;
    m.speed = handle.moveSpeed;
    m.run = handle.runActive;

    const next = chooseClip(m);
    const prev = current.current;
    const nextAction = rig.actions.get(next);
    if (next !== prev && nextAction) {
      const prevAction = rig.actions.get(prev);
      const fade = fadeTime(prev, next);
      nextAction.reset();
      // Walk, jog and sprint keep the step phase, so the feet do not jump.
      if (prevAction && LOCOMOTION.has(prev) && LOCOMOTION.has(next)) {
        nextAction.time = (prevAction.time / prevAction.getClip().duration) * nextAction.getClip().duration;
      }
      nextAction.setEffectiveWeight(1).fadeIn(fade).play();
      prevAction?.fadeOut(fade);
      current.current = next;
    }
    if (nextAction) nextAction.timeScale = clipTimeScale(next, m.speed);
    // The figure is hidden in first person: the state is kept, the bones are not posed.
    if (visible) rig.mixer.update(dt);
  });

  if (!rig) return null;
  return (
    <group position={[0, -footOffset, 0]} visible={visible}>
      <primitive object={rig.copy.object} />
    </group>
  );
}
