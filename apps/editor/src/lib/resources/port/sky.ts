// The Port sky as a sky entry of the editor: a low, warm sun under a broken cloud deck,
// with a bright gap at the horizon on the sun side. One shader gives the sky that you see and
// the environment map that lights every surface, so light, reflections and haze agree.
//
// The original scene lit its scene with one sun and this environment map (no fill lights), then set the
// exposure by itself. The editor has a fixed exposure, so the values below are the original code's
// values with one exposure number (SKY_EXPOSURE) that was set by eye against the original scene.
//
// Credit: this code was written by Claude Fable 5.2 (a public claude.ai artifact,
// https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA).
import * as THREE from "three";
import type { SkyInstance } from "../types";
import { loadPort } from "./kit";

/** Strength of the environment map as light (the original code's value). */
const ENVIRONMENT_INTENSITY = 2;
/** Exposure for the editor's tone mapping with this sky (set by eye against the original scene, 2026-11-12). */
export const SKY_EXPOSURE = 0.8;
/** Half size in meters of the box around the view that gets sun shadows. */
const SHADOW_HALF_SIZE = 70;
const SUN_DISTANCE = 220;
/** The haze: about half of a far object is left at 300 m. */
const FOG_DENSITY = 0.0028;

/** The skies that are alive now (for the local test handle: window.__therasDebug.portSkies). */
export const livePortSkies = new Set<SkyInstance>();

export function createPortSky(opts: { renderer: THREE.WebGLRenderer }): SkyInstance {
  const group = new THREE.Group();
  group.name = "port-sky";
  const fog = new THREE.FogExp2(0x6b7885, FOG_DENSITY);
  const sun = new THREE.DirectionalLight(0xffffff, 0);
  sun.name = "port-sun";
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  const box = sun.shadow.camera;
  box.left = -SHADOW_HALF_SIZE;
  box.right = SHADOW_HALF_SIZE;
  box.top = SHADOW_HALF_SIZE;
  box.bottom = -SHADOW_HALF_SIZE;
  box.near = 1;
  box.far = SUN_DISTANCE + 160;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);

  let disposed = false;
  let time = 0;
  let material: THREE.ShaderMaterial | null = null;
  let free: (() => void) | null = null;
  const direction = new THREE.Vector3(0.916, 0.225, 0.331).normalize();
  const center = new THREE.Vector3();

  const instance: SkyInstance = {
    object: group,
    fog,
    environment: null,
    environmentIntensity: ENVIRONMENT_INTENSITY,
    exposure: SKY_EXPOSURE,
    update(camera, dt) {
      time += dt;
      if (material) material.uniforms.uTime!.value = time;
      // The shadow box follows the view in steps of 8 m, so the shadow edges do not swim.
      center.set(Math.round(camera.position.x / 8) * 8, 0, Math.round(camera.position.z / 8) * 8);
      sun.target.position.copy(center);
      sun.position.copy(center).addScaledVector(direction, SUN_DISTANCE);
    },
    dispose() {
      disposed = true;
      livePortSkies.delete(instance);
      free?.();
      sun.dispose();
    }
  };
  livePortSkies.add(instance);

  void loadPort()
    .then((game) => {
      if (disposed) return;
      const noise = game.createNoiseTexture();
      const sky = game.createSky(noise);
      sky.mesh.userData.noOcclusion = true;
      sky.mesh.userData.noCollide = true;
      material = sky.material;
      group.add(sky.mesh);
      direction.copy(game.SUN.dir).normalize();
      sun.color.copy(game.SUN.color);
      sun.intensity = game.SUN.intensity;
      fog.color.copy(game.SKY.fog);
      const target = game.createSkyEnvironment(opts.renderer, sky);
      instance.environment = target.texture;
      free = () => {
        group.remove(sky.mesh);
        sky.geometry.dispose();
        sky.material.dispose();
        noise.dispose();
        target.dispose();
      };
    })
    .catch((error) => console.warn("[library] could not build the port sky:", error));

  return instance;
}
