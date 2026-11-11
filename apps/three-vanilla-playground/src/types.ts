import type { GameplayRuntime } from "@theras/gameplay-runtime";
import type { DerivedRenderScene } from "@theras/render-pipeline";
import type { SceneSettings, Vec3 } from "@theras/shared";
import type { TherasEngineScene } from "@theras/three-runtime";

export type AssetPathResolver = (path: string) => Promise<string> | string;

export type PlaybackPhysicsState = "paused" | "running" | "stopped";

export type PlayerActor = {
  height?: number;
  id: string;
  position: Vec3;
  radius?: number;
  tags: string[];
};

export type EnabledSystemsState = {
  audio: boolean;
  mover: boolean;
  openable: boolean;
  pathMover: boolean;
  sequence: boolean;
  trigger: boolean;
};

export type EnabledSystemKey = keyof EnabledSystemsState;

export type StageStats = {
  entities: number;
  lights: number;
  meshes: number;
  nodes: number;
};

export type SceneRuntimeConfig = {
  cameraMode: "fps" | "third-person" | "top-down";
  gameplayRuntime?: GameplayRuntime;
  physicsPlayback: PlaybackPhysicsState;
  renderScene: DerivedRenderScene;
  resolveAssetPath: AssetPathResolver;
  scene: TherasEngineScene;
  sceneSettings: SceneSettings;
};
