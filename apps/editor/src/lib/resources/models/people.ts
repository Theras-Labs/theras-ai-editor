// People: the rigged, animated human figure of the library (also the player in game mode).
// One GLB (public/library/models/people/animation-library.glb, see LICENSE.txt there) loads once
// per page. Each copy is a SkeletonUtils clone (a plain clone breaks a skinned mesh) with its own
// materials and skeleton; the geometry and the animation clips are shared.
// The loader is made on the first load, never at module top level (tests import this file).
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import type { ResourceEntry, ResourceFrame, ResourceInstance } from "../types";
import { LIBRARY_BASE } from "./gltf-model";

/** Height of every copy in meters (the player body is 1.75 m too). */
export const PERSON_HEIGHT = 1.75;
/** Height of the figure in the file (measured: 1.829 m), used until the real box is known. */
const SOURCE_HEIGHT = 1.83;

const BODY_COLOR = "#d9dde2";
const JOINT_COLOR = "#2b3442";

/** The clips of the file that the editor uses. */
export const PERSON_CLIPS = [
  "Idle_Loop",
  "Walk_Loop",
  "Jog_Fwd_Loop",
  "Sprint_Loop",
  "Jump_Start",
  "Jump_Loop",
  "Jump_Land",
  "Crouch_Idle_Loop",
  "Crouch_Fwd_Loop",
  "Dance_Loop",
  "Idle_Talking_Loop",
  "Sitting_Idle_Loop",
  "Sitting_Talking_Loop",
  "Push_Loop",
  "Interact",
  "Pistol_Idle_Loop",
  "Pistol_Aim_Neutral",
  "Pistol_Shoot",
  "Swim_Idle_Loop",
  "Swim_Fwd_Loop",
  "Walk_Formal_Loop",
  "A_TPose"
] as const;

export type PersonClip = (typeof PERSON_CLIPS)[number];

/** Short words for the library animation (params.animation) and the clip each one plays. */
export const PERSON_ANIMATIONS = {
  idle: "Idle_Loop",
  walk: "Walk_Loop",
  jog: "Jog_Fwd_Loop",
  run: "Sprint_Loop",
  dance: "Dance_Loop",
  talk: "Idle_Talking_Loop",
  sit: "Sitting_Idle_Loop",
  "sit-talk": "Sitting_Talking_Loop",
  crouch: "Crouch_Idle_Loop",
  push: "Push_Loop"
} as const satisfies Record<string, PersonClip>;

export type PersonAnimation = keyof typeof PERSON_ANIMATIONS;

const ANIMATION_ALIASES: Record<string, PersonAnimation> = {
  stand: "idle",
  standing: "idle",
  walking: "walk",
  jogging: "jog",
  running: "run",
  sprint: "run",
  sprinting: "run",
  dancing: "dance",
  talking: "talk",
  chat: "talk",
  chatting: "talk",
  sitting: "sit",
  "sit-and-talk": "sit-talk",
  "sitting-talking": "sit-talk",
  crouching: "crouch",
  pushing: "push"
};

/** The clip for a params.animation value: a short word, an alias, or a clip name. Default: idle. */
export function personAnimationClip(value: unknown): PersonClip {
  if (typeof value !== "string") return PERSON_ANIMATIONS.idle;
  if ((PERSON_CLIPS as readonly string[]).includes(value)) return value as PersonClip;
  const word = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  const key = (word in PERSON_ANIMATIONS ? word : ANIMATION_ALIASES[word]) as PersonAnimation | undefined;
  return key ? PERSON_ANIMATIONS[key] : PERSON_ANIMATIONS.idle;
}

export type PersonSource = {
  scene: THREE.Object3D;
  animations: THREE.AnimationClip[];
  /** Scale and lift that make a copy PERSON_HEIGHT tall with the feet at y = 0. */
  fit: { scale: number; lift: number };
};

let pending: Promise<PersonSource> | null = null;

/** Loads the figure once for the page. A failed load can be tried again. */
export function loadPerson(): Promise<PersonSource> {
  if (!pending) {
    pending = new GLTFLoader().loadAsync(`${LIBRARY_BASE}/models/people/animation-library.glb`).then((gltf) => {
      const scene = gltf.scene;
      scene.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        // The animated pose leaves the rest-pose bounds (crouch, jump): do not cull it wrongly.
        mesh.frustumCulled = false;
        for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) styleMaterial(m);
      });
      scene.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(scene);
      const height = box.max.y - box.min.y;
      const scale = PERSON_HEIGHT / (height > 0.5 && height < 5 ? height : SOURCE_HEIGHT);
      return { scene, animations: gltf.animations, fit: { scale, lift: Number.isFinite(box.min.y) ? -box.min.y * scale : 0 } };
    });
    pending.catch((error) => {
      console.warn("[library] could not load the person model:", error);
      pending = null;
    });
  }
  return pending;
}

