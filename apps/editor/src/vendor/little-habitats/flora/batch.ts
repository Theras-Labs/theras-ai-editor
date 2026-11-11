// Ports bundle lines 22471-22597: one instanced mesh per species, with per-instance growth / birth / death data.
import * as THREE from 'three';
import { PLANT_BUILDERS } from './plants';
import { SPECIES_LOOK, applySpeciesLook, type SeasonState } from './look';
import { createFloraDepthMaterial, createFloraMaterial, createFloraUniforms, type FloraUniforms } from './shader';
import type { SpeciesId } from './species';

/** Death time of a living plant (far in the future). */
export const NEVER = 1e9; // lu (22471)

const _matrix = new THREE.Matrix4(); // uu (22472)
const _quat = new THREE.Quaternion(); // du (22473)
const _pos = new THREE.Vector3(); // fu (22474)
const _scale = new THREE.Vector3(); // pu (22475)
const _up = new THREE.Vector3(0, 1, 0); // mu (22476)

/** One plant as flora tracks it (the `e` records of createFlora's sync). */
export interface FloraInstance {
  id: string;
  sp: SpeciesId;
  /** Index in its batch, -1 when not in a batch. */
  slot: number;
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
  variant: number;
  /** Growth animates from gFrom to gTo over 1.2 s from gT0 (uTime seconds). */
  gFrom: number;
  gTo: number;
  gT0: number;
  birth: number;
  death: number;
  seen: number;
}

export class SpeciesBatch { // hu (22477)
  id: SpeciesId;
  group: THREE.Group;
  uni: FloraUniforms;
  mat: THREE.MeshStandardMaterial;
  depth: THREE.MeshDepthMaterial | null;
  base: THREE.BufferGeometry;
  mesh!: THREE.InstancedMesh;
  cap = 0;
  count = 0;
  slots: FloraInstance[] = [];
  i0!: THREE.InstancedBufferAttribute;
  i1!: THREE.InstancedBufferAttribute;
  dMin = 1 / 0;
  dMax = -1;
  state: SeasonState = { leaf: 1, blossom: 0, fruit: 0, flower: 0, bud: 0, seed: 0, dormant: 0, size: 1 };

  constructor(id: SpeciesId, group: THREE.Group) {
    this.id = id;
    this.group = group;
    const look = SPECIES_LOOK[id];
    this.base = PLANT_BUILDERS[id]();
    this.uni = createFloraUniforms();
    applySpeciesLook(id, this.uni);
    this.mat = createFloraMaterial(this.uni, !!look.doubleSide);
    this.depth = look.shadow ? createFloraDepthMaterial(this.uni) : null;
    this.allocate(id === `grass_tuft` ? 2048 : 32);
  }

  /** (Re)creates the instanced mesh with capacity `cap`, copying the current instances. */
  allocate(cap: number): void {
    const old = this.mesh as THREE.InstancedMesh | undefined;
    const geometry = new THREE.BufferGeometry();
    for (const name of Object.keys(this.base.attributes)) geometry.setAttribute(name, this.base.getAttribute(name));
    geometry.boundingSphere = this.base.boundingSphere;
    const i0 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const i1 = new THREE.InstancedBufferAttribute(new Float32Array(cap * 2), 2);
    i0.setUsage(THREE.DynamicDrawUsage);
    i1.setUsage(THREE.DynamicDrawUsage);
    if (old) {
      (i0.array as Float32Array).set(this.i0.array as Float32Array);
      (i1.array as Float32Array).set(this.i1.array as Float32Array);
    }
    geometry.setAttribute('aI0', i0);
    geometry.setAttribute('aI1', i1);
    const mesh = new THREE.InstancedMesh(geometry, this.mat, cap);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    if (old) (mesh.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
    mesh.count = this.count;
    mesh.visible = this.count > 0;
    mesh.frustumCulled = false;
    mesh.castShadow = !!this.depth;
    mesh.receiveShadow = true;
    if (this.depth) mesh.customDepthMaterial = this.depth;
    mesh.name = `flora-${this.id}`;
    this.group.add(mesh);
    if (old) {
      this.group.remove(old);
      old.geometry.dispose();
      old.dispose();
    }
    this.mesh = mesh;
    this.i0 = i0;
    this.i1 = i1;
    this.cap = cap;
    this.dMin = 0;
    this.dMax = this.count - 1;
  }

  add(e: FloraInstance): void {
    if (this.count >= this.cap) this.allocate(this.cap * 2);
    e.slot = this.count++;
    this.slots[e.slot] = e;
    this.mesh.count = this.count;
    this.mesh.visible = true;
    this.writeMatrix(e);
    this.writeAttrs(e);
  }

  writeMatrix(e: FloraInstance): void {
    _quat.setFromAxisAngle(_up, e.rotY);
    _matrix.compose(_pos.set(e.x, e.y, e.z), _quat, _scale.setScalar(e.scale));
    this.mesh.setMatrixAt(e.slot, _matrix);
    this.mark(e.slot);
  }

  writeAttrs(e: FloraInstance): void {
    const i0 = this.i0.array as Float32Array;
    const i1 = this.i1.array as Float32Array;
    const k = e.slot * 4;
    i0[k] = e.variant;
    i0[k + 1] = e.birth;
    i0[k + 2] = e.death;
    i0[k + 3] = e.gT0;
    i1[e.slot * 2] = e.gFrom;
    i1[e.slot * 2 + 1] = e.gTo;
    this.mark(e.slot);
  }

  /** Removes e by moving the last instance into its slot. */
  remove(e: FloraInstance): void {
    const last = this.count - 1;
    const slot = e.slot;
    if (slot < 0 || slot > last || this.slots[slot] !== e) return;
    if (slot !== last) {
      const moved = this.slots[last];
      this.slots[slot] = moved;
      moved.slot = slot;
      (this.mesh.instanceMatrix.array as Float32Array).copyWithin(slot * 16, last * 16, last * 16 + 16);
      (this.i0.array as Float32Array).copyWithin(slot * 4, last * 4, last * 4 + 4);
      (this.i1.array as Float32Array).copyWithin(slot * 2, last * 2, last * 2 + 2);
      this.mark(slot);
    }
    this.slots.length = last;
    this.count = last;
    this.mesh.count = last;
    this.mesh.visible = last > 0;
    e.slot = -1;
  }

  mark(slot: number): void {
    if (slot < this.dMin) this.dMin = slot;
    if (slot > this.dMax) this.dMax = slot;
  }

  /** Uploads the instance range changed since the last flush. */
  flush(): void {
    if (this.dMax < this.dMin) return;
    const start = this.dMin;
    const count = this.dMax - this.dMin + 1;
    const matrices = this.mesh.instanceMatrix;
    matrices.clearUpdateRanges();
    matrices.addUpdateRange(start * 16, count * 16);
    matrices.needsUpdate = true;
    this.i0.clearUpdateRanges();
    this.i0.addUpdateRange(start * 4, count * 4);
    this.i0.needsUpdate = true;
    this.i1.clearUpdateRanges();
    this.i1.addUpdateRange(start * 2, count * 2);
    this.i1.needsUpdate = true;
    this.dMin = 1 / 0;
    this.dMax = -1;
  }
}
