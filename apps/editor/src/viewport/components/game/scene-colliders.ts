// Builds Rapier colliders from the live three.js scene for game mode. Every object that the
// viewport draws as "node:<id>" is one unit. A unit is solid (one fixed trimesh), loose (one
// dynamic convex body that moves its object), a tree trunk (one fixed capsule) or ghost (no
// collider). A scan runs a few times a second in the browser only (no network, no database):
// it adds units that appear (also while the AI builds), rebuilds units that changed, and
// removes units that are gone. Loose objects go back to their places on reset and on exit.
// During the wrap phase a scan only marks new units as ready ("held"); GameWorld then builds
// them a few at a time with buildHeld, so the user sees the wrap.
import type { useRapier } from "@react-three/rapier";
import * as THREE from "three";
import type { BodyInfo, BodyMode, BodyShape, ColliderScope, LooseDefault } from "@/lib/game/game-store";
import type { WrapItem } from "@/lib/game/wrap-plan";

type RapierContext = ReturnType<typeof useRapier>;
type World = RapierContext["world"];
type RapierModule = RapierContext["rapier"];
type Body = ReturnType<World["createRigidBody"]>;

/** What the scene document says about one node. */
export type NodeInfo = {
  /** Library kind: plant, building, feature, water, creature, ... */
  kind?: string;
  terrain?: boolean;
  /** Sky, lake and other nodes that must never collide. */
  skip?: boolean;
};

export type ColliderSettings = {
  scope: ColliderScope;
  looseDefault: LooseDefault;
  overrides: Record<string, BodyMode>;
};

type UnitMode = BodyMode | "trunk";

type Unit = {
  id: string;
  object: THREE.Object3D;
  mode: UnitMode;
  body: Body | null;
  /** Root part of the signature: mode, root transform, geometry identities. */
  rootSig: string;
  /** Pose part: where each mesh is relative to the root (moves while an object animates). */
  poseSig: string;
  /** Pose part that waits for one more scan before a rebuild (objects that are still rising). */
  pendingPose: string | null;
  firstSeen: number;
  built: boolean;
  /** No collidable meshes (not loaded yet, hidden, or only instanced parts). */
  empty: boolean;
  /** Loose units: the local transform to restore. */
  home?: { position: THREE.Vector3; quaternion: THREE.Quaternion };
  /** The shape that was really built (null = no collider). */
  shape: BodyShape | null;
  /** Ready for its first build, waiting for the wrap (wrap phase only). */
  held: boolean;
  /** The meshes and signatures of the last scan, for a build outside the scan. */
  meshes: THREE.Mesh[];
  nextRootSig: string;
  nextPoseSig: string;
  /** World center of the meshes at the last scan (wrap order). */
  center: THREE.Vector3;
  /** The unit had its first collider (and its sweep) in this game session. */
  swept: boolean;
};

/** A unit that just got its first collider: the sweep effect draws over it. */
export type BuiltUnit = {
  id: string;
  mode: UnitMode;
  shape: BodyShape;
  meshes: THREE.Mesh[];
  /** World box of the unit (the box collider for shape "box"). */
  box: THREE.Box3;
  /** The capsule collider (shape "capsule"): center, half height of the cylinder part, radius. */
  capsule?: { center: THREE.Vector3; halfHeight: number; radius: number };
};

const MAX_TRIANGLES = 400_000;
const HULL_POINTS = 2_000;
/** A never-built unit that keeps changing (a turning windmill) is built after this time anyway. */
const FORCE_BUILD_MS = 2_500;
const LOOSE_DENSITY = 180;

const tmpBox = new THREE.Box3();
const tmpBox2 = new THREE.Box3();
const tmpV = new THREE.Vector3();
const tmpM = new THREE.Matrix4();
const tmpInv = new THREE.Matrix4();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpScale = new THREE.Vector3();

const round = (n: number, step: number) => Math.round(n / step);

function nodeIdOf(object: THREE.Object3D): string | null {
  // World mode prefixes ids with the document ("doc::node"). Instanced batches have no plain
  // meshes, so they never get a collider.
  return object.name.startsWith("node:") ? object.name.slice(5) : null;
}

/** The editor node id: world mode ids carry a "doc::" prefix. */
export const plainId = (id: string) => (id.includes("::") ? id.slice(id.lastIndexOf("::") + 2) : id);

