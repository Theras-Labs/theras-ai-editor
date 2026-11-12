// Scene templates: a ready start with land, sky and objects. Applying one is ONE undo step:
// it can first remove the current top-level objects, then adds the island (and its lake) or a
// whole place built in code (an arena, a desert), the environment, and a folder with the
// template's objects, placed on the island surface. The camera then frames the new scene.
// Templates are grouped by where they come from; imported projects add their own templates.
import type { EditorCore } from "@theras/editor-core";
import { createDeleteSelectionCommand } from "@theras/editor-core";
import { makeTransform, vec3, type GeometryNode, type GroupNode } from "@theras/shared";
import { markBuildReveal } from "@/lib/build-reveal";
import { nodeBatchCommand, uniqueNodeId } from "@/lib/outliner";
import { getResource } from "./catalog";
import { adapterOf, projectStore, type ImportedProject } from "@/lib/projects/projects";
import { uiStore } from "@/state/ui-store";
import { projectSessionStore } from "@/state/project-session-store";
import { slugifyProjectName } from "@theras/dev-sync";
import type { ScenePostFx } from "@theras/shared";
import { POST_FX_OFF, setScenePostFx } from "@/lib/post-fx";
import { starterIslandSurface, type StarterShape } from "./little-habitats/terrain";
import { PORT_SKY_ID, PORT_YARD_ID } from "./port";
import { YARD_START } from "./port/yard";

type Vec = { x: number; y: number; z: number };

export type SceneTemplate = {
  id: string;
  name: string;
  /** Gallery section: where the template comes from. */
  group: string;
  /** A whole place built in code (library entry) at the origin, with its params. */
  environment?: { resource: string; params?: Record<string, unknown>; name?: string };
  /** Camera after the template is applied. */
  camera?: { position: Vec; target: Vec };
  description: string;
  /** CSS gradient for the gallery card. */
  preview: string;
  sky: string;
  /** Stylized water around the island (a water library entry). */
  water?: string;
  island?: { seed: number; shape: StarterShape };
  /** Objects to place: resource id and how many, and where on the land. */
  objects: { resource: string; count?: number; spot: "top" | "coast" | "land" | "center" }[];
  /** Screen effects of the scene (bloom, grade, vignette, grain). Written to the scene settings. */
  postFx?: Partial<ScenePostFx>;
};

/** The gallery section of scenes that are made by code only: no image, no model file. */
export const PROCEDURAL_GROUP = "Procedural: full code";

