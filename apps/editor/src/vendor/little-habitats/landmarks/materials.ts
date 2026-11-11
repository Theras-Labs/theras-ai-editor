// Ports index-BwioI7A7.js 26356-26415: the shared landmark materials (tf/nf) and the landmark mesh helper (rf).
import * as THREE from 'three';
import { PALETTE } from '../core/palette';
import { patchWorldMaterial } from '../fx/pokefx';

/** Builds the materials once. */
function createLandmarkMaterials() { // tf (26357)
  return {
    base: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.86, metalness: 0 }),
      { snow: 1 },
    ),
    glow: patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: `#ffe9c4`,
        emissive: new THREE.Color(PALETTE.lanternGlow),
        emissiveIntensity: 3.4,
        roughness: 0.6,
        flatShading: true,
      }),
      {
        fragment: `
        float lmNight = 1.0 - smoothstep(0.08, 0.6, uDaylight);
        float lmFlick = 0.92 + 0.08 * sin(uTime * 6.1 + vScWorldPos.x * 4.0) * sin(uTime * 3.3 + vScWorldPos.z * 3.0);
        totalEmissiveRadiance *= mix(0.04, 1.0, lmNight) * lmFlick;`,
        cacheKey: `lm-glow`,
      },
    ),
    glass: new THREE.MeshStandardMaterial({
      color: `#d9f0f2`,
      transparent: true,
      opacity: 0.38,
      roughness: 0.08,
      metalness: 0.1,
      depthWrite: false,
    }),
    water: patchWorldMaterial(
      new THREE.MeshStandardMaterial({
        color: PALETTE.waterShallow,
        emissive: new THREE.Color(`#2f8f93`),
        emissiveIntensity: 0.25,
        transparent: true,
        opacity: 0.82,
        roughness: 0.12,
      }),
      {
        fragment: `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.98, 0.97), smoothstep(0.55, 0.9, sc_noise(vScWorldPos.xy * 6.0 + vec2(0.0, uTime * 3.0))) * 0.6);`,
        cacheKey: `lm-water`,
      },
    ),
    cloth: patchWorldMaterial(
      new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9, flatShading: true }),
      {
        snow: 0.6,
        vertex: `
      // flutter: displacement grows along local +x (attach the cloth at x = 0)
      float lmK = max(0.0, transformed.x);
      transformed.z += sin(uTime * 7.0 + transformed.x * 3.5 + sc_origin.x) * 0.06 * lmK * (0.4 + uWindStrength);
      transformed.y += sin(uTime * 5.3 + transformed.x * 2.7 + sc_origin.z) * 0.03 * lmK * uWindStrength;`,
        cacheKey: `lm-cloth`,
      },
    ),
  };
}

export type LandmarkMaterials = ReturnType<typeof createLandmarkMaterials>;

let cache: LandmarkMaterials | null = null; // ef (26356)

/** The shared landmark materials: base, glow, glass, water, cloth. Built on first use. */
export function landmarkMaterials(): LandmarkMaterials { // nf (26409)
  return (cache ??= createLandmarkMaterials());
}

/** A mesh that receives shadows and (by default) casts them. */
export function landmarkMesh( // rf (26412)
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  castShadow = true,
): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = castShadow;
  mesh.receiveShadow = true;
  return mesh;
}
