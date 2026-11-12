// Library entries: the rifle, the drone and the robot hound of the port scene, built by the original
// model builders and with the original materials. Made by code only: no model file.
//
// The original scene makes these models inside its weapon and enemies factories. Those factories need a
// camera, input, a player, physics and an AI, and the enemies factory builds pools of 18 robots.
// So each entry calls the model builder directly and does the small part of the factory that
// makes the materials and puts the parts together (the values are copied from the factories:
// dm in 08-weapon.js, Em, Q_ and iM in 09-enemies-hud-game-boot.js). The motion is the part of
// the original code's update that depends on time only; the AI part (targets, flight, walking) is not
// used.
//
// Credit: this code was written by Claude Fable 5.2 (a public claude.ai artifact,
// https://claude.ai/artifact/2UXyB49DrVHFfhTMdNDFTA).
import * as THREE from "three";
import type { PortRigDef } from "@/vendor/port/game.js";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../types";
import { PROCEDURAL_TAG, PORT_CREDIT, PORT_CREDIT_URL, PORT_LICENSE, PORT_ORIGIN } from "./index";
import { portKit, type PortKit } from "./kit";

/** One built model: its root, a function for each frame (scene time in seconds) and its cleanup. */
type Built = {
  object: THREE.Object3D;
  update?(time: number): void;
  dispose(): void;
};

type Builder = (kit: PortKit, seed: number) => Built;

/** A phase from the seed, so that two copies do not move in step. */
const phaseOf = (seed: number) => ((Math.abs(seed) * 0.6180339887) % 1) * Math.PI * 2;

/** Frees the geometry of a group that the caller made (not the kit materials). */
function disposeGeometry(root: THREE.Object3D) {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
  });
}

// ---- Rifle ----

/** The text decals of the rifle, as the weapon factory places them (08-weapon.js, dm). */
const RIFLE_MARKINGS: (string | number)[][] = [
  ["model", -0.0168, -0.0315, 0.064, 0.0095, "L"],
  ["maker", -0.0168, -0.042, 0.064, 0.003, "L"],
  ["cal", -0.0168, -0.0465, 0.064, 0.0028, "L"],
  ["prop", -0.0168, -0.071, 0.066, 0.0026, "L"],
  ["auto", -0.0168, -0.027, -0.0335, 0.0036, "L"],
  ["semi", -0.0168, -0.0262, -0.049, 0.0036, "L"],
  ["safe", -0.0168, -0.0362, -0.062, 0.0036, "L"],
  ["rack", -0.0168, -0.004, -0.205, 0.02, "L"],
  ["warn", -0.0181, -0.01, 0.03, 0.0062, "L"],
  ["optic", -0.0195, 0.0735, 0.021, 0.0024, "L"],
  ["model", 0.0168, -0.0315, 0.068, 0.0095, "R"],
  ["warn", 0.0168, -0.066, 0.066, 0.0075, "R"],
  ["rack", 0.0168, -0.004, -0.205, 0.02, "R"],
  ["auto", 0.0168, -0.027, -0.0335, 0.0036, "R"],
  ["safe", 0.0168, -0.0362, -0.062, 0.0036, "R"],
  ["optic", 0.0195, 0.0735, 0.021, 0.0024, "R"],
  ["cal", 0.0181, 0.0245, -0.055, 0.0026, "R"],
  ["r2", 0, 0.04365, -0.0816, 0.003, "T"],
  ["r4", 0, 0.04365, -0.0616, 0.003, "T"],
  ["r6", 0, 0.04365, 0.0584, 0.003, "T"],
  ["r8", 0, 0.04365, 0.0784, 0.003, "T"],
  ["r10", 0, 0.04365, 0.0984, 0.003, "T"],
  ["r12", 0, 0.04365, 0.1184, 0.003, "T"]
];