/** Starts the load early (game mode calls it when the player mounts). */
export function preloadPerson() {
  loadPerson().catch(() => undefined);
}

/** Clean, friendly look for a stylized scene: light grey body, dark slate joints. */
function styleMaterial(material: THREE.Material) {
  const m = material as THREE.MeshStandardMaterial;
  m.side = THREE.FrontSide;
  if (!m.color) return;
  if (m.name === "M_Joints") {
    m.color.set(JOINT_COLOR);
    m.roughness = 0.6;
  } else {
    m.color.set(BODY_COLOR);
    m.roughness = 0.75;
  }
  m.metalness = 0;
}

export type PersonCopy = {
  /** Feet at y = 0, PERSON_HEIGHT tall, facing +z. The mixer root. */
  object: THREE.Group;
  /** The materials of this copy (change a color here; no other copy sees it). */
  materials: THREE.Material[];
  /** Frees what this copy owns (materials, skeleton data), not the shared geometry. */
  dispose: () => void;
};

/** One independent copy of the figure. */
export function clonePerson(source: PersonSource): PersonCopy {
  const model = cloneSkinned(source.scene);
  const materials: THREE.Material[] = [];
  const skeletons: THREE.Skeleton[] = [];
  model.traverse((o) => {
    const mesh = o as THREE.SkinnedMesh;
    if (!mesh.isMesh) return;
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map((m) => m.clone());
      materials.push(...mesh.material);
    } else {
      mesh.material = mesh.material.clone();
      materials.push(mesh.material);
    }
    if (mesh.isSkinnedMesh && mesh.skeleton) skeletons.push(mesh.skeleton);
  });
  // The animation moves the bones, not this group, so the fit stays.
  const object = new THREE.Group();
  object.name = "Person";
  model.scale.setScalar(source.fit.scale);
  model.position.y = source.fit.lift;
  object.add(model);
  return {
    object,
    materials,
    dispose: () => {
      for (const m of materials) m.dispose();
      for (const s of skeletons) s.dispose();
      object.removeFromParent();
    }
  };
}

/** The clip of the file by name (undefined when missing). */
export function findPersonClip(source: PersonSource, name: PersonClip) {
  return source.animations.find((clip) => clip.name === name);
}

/** 0..1 from a seed, so copies with different seeds start at different times. */
function seedFraction(seed: number, salt: number) {
  const x = Math.sin((seed + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/** A library copy: an empty group at once, the figure when loaded, one looping animation. */
function personInstance(seed: number, params?: Record<string, unknown>): ResourceInstance {
  const holder = new THREE.Group();
  const clipName = personAnimationClip(params?.animation);
  let copy: PersonCopy | null = null;
  let mixer: THREE.AnimationMixer | null = null;
  let disposed = false;
  const ready = loadPerson().then((source) => {
    if (disposed) return;
    copy = clonePerson(source);
    holder.add(copy.object);
    const clip = findPersonClip(source, clipName) ?? findPersonClip(source, "Idle_Loop");
    if (!clip) return;
    mixer = new THREE.AnimationMixer(copy.object);
    const action = mixer.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    // A crowd is not in step: another start time and a slightly different pace per seed.
    action.time = seedFraction(seed, 1) * clip.duration;
    action.timeScale = 0.92 + seedFraction(seed, 2) * 0.16;
    action.play();
    mixer.update(0);
  });
  return {
    object: holder,
    ready: ready.catch(() => undefined),
    update: (frame: ResourceFrame) => {
      if (mixer && frame.dt > 0) mixer.update(Math.min(frame.dt, 0.1));
    },
    dispose: () => {
      disposed = true;
      if (mixer && copy) {
        mixer.stopAllAction();
        mixer.uncacheRoot(copy.object);
      }
      copy?.dispose();
      mixer = null;
      copy = null;
    }
  };
}

const ANIMATION_WORDS = Object.keys(PERSON_ANIMATIONS).join(", ");

export const PEOPLE_ENTRIES: ResourceEntry[] = [
  {
    id: "creature:person",
    name: "Person",
    kind: "creature",
    source: "local",
    origin: "Ecctrl example, animations by Quaternius",
    license: "MIT (Ecctrl) / CC0 (animations)",
    category: "People",
    tags: [
      "person",
      "human",
      "man",
      "woman",
      "character",
      "npc",
      "player",
      "people",
      "pedestrian",
      "citizen",
      "figure",
      "mannequin",
      "rigged",
      "animated",
      "basic"
    ],
    description: `A rigged human figure (a clean mannequin), ${PERSON_HEIGHT} m tall, that plays one looping animation chosen with params.animation: ${ANIMATION_WORDS} (default idle). Copies with different seeds are not in step.`,
    footprint: 0.45,
    create: (seed, opts) => personInstance(seed, opts?.params)
  }
];
