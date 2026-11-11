// The wrap sweep of game mode: when a unit gets its collider, a bright band rises over it from
// bottom to top (about 0.65 s) and leaves a faint grid that fades out. Color by mode.
// The scene materials are NOT patched (many objects share one material, see
// src/lib/build-reveal.ts). Instead each sweep draws overlay meshes: the unit's own geometries
// for a trimesh or hull collider, the collider shape for a box or capsule collider.
// Each sweep has its own ShaderMaterial; overlays are removed and disposed when the sweep ends.
// Client-only; GameWorld calls update() in useFrame only while sweeps are alive.
import * as THREE from "three";
import type { BuiltUnit } from "./scene-colliders";

/** Band rise time. */
export const SWEEP_RISE_MS = 650;
/** Grid fade after the rise. */
export const SWEEP_FADE_MS = 350;
/** Sweeps alive at one time; more units are still built, without their own sweep. */
export const MAX_SWEEPS = 24;
/** Geometries above this get a box overlay. */
const MAX_OVERLAY_TRIANGLES = 150_000;
/** Overlay meshes per sweep; a unit with more meshes gets one box overlay. */
const MAX_OVERLAY_MESHES = 64;

const COLORS: Record<string, THREE.Color> = {
  solid: new THREE.Color("#5cf2b0"),
  loose: new THREE.Color("#ffb454"),
  trunk: new THREE.Color("#b8e986")
};