const buildRifle: Builder = (kit) => {
  const { game } = kit;
  const geo = game.buildRifleGeometry();
  const owned: THREE.Material[] = [];
  const standard = (rgb: [number, number, number] | number, roughness: number, metalness: number, detail: number | null) => {
    const color = typeof rgb === "number" ? new THREE.Color(rgb) : new THREE.Color(rgb[0], rgb[1], rgb[2]);
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness, vertexColors: true });
    owned.push(m);
    return detail === null ? m : game.patchRifleMaterial(m, detail);
  };
  // The same five surfaces as the weapon factory. Kind 0, 1, 2 = anodized, steel, polymer detail.
  const anodized = standard([0.0085, 0.009, 0.0105], 0.4, 0.45, 0);
  const matte = standard(0xffffff, 0.92, 0, null);
  const phosphate = standard([0.016, 0.016, 0.0165], 0.5, 0.7, 1);
  const polymer = standard([0.0125, 0.0128, 0.0135], 0.62, 0, 2);
  const tan = standard([0.105, 0.08, 0.05], 0.62, 0, 2);
  // The brass of the rounds is a kit surface: shared, never disposed here.
  const brass = kit.ctx.mats.get("brass", { triplanar: true, vertexColors: true, scale: 4 });

  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => {
    const out = new THREE.Mesh(g, m);
    out.castShadow = true;
    out.receiveShadow = true;
    return out;
  };
  const model = new THREE.Group();
  model.name = "pac9";
  model.add(mesh(geo.ano, anodized), mesh(geo.gun, phosphate), mesh(geo.poly, polymer), mesh(geo.plain, matte), mesh(geo.bolt, phosphate));
  const mag = new THREE.Group();
  mag.position.fromArray(game.RIFLE_SPEC.magPos);
  mag.add(mesh(geo.mag, tan), mesh(geo.round, brass));
  model.add(mag);

  let markings: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | null = null;
  try {
    markings = game.buildRifleMarkings(RIFLE_MARKINGS);
    markings.receiveShadow = true;
    model.add(markings);
  } catch (error) {
    // The original scene also goes on without the text (it draws the atlas on a 2D canvas).
    console.warn("[port] rifle markings skipped:", error);
  }
  const spec = game.RIFLE_SPEC;
  const lens = game.buildRifleLens(
    spec.window.map((p) => [p[0] * 1.01, (p[1] - spec.sightY) * 1.01 + spec.sightY] as [number, number]),
    spec.lensF + 0.0025
  );
  model.add(lens);

  // The model is forward = -Z, up = +Y, right = +X. Lying on its right side: +X turns to -Y.
  model.rotation.z = -Math.PI / 2;
  const root = new THREE.Group();
  root.add(model);
  // Put the lowest point on the ground and the middle of the base on the origin.
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  if (!box.isEmpty()) model.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);

  return {
    object: root,
    update() {
      // The rain patch of the rifle has its own value; follow the kit (dry until a rain place holds wet).
      game.RIFLE_RAIN.value = kit.ctx.mats.uniforms.wet.value;
    },
    dispose() {
      disposeGeometry(root);
      for (const m of owned) m.dispose();
      if (markings) {
        markings.material.map?.dispose();
        markings.material.dispose();
      }
      lens.material.dispose();
    }
  };
};

// ---- Robots ----

/** The robot materials of the enemies factory (Em). Shell and metal are kit surfaces (shared). */
function robotMaterials(kit: PortKit) {
  const mats = kit.ctx.mats;
  const glow = mats.emissive(0xffffff, 1).clone();
  glow.color.setRGB(1, 1, 1);
  glow.vertexColors = true;
  // Each robot changes the color of its lens, so each one has its own copy (as the original does).
  const lens = mats.emissive(0xffa040, 6).clone();
  return {
    shell: mats.get("armor_white", { triplanar: true, vertexColors: true }),
    metal: mats.get("gunmetal", { triplanar: true, vertexColors: true }),
    glow,
    lens,
    /** Materials this instance owns. */
    owned: [glow, lens] as THREE.Material[]
  };
}

