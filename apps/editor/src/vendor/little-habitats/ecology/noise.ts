// Ports index-BwioI7A7.js 23631-23646 ($u, ed).
// The plan names ed `sharedNoise`. It is the shared 128 x 128 soft round alpha texture (white RGB, alpha falls off
// from the centre) used for lantern glow discs here and by landmarks.
import * as THREE from 'three';

let cached: THREE.DataTexture | null = null; // $u (23631)

export function sharedNoise(): THREE.DataTexture { // ed (23632)
  if (cached) return cached;
  const data = new Uint8Array(65536);
  for (let y = 0; y < 128; y++)
    for (let x = 0; x < 128; x++) {
      const u = (x + 0.5) / 128 - 0.5;
      const v = (y + 0.5) / 128 - 0.5;
      const r = Math.min(1, Math.sqrt(u * u + v * v) * 2);
      const a = (1 - r) ** 2.2 * (1 - r * 0.3);
      const k = (y * 128 + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = 255;
      data[k + 3] = Math.round(a * 255);
    }
  const tex = new THREE.DataTexture(data, 128, 128, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearFilter;
  cached = tex;
  return tex;
}
