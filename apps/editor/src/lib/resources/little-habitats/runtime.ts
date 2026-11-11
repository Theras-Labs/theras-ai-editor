// Drives the shared Island kit shader uniforms (time, wind, daylight, sun direction)
// and gives landmark update() calls the clock context they expect. One instance per page.
import * as THREE from "three";
import { Clock, type ClockState } from "@/vendor/little-habitats/core/clock";
import { Events } from "@/vendor/little-habitats/core/events";
import { UNIFORMS } from "@/vendor/little-habitats/fx/pokefx";
import type { LandmarkUpdateContext } from "@/vendor/little-habitats/landmarks/types";

const events = new Events();
/** A paused clock: the editor sets the time of day; it does not run on its own. */
export const lhClock = new Clock(events, { dayFrac: 0.42, yearFrac: 0.3 });
lhClock.setPaused(true);

let realTime = 0;

export function setLittleHabitatsTime(dayFrac: number, yearFrac: number) {
  lhClock.setDayFrac(dayFrac);
  lhClock.setYearFrac(yearFrac);
}

export function clockState(): ClockState {
  return lhClock.state;
}

/** Call once per frame. */
export function tickLittleHabitats(dt: number): LandmarkUpdateContext {
  realTime += dt;
  const state = lhClock.update(dt);
  state.realTime = realTime;
  UNIFORMS.uTime.value = realTime;
  UNIFORMS.uDaylight.value = state.daylight;
  UNIFORMS.uSnow.value = state.snow;
  UNIFORMS.uAutumn.value = state.autumn;
  UNIFORMS.uBloom.value = state.bloom;
  UNIFORMS.uYear.value = state.yearFrac;
  return {
    dt,
    realTime,
    time: state,
    night: 1 - state.daylight,
    wind: UNIFORMS.uWindStrength.value,
    windDir: UNIFORMS.uWindDir.value as THREE.Vector2
  };
}

export function currentRealTime() {
  return realTime;
}