export const SCENE_TEMPLATES: SceneTemplate[] = [
  {
    id: "port-yard",
    name: "Port yard at dusk",
    group: PROCEDURAL_GROUP,
    description:
      "A container port at dusk in the rain: 47 containers along three lanes, a steel shed, a quay with a crane and a ship, wet ground with puddles that mirror the scene. Every asset is made by code. Walk it in game mode.",
    preview: "linear-gradient(160deg,#27333f 0%,#55616c 32%,#d99a5b 52%,#3b3f44 70%,#16191c 100%)",
    sky: PORT_SKY_ID,
    environment: { resource: PORT_YARD_ID, name: "Port yard" },
    // The first view of the original scene: at the gate, down the main lane toward the low sun.
    camera: YARD_START,
    objects: [],
    // The original film chain (bloom with no threshold and a small mix, an S-curve, vignette,
    // grain), as near as the editor's screen effects get to it. The sun and the lamps are very
    // bright values, so the bloom is weak: only they glow. Set by eye against the original scene.
    postFx: { bloom: 0.045, bloomThreshold: 1.1, bloomRadius: 0.8, contrast: 0.16, saturation: 0.1, warmth: 0, vignette: 0.32, grain: 0.03 }
  },
  {
    id: "cozy-island",
    name: "Cozy island",
    group: "Island kit",
    camera: { position: { x: 16, y: 11, z: 18 }, target: { x: 0, y: 1, z: 0 } },
    description: "A green island in a clear lagoon under puffy anime clouds: windmill on the hill, lighthouse on the coast, lanterns and flowers.",
    preview: "linear-gradient(160deg,#8fc8f0 0%,#d9eefa 30%,#3fb7c9 62%,#2c7a5a 100%)",
    sky: "lh:sky:anime_day",
    water: "water:lagoon",
    island: { seed: 4242, shape: "island" },
    objects: [
      { resource: "lh:landmark:windmill", spot: "top" },
      { resource: "lh:landmark:lighthouse", spot: "coast" },
      { resource: "lh:feature:bench", spot: "center" },
      { resource: "lh:feature:rose_arch", spot: "land" },
      { resource: "lh:feature:lantern", count: 3, spot: "land" },
      { resource: "lh:plant:seed_mix", count: 14, spot: "land" },
      { resource: "lh:plant:oak", count: 2, spot: "land" }
    ]
  },
  {
    id: "spring-meadow",
    group: "Island kit",
    camera: { position: { x: 20, y: 12, z: 22 }, target: { x: 0, y: 1, z: 0 } },
    name: "Spring meadow",
    description: "A wide, flat meadow in soft morning light with blossom trees, flowers, beehives and a bench.",
    preview: "linear-gradient(160deg,#cfe8f5 0%,#a8d8a0 45%,#6fae5c 75%,#4f8a45 100%)",
    sky: "lh:sky:anime_morning",
    island: { seed: 1717, shape: "meadow" },
    objects: [
      { resource: "lh:plant:cherry", count: 3, spot: "land" },
      { resource: "lh:plant:birch", count: 2, spot: "land" },
      { resource: "lh:plant:seed_mix", count: 22, spot: "land" },
      { resource: "lh:feature:beehive", count: 2, spot: "land" },
      { resource: "lh:feature:bench", spot: "center" },
      { resource: "lh:feature:birdhouse", spot: "land" }
    ]
  },
  {
    id: "night-harbor",
    group: "Island kit",
    camera: { position: { x: 16, y: 10, z: 18 }, target: { x: 0, y: 1, z: 0 } },
    name: "Night harbor",
    description: "A small island under the stars: lighthouse, campfire, glowing lanterns and a rowboat at the shore.",
    preview: "linear-gradient(160deg,#0d1530 0%,#1f2f5c 45%,#3a3f6e 70%,#e7a64a 100%)",
    sky: "lh:sky:night",
    water: "water:ocean",
    island: { seed: 777, shape: "island" },
    objects: [
      { resource: "lh:landmark:lighthouse", spot: "coast" },
      { resource: "lh:landmark:campfire", spot: "center" },
      { resource: "lh:landmark:friendship_lantern", spot: "top" },
      { resource: "lh:feature:lantern", count: 5, spot: "land" },
      { resource: "lh:feature:rowboat", spot: "coast" },
      { resource: "lh:plant:pine", count: 4, spot: "land" }
    ]
  },
  {
    id: "empty-island",
    name: "Empty island",
    group: "Island kit",
    camera: { position: { x: 16, y: 11, z: 18 }, target: { x: 0, y: 1, z: 0 } },
    description: "Just the island and a clear summer sky. Shape it with Soil, Stone and Water.",
    preview: "linear-gradient(160deg,#9fd3f2 0%,#7cc0e0 45%,#79b86a 75%,#5d9a52 100%)",
    sky: "lh:sky:summer_noon",
    island: { seed: 9090, shape: "island" },
    objects: []
  },
  {
    id: "alley-arena",
    name: "Cobbled alley arena",
    group: "Alley arena",
    description: "A walled town square of cobbles at sunset: shop fronts, doors and shutters, signs and posters, crates, barrels and powder kegs. 44 by 44 m.",
    preview: "linear-gradient(160deg,#f2b27a 0%,#c9774f 40%,#6d4a3a 75%,#3b2c27 100%)",
    sky: "lh:sky:anime_sunset",
    environment: { resource: "env:alley-arena", name: "Alley arena" },
    // Inside the square: the outer walls block a view from outside.
    camera: { position: { x: 15, y: 8, z: 17 }, target: { x: -2, y: 2, z: -2 } },
    objects: []
  },
  {
    id: "desert-world",
    name: "Desert of the giants",
    group: "Desert",
    description: "Dunes, a dry channel and giant ruins under a high sun: the desert world, ready to walk in game mode.",
    preview: "linear-gradient(160deg,#f6dcb0 0%,#e9b77c 45%,#c98a52 75%,#8b5a3a 100%)",
    sky: "lh:sky:summer_noon",
    environment: { resource: "env:desert-ruins", name: "Desert world" },
    // The original code's landing site, looking at the mesas and the giant's hand.
    camera: { position: { x: -174.5, y: 2.4, z: 41.1 }, target: { x: 0, y: 4, z: 0 } },
    objects: []
  },
  {
    id: "blank",
    name: "Blank plain",
    group: "Start",
    camera: { position: { x: 12, y: 8, z: 14 }, target: { x: 0, y: 0, z: 0 } },
    description: "No land, only the editor grid and a summer sky. Build from scratch.",
    preview: "linear-gradient(160deg,#20262c 0%,#2c343b 60%,#39434b 100%)",
    sky: "lh:sky:summer_noon",
    objects: []
  }
];

