// Island kit sky as a Theras environment: the sky dome shader, the sun (or moon) light,
// the hemisphere light and the fog, computed by Island kit' own atmosphere state for
// a time of day and year. The post-processing chain of the game is not used: the editor
// renders the scene itself.
import * as THREE from "three";
import { clamp, smoothstep } from "@/vendor/little-habitats/core/anim";
import { computeAtmosphere, createAtmosphereState } from "@/vendor/little-habitats/atmosphere/state";
import { createSky } from "@/vendor/little-habitats/atmosphere/sky";
import { UNIFORMS } from "@/vendor/little-habitats/fx/pokefx";
import type { EnvironmentParams, ResourceEntry } from "../types";
import { createLensFlare } from "../sky/lens-flare";
import { clockState, setLittleHabitatsTime } from "./runtime";

const SUN_DISTANCE = 60;
const SHADOW_HALF_SIZE = 19.5;

export type LittleHabitatsEnvironment = {
  object: THREE.Group;
  fog: THREE.Fog;
  update: (camera: THREE.Camera) => void;
  dispose: () => void;
};

export function createLittleHabitatsEnvironment(params: EnvironmentParams): LittleHabitatsEnvironment {
  setLittleHabitatsTime(params.dayFrac, params.yearFrac);

  const group = new THREE.Group();
  group.name = "little-habitats-environment";

  const sun = new THREE.DirectionalLight("#fff1d6", 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -SHADOW_HALF_SIZE;
  sun.shadow.camera.right = SHADOW_HALF_SIZE;
  sun.shadow.camera.top = SHADOW_HALF_SIZE;
  sun.shadow.camera.bottom = -SHADOW_HALF_SIZE;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 140;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  group.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight("#d4e6f8", "#bdae8c", 1.3);
  hemi.position.set(0, 1, 0);
  group.add(hemi);

  const fog = new THREE.Fog(new THREE.Color("#eef0e2"), 45, 175);
  const sky = createSky();
  sky.mesh.userData.noOcclusion = true;
  (sky.mesh.material as THREE.ShaderMaterial).uniforms.uCloudStyle!.value = params.cloudStyle === "cumulus" ? 1 : 0;
  group.add(sky.mesh);
  const flare = params.flare ? createLensFlare() : null;
  if (flare) group.add(flare.mesh);

  const look = createAtmosphereState();
  const sunPos = new THREE.Vector3();
  const moonPos = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const cloudOffset = new THREE.Vector2();

  const update = (camera: THREE.Camera) => {
    const clock = clockState();
    computeAtmosphere(clock, 0, look);
    if (params.clouds !== undefined) look.cloudCover = params.clouds;
    const el = clock.sunElevation;
    const az = clock.sunAzimuth;
    sunPos.set(Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el));
    moonPos.set(-sunPos.x, -sunPos.y + 0.28, -sunPos.z).normalize();
    let intensity: number;
    if (look.sunWeight > 0.5) {
      const lightEl = el > 0.42 ? el : 0.26 + 0.16 * smoothstep(0, 0.42, el);
      lightDir.set(Math.cos(az) * Math.cos(lightEl), Math.sin(lightEl), Math.sin(az) * Math.cos(lightEl));
      sun.color.copy(look.sunColor);
      intensity = look.sunIntensity;
    } else {
      const moonEl = Math.max(0.62, Math.asin(clamp(moonPos.y, -1, 1)));
      const moonAz = Math.atan2(moonPos.z, moonPos.x);
      lightDir.set(Math.cos(moonAz) * Math.cos(moonEl), Math.sin(moonEl), Math.sin(moonAz) * Math.cos(moonEl));
      sun.color.copy(look.moonColor);
      intensity = look.moonIntensity;
    }
    sun.intensity = intensity;
    sun.position.copy(lightDir).multiplyScalar(SUN_DISTANCE);
    sun.target.position.set(0, 0, 0);
    UNIFORMS.uSunDir.value.copy(lightDir);
    hemi.color.copy(look.hemiSky);
    hemi.groundColor.copy(look.hemiGround);
    hemi.intensity = look.hemiI;
    fog.color.copy(look.fog);
    fog.near = look.fogNear;
    fog.far = look.fogFar;
    const t = clock.realTime;
    cloudOffset.x = (UNIFORMS.uWindDir.value.x * t * 0.004) % 1e3;
    cloudOffset.y = (UNIFORMS.uWindDir.value.y * t * 0.004) % 1e3;
    sky.update(look, sunPos, moonPos, cloudOffset, t, camera as THREE.PerspectiveCamera);
    sky.mesh.position.copy(camera.position);
    flare?.update(camera, sunPos, look.sunWeight > 0.5 && sunPos.y > 0.01, look.sunColor);
  };

  return {
    object: group,
    fog,
    update,
    dispose: () => {
      sky.mesh.geometry.dispose();
      (sky.mesh.material as THREE.Material).dispose();
      sun.dispose();
      hemi.dispose();
      flare?.dispose();
    }
  };
}

