// Sites (Director v2, plan docs/plans/realtime-ai-harness.md 5C): the director's memory of what
// the generators built. Each generator writes ONE SiteRecord as JSON text into metadata.site of
// its folder node, in the same undo step as the build. The director reads the records back as a
// short [Built] text; other generators read the facts (a river routes by the city plan).
import type { EditorCore } from "@theras/editor-core";
import type { BuiltSite, CitySiteFacts, SiteRecord, SiteRect } from "./types";

type MetadataValue = string | number | boolean;

/** Metadata for the folder node of a generator: spread it into the node's metadata. */
export function siteMetadata(record: SiteRecord): Record<string, MetadataValue> {
  return { generated: record.generator, site: JSON.stringify(record) };
}

function parseSite(id: string, text: unknown): BuiltSite | null {
  if (typeof text !== "string") return null;
  try {
    const r = JSON.parse(text) as SiteRecord;
    if (!r || typeof r !== "object" || typeof r.generator !== "string" || !r.facts || !r.facts.center || !r.facts.rect) return null;
    return { ...r, id };
  } catch {
    return null;
  }
}

/** All sites in the scene, in build order (scene order). */
export function readSites(editor: EditorCore): BuiltSite[] {
  const out: BuiltSite[] = [];
  // A test editor may have no scene.
  const nodes = editor?.scene?.nodes;
  if (!nodes) return out;
  for (const node of nodes.values()) {
    const site = parseSite(node.id, node.metadata?.site);
    if (site) out.push(site);
  }
  return out;
}

/** The folder of a site and every node below it, children before parents (for remove). */
export function siteNodeIds(editor: EditorCore, siteId: string): string[] {
  const children = new Map<string, string[]>();
  for (const node of editor.scene.nodes.values()) {
    if (!node.parentId) continue;
    const list = children.get(node.parentId);
    if (list) list.push(node.id);
    else children.set(node.parentId, [node.id]);
  }
  const out: string[] = [];
  const walk = (id: string) => {
    for (const child of children.get(id) ?? []) walk(child);
    out.push(id);
  };
  if (editor.scene.nodes.has(siteId)) walk(siteId);
  return out;
}

/** Node id -> site id, for every node that is inside a site folder (the folder itself too). */
export function siteMembership(editor: EditorCore, sites: BuiltSite[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const site of sites) for (const id of siteNodeIds(editor, site.id)) out.set(id, site.id);
  return out;
}

// ── Geometry helpers for generators ───────────────────────────

export const rectWidth = (r: SiteRect) => r.x1 - r.x0;
export const rectDepth = (r: SiteRect) => r.z1 - r.z0;
export const rectCenter = (r: SiteRect) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2 });
export const rectContains = (r: SiteRect, x: number, z: number, margin = 0) => x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin;
export const rectsOverlap = (a: SiteRect, b: SiteRect, margin = 0) => a.x0 < b.x1 + margin && a.x1 > b.x0 - margin && a.z0 < b.z1 + margin && a.z1 > b.z0 - margin;
/** Distance from a point to a rectangle (0 inside). */
export function rectDistance(r: SiteRect, x: number, z: number) {
  return Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));
}

/** The city sites, nearest to a point first. */
export function citySites(sites: BuiltSite[], near?: { x: number; z: number }): (BuiltSite & { facts: BuiltSite["facts"] & { city: CitySiteFacts } })[] {
  const list = sites.filter((s): s is BuiltSite & { facts: BuiltSite["facts"] & { city: CitySiteFacts } } => Boolean(s.facts.city));
  if (near) list.sort((a, b) => rectDistance(a.facts.rect, near.x, near.z) - rectDistance(b.facts.rect, near.x, near.z));
  return list;
}

/** The city a point stands on or near (within reach meters of its ground), or undefined. */
export function cityNear(sites: BuiltSite[], point: { x: number; z: number }, reach = 30) {
  const city = citySites(sites, point)[0];
  return city && rectDistance(city.facts.city.groundRect, point.x, point.z) <= reach ? city : undefined;
}

/** Tallest thing that generators built, in world meters (0 = nothing). */
export function tallestHeight(sites: BuiltSite[]): number {
  // A modeled object (a giant cactus) is not a building.
  return sites.reduce((h, s) => (s.generator === "object" ? h : Math.max(h, s.facts.height ?? 0)), 0);
}

// ── Obstacles for the layout solver ───────────────────────────

export type SiteObstacle = { id: string; name: string; kind: string; position: { x: number; y: number; z: number }; radius: number };