/** A template is ready when its place builder is in the library. */
export function templateAvailable(template: SceneTemplate) {
  return !template.environment || Boolean(getResource(template.environment.resource));
}

/** One template for each imported project that has an environment (a known builder or a level model). */
export function projectTemplates(projects: readonly ImportedProject[] = projectStore.projects): SceneTemplate[] {
  const out: SceneTemplate[] = [];
  for (const project of projects) {
    const adapter = adapterOf(project);
    const id = `project:${project.root}`;
    const about = project.about.replace(/^#+\s*/gm, "").split("\n").find((line) => line.trim().length > 20)?.trim() ?? "";
    const facts = `${project.models.length} models, ${project.textures} textures, ${project.references.length} reference images.`;
    if (adapter && adapter.entryId === "lh:terrain:island") {
      const base = SCENE_TEMPLATES.find((t) => t.id === "cozy-island")!;
      out.push({ ...base, id, name: project.name, group: "Your projects", description: `${adapter.label} from ${project.root}. ${facts}` });
    } else if (adapter) {
      out.push({
        id,
        name: project.name,
        group: "Your projects",
        description: `${adapter.label}, built from the project's own files at ${project.root}. ${facts}`,
        preview: "linear-gradient(160deg,#3b4a5c 0%,#24303c 60%,#141b22 100%)",
        sky: adapter.sky,
        environment: { resource: adapter.entryId, params: project.environmentParams, name: adapter.label },
        camera: adapter.camera,
        objects: []
      });
    } else if (project.levelModel) {
      out.push({
        id,
        name: project.name,
        group: "Your projects",
        description: `The level model of ${project.root}. ${facts}${about ? ` ${about.slice(0, 120)}` : ""}`,
        preview: "linear-gradient(160deg,#3b4a5c 0%,#24303c 60%,#141b22 100%)",
        sky: "lh:sky:summer_noon",
        environment: { resource: project.levelModel, name: "Project level" },
        camera: { position: { x: 30, y: 22, z: 34 }, target: { x: 0, y: 1, z: 0 } },
        objects: []
      });
    }
  }
  return out;
}

export function getTemplate(id: string) {
  return SCENE_TEMPLATES.find((t) => t.id === id) ?? projectTemplates().find((t) => t.id === id);
}

/** Points the 3D view at a new scene (an island is small, an arena or a desert is wide). */
function frameTemplate(template: SceneTemplate) {
  const view = uiStore.viewports.perspective;
  if (!view || !template.camera) return;
  view.camera = { ...view.camera, position: { ...template.camera.position }, target: { ...template.camera.target } };
  // A place brings its own ground: the editor grid (at y 0) would cut through its dunes or cobbles.
  view.grid = { ...view.grid, visible: !template.environment };
}

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Applies a template. replace = remove the current top-level objects first (same undo step). */
type ProjectName = { name: string; slug: string; dirty: boolean };
type ProjectSwitch = { label: string; before: ProjectName; after: ProjectName; done: boolean };
const projectSwitches: ProjectSwitch[] = [];
const trackedEditors = new WeakSet<EditorCore>();

function trackProjectSwitch(editor: EditorCore, entry: ProjectSwitch, setProject: (p: ProjectName) => void) {
  projectSwitches.push(entry);
  if (projectSwitches.length > 20) projectSwitches.shift();
  if (trackedEditors.has(editor)) return;
  trackedEditors.add(editor);
  editor.events.on("command:undone", ({ label }) => {
    const hit = [...projectSwitches].reverse().find((p) => p.done && p.label === label);
    if (!hit) return;
    hit.done = false;
    setProject(hit.before);
  });
  editor.events.on("command:redone", ({ label }) => {
    const hit = projectSwitches.find((p) => !p.done && p.label === label);
    if (!hit) return;
    hit.done = true;
    setProject(hit.after);
  });
}

export function applyTemplate(editor: EditorCore, id: string, replace = true): { nodes: number } {
  const template = getTemplate(id);
  if (!template) throw new Error(`No template "${id}"`);
  const scene = editor.scene;
  const taken = new Set<string>();
  const add: GeometryNode[] = [];
  const objectIds: string[] = [];
  const random = rng(template.island?.seed ?? 1);

  // Environment
  const sky = getResource(template.sky);
  add.push({
    id: uniqueNodeId(scene, "node:environment", taken),
    kind: "group",
    name: `Environment: ${sky?.name ?? template.sky}`,
    data: {},
    transform: makeTransform(vec3(0, 0, 0)),
    metadata: { resource: template.sky, environment: true }
  } as GroupNode);

  if (template.environment) {
    const entry = getResource(template.environment.resource);
    if (!entry) throw new Error(`The place "${template.environment.resource}" is not in the library yet.`);
    add.push({
      id: uniqueNodeId(scene, "node:place", taken),
      kind: "group",
      name: template.environment.name ?? entry.name,
      data: {},
      transform: makeTransform(vec3(0, 0, 0)),
      metadata: {
        resource: entry.id,
        seed: 1,
        ...(template.environment.params ? { params: JSON.stringify(template.environment.params) } : {})
      }
    } as GroupNode);
  }

  if (template.island) {
    const islandId = uniqueNodeId(scene, "node:terrain", taken);
    add.push({
      id: islandId,
      kind: "group",
      name: template.island.shape === "meadow" ? "Meadow land" : "Island land",
      data: {},
      transform: makeTransform(vec3(0, 0, 0)),
      metadata: { resource: "lh:terrain:island", terrain: true, seed: template.island.seed, starter: template.island.shape }
    } as GroupNode);
    add.push({
      id: uniqueNodeId(scene, "node:lake", taken),
      kind: "group",
      name: "Lake water",
      data: {},
      transform: makeTransform(vec3(0, 0, 0)),
      metadata: { lakeOf: islandId }
    } as GroupNode);

    if (template.water) {
      add.push({
        id: uniqueNodeId(scene, "node:water", taken),
        kind: "group",
        name: getResource(template.water)?.name ?? "Water",
        data: {},
        transform: makeTransform(vec3(0, 0, 0)),
        metadata: { resource: template.water, seed: 1 }
      } as GroupNode);
    }

    if (template.objects.length) {
      const surface = starterIslandSurface(template.island.seed, template.island.shape);
      const folderId = uniqueNodeId(scene, "node:group", taken);
      add.push({ id: folderId, kind: "group", name: template.name, data: {}, transform: makeTransform(vec3(0, 0, 0)), metadata: { placement: true } } as GroupNode);
      const used: { x: number; z: number; r: number }[] = [];
      const maxD = Math.max(...surface.land.map((c) => c.d));
      const pick = (spot: SceneTemplate["objects"][number]["spot"], radius: number) => {
        const free = (c: { x: number; z: number }) => used.every((u) => Math.hypot(u.x - c.x, u.z - c.z) > u.r + radius);
        let pool = surface.land.filter((c) => !c.stone && free(c));
        if (spot === "top") pool = pool.sort((a, b) => b.level - a.level || a.d - b.d).slice(0, 6);
        else if (spot === "coast") pool = pool.filter((c) => c.level === 1 && c.d > maxD * 0.72);
        else if (spot === "center") pool = pool.filter((c) => c.d < maxD * 0.35);
        if (pool.length === 0) pool = surface.land.filter((c) => free(c));
        return pool.length ? pool[Math.floor(random() * pool.length)]! : null;
      };
      for (const item of template.objects) {
        const entry = getResource(item.resource);
        if (!entry) continue;
        for (let i = 0; i < (item.count ?? 1); i++) {
          const spot = pick(item.spot, Math.max(0.35, entry.footprint * 0.8));
          if (!spot) break;
          used.push({ x: spot.x, z: spot.z, r: Math.max(0.35, entry.footprint * 0.8) });
          const seed = Math.floor(random() * 1e6);
          const transform = makeTransform(vec3(spot.x, surface.top(spot.level), spot.z));
          transform.rotation.y = random() * Math.PI * 2;
          const nodeId = uniqueNodeId(scene, `node:resource:${item.resource.split(":").pop()}`, taken);
          objectIds.push(nodeId);
          add.push({
            id: nodeId,
            kind: "group",
            name: entry.nameFor?.(seed) ?? entry.name,
            parentId: folderId,
            data: {},
            transform,
            metadata: { resource: entry.id, seed }
          } as GroupNode);
        }
      }
    }
  }

  const remove = replace ? [...scene.nodes.values()].filter((n) => !n.parentId).map((n) => n.id) : [];
  const del = remove.length ? createDeleteSelectionCommand(scene, remove) : null;
  const addCommand = nodeBatchCommand(scene, `template ${template.name}`, { add });
  // A replaced scene is a new project: it gets the template's name, so it has its own chats
  // (chat history is kept per project slug). Undo brings back the old name too.
  const before = { name: projectSessionStore.projectName, slug: projectSessionStore.projectSlug, dirty: projectSessionStore.projectSlugDirty };
  const setProject = (p: { name: string; slug: string; dirty: boolean }) => {
    projectSessionStore.projectName = p.name;
    projectSessionStore.projectSlug = p.slug;
    projectSessionStore.projectSlugDirty = p.dirty;
  };
  const after = { name: template.name, slug: slugifyProjectName(template.name), dirty: false };
  const label = `template ${template.name}`;
  editor.execute({
    label,
    execute(s) {
      del?.execute(s);
      addCommand.execute(s);
    },
    undo(s) {
      addCommand.undo(s);
      del?.undo(s);
    }
  });
  if (replace) {
    // The editor shell undoes through its own history (the command's undo is not called),
    // so the name follows the editor's undone and redone events.
    setProject(after);
    trackProjectSwitch(editor, { label, before, after, done: true }, setProject);
  }
  // The template's screen effects go to the scene settings (their own undo step).
  if (template.postFx) setScenePostFx(editor, { ...POST_FX_OFF, ...template.postFx, enabled: true, preset: "template" });
  // Objects rise in one after another while the island builds.
  objectIds.forEach((nodeId, i) => markBuildReveal([nodeId], 900 + i * 90));
  frameTemplate(template);
  return { nodes: add.length };
}