function visibleInScene(object: THREE.Object3D) {
  for (let o: THREE.Object3D | null = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

const isInstanced = (mesh: THREE.Mesh) => (mesh as THREE.InstancedMesh).isInstancedMesh === true;

/** Trunk colliders are made only for plants at least this tall. */
const TRUNK_MIN_HEIGHT = 1.8;

/** Plain meshes can be trimesh or hull colliders; instanced meshes (island plants) only give a box. */
function collidable(mesh: THREE.Mesh) {
  if (!mesh.isMesh) return false;
  const data = mesh.userData ?? {};
  if (data.waterSurface || data.noWaterPass || data.noCollide || data.noOcclusion) return false;
  const position = mesh.geometry?.getAttribute?.("position");
  if (!position || position.count < 3) return false;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material && material.transparent && material.opacity < 0.35) return false;
  return true;
}

/** The meshes of a unit, without the meshes of nested units. */
function unitMeshes(root: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  const walk = (o: THREE.Object3D) => {
    if (!o.visible) return;
    if (o !== root && nodeIdOf(o)) return;
    if (collidable(o as THREE.Mesh)) out.push(o as THREE.Mesh);
    for (const child of o.children) walk(child);
  };
  walk(root);
  return out;
}

function attributeVersion(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  return "isInterleavedBufferAttribute" in attribute && attribute.isInterleavedBufferAttribute
    ? (attribute as THREE.InterleavedBufferAttribute).data.version
    : (attribute as THREE.BufferAttribute).version;
}

const tmpInstance = new THREE.Matrix4();

function worldBox(meshes: THREE.Mesh[], target: THREE.Box3) {
  target.makeEmpty();
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    if (isInstanced(mesh)) {
      const instanced = mesh as THREE.InstancedMesh;
      for (let i = 0; i < Math.min(instanced.count, 64); i++) {
        instanced.getMatrixAt(i, tmpInstance);
        tmpBox.copy(mesh.geometry.boundingBox!).applyMatrix4(tmpInstance.premultiply(mesh.matrixWorld));
        target.union(tmpBox);
      }
      continue;
    }
    tmpBox.copy(mesh.geometry.boundingBox!).applyMatrix4(mesh.matrixWorld);
    target.union(tmpBox);
  }
  return target;
}

export class SceneColliders {
  private units = new Map<string, Unit>();
  /** World boxes of water surfaces (lakes, seas), for the spawn point. */
  private water: THREE.Box3[] = [];
  private ground: Body | null = null;
  private groundY = Number.NaN;
  /** First builds since the last takeBuilt (for the sweep). */
  private built: BuiltUnit[] = [];

  constructor(
    private world: World,
    private rapier: RapierModule,
    private infoOf: (nodeId: string) => NodeInfo | undefined
  ) {}