/** The lamp cone of the drone: an additive light shaft on a skinned mesh (copied from Em). */
function lampConeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(1, 0.9, 0.74) }, uGain: { value: 0.085 } },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        vec4 mv = modelViewMatrix * vec4(transformed, 1.0);
        vN = normalMatrix * objectNormal; vV = -mv.xyz; vT = 1.0 - uv.y;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uColor; uniform float uGain;
      varying float vT; varying vec3 vN; varying vec3 vV;
      void main() {
        float f = abs(dot(normalize(vN), normalize(vV)));
        f = f * f * (3.0 - 2.0 * f);
        float t = clamp(vT, 0.0, 1.0);
        float k = pow(1.0 - t, 1.7) * (0.35 + 0.65 * smoothstep(0.0, 0.06, t));
        gl_FragColor = vec4(uColor * (uGain * f * k), 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false
  });
}

/** A label quad from the kit (the material is cached by the kit: never dispose it). */
function labelMesh(kit: PortKit, text: string, distress: number, width: number, maxHeight: number) {
  const label = kit.ctx.mats.label(text, { color: "black", font: "stencil", distress });
  const height = Math.min(maxHeight, width / (label.aspect || 3));
  return { geometry: new THREE.PlaneGeometry(width, height), material: label.material };
}

function disposeRig(defs: PortRigDef[], skeleton: THREE.Skeleton, owned: THREE.Material[], extra: THREE.Object3D[]) {
  for (const def of defs) def.geometry.dispose();
  skeleton.dispose();
  for (const m of owned) m.dispose();
  for (const o of extra) disposeGeometry(o);
}

/** Height of the drone body above the origin, meters (the original code's showcase hovers it at 1.6). */
export const DRONE_HOVER = 1.6;

const buildDrone: Builder = (kit, seed) => {
  const { game } = kit;
  const def = game.buildDroneRig();
  const m = robotMaterials(kit);
  const disc = new THREE.MeshBasicMaterial({ color: 0x0c0d0f, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide });
  const cone = lampConeMaterial();
  const rig = game.assembleRig(
    def,
    { shell: m.shell, metal: m.metal, glow: m.glow, lens: m.lens, disc, cone },
    { radius: 0.9, center: [0, 0, 0], extra: { def: def.extra, radius: 10 } }
  );
  // The 9 m lamp cone gives the extra mesh a 20 m box. Culling keeps the large sphere; the box
  // (selection, framing) is the body box.
  if (rig.extraMesh && rig.mesh.boundingBox) rig.extraMesh.boundingBox = rig.mesh.boundingBox.clone();
  rig.group.rotation.order = "YXZ";
  rig.group.position.y = DRONE_HOVER;
  const b = rig.bones;

  const labelParts: THREE.Object3D[] = [];
  try {
    const { geometry, material } = labelMesh(kit, "G-11", 0.35, 0.105, 0.045);
    geometry.rotateX(-Math.PI / 2);
    geometry.rotateY(Math.PI);
    const label = new THREE.Mesh(geometry, material);
    label.position.set(0, 0.0985, -0.085);
    label.receiveShadow = true;
    b.body!.add(label);
    labelParts.push(label);
  } catch (error) {
    console.warn("[port] drone label skipped:", error);
  }

  const root = new THREE.Group();
  root.add(rig.group);
  const phase = phaseOf(seed);
  const lensColor = game.ROBOT_LENS_COLOR;
  // The look-down angle of the camera ball when it patrols: a point 1.6 m below and 5 m ahead.
  const lookDown = Math.atan2(1.6, 5);

  const pose = (t: number) => {
    // The original code's hover bob (about 6 cm at most), rotor spin (41 rad/s, alternate directions),
    // navigation strobes and lens pulse: the time-only part of the gull update (Q_).
    b.body!.position.y = Math.sin(t * 2.1 + phase) * 0.045 + Math.sin(t * 3.7 + phase * 1.7) * 0.018;
    const spin = 41 * t;
    b.rotor0!.rotation.y = spin;
    b.rotor1!.rotation.y = -spin * 1.03;
    b.rotor2!.rotation.y = -spin * 0.98;
    b.rotor3!.rotation.y = spin * 1.01;
    const s = (((t * 0.9 + phase * 0.1) % 1) + 1) % 1;
    const blink = s < 0.05 || (s > 0.13 && s < 0.18) ? 1 : 1e-4;
    b.strobeR!.scale.setScalar(blink);
    b.strobeG!.scale.setScalar(blink);
    b.strobeW!.scale.setScalar(s > 0.5 && s < 0.56 ? 1 : 1e-4);
    // The patrol sweep of the camera ball and the gun.
    b.gimbalYaw!.rotation.y = Math.sin(t * 0.5 + phase) * 0.9;
    b.ball!.rotation.x = lookDown;
    b.gun!.rotation.x = Math.min(1.3, Math.max(-0.2, lookDown));
    const k = 1 + Math.sin(t * 3 + phase) * 0.15;
    m.lens.color.setRGB(lensColor[0] * k, lensColor[1] * k, lensColor[2] * k);
  };
  pose(0);

  return {
    object: root,
    update: pose,
    dispose() {
      disposeRig([def, def.extra], rig.skeleton, [...m.owned, disc, cone], labelParts);
    }
  };
};