const VERTEX = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform float uMinY;
uniform float uMaxY;
uniform float uProgress;
uniform float uFade;
varying vec3 vWorld;
void main() {
  float h = (vWorld.y - uMinY) / max(uMaxY - uMinY, 0.001);
  float front = uProgress * 1.15 - 0.05;
  if (h > front + 0.06) discard;
  // Bright band at the front.
  float d = (front - h) / 0.035;
  float band = exp(-d * d) * step(uProgress, 0.999);
  // Faint grid (0.5 m) in the swept part.
  vec3 g = vWorld * 2.0;
  vec3 w = max(fwidth(g), vec3(0.0001));
  vec3 lines = abs(fract(g - 0.5) - 0.5) / w;
  float grid = 1.0 - min(min(lines.x, lines.y), lines.z);
  grid = clamp(grid, 0.0, 1.0) * 0.35 * step(h, front);
  float a = clamp((band * 1.6 + grid + 0.06 * step(h, front)) * uFade, 0.0, 1.0);
  if (a < 0.003) discard;
  gl_FragColor = vec4(uColor * (1.0 + band * 1.5), a);
}`;

type Sweep = {
  start: number;
  group: THREE.Group;
  material: THREE.ShaderMaterial;
  /** Overlays that follow a scene mesh (loose objects move). */
  follow: { overlay: THREE.Mesh; source: THREE.Mesh }[];
  /** Geometries this sweep made (boxes, capsules). */
  owned: THREE.BufferGeometry[];
};

const noRaycast = () => undefined;

function triangles(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  if (!position) return 0;
  return (geometry.index ? geometry.index.count : position.count) / 3;
}

function overlayMesh(geometry: THREE.BufferGeometry, material: THREE.Material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "game-sweep";
  mesh.userData.noCollide = true;
  mesh.matrixAutoUpdate = false;
  mesh.raycast = noRaycast;
  mesh.renderOrder = 10;
  return mesh;
}

export class WrapSweeps {
  private sweeps: Sweep[] = [];
  private root = new THREE.Group();

  constructor(scene: THREE.Object3D) {
    this.root.name = "game-sweeps";
    this.root.userData.noCollide = true;
    this.root.raycast = noRaycast;
    scene.add(this.root);
  }

  get alive() {
    return this.sweeps.length;
  }

  /** Starts a sweep over a unit that just got its collider. Returns false when the limit is reached. */
  add(unit: BuiltUnit, now = performance.now()) {
    if (this.sweeps.length >= MAX_SWEEPS || unit.box.isEmpty()) return false;
    const box = unit.box.clone();
    if (unit.capsule) {
      const { center, halfHeight, radius } = unit.capsule;
      box.min.set(center.x - radius, center.y - halfHeight - radius, center.z - radius);
      box.max.set(center.x + radius, center.y + halfHeight + radius, center.z + radius);
    }
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: (COLORS[unit.mode] ?? COLORS.solid!).clone() },
        uMinY: { value: box.min.y },
        uMaxY: { value: box.max.y },
        uProgress: { value: 0 },
        uFade: { value: 1 }
      },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -4,
      toneMapped: false
    });
    const sweep: Sweep = { start: now, group: new THREE.Group(), material, follow: [], owned: [] };
    sweep.group.name = "game-sweep";
    sweep.group.userData.noCollide = true;

    const addBox = (b: THREE.Box3) => {
      if (b.isEmpty()) return;
      const geometry = new THREE.BoxGeometry(1, 1, 1);
      sweep.owned.push(geometry);
      const mesh = overlayMesh(geometry, material);
      const size = b.getSize(new THREE.Vector3()).max(new THREE.Vector3(0.04, 0.04, 0.04));
      mesh.matrix.compose(b.getCenter(new THREE.Vector3()), new THREE.Quaternion(), size);
      sweep.group.add(mesh);
    };

    if (unit.shape === "capsule" && unit.capsule) {
      const { center, halfHeight, radius } = unit.capsule;
      const geometry = new THREE.CapsuleGeometry(radius, halfHeight * 2, 4, 12);
      sweep.owned.push(geometry);
      const mesh = overlayMesh(geometry, material);
      mesh.matrix.makeTranslation(center.x, center.y, center.z);
      sweep.group.add(mesh);
    } else if (unit.shape === "box" || unit.meshes.length > MAX_OVERLAY_MESHES) {
      addBox(box);
    } else {
      // Trimesh or hull: the unit's own geometries at their world matrices.
      for (const source of unit.meshes) {
        const skinned = (source as THREE.SkinnedMesh).isSkinnedMesh === true;
        const instanced = (source as THREE.InstancedMesh).isInstancedMesh === true;
        if (skinned || instanced || triangles(source.geometry) > MAX_OVERLAY_TRIANGLES) {
          if (!source.geometry.boundingBox) source.geometry.computeBoundingBox();
          addBox(instanced ? box : source.geometry.boundingBox!.clone().applyMatrix4(source.matrixWorld));
          continue;
        }
        const mesh = overlayMesh(source.geometry, material);
        mesh.matrix.copy(source.matrixWorld);
        sweep.group.add(mesh);
        sweep.follow.push({ overlay: mesh, source });
      }
    }
    if (sweep.group.children.length === 0) {
      this.end(sweep);
      return false;
    }
    this.root.add(sweep.group);
    this.sweeps.push(sweep);
    return true;
  }

  /** Advances every sweep; removes the ones that ended. Call each frame while alive > 0. */
  update(now = performance.now()) {
    if (this.sweeps.length === 0) return;
    const keep: Sweep[] = [];
    for (const sweep of this.sweeps) {
      const t = now - sweep.start;
      if (t >= SWEEP_RISE_MS + SWEEP_FADE_MS) {
        this.end(sweep);
        continue;
      }
      const u = sweep.material.uniforms;
      const rise = Math.min(1, t / SWEEP_RISE_MS);
      u.uProgress!.value = 1 - Math.pow(1 - rise, 2);
      u.uFade!.value = t <= SWEEP_RISE_MS ? 1 : 1 - (t - SWEEP_RISE_MS) / SWEEP_FADE_MS;
      for (const f of sweep.follow) f.overlay.matrix.copy(f.source.matrixWorld);
      keep.push(sweep);
    }
    this.sweeps = keep;
  }

  private end(sweep: Sweep) {
    sweep.group.removeFromParent();
    sweep.material.dispose();
    for (const geometry of sweep.owned) geometry.dispose();
    sweep.follow = [];
  }

  /** Removes every overlay (game mode ends). */
  dispose() {
    for (const sweep of this.sweeps) this.end(sweep);
    this.sweeps = [];
    this.root.removeFromParent();
  }
}
