// Scene animation clock ("Animate"): waves, water ripples, wind and other ambient motion read
// their time from here. Pause freezes that time. This is not physics: physics (rigid bodies,
// collisions, gravity) is a separate mode. Saved per viewer.
import { proxy, subscribe } from "valtio";

const KEY = "theras:animate";

function load() {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export const animationStore = proxy({ playing: load() });

subscribe(animationStore, () => {
  try {
    localStorage.setItem(KEY, animationStore.playing ? "on" : "off");
  } catch {
    // per-viewer convenience only
  }
});

let simTime = 0;
let lastReal = -1;
let runUntil = 0;
/** Scene seconds that must still run while paused (a build reveal that is not finished). */
let owed = 0;
let lastFrameStamp = 0;

/**
 * Lets time run while paused, so a new object can still grow or rise in. The time is counted
 * in scene seconds, not wall time: slow frames (a big scene swap) still get the whole reveal.
 */
export function nudgeAnimation(ms = 2000) {
  runUntil = Math.max(runUntil, performance.now() + ms);
  owed = Math.max(owed, ms / 1000);
}

/** Once per frame (the resource ticker): uses up the owed time while paused. */
export function beginSceneFrame(dt: number) {
  const now = performance.now();
  // Several viewports tick in the same frame: count the frame once.
  if (now - lastFrameStamp < 4) return;
  lastFrameStamp = now;
  if (!animationStore.playing && owed > 0) owed = Math.max(0, owed - Math.min(dt, 0.1));
}

function running() {
  return animationStore.playing || owed > 0 || performance.now() < runUntil;
}

/**
 * Scene time in seconds for a real clock value (state.clock.elapsedTime). Many objects call it in
 * the same frame: only the first call per frame advances the time.
 */
export function sceneTime(realTime: number) {
  if (lastReal < 0) lastReal = realTime;
  const dt = realTime - lastReal;
  if (dt > 0) {
    lastReal = realTime;
    if (running()) simTime += Math.min(dt, 0.1);
  }
  return simTime;
}

/** Frame delta for ambient motion: 0 while paused. */
export function sceneDelta(dt: number) {
  return running() ? dt : 0;
}