const buildHound: Builder = (kit, seed) => {
  const { game } = kit;
  const spec = game.HOUND_SPEC;
  const def = game.buildHoundRig();
  const m = robotMaterials(kit);
  const rig = game.assembleRig(def, { shell: m.shell, metal: m.metal, glow: m.glow, lens: m.lens }, { radius: 1.5, center: [0, 0.6, 0] });
  const b = rig.bones;

  const labelParts: THREE.Object3D[] = [];
  try {
    // The unit number on both flanks of the body.
    for (const side of [1, -1]) {
      const { geometry, material } = labelMesh(kit, "H-03", 0.3, 0.2, 0.085);
      geometry.rotateY((side * Math.PI) / 2);
      geometry.translate(side * 0.1675, 0.03, -0.085);
      const label = new THREE.Mesh(geometry, material);
      label.receiveShadow = true;
      b.body!.add(label);
      labelParts.push(label);
    }
  } catch (error) {
    console.warn("[port] hound label skipped:", error);
  }

  const abd = spec.legs.map((leg) => b["abd" + leg]!);
  const thigh = spec.legs.map((leg) => b["thigh" + leg]!);
  const shin = spec.legs.map((leg) => b["shin" + leg]!);
  const ik = { abd: 0, hip: 0, knee: 0, reach: 0 };
  const phase = phaseOf(seed);
  const lensColor = game.ROBOT_LENS_COLOR;
  m.lens.color.setRGB(lensColor[0], lensColor[1], lensColor[2]);

  const pose = (t: number) => {
    // Standing on flat ground at the origin, facing +Z. The body height has the original code's 4 mm
    // breathing; each foot stays on its rest point and the original code's leg solver bends the knees.
    const height = spec.stand + Math.sin(t * 1.7 + phase) * 0.004;
    b.body!.position.set(0, height, 0);
    b.body!.rotation.set(0, 0, 0);
    for (let l = 0; l < 4; l++) {
      const side = spec.side[l]!;
      game.solveHoundLeg(
        ik,
        side * spec.footX - side * spec.hipX,
        spec.footR * 0.6 - height - spec.hipY,
        spec.footZ[l]! - spec.fore[l]! * spec.hipZ,
        side,
        spec.l0,
        spec.L1,
        spec.L2 - spec.footR * 0.6
      );
      abd[l]!.rotation.z = ik.abd;
      thigh[l]!.rotation.x = ik.hip;
      shin[l]!.rotation.x = ik.knee;
    }
    // The patrol look of the original scene when there is no target: the turret scans, the head looks
    // around, the beacon blinks.
    b.turret!.rotation.y = Math.sin(t * 0.45 + phase) * 1.1;
    b.head!.rotation.set(0, Math.sin(t * 0.7 + phase) * 0.5, 0);
    const f = (((t * 0.8 + phase) % 1) + 1) % 1;
    b.beacon!.scale.setScalar(f < 0.12 || (f > 0.22 && f < 0.3) ? 1 : 1e-4);
  };
  pose(0);

  return {
    object: rig.group,
    update: pose,
    dispose() {
      disposeRig([def], rig.skeleton, m.owned, labelParts);
    }
  };
};

