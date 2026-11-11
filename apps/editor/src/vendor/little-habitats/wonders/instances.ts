// Ports index-BwioI7A7.js 36378-36423: instanced moving props (ev..av scratch objects, ov InstanceSet)
// and the vertex-colour basic material (sv).
import * as THREE from 'three';

const tmpMatrix = new THREE.Matrix4(); // ev (36378)
const tmpQuat = new THREE.Quaternion(); // tv (36379)
const tmpEuler = new THREE.Euler(0, 0, 0, `YXZ`); // nv (36380)
const tmpPos = new THREE.Vector3(); // rv (36381)
const tmpScale = new THREE.Vector3(); // iv (36382)
const tmpColor = new THREE.Color(); // av (36383)

/** Geometry layers of a cached prefab (Sv). */
export interface InstanceGeometries {
  base?: THREE.BufferGeometry;
  flag?: THREE.BufferGeometry;
  glow?: THREE.BufferGeometry;
}

export interface InstanceMaterials {
  base?: THREE.Material;
  glow?: THREE.Material;
  /** Materials that this set disposes. */
  own?: THREE.Material[];
}

/** One InstancedMesh per layer (base, glow); every layer shares the same instance matrices. */
export class InstanceSet { // ov (36384)
  count: number;
  meshes: THREE.InstancedMesh[] = [];
  owned: THREE.Material[] = [];
  constructor(
    geometries: InstanceGeometries,
    count: number,
    materials: InstanceMaterials,
    parent: THREE.Object3D,
    castShadow = false,
  ) {
    this.count = count;
    const add = (geometry: THREE.BufferGeometry | undefined, material: THREE.Material | undefined, shadow: boolean) => {
      if (!geometry || !material) return;
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.castShadow = shadow;
      mesh.receiveShadow = false;
      tmpMatrix.makeScale(0, 0, 0);
      for (let e = 0; e < count; e++) mesh.setMatrixAt(e, tmpMatrix);
      parent.add(mesh);
      this.meshes.push(mesh);
    };
    add(geometries.base, materials.base, castShadow);
    add(geometries.glow, materials.glow, false);
    if (materials.own) this.owned.push(...materials.own);
  }

  set(i: number, x: number, y: number, z: number, yaw: number, scale: number, pitch = 0, roll = 0): void {
    if (scale <= 1e-4) tmpMatrix.makeScale(0, 0, 0);
    else {
      tmpEuler.set(pitch, yaw, roll, `YXZ`);
      tmpQuat.setFromEuler(tmpEuler);
      tmpMatrix.compose(tmpPos.set(x, y, z), tmpQuat, tmpScale.set(scale, scale, scale));
    }
    for (const mesh of this.meshes) mesh.setMatrixAt(i, tmpMatrix);
  }

  /** Sets the instance colour of the first layer. */
  tint(i: number, color: THREE.ColorRepresentation): void {
    const mesh = this.meshes[0];
    if (mesh) {
      mesh.setColorAt(i, tmpColor.set(color));
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  flush(): void {
    for (const mesh of this.meshes) mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    for (const mesh of this.meshes) {
      mesh.removeFromParent();
      mesh.dispose();
    }
    for (const material of this.owned) material.dispose();
  }
}

/** MeshBasicMaterial with vertex colours, multiplied by an HDR colour. */
export function vertexColorBasic(r: number, g: number, b: number): THREE.MeshBasicMaterial { // sv (36421)
  return new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(r, g, b) });
}