/**
 * Street surfaces and river water as rows of circles, so the layout solver (circles only) never
 * puts a tree or a bench on a road or in the water. Sidewalks, lots and parks stay free.
 * The furniture of an interior is a circle for each piece.
 */
export function siteObstacles(sites: BuiltSite[]): SiteObstacle[] {
  const out: SiteObstacle[] = [];
  for (const site of sites) {
    const city = site.facts.city;
    if (city) {
      for (const st of city.streets) {
        const r = Math.max(1, st.carriage / 2);
        const step = r * 1.2;
        const n = Math.max(1, Math.ceil((st.to - st.from) / step));
        for (let k = 0; k <= n; k++) {
          const along = st.from + ((st.to - st.from) * k) / n;
          out.push({
            id: `site-obstacle:${site.id}:street:${st.id}:${k}`,
            name: st.name,
            kind: "street surface",
            position: st.axis === "x" ? { x: along, y: city.y, z: st.pos } : { x: st.pos, y: city.y, z: along },
            radius: r
          });
        }
      }
    }
    const river = site.facts.river;
    if (river && river.points.length > 1) {
      const r = river.width / 2 + 0.6;
      for (let i = 0; i + 1 < river.points.length; i++) {
        const [ax, az] = river.points[i];
        const [bx, bz] = river.points[i + 1];
        const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / (r * 1.2)));
        for (let k = 0; k < n; k++) {
          const t = k / n;
          out.push({ id: `site-obstacle:${site.id}:river:${i}:${k}`, name: site.title, kind: "river course", position: { x: ax + (bx - ax) * t, y: 0, z: az + (bz - az) * t }, radius: r });
        }
      }
    }
    // The furniture of an interior: a plant placed in the lobby stands between it, not in it.
    const interior = site.facts.interior;
    if (interior) {
      interior.obstacles.forEach(([x, z, r], k) => {
        out.push({ id: `site-obstacle:${site.id}:furniture:${k}`, name: site.title, kind: "furniture", position: { x, y: interior.floorY, z }, radius: r });
      });
    }
  }
  return out;
}

/** Height of the walkable city surface (sidewalks, lots, park) under a point, or null outside every city. */
export function cityGroundAt(sites: BuiltSite[], x: number, z: number, curb = 0.17): number | null {
  for (const site of sites) {
    const city = site.facts.city;
    if (city && rectContains(city.streetsRect, x, z)) return city.y + curb * city.scale;
  }
  return null;
}

// ── Text for the director ─────────────────────────────────────

const f = (n: number) => String(Math.round(n * 10) / 10);

/** The [Built] block of the director context. "" when no generator built anything. */
export function sitesToText(sites: BuiltSite[]): string {
  if (sites.length === 0) return "";
  const lines = [
    "[Built. One line for each thing a generator built: id | title | generator | center x,z | size | facts | change. To change one, send a task with the same generator, replace = its id, and only the params that change.]"
  ];
  // Modeled objects (objects.ts) come after the big things, and many of them never push a city out.
  const big = sites.filter((s) => s.generator !== "object").slice(-12);
  const objects = sites.filter((s) => s.generator === "object").slice(-8);
  for (const s of [...big, ...objects]) {
    const { facts } = s;
    const size = `${f(rectWidth(facts.rect))} x ${f(rectDepth(facts.rect))} m${facts.height ? `, ${f(facts.height)} m tall` : ""}`;
    lines.push(`${s.id} | ${s.title} | ${s.generator} | ${f(facts.center.x)},${f(facts.center.z)} | ${size} | ${facts.summary}${facts.adjustable ? ` | change: ${facts.adjustable}` : ""}`);
  }
  const style = sceneStyle(sites);
  if (style) lines.push(`[Scene style: ${style}. New things fit this style unless the user asks for a contrast.]`);
  return lines.join("\n");
}

/** A few words for the look of the scene so far, from the site records. */
export function sceneStyle(sites: BuiltSite[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  const add = (text: string | undefined) => {
    const t = text?.trim();
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      parts.push(t);
    }
  };
  for (const s of sites) add(s.facts.style);
  const city = sites.find((s) => s.facts.city)?.facts.city;
  if (city && city.trees !== "none") add(`street trees ${city.trees}`);
  const tallest = tallestHeight(sites);
  if (tallest > 0) add(`tallest building ${f(tallest)} m`);
  return parts.slice(0, 8).join("; ");
}
