// Compact scene digest (plan 4.6). It goes at the end of the latest user message, so the
// model does not spend steps on list_nodes / get_node_details, and the static system prompt
// and tool list stay a byte-identical prefix for the prompt cache.
import type { EditorCore } from "@theras/editor-core";
import { resolveSceneGraph, type Vec3 } from "@theras/shared";
import { getResource } from "@/lib/resources/catalog";
import { gameStore, playerPose } from "@/lib/game/game-store";
import { adapterOf, projectStore } from "@/lib/projects/projects";
import { objectMembership, readObjects } from "./director/objects";
import { readSites, siteMembership, sitesToText } from "./director/site";
import type { BuiltSite } from "./director/types";

export const DIGEST_MAX_NODES = 60;

const f = (n: number) => {
  const r = Math.round(n * 10) / 10;
  return Object.is(r, -0) ? "0" : String(r);
};
const v3 = (v: Vec3) => `${f(v.x)},${f(v.y)},${f(v.z)}`;

export type DigestNode = {
  id: string;
  name: string;
  /** "resource <library id>", "folder", "primitive cube", "mesh", "light", ... */
  kind: string;
  position: Vec3;
  /** Box size "x×y×z", or "r<radius>" for library objects. */
  size: string;
  /** Footprint radius in meters (for spacing), when known. */
  radius?: number;
  terrain?: boolean;
};

/** One entry for each scene node (lake and environment helper nodes are left out). */
export function digestNodes(editor: EditorCore): DigestNode[] {
  const scene = editor.scene;
  const graph = resolveSceneGraph(scene.nodes.values(), scene.entities.values());
  const out: DigestNode[] = [];
  for (const node of scene.nodes.values()) {
    if (typeof node.metadata?.lakeOf === "string") continue;
    const world = graph.nodeWorldTransforms.get(node.id) ?? node.transform;
    const scale = Math.max(Math.abs(world.scale.x), Math.abs(world.scale.z)) || 1;
    const resourceId = typeof node.metadata?.resource === "string" ? node.metadata.resource : undefined;
    const entry = resourceId ? getResource(resourceId) : undefined;
    let kind: string = node.kind;
    let size = "-";
    let radius: number | undefined;
    if (node.metadata?.environment === true) {
      kind = `sky ${resourceId ?? ""}`.trim();
    } else if (node.metadata?.terrain === true) {
      kind = "terrain island";
      radius = (entry?.footprint ?? 16) * scale;
      size = `r${f(radius)}`;
    } else if (resourceId) {
      kind = `resource ${resourceId}`;
      // Generated objects (a castle, a parts model) store their real footprint on the node.
      const own = typeof node.metadata?.footprint === "number" ? node.metadata.footprint : undefined;
      radius = (own ?? entry?.footprint ?? 1) * scale;
      size = `r${f(radius)}`;
    } else if (node.kind === "group") {
      kind = "folder";
    } else if (node.kind === "primitive") {
      const s = node.data.size;
      kind = `primitive ${node.data.shape}`;
      size = `${f(s.x * world.scale.x)}x${f(s.y * world.scale.y)}x${f(s.z * world.scale.z)}`;
      radius = Math.max(Math.abs(s.x * world.scale.x), Math.abs(s.z * world.scale.z)) / 2;
    }
    out.push({ id: node.id, name: node.name, kind, position: world.position, size, radius, terrain: node.metadata?.terrain === true });
  }
  return out;
}

export type DigestInput = {
  nodes: DigestNode[];
  selection: string[];
  cameraTarget?: Vec3;
  counts: { entities: number; materials: number; paths: number; hooks: number };
};

/** Text of the digest. Pure function (unit tested). */
export function formatSceneDigest(input: DigestInput): string {
  const { nodes, selection, cameraTarget, counts } = input;
  const lines = [
    "[Scene digest. Ids are for tools and layout anchors. Positions are world x,y,z in meters. Size is x×y×z, or rN = footprint radius.]",
    `Selection: ${selection.length ? selection.slice(0, 20).join(", ") : "none"}`,
    `Camera target: ${cameraTarget ? v3(cameraTarget) : "unknown"}`,
    `Counts: ${nodes.length} nodes, ${counts.entities} entities, ${counts.materials} materials, ${counts.paths} paths, ${counts.hooks} hooks`,
    "id | name | kind | position | size"
  ];
  for (const n of nodes.slice(0, DIGEST_MAX_NODES)) lines.push(`${n.id} | ${n.name} | ${n.kind} | ${v3(n.position)} | ${n.size}`);
  if (nodes.length > DIGEST_MAX_NODES) lines.push(`... and ${nodes.length - DIGEST_MAX_NODES} more nodes (use list_nodes for them)`);
  if (nodes.length === 0) lines.push("(the scene is empty)");
  return lines.join("\n");
}