// ---- Entries ----

function createActor(key: string, build: Builder) {
  return (seed: number, opts?: { appear?: boolean; params?: Record<string, unknown>; renderer?: THREE.WebGLRenderer }): ResourceInstance => {
    const holder = new THREE.Group();
    holder.name = `port-${key}`;
    const renderer = opts?.renderer;
    let disposed = false;
    let built: Built | null = null;
    let kit: PortKit | null = null;
    // Without a renderer (a test, an old caller) the holder stays empty: the surfaces are drawn
    // on the graphics card, so there is nothing to show.
    const ready = renderer
      ? portKit(renderer).then((k) => {
          if (disposed) return;
          kit = k;
          built = build(k, seed);
          holder.add(built.object);
        })
      : Promise.resolve();
    ready.catch((error) => console.warn(`[library] could not build the port model "${key}":`, error));
    return {
      object: holder,
      ready: ready.catch(() => undefined),
      update(frame: ResourceFrame) {
        kit?.tick(frame.dt);
        built?.update?.(frame.time);
      },
      dispose() {
        disposed = true;
        if (built) {
          holder.remove(built.object);
          built.dispose();
          built = null;
        }
      }
    };
  };
}

type ActorRow = {
  id: string;
  name: string;
  tags: string[];
  description: string;
  footprint: number;
  build: Builder;
};

const ACTORS: ActorRow[] = [
  {
    id: "rifle",
    name: "Rifle PAC-9",
    tags: ["rifle", "gun", "weapon", "firearm", "carbine", "prop"],
    description:
      "The PAC-9 rifle of the game, 0.88 m long, lying on its right side: an upper receiver with a top rail, a handguard with vents, a muzzle brake, a red-dot sight with a lit reticle, a tan magazine and engraved markings. Black anodized, phosphate steel and polymer surfaces with fine wear. Made by code only.",
    footprint: 0.47,
    build: buildRifle
  },
  {
    id: "drone",
    name: "Drone, quad rotor",
    tags: ["drone", "quadcopter", "rotor", "robot", "enemy", "flying", "machine", "lamp"],
    description: `A white armored quad-rotor drone with four ducted rotors, a camera ball with a lamp, a gun pod and navigation strobes. It hovers ${DRONE_HOVER} m above its origin with the rotors turning and a small bob; the lamp casts a light cone. 1.07 x 1.01 m. Made by code only.`,
    footprint: 0.75,
    build: buildDrone
  },
  {
    id: "hound",
    name: "Robot hound",
    tags: ["robot", "quadruped", "hound", "enemy", "walker", "machine", "turret"],
    description:
      "A four-legged white armored robot with a sensor head, a back turret, an antenna and a beacon, standing on the ground. It breathes, scans with its turret and looks around. 1.4 m from gun to tail, 0.72 m to the back. Made by code only.",
    footprint: 0.77,
    build: buildHound
  }
];

/** Entry id of a Port machine. */
export const portActorId = (key: string) => `proc:${key}`;

export const PORT_ACTOR_ENTRIES: ResourceEntry[] = ACTORS.map((row) => ({
  id: portActorId(row.id),
  name: row.name,
  kind: "feature",
  source: "local",
  origin: PORT_ORIGIN,
  category: "Procedural: machines",
  license: PORT_LICENSE,
  credit: PORT_CREDIT,
  creditUrl: PORT_CREDIT_URL,
  tags: [PROCEDURAL_TAG, "harbor", ...row.tags],
  description: row.description,
  footprint: row.footprint,
  create: createActor(row.id, row.build)
}));