  /** The safety ground: y 0 for flat scenes, under the sea for islands. */
  setGround(y: number) {
    if (y === this.groundY) return;
    if (this.ground) this.world.removeRigidBody(this.ground);
    this.groundY = y;
    this.ground = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(0, y - 0.5, 0));
    this.world.createCollider(this.rapier.ColliderDesc.cuboid(400, 0.5, 400).setFriction(0.9), this.ground);
  }

  stats() {
    let solid = 0;
    let loose = 0;
    for (const unit of this.units.values()) {
      if (!unit.body) continue;
      if (unit.mode === "loose") loose += 1;
      else solid += 1;
    }
    return { solid, loose };
  }

  /** True when every terrain unit has its collider (the spawn waits for the land). */
  terrainReady() {
    let any = false;
    for (const unit of this.units.values()) {
      if (!this.infoOf(unit.id)?.terrain) continue;
      any = true;
      if (!unit.body) return false;
    }
    return any;
  }

  /** Units that are seen but not built yet (held ones included). */
  pendingCount() {
    let n = 0;
    for (const unit of this.units.values()) if (!unit.built && !unit.empty && unit.mode !== "ghost") n += 1;
    return n;
  }

  /** Units that are ready and wait for the wrap, with their place (for the wrap order). */
  heldItems(): WrapItem[] {
    const out: WrapItem[] = [];
    for (const unit of this.units.values()) {
      if (!unit.held) continue;
      out.push({ id: unit.id, terrain: Boolean(this.infoOf(unit.id)?.terrain), x: unit.center.x, y: unit.center.y, z: unit.center.z });
    }
    return out;
  }

  /** Units that will get a collider but are not ready yet (loading, still moving). */
  waitingCount() {
    let n = 0;
    for (const unit of this.units.values()) if (!unit.built && !unit.held && !unit.empty && unit.mode !== "ghost") n += 1;
    return n;
  }

  /** Builds one held unit now. Returns true when it got a collider. */
  buildHeld(id: string) {
    const unit = this.units.get(id);
    if (!unit || !unit.held) return false;
    this.build(unit, unit.mode, unit.meshes);
    return unit.body !== null;
  }

  /**
   * Builds every unit that is seen but not built (held or not ready). Used at the end of the
   * wrap. Returns how many got a collider and the id of the last one.
   */
  buildAllPending() {
    let count = 0;
    let last: string | null = null;
    for (const unit of this.units.values()) {
      if (unit.built || unit.empty || unit.mode === "ghost" || unit.meshes.length === 0) continue;
      this.build(unit, unit.mode, unit.meshes);
      if (unit.body) {
        count += 1;
        last = unit.id;
      }
    }
    return { count, last };
  }

  /** The units that got their first collider since the last call. */
  takeBuilt(): BuiltUnit[] {
    const out = this.built;
    this.built = [];
    return out;
  }

  /** The live colliders by plain editor node id. */
  bodyInfos(): Record<string, BodyInfo> {
    const out: Record<string, BodyInfo> = {};
    for (const unit of this.units.values()) {
      if (!unit.body || !unit.shape || unit.mode === "ghost") continue;
      out[plainId(unit.id)] = { mode: unit.mode, shape: unit.shape };
    }
    return out;
  }

  /**
   * Compares the scene with the colliders and fixes the difference.
   * hold: new units are not built here; they are marked ready for buildHeld (wrap phase).
   */
  scan(scene: THREE.Object3D, settings: ColliderSettings, now = performance.now(), hold = false) {
    const seen = new Set<string>();
    scene.updateMatrixWorld();
    this.water = [];
    scene.traverse((object) => {
      const id = nodeIdOf(object);
      if (!id || seen.has(id)) return;
      seen.add(id);
      this.visit(id, object, settings, now, hold);
    });
    for (const [id, unit] of this.units) {
      if (!seen.has(id)) {
        this.removeUnit(unit);
        this.units.delete(id);
      }
    }
  }

  private collectWater(object: THREE.Object3D, info: NodeInfo | undefined) {
    if (info?.kind !== "water" && info?.kind !== "lake" && !info?.terrain) return;
    object.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !(info?.kind === "water" || mesh.userData?.waterSurface)) return;
      const box = worldBox([mesh], new THREE.Box3());
      if (!box.isEmpty()) this.water.push(box);
    });
  }

  /** True when a water surface lies above the ground point (x, groundY, z). */
  isWet(x: number, z: number, groundY: number) {
    for (const box of this.water) {
      if (x >= box.min.x && x <= box.max.x && z >= box.min.z && z <= box.max.z && box.max.y > groundY + 0.02) return true;
    }
    return false;
  }

  private modeFor(id: string, info: NodeInfo | undefined, meshes: THREE.Mesh[], settings: ColliderSettings): UnitMode {
    if (info?.skip || info?.kind === "water") return "ghost";
    const override = settings.overrides[id] ?? settings.overrides[plainId(id)];
    if (override) return override === "loose" && info?.terrain ? "solid" : override;
    if (settings.scope === "targets" && !info?.terrain) return "ghost";
    if (info?.terrain) return "solid";
    if (info?.kind === "plant") return "trunk";
    if (settings.looseDefault === "small" && meshes.length > 0) {
      const size = worldBox(meshes, new THREE.Box3()).getSize(tmpV);
      if (Math.max(size.x, size.y, size.z) <= 1.6 && size.x * size.y * size.z <= 1.5) return "loose";
    }
    return "solid";
  }

  private visit(id: string, object: THREE.Object3D, settings: ColliderSettings, now: number, hold: boolean) {
    const info = this.infoOf(id);
    this.collectWater(object, info);
    const allMeshes = visibleInScene(object) ? unitMeshes(object) : [];
    const plain = allMeshes.filter((m) => !isInstanced(m));
    let mode = this.modeFor(id, info, plain.length ? plain : allMeshes, settings);
    // Instanced-only objects (island plants) can be a trunk or a box, never a trimesh or a hull.
    if (plain.length === 0 && allMeshes.length > 0 && (mode === "solid" || mode === "loose")) mode = info?.kind === "plant" ? "trunk" : "solid";
    let meshes = mode === "trunk" || plain.length === 0 ? allMeshes : plain;
    // Small plants (flowers, grass, a tree that is still growing) get no collider: treat them as
    // empty, so they are not counted in the wrap and are seen again when they grow.
    if (mode === "trunk" && meshes.length > 0 && worldBox(meshes, new THREE.Box3()).getSize(tmpV).y < TRUNK_MIN_HEIGHT) meshes = [];
    let unit = this.units.get(id);
    if (!unit) {
      unit = {
        id,
        object,
        mode,
        body: null,
        rootSig: "",
        poseSig: "",
        pendingPose: null,
        firstSeen: now,
        built: false,
        empty: true,
        shape: null,
        held: false,
        meshes: [],
        nextRootSig: "",
        nextPoseSig: "",
        center: new THREE.Vector3(),
        swept: false
      };
      this.units.set(id, unit);
    }

    // A loose body owns its object's transform: only a mode change or new geometry rebuilds it.
    const geometryIds = meshes.map((m) => `${m.geometry.uuid}.${attributeVersion(m.geometry.getAttribute("position"))}`).join(",");
    const rootMatrix =
      mode === "loose" && unit.mode === "loose" && unit.body
        ? ""
        : object.matrixWorld.elements.map((e) => round(e, 0.02)).join(",");
    const rootSig = `${mode}|${object === unit.object ? "" : "new"}|${rootMatrix}|${geometryIds}`;
    tmpInv.copy(object.matrixWorld).invert();
    const poseSig = meshes
      .map((m) => tmpM.multiplyMatrices(tmpInv, m.matrixWorld).elements.map((e) => round(e, 0.02)).join(","))
      .join("|");

    if (mode === "ghost") {
      if (unit.body || unit.mode !== "ghost") this.removeUnit(unit);
      Object.assign(unit, { mode, object, rootSig, poseSig, pendingPose: null, built: true, empty: false, held: false, meshes: [] });
      return;
    }
    if (meshes.length === 0) {
      // Not loaded yet (or hidden): nothing to collide with.
      if (unit.body) this.removeUnit(unit);
      Object.assign(unit, { mode, object, rootSig: "", poseSig: "", pendingPose: null, built: false, empty: true, held: false, meshes: [] });
      return;
    }
    unit.empty = false;
    // A built unit keeps its old object until the rebuild (a loose one restores it on remove).
    if (!unit.built) unit.object = object;
    unit.meshes = meshes;
    unit.nextRootSig = rootSig;
    unit.nextPoseSig = poseSig;

    const rootChanged = rootSig !== unit.rootSig;
    const poseChanged = poseSig !== unit.poseSig;
    let build = false;
    if (!unit.built) {
      // First build: wait until the object stops changing (rise animation, loading), or a while.
      build = unit.pendingPose === poseSig || now - unit.firstSeen > FORCE_BUILD_MS;
      unit.pendingPose = poseSig;
      if (hold) {
        // Wrap phase: mark it ready; GameWorld builds it in its turn.
        unit.mode = mode;
        unit.held = build;
        if (build) worldBox(meshes, tmpBox2).getCenter(unit.center);
        return;
      }
    } else if (rootChanged) {
      build = true;
    } else if (poseChanged) {
      // A part moved: rebuild once it holds still for one scan (animated parts never do).
      build = unit.pendingPose === poseSig;
      unit.pendingPose = poseSig;
    }
    if (!build) return;
    this.build(unit, mode, meshes, object);
  }

  /** Builds (or rebuilds) the collider of a unit from the meshes and signatures of the last scan. */
  private build(unit: Unit, mode: UnitMode, meshes: THREE.Mesh[], object = unit.object) {
    if (unit.body) this.removeUnit(unit);
    unit.object = object;
    unit.mode = mode;
    unit.rootSig = unit.nextRootSig;
    unit.poseSig = unit.nextPoseSig;
    unit.pendingPose = null;
    unit.built = true;
    unit.held = false;
    unit.shape = null;
    let capsule: BuiltUnit["capsule"];
    if (mode === "solid") {
      if (meshes.some(isInstanced)) {
        unit.body = this.buildBox(meshes);
        unit.shape = unit.body ? "box" : null;
      } else {
        const solid = this.buildSolid(meshes);
        unit.body = solid.body;
        unit.shape = solid.body ? solid.shape : null;
      }
    } else if (mode === "trunk") {
      const trunk = this.buildTrunk(meshes);
      unit.body = trunk?.body ?? null;
      unit.shape = unit.body ? "capsule" : null;
      capsule = trunk?.capsule;
    } else if (mode === "loose") {
      const loose = this.buildLoose(unit, meshes);
      unit.body = loose?.body ?? null;
      unit.shape = loose ? loose.shape : null;
    }
    if (unit.body && unit.shape && !unit.swept) {
      unit.swept = true;
      this.built.push({ id: unit.id, mode, shape: unit.shape, meshes, box: worldBox(meshes, new THREE.Box3()), capsule });
    }
  }

  private buildSolid(meshes: THREE.Mesh[]): { body: Body | null; shape: BodyShape } {
    let vertexCount = 0;
    let triangleCount = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry;
      vertexCount += g.getAttribute("position").count;
      triangleCount += (g.index ? g.index.count : g.getAttribute("position").count) / 3;
    }
    if (triangleCount > MAX_TRIANGLES || triangleCount < 1) return { body: this.buildBox(meshes), shape: "box" };
    const vertices = new Float32Array(vertexCount * 3);
    const indices = new Uint32Array(Math.floor(triangleCount) * 3);
    let vOffset = 0;
    let iOffset = 0;
    for (const mesh of meshes) {
      const g = mesh.geometry;
      const position = g.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        tmpV.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
        vertices[(vOffset + i) * 3] = tmpV.x;
        vertices[(vOffset + i) * 3 + 1] = tmpV.y;
        vertices[(vOffset + i) * 3 + 2] = tmpV.z;
      }
      if (g.index) {
        const index = g.index;
        const count = Math.floor(index.count / 3) * 3;
        for (let i = 0; i < count; i++) indices[iOffset + i] = index.getX(i) + vOffset;
        iOffset += count;
      } else {
        const count = Math.floor(position.count / 3) * 3;
        for (let i = 0; i < count; i++) indices[iOffset + i] = i + vOffset;
        iOffset += count;
      }
      vOffset += position.count;
    }
    try {
      const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed());
      this.world.createCollider(this.rapier.ColliderDesc.trimesh(vertices, indices.subarray(0, iOffset)).setFriction(0.8), body);
      return { body, shape: "trimesh" };
    } catch (error) {
      console.warn("[game] trimesh collider failed, using a box", error);
      return { body: this.buildBox(meshes), shape: "box" };
    }
  }

  private buildBox(meshes: THREE.Mesh[]): Body | null {
    const box = worldBox(meshes, new THREE.Box3());
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    this.world.createCollider(
      this.rapier.ColliderDesc.cuboid(Math.max(0.02, size.x / 2), Math.max(0.02, size.y / 2), Math.max(0.02, size.z / 2)),
      body
    );
    return body;
  }

  /** Trees block the player at the trunk only; small plants (flowers, grass) do not block. */
  private buildTrunk(meshes: THREE.Mesh[]): { body: Body; capsule: NonNullable<BuiltUnit["capsule"]> } | null {
    const box = worldBox(meshes, new THREE.Box3());
    if (box.isEmpty()) return null;
    const size = box.getSize(new THREE.Vector3());
    if (size.y < TRUNK_MIN_HEIGHT) return null;
    const radius = THREE.MathUtils.clamp(Math.min(size.x, size.z) * 0.07, 0.12, 0.45);
    const height = Math.min(size.y * 0.55, 4);
    const halfHeight = Math.max(0.05, height / 2 - radius);
    const center = box.getCenter(new THREE.Vector3());
    center.y = box.min.y + height / 2;
    const body = this.world.createRigidBody(this.rapier.RigidBodyDesc.fixed().setTranslation(center.x, center.y, center.z));
    this.world.createCollider(this.rapier.ColliderDesc.capsule(halfHeight, radius), body);
    return { body, capsule: { center, halfHeight, radius } };
  }

  private buildLoose(unit: Unit, meshes: THREE.Mesh[]): { body: Body; shape: BodyShape } | null {
    const object = unit.object;
    if (!unit.home) unit.home = { position: object.position.clone(), quaternion: object.quaternion.clone() };
    object.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
    // Points in the body frame: the object's world place and turn, with its scale baked in.
    const frame = new THREE.Matrix4().compose(tmpPos, tmpQuat, new THREE.Vector3(1, 1, 1));
    const toFrame = frame.clone().invert();
    let total = 0;
    for (const mesh of meshes) total += mesh.geometry.getAttribute("position").count;
    const stride = Math.max(1, Math.ceil(total / HULL_POINTS));
    const points: number[] = [];
    const localBox = new THREE.Box3();
    let k = 0;
    for (const mesh of meshes) {
      const position = mesh.geometry.getAttribute("position");
      tmpM.multiplyMatrices(toFrame, mesh.matrixWorld);
      for (let i = 0; i < position.count; i++, k++) {
        if (k % stride !== 0) continue;
        tmpV.fromBufferAttribute(position, i).applyMatrix4(tmpM);
        points.push(tmpV.x, tmpV.y, tmpV.z);
        localBox.expandByPoint(tmpV);
      }
    }
    if (localBox.isEmpty()) return null;
    const body = this.world.createRigidBody(
      this.rapier.RigidBodyDesc.dynamic()
        .setTranslation(tmpPos.x, tmpPos.y, tmpPos.z)
        .setRotation({ x: tmpQuat.x, y: tmpQuat.y, z: tmpQuat.z, w: tmpQuat.w })
        .setLinearDamping(0.05)
        .setAngularDamping(0.4)
        .setCcdEnabled(true)
    );
    let desc = this.rapier.ColliderDesc.convexHull(new Float32Array(points));
    const shape: BodyShape = desc ? "hull" : "box";
    if (!desc) {
      const size = localBox.getSize(new THREE.Vector3());
      const center = localBox.getCenter(new THREE.Vector3());
      desc = this.rapier.ColliderDesc.cuboid(Math.max(0.02, size.x / 2), Math.max(0.02, size.y / 2), Math.max(0.02, size.z / 2)).setTranslation(
        center.x,
        center.y,
        center.z
      );
    }
    this.world.createCollider(desc.setDensity(LOOSE_DENSITY).setFriction(0.7).setRestitution(0.05), body);
    return { body, shape };
  }

  /** After each physics step: loose objects follow their bodies. */
  syncLoose() {
    for (const unit of this.units.values()) {
      if (unit.mode !== "loose" || !unit.body) continue;
      const object = unit.object;
      const t = unit.body.translation();
      const r = unit.body.rotation();
      object.matrixWorld.decompose(tmpPos, tmpQuat, tmpScale);
      tmpM.compose(tmpPos.set(t.x, t.y, t.z), tmpQuat.set(r.x, r.y, r.z, r.w), tmpScale);
      if (object.parent) {
        object.parent.updateWorldMatrix(true, false);
        tmpM.premultiply(tmpInv.copy(object.parent.matrixWorld).invert());
      }
      tmpM.decompose(object.position, object.quaternion, tmpScale);
      object.updateMatrixWorld(true);
    }
  }

  private restoreHome(unit: Unit) {
    if (!unit.home) return;
    unit.object.position.copy(unit.home.position);
    unit.object.quaternion.copy(unit.home.quaternion);
    unit.object.updateMatrixWorld(true);
    unit.home = undefined;
  }

  private removeUnit(unit: Unit) {
    if (unit.body) {
      try {
        this.world.removeRigidBody(unit.body);
      } catch {
        // the world is already gone
      }
    }
    unit.body = null;
    unit.shape = null;
    unit.built = false;
    this.restoreHome(unit);
  }

  /** Puts every loose object back and builds it again where it started. */
  resetLoose() {
    for (const unit of this.units.values()) {
      if (unit.mode !== "loose") continue;
      this.removeUnit(unit);
      unit.rootSig = "";
      unit.pendingPose = unit.poseSig;
    }
  }

  /** The first ground under (x, z), from the colliders. */
  groundBelow(x: number, z: number, fromY = 300): number | null {
    const ray = new this.rapier.Ray({ x, y: fromY, z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, fromY + 500, true);
    return hit ? fromY - hit.timeOfImpact : null;
  }

  /** Distance to the first collider along dir (unit length) within maxDist, or null. */
  castRay(origin: { x: number; y: number; z: number }, dir: { x: number; y: number; z: number }, maxDist: number): number | null {
    const ray = new this.rapier.Ray(origin, dir);
    const hit = this.world.castRay(ray, maxDist, true);
    return hit ? hit.timeOfImpact : null;
  }

  dispose() {
    for (const unit of this.units.values()) this.removeUnit(unit);
    this.units.clear();
    this.built = [];
    if (this.ground) {
      try {
        this.world.removeRigidBody(this.ground);
      } catch {
        // the world is already gone
      }
    }
    this.ground = null;
  }
}