const ORIGIN = "Island kit";
const LICENSE = "Owned by the Theras AI author";

const SKIES: ({ id: string; name: string; tags: string[]; description: string } & EnvironmentParams)[] = [
  { id: "spring_morning", name: "Spring morning", dayFrac: 0.33, yearFrac: 0.16, tags: ["day", "spring", "soft"], description: "Low warm sun, fresh green light." },
  { id: "summer_noon", name: "Summer noon", dayFrac: 0.48, yearFrac: 0.4, tags: ["day", "summer", "bright"], description: "High sun and a clear blue sky." },
  { id: "golden_hour", name: "Golden hour", dayFrac: 0.71, yearFrac: 0.4, tags: ["evening", "warm", "sunset"], description: "Long shadows and a warm orange sky." },
  { id: "autumn_afternoon", name: "Autumn afternoon", dayFrac: 0.6, yearFrac: 0.66, tags: ["day", "autumn", "warm"], description: "Amber light and hazy air." },
  { id: "winter_day", name: "Winter day", dayFrac: 0.5, yearFrac: 0.9, tags: ["day", "winter", "cold", "snow"], description: "Pale sky and cool light." },
  { id: "dusk", name: "Dusk", dayFrac: 0.79, yearFrac: 0.4, tags: ["evening", "purple", "lanterns"], description: "Blue hour; lanterns start to glow." },
  { id: "anime_day", name: "Anime day", dayFrac: 0.44, yearFrac: 0.4, clouds: 0.55, cloudStyle: "cumulus", flare: true, tags: ["day", "anime", "clouds", "cumulus", "sun", "flare", "bright"], description: "Bright blue sky with big puffy cumulus clouds and a sun lens flare." },
  { id: "anime_morning", name: "Anime morning", dayFrac: 0.31, yearFrac: 0.2, clouds: 0.45, cloudStyle: "cumulus", flare: true, tags: ["morning", "anime", "clouds", "sun", "flare", "soft"], description: "Low morning sun through soft cumulus clouds, with a lens flare." },
  { id: "anime_sunset", name: "Anime sunset", dayFrac: 0.72, yearFrac: 0.4, clouds: 0.5, cloudStyle: "cumulus", flare: true, tags: ["sunset", "evening", "anime", "clouds", "flare", "warm"], description: "Warm sunset with glowing cloud edges and a lens flare." },
  { id: "cloudy_day", name: "Cloudy day", dayFrac: 0.5, yearFrac: 0.45, clouds: 0.85, cloudStyle: "cumulus", tags: ["day", "clouds", "overcast", "cumulus"], description: "A sky full of large cumulus clouds." },
  { id: "night", name: "Starry night", dayFrac: 0.95, yearFrac: 0.4, tags: ["night", "stars", "moon"], description: "Moonlight and stars; lanterns and fires glow." }
];

export const LH_SKY_ENTRIES: ResourceEntry[] = SKIES.map((s) => ({
  id: `lh:sky:${s.id}`,
  name: s.name,
  kind: "sky",
  source: "local",
  origin: ORIGIN,
  license: LICENSE,
  tags: ["little-habitats", "sky", "light", "fog", ...s.tags],
  description: s.description,
  footprint: 0,
  environment: { dayFrac: s.dayFrac, yearFrac: s.yearFrac, clouds: s.clouds, cloudStyle: s.cloudStyle, flare: s.flare }
}));
