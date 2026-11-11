// Theras stub of the Island kit game context type. The full type (src/game/types.ts in
// the island kit source) imports every game system; Theras hosts only
// terrain, flora shading and the sky, so the other systems are typed loosely here.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as THREE from 'three';
import type { Clock } from '../core/clock';
import type { Events } from '../core/events';
import type { Grid } from '../core/grid';
import type { GameState } from '../core/state';
import type { World } from '../core/world';
import type { UNIFORMS } from '../fx/pokefx';

export interface Session {
  loadedSave: boolean;
  showMenu: boolean;
  sampleGarden: boolean;
  blankStart: boolean;
  visiting: { name: string } | null;
}

export interface Game {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  container: HTMLElement;
  params: URLSearchParams;
  seed: number;
  grid: Grid;
  world: World;
  clock: Clock;
  events: Events;
  state: GameState;
  uniforms: typeof UNIFORMS;
  session: Session;
  atmosphere: any;
  terrain: any;
  flora: any;
  ecology: any;
  landmarks: any;
  wonders: any;
  fauna: any;
  interaction: any;
  ui: any;
  audio: any;
}