/**
 * Nodes for the digest text with the things that generators built folded to ONE line each
 * (Director v2): the folder stays, its parts are counted. A city of 300 nodes is one line, so the
 * model reads structure and not a parts list. The facts are in the [Built] block (site.ts).
 */
export function collapseSites(nodes: DigestNode[], sites: BuiltSite[], membership: Map<string, string>): DigestNode[] {
  if (sites.length === 0) return nodes;
  const byId = new Map(sites.map((s) => [s.id, s]));
  const parts = new Map<string, number>();
  for (const [nodeId, siteId] of membership) if (nodeId !== siteId) parts.set(siteId, (parts.get(siteId) ?? 0) + 1);
  const out: DigestNode[] = [];
  for (const n of nodes) {
    const siteId = membership.get(n.id);
    if (!siteId) {
      out.push(n);
      continue;
    }
    if (siteId !== n.id) continue;
    const site = byId.get(siteId)!;
    const r = site.facts.rect;
    out.push({
      ...n,
      kind: `built ${site.generator} (${parts.get(siteId) ?? 0} parts, see [Built])`,
      position: { x: site.facts.center.x, y: n.position.y, z: site.facts.center.z },
      size: `${f(r.x1 - r.x0)}x${f(site.facts.height ?? 0)}x${f(r.z1 - r.z0)}`
    });
  }
  return out;
}

export function buildSceneDigest(editor: EditorCore, cameraTarget?: Vec3): string {
  const scene = editor.scene;
  const hooks =
    Array.from(scene.nodes.values()).reduce((count, node) => count + (node.hooks?.length ?? 0), 0) +
    Array.from(scene.entities.values()).reduce((count, entity) => count + (entity.hooks?.length ?? 0), 0);
  const sites = readSites(editor);
  // Modeled objects are in [Built] too, so the director can change one in place. A group of
  // copies is one line of the digest; a single object keeps its own line (id, place, radius).
  const objects = readObjects(editor);
  const groups = objects.filter((o) => typeof editor.scene.nodes.get(o.id)?.metadata?.objectGroup === "string");
  const membership = siteMembership(editor, sites);
  for (const [nodeId, groupId] of objectMembership(editor, groups)) membership.set(nodeId, groupId);
  const digest = formatSceneDigest({
    nodes: collapseSites(digestNodes(editor), [...sites, ...groups], membership),
    selection: [...editor.selection.ids],
    cameraTarget,
    counts: { entities: scene.entities.size, materials: scene.materials.size, paths: scene.settings.paths?.length ?? 0, hooks }
  });
  const built = sitesToText([...sites, ...objects]);
  const text = built ? `${digest}\n${built}` : digest;
  const withProjects = projectStore.projects.length ? `${text}\n${projectsLine()}` : text;
  return gameStore.active ? `${withProjects}\n${gameModeLine()}` : withProjects;
}

/** Imported projects: what load_project and search_resources can use. */
export function projectsLine(): string {
  const rows = projectStore.projects.slice(0, 6).map((p) => {
    const adapter = adapterOf(p);
    const env = adapter ? adapter.label : p.levelModel ? `level model ${p.levelModel}` : "no environment";
    const models = p.models.length ? `${p.models.length} models (${p.models.slice(0, 5).map((m) => m.id).join(", ")}${p.models.length > 5 ? ", ..." : ""})` : "no models";
    return `- ${p.name} (${p.root}): ${env}; ${models}; ${p.references.length} reference images`;
  });
  return ["Imported projects (load_project loads the environment):", ...rows].join("\n");
}

/** The player's place and facing while the user walks the scene (game mode). */
export function gameModeLine(): string {
  if (!playerPose.valid) return `Game mode: on (${gameStore.view} person), the player is not placed yet.`;
  const p = playerPose.position;
  const fw = playerPose.forward;
  const loose = Object.entries(gameStore.overrides)
    .filter(([, mode]) => mode === "loose")
    .map(([id]) => id);
  return [
    `Game mode: on (${gameStore.view} person). Player feet at ${v3(p)}, facing x ${f(fw.x)}, z ${f(fw.z)}.`,
    `In front of the player (4 m): ${f(p.x + fw.x * 4)},${f(p.y)},${f(p.z + fw.z * 4)}. Loose objects: ${loose.length ? loose.slice(0, 20).join(", ") : "none"}.`
  ].join("\n");
}
