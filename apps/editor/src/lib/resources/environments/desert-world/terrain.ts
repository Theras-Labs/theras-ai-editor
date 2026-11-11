// The ground of the crop: one height grid, 2 m cells in the crop, then an apron of wider cells
// out to the horizon, so the crop does not end in a hard edge. Heights come from the built
// desert height function; the grid is local to the crop origin.
import * as THREE from "three";

export type CropSpec = { cx: number; cz: number; half: number; step: number; apron: number[] };

/** Axis positions (relative to the crop centre): fine inside the crop, wider in the apron. */
function axis(spec: CropSpec): number[] {
  const out: number[] = [];
  const n = Math.round((spec.half * 2) / spec.step);
  for (const d of [...spec.apron].reverse()) out.push(-spec.half - d);
  for (let i = 0; i <= n; i++) out.push(-spec.half + (i * spec.half * 2) / n);
  for (const d of spec.apron) out.push(spec.half + d);
  return out;
}

export function buildTerrainGeometry(spec: CropSpec, height: (x: number, z: number) => number, originY: number): THREE.BufferGeometry {
  const xs = axis(spec);
  const n = xs.length;
  const outer = spec.half + spec.apron[spec.apron.length - 1];
  const pos = new Float32Array(n * n * 3);
  for (let row = 0; row < n; row++)
    for (let col = 0; col < n; col++) {
      const lx = xs[col];
      const lz = xs[row];
      let h = height(spec.cx + lx, spec.cz + lz) - originY;
      // the apron's last ring rolls down a little, so its edge sits under the horizon line
      const edge = Math.max(Math.abs(lx), Math.abs(lz));
      if (edge > spec.half) {
        const t = (edge - spec.half) / (outer - spec.half);
        h -= t * t * t * 18;
      }
      const i = (row * n + col) * 3;
      pos[i] = lx;
      pos[i + 1] = h;
      pos[i + 2] = lz;
    }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let row = 0; row < n - 1; row++)
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      index[k++] = a;
      index[k++] = c;
      index[k++] = b;
      index[k++] = b;
      index[k++] = c;
      index[k++] = d;
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();
  return geo;
}
