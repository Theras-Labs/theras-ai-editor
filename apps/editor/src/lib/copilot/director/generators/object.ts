// Generator "object": an object that is NOT in the library, modeled from parts.
// One model call (the modeler, src/lib/generators/parts/prompt.ts) writes a parts spec as DATA
// through the submit_parts tool; code validates, self-checks and builds it. The editor never
// runs model-written code. The object appears stage by stage: stage 1 (the silhouette) right after
// the answer, then one stage per pause, each grown in by the parts reveal shader.
// The whole live build is ONE undo step (the stage updates are folded into the creation).
//
// A modeled object can be CHANGED (plan 5E, 2026-11-11). The director sends a replace task with
// the id of the object from [Built] (director/objects.ts reads the objects back from the scene):
//   - another size: the same spec with another fit size, in place, with NO model call;
//   - other colors: the palette roles of the same spec, in place, with no model call;
//   - copies (count, arrange, around, closed): the same spec placed several times by the layout
//     solver, as a group, a row or a ring around another thing ("a wall of cactus around the
//     puddle"); one folder, one undo step;
//   - another shape (change, or a new subject): the modeler changes the present spec.
import { createSetNodeCommand, type Command, type EditorCore } from "@theras/editor-core";
import { makeTransform, vec3, type GeometryNode, type GroupNode } from "@theras/shared";
import { markBuildReveal } from "@/lib/build-reveal";
import { placementSceneOf, propPlacementSceneOf } from "@/lib/copilot/instant-path";
import {
  MODELER_SYSTEM_PROMPT,
  SUBMIT_PARTS_TOOL,
  buildParts,
  modelerUserMessage,
  partCount,
  prepareSpec,
  totalInstances,
  validateSpec,
  type PartsParams,
  type PartsSpec
} from "@/lib/generators/parts";
import { nodeBatchCommand } from "@/lib/outliner";
import { LAYOUT_GAP, LAYOUT_MAX_COUNT, findSpots, resolveLayoutAnchor, seededRandom, solveLayout, type LayoutPattern, type PlacementScene } from "@/lib/resources/layout";
import { placeResource } from "@/lib/resources/place";
import { OBJECT_ENTRY, objectGroupMetadata, objectMetadata, objectNodeIds, subjectAlone, subjectChanged, type ObjectArrange, type ObjectStyle } from "../objects";
import type { BuiltSite, ChoiceAnswers, Generator, GeneratorResult, NextStep } from "../types";

const ENTRY_ID = OBJECT_ENTRY;
/** Time between two stages of the live build (each stage also plays a 0.9 s reveal). */
const STAGE_PAUSE_MS = 650;
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const STYLES = ["toy", "realistic"] as const;

/**
 * Effort "medium" for words, "high" with a reference image. Measured 2026-11-11 (gpt-5.6-luna):
 * medium 14 to 24 s for 20 to 34 parts; high 64 s for a car of 27 parts that was not better.
 */
const effortFor = (images: number) => (images > 0 ? "high" : "medium");

function textOf(v: unknown, max: number) {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** The tool arguments, or the first JSON object in the text when the model answered in text. */
function specFromAnswer(args: Record<string, unknown> | undefined, text: string): unknown {
  if (args && Object.keys(args).length) return args;
  const a = text.indexOf("{");
  const b = text.lastIndexOf("}");
  if (a < 0 || b <= a) return undefined;
  try {
    return JSON.parse(text.slice(a, b + 1));
  } catch {
    return undefined;
  }
}

/**
 * Folds the creation command and the stage updates on top of the undo stack into one command.
 * Does nothing when another command came in between (then each stays its own step).
 */
function foldUndo(editor: EditorCore, chain: Command[], finalNode: GeometryNode, label: string) {
  const done = editor.commands.done;
  if (chain.length < 2 || done.length < chain.length) return;
  const top = done.slice(done.length - chain.length);
  if (top.some((c, i) => c !== chain[i])) return;
  const node = structuredClone(finalNode);
  done.splice(done.length - chain.length, chain.length, {
    label,
    execute(scene) {
      scene.addNode(structuredClone(node));
    },
    undo(scene) {
      scene.removeNode(node.id);
    }
  });
}

/**
 * A sentence for the summary when the object could not stand where the user asked (the place
 * was taken, for example inside a building): how far away it stands and in which direction.
 * The user then knows where to look, and the summary does not claim the asked place.
 */
export function placeNote(asked: { x: number; z: number }, spot: { x: number; z: number }, footprint: number): string {
  const dx = spot.x - asked.x;
  const dz = spot.z - asked.z;
  const distance = Math.hypot(dx, dz);
  if (distance <= Math.max(3, footprint * 1.5)) return "";
  // North is -z and east is +x, as in the river routes.
  const names = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];
  const direction = names[((Math.round(Math.atan2(dz, dx) / (Math.PI / 4)) % 8) + 8) % 8];
  return ` The place you asked for was not free, so it stands ${Math.round(distance)} m to the ${direction} of it.`;
}

// ── Copies of one model: the plan (pure, unit tested) ────────

const TAU = Math.PI * 2;
const r1 = (n: number) => Math.round(n * 10) / 10;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Words the director may send for arrange. A wall or a fence is a ring with no gaps. */
const ARRANGE_WORDS: Record<string, { arrange: ObjectArrange; closed?: boolean }> = {
  cluster: { arrange: "cluster" },
  group: { arrange: "cluster" },
  clump: { arrange: "cluster" },
  patch: { arrange: "cluster" },
  scatter: { arrange: "cluster" },
  ring: { arrange: "ring" },
  circle: { arrange: "ring" },
  around: { arrange: "ring" },
  wall: { arrange: "ring", closed: true },
  fence: { arrange: "ring", closed: true },
  hedge: { arrange: "ring", closed: true },
  border: { arrange: "ring", closed: true },
  enclosure: { arrange: "ring", closed: true },
  row: { arrange: "row" },
  line: { arrange: "row" }
};

export type CopiesPlan = {
  pattern: LayoutPattern;
  count: number;
  /** Ring radius in meters (ring only). */
  radius?: number;
  /** Footprint radius for the layout solver: smaller than the bounding radius, so copies stand close. */
  footprint: number;
  closed: boolean;
  /** A closed ring that 24 copies of this size cannot close. */
  gaps: boolean;
};

/**
 * How many copies, and how close they stand. footprint is the bounding radius of one copy
 * (the corner of its bounding box), which is loose: neighbors at that distance leave gaps.
 * A closed ring (a wall) packs the copies so they touch, and its count comes from the ring length.
 */
export function planCopies(input: { arrange: ObjectArrange; count?: number; closed: boolean; footprint: number; anchorRadius: number }): CopiesPlan {
  const f = Math.max(input.footprint, 0.2);
  const asked = input.count !== undefined && Number.isFinite(input.count) ? clamp(Math.round(input.count), 1, LAYOUT_MAX_COUNT) : undefined;
  if (input.arrange === "ring") {
    const base = input.anchorRadius > 0 ? input.anchorRadius + f * 0.85 + 0.3 : Math.max(f * 2.2, 2);
    const r = f * (input.closed ? 0.6 : 0.8);
    // The solver keeps two copies 2r + gap apart in a STRAIGHT line (the chord of the ring, not
    // the arc). With the arc, every second copy had no room and moved one step out.
    const chord = 2 * r + LAYOUT_GAP + 0.02;
    /** Copies that fit on a ring of this radius. */
    const fits = (radius: number) => Math.floor(Math.PI / Math.asin(Math.min(1, chord / (2 * radius))));
    /** The smallest ring that holds n copies. */
    const ringFor = (n: number) => chord / (2 * Math.sin(Math.PI / n));
    if (input.closed) {
      const need = fits(base);
      const count = clamp(need, 5, LAYOUT_MAX_COUNT);
      return { pattern: "ring", count, radius: Math.max(base, ringFor(count)), footprint: r, closed: true, gaps: need > LAYOUT_MAX_COUNT };
    }
    const count = Math.max(2, asked ?? clamp(Math.round((TAU * base) / (f * 3.2)), 5, 12));
    return { pattern: "ring", count, radius: Math.max(base, ringFor(count)), footprint: r, closed: false, gaps: false };
  }
  if (input.arrange === "row") return { pattern: "row", count: asked ?? 5, footprint: f * 0.75, closed: false, gaps: false };
  return { pattern: "cluster", count: asked ?? 3, footprint: f * 0.8, closed: false, gaps: false };
}

/** Things that grow or lie in nature: copies of them get their own turn and size. */
const NATURAL = /cact|tree|bush|shrub|plant|flower|rock|stone|boulder|palm|fern|mushroom|coral|grass|bamboo|reed|log\b|stump|crystal|dune|vine|weed/i;
/** A number in the user's own words ("8 cacti", "a dozen"): then the count is a wish, not a guess. */
const NUMBER_WORDS = /\d|\b(two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|dozen|couple|pair)\b/i;

/**
 * The spec with the asked colors on its palette roles (role names compared without case).
 * roles = the roles that changed; empty when no asked role is in the palette.
 */
export function swapColors(spec: PartsSpec, colors: Record<string, string>): { spec: PartsSpec; roles: string[] } {
  const byLower = new Map(Object.keys(spec.palette).map((role) => [role.toLowerCase(), role]));
  const palette = { ...spec.palette };
  const roles: string[] = [];
  for (const [role, hex] of Object.entries(colors)) {
    const key = byLower.get(role.trim().toLowerCase());
    if (!key || !HEX.test(hex) || palette[key]!.toLowerCase() === hex.toLowerCase()) continue;
    palette[key] = hex;
    roles.push(key);
  }
  return roles.length ? { spec: { ...spec, palette }, roles } : { spec, roles };
}

function hashText(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

const isPartsNode = (n: GeometryNode | undefined): n is GeometryNode => Boolean(n) && n!.metadata?.resource === ENTRY_ID;

/** The checked spec of a modeled node, with its fit size. */
function storedParamsOf(node: GeometryNode): PartsParams | undefined {
  try {
    const raw = JSON.parse(String(node.metadata?.params ?? "")) as { spec?: unknown; sizeMeters?: unknown };
    const v = validateSpec(raw.spec);
    if ("error" in v) return undefined;
    const size = typeof raw.sizeMeters === "number" && Number.isFinite(raw.sizeMeters) && raw.sizeMeters > 0 ? raw.sizeMeters : undefined;
    return { spec: v.spec, ...(size ? { sizeMeters: size } : {}) };
  } catch {
    return undefined;
  }
}

const nodeScaleOf = (node: GeometryNode) => Math.max(Math.abs(node.transform.scale.x), Math.abs(node.transform.scale.y), Math.abs(node.transform.scale.z)) || 1;

/** Footprint radius and size of a spec at a fit size (builds the meshes once, then frees them). */
function measure(spec: PartsSpec, fitSize: number | undefined) {
  const probe = buildParts(spec, { fitSize });
  const out = { footprint: Math.round(probe.footprint * 100) / 100, size: probe.size.map((v) => r1(v)) as number[] };
  probe.dispose();
  return out;
}

const sizeText = (size: number[]) => `${size.join(" x ")} m`;

function nextFor(name: string, multi: boolean): NextStep[] {
  return multi
    ? [
        { label: "Bigger copies", prompt: `Make the ${name} copies bigger` },
        { label: "More copies", prompt: `Add more copies to ${name}` }
      ]
    : [
        { label: "Make it bigger", prompt: `Make ${name} bigger` },
        { label: "A group of 5", prompt: `Make a group of 5 of ${name}` }
      ];
}

export const objectGenerator: Generator = {
  id: "object",
  describe:
    'ONE object that is NOT in the library (airplane, sports car, market stall, robot, statue, any vehicle, machine or prop). A modeler builds it from shapes. Use only when the library has no such object. params: subject (the object and its key traits), sizeMeters? (longest side; bench 1.2, cottage 4), style? ("toy" | "realistic" | "unsure" = ask the user), colors? (role -> "#hex"). Several of the SAME model: count? (2-24), arrange? ("cluster" | "ring" | "row"), around? (node id), closed? (true = a wall of it, no gaps), vary? (true: plants, rocks). With replace: change? (words for another shape).',

  validate(params, brief) {
    const words = textOf(params.subject, 200) ?? textOf(params.name, 200);
    if (!words) return "object: params.subject is required (the object to model, for example \"small propeller airplane\")";
    // The object alone: its place and its neighbors are in the scene, not in the model.
    const subject = subjectAlone(words);
    const out: Record<string, unknown> = { subject };
    const size = Number(params.sizeMeters);
    if (params.sizeMeters !== undefined && Number.isFinite(size) && size > 0) out.sizeMeters = Math.min(60, Math.max(0.1, size));
    const style = textOf(params.style, 20)?.toLowerCase();
    if (style === "unsure") out.style = "unsure";
    else if (style && (STYLES as readonly string[]).includes(style)) out.style = style;
    else if (style?.startsWith("real")) out.style = "realistic";
    const colors: Record<string, string> = {};
    const own = params.colors && typeof params.colors === "object" ? (params.colors as Record<string, unknown>) : undefined;
    const source = own ?? brief.style?.colors ?? {};
    for (const [k, v] of Object.entries(source).slice(0, 6)) if (typeof v === "string" && HEX.test(v.trim())) colors[k.slice(0, 24)] = v.trim();
    if (Object.keys(colors).length) {
      out.colors = colors;
      // Colors of the task itself are a change request; colors of the brief style are a hint.
      if (own) out.colorsAsked = true;
    }
    const count = Number(params.count);
    if (params.count !== undefined && Number.isFinite(count) && count >= 1) out.count = clamp(Math.round(count), 1, LAYOUT_MAX_COUNT);
    const word = ARRANGE_WORDS[textOf(params.arrange, 20)?.toLowerCase() ?? ""];
    if (word) {
      out.arrange = word.arrange;
      if (word.closed) out.closed = true;
    }
    if (params.closed === true || params.closed === "true") out.closed = true;
    else if (params.closed === false || params.closed === "false") delete out.closed;
    if (params.vary === true || params.vary === "true") out.vary = true;
    const around = textOf(params.around, 120);
    if (around) out.around = around;
    const change = textOf(params.change, 300);
    if (change) out.change = change;
    return out;
  },

  choices(params, ctx) {
    // A change keeps the style of the object; only a new object asks.
    if (params.style !== "unsure" || ctx.replace) return [];
    return [
      {
        id: "style",
        title: "Style?",
        suggested: "toy",
        options: [
          { id: "toy", label: "Stylized", hint: "Rounded shapes, soft colors" },
          { id: "realistic", label: "Realistic", hint: "True proportions, muted colors" }
        ]
      }
    ];
  },

  async run(params, answers: ChoiceAnswers, ctx): Promise<GeneratorResult> {
    const editor = ctx.editor;
    const subject = String(params.subject);
    const chosen = answers.style?.optionIds[0];
    const style: ObjectStyle = chosen === "realistic" || (chosen === undefined && params.style === "realistic") ? "realistic" : "toy";
    const images = (ctx.attachments ?? []).filter((a) => a.kind === "image").slice(0, 2);

    // The object this task changes (a single node, or the folder of copies), if any.
    const old: BuiltSite | undefined = ctx.replace?.generator === "object" ? ctx.replace : undefined;
    const oldIds = old ? objectNodeIds(editor, old.id) : [];
    const oldParts = oldIds.map((id) => editor.scene.getNode(id) as GeometryNode | undefined).filter(isPartsNode);
    const oldFirst = oldParts[0];
    const oldIsGroup = Boolean(old) && oldIds.length > 0 && !isPartsNode(editor.scene.getNode(old!.id) as GeometryNode | undefined);
    const stored = oldFirst ? storedParamsOf(oldFirst) : undefined;
    const oldLongest = old && typeof old.params.sizeMeters === "number" ? old.params.sizeMeters : undefined;
    const oldName = oldFirst?.name ?? old?.title ?? subject;

    // 1. The spec: the present one (with another palette), or one from the modeler.
    const change = typeof params.change === "string" ? params.change : undefined;
    const askedColors = params.colorsAsked === true ? ((params.colors ?? {}) as Record<string, string>) : {};
    const swap = stored ? swapColors(stored.spec, askedColors) : undefined;
    const colorsNeedModeler = Boolean(stored) && Object.keys(askedColors).length > 0 && swap!.roles.length === 0;
    const reuse = Boolean(stored) && !change && !colorsNeedModeler && images.length === 0 && !subjectChanged(String(old?.params.subject ?? ""), subject, `${old?.title ?? ""} ${oldName}`);
    const asked = typeof params.sizeMeters === "number" ? params.sizeMeters : undefined;
    const sizeChanged = asked !== undefined && (oldLongest === undefined || Math.abs(asked - oldLongest) > 0.051);
    /** Longest side in world meters: the asked one, or the present one of the object. */
    const worldLongest = sizeChanged || !old ? asked : oldLongest;

    let spec: PartsSpec;
    let dropped: string[] = [];
    let modelNote = "";
    if (reuse) {
      spec = swap!.spec;
      ctx.step("Same model", `${spec.name}: no new model call`);
    } else {
      ctx.step(stored ? "Changing the model" : "Modeling", change ?? subject);
      const started = Date.now();
      // Start the build as soon as the tool call is complete in the stream (before the final event).
      let early: (args: Record<string, unknown>) => void = () => {};
      const earlyArgs = new Promise<Record<string, unknown>>((resolve) => (early = resolve));
      const call = ctx.callModel({
        system: MODELER_SYSTEM_PROMPT,
        user: modelerUserMessage({
          subject,
          sizeMeters: worldLongest,
          style,
          colors: params.colors as Record<string, string> | undefined,
          understanding: ctx.brief.understanding ? subjectAlone(ctx.brief.understanding) : undefined,
          prompt: ctx.prompt,
          hasImage: images.length > 0,
          ...(stored ? { base: { spec: stored.spec, change: change ?? (Object.keys(askedColors).length ? "other colors, as listed" : `it is now: ${subject}`) } } : {})
        }),
        attachments: images.length ? images : undefined,
        tool: SUBMIT_PARTS_TOOL,
        effort: effortFor(images.length),
        onToolCall: (args) => early(args)
      });
      const answer = await Promise.race([earlyArgs.then((args) => ({ args, text: "" })), call.then((r) => ({ args: r.toolArgs, text: r.text }))]);
      // The call keeps running for its final event; its errors after the tool call do not matter.
      void call.catch(() => {});
      const seconds = ((Date.now() - started) / 1000).toFixed(1);
      const prepared = prepareSpec(specFromAnswer(answer.args, answer.text));
      if ("error" in prepared) {
        return {
          nodeIds: [],
          summary: `Could not model ${subject}: the modeler's spec was not usable (${prepared.error}).${old ? ` ${oldName} is not changed.` : ""}`,
          skipped: [`${subject}: ${prepared.error}`]
        };
      }
      spec = prepared.spec;
      dropped = prepared.issues.filter((i) => i.endsWith("dropped")).slice(0, 6);
      modelNote = `${partCount(spec)} parts (${totalInstances(spec)} pieces with mirrors and repeats)`;
      ctx.step("Parts spec", `${partCount(spec)} parts in ${spec.stages.length} stages, ${seconds} s${prepared.issues.length ? `, ${prepared.issues.length} fixed by the self-check` : ""}`);
    }
    // The style goes into the stored spec: the library entry gets only the params, and the
    // style picks the default surface (painted steel or plastic). A reused spec keeps its own.
    spec = { ...spec, style: reuse && spec.style ? spec.style : style };
    const note = { subject, style };

    // 2. One object or copies of it.
    const arrangeParam = params.arrange === "ring" || params.arrange === "row" || params.arrange === "cluster" ? (params.arrange as ObjectArrange) : undefined;
    const countParam = typeof params.count === "number" ? params.count : undefined;
    // With a replace the stored count is in the params too: only another number is a wish.
    const countGiven = countParam !== undefined && (!old || countParam !== old.params.count);
    const multi = countGiven ? countParam! > 1 : arrangeParam !== undefined || (countParam ?? 1) > 1;

    if (multi) {
      const arrange: ObjectArrange = arrangeParam ?? "cluster";
      // A wall has no gaps: its count comes from the ring length. A count wins only when the
      // number is in the user's own words; a count the director added by itself is a guess.
      const closed = arrange === "ring" && params.closed === true && !(countGiven && NUMBER_WORDS.test(ctx.prompt));
      const vary = params.vary === true || NATURAL.test(`${subject} ${spec.name}`);
      const { footprint, size } = measure(spec, worldLongest);
      const center = old ? old.facts.center : ctx.anchor;
      const gone = new Set(oldIds);
      const base = propPlacementSceneOf(editor, { x: center.x, y: 0, z: center.z });
      const scene: PlacementScene = { ...base, nodes: base.nodes.filter((n) => !gone.has(n.id)) };

      // The thing the copies stand around: a node of the scene, or the place of the object.
      const aroundRef = typeof params.around === "string" ? params.around : undefined;
      let anchorRef: string | { x: number; z: number } = { x: center.x, z: center.z };
      let anchorRadius = 0;
      let anchorPoint = { x: center.x, z: center.z };
      let anchorName: string | undefined;
      let anchorNote = "";
      if (aroundRef) {
        const resolved = gone.has(aroundRef) ? "the object itself" : resolveLayoutAnchor(aroundRef, scene);
        if (typeof resolved === "string") {
          anchorNote = ` I could not find "${aroundRef}" as a thing in the scene, so the copies stand at the place of ${oldName}.`;
        } else {
          anchorRef = aroundRef;
          anchorRadius = resolved.r;
          anchorPoint = { x: resolved.x, z: resolved.z };
          const lower = aroundRef.toLowerCase();
          anchorName = scene.nodes.find((n) => n.id === aroundRef)?.name ?? scene.nodes.find((n) => n.name.toLowerCase() === lower)?.name ?? (aroundRef === "camera" || aroundRef === "selection" ? undefined : aroundRef);
        }
      }

      const plan = planCopies({ arrange, count: closed ? undefined : countParam && countParam > 1 ? countParam : undefined, closed, footprint, anchorRadius });
      const seed = hashText(`${spec.name}|${arrange}|${Math.round(anchorPoint.x)}|${Math.round(anchorPoint.z)}`);
      const result = solveLayout(
        [
          {
            id: ENTRY_ID,
            footprint: plan.footprint,
            medium: "land",
            vary: vary && plan.pattern === "cluster",
            count: plan.count,
            layout: { pattern: plan.pattern, anchor: anchorRef, ...(plan.radius ? { radius: plan.radius } : {}) },
            seed
          }
        ],
        scene
      );
      if (result.placed.length === 0) {
        return {
          nodeIds: [],
          summary: `Could not place copies of ${spec.name}: ${result.skipped.map((s) => s.reason).join("; ") || "no free ground"}.${old ? ` ${oldName} is not changed.` : ""}`,
          skipped: result.skipped.map((s) => s.reason)
        };
      }

      const taken = new Set<string>();
      const freeId = (prefix: string) => {
        let i = 1;
        while (editor.scene.nodes.has(`${prefix}:${i}`) || taken.has(`${prefix}:${i}`)) i++;
        taken.add(`${prefix}:${i}`);
        return `${prefix}:${i}`;
      };
      const folderId = freeId("node:group");
      const word = plan.pattern === "ring" ? (plan.closed ? "wall" : "ring") : plan.pattern === "row" ? "row" : "group";
      const folderName = oldIsGroup ? (editor.scene.getNode(old!.id)?.name ?? `${spec.name} ${word}`) : `${spec.name} ${word}`;
      const paramsText = JSON.stringify({ spec, ...(worldLongest ? { sizeMeters: worldLongest } : {}) } satisfies PartsParams);
      const rng = seededRandom(seed + 17);
      const copies: GroupNode[] = result.placed.map((p) => {
        // Plants and rocks: each copy has its own turn and size, so the repeat does not show.
        const scale = vary ? (plan.pattern === "cluster" ? p.scale : 0.86 + rng() * 0.28) : 1;
        const transform = makeTransform(vec3(p.x, p.y, p.z));
        transform.rotation.y = vary ? rng() * TAU : p.rotationY;
        if (scale !== 1) transform.scale = vec3(scale, scale, scale);
        return {
          id: freeId("node:resource:parts"),
          kind: "group",
          name: spec.name,
          parentId: folderId,
          transform,
          data: {},
          metadata: { resource: ENTRY_ID, seed: p.seed, params: paramsText, footprint, ...objectMetadata(note) }
        };
      });
      const folder: GroupNode = {
        id: folderId,
        kind: "group",
        name: folderName,
        transform: makeTransform(vec3(0, 0, 0)),
        data: {},
        metadata: objectGroupMetadata({
          ...note,
          arrange,
          ...(anchorName && typeof anchorRef === "string" ? { around: anchorRef } : {}),
          ...(plan.closed ? { closed: true } : {}),
          ...(vary ? { vary: true } : {}),
          center: anchorPoint
        })
      };
      editor.execute(nodeBatchCommand(editor.scene, `${old ? "change" : "build"} ${folderName}`, { add: [folder, ...copies], ...(oldIds.length ? { remove: oldIds } : {}) }));
      copies.forEach((c, i) => markBuildReveal([c.id], i * 90));
      ctx.step(folderName, `${copies.length} copies`);

      const shape = plan.pattern === "ring" ? (plan.closed ? "a closed ring" : "a ring") : plan.pattern === "row" ? "a row" : "a group";
      const ringR = plan.pattern === "ring" ? copies.reduce((sum, c) => sum + Math.hypot(c.transform.position.x - anchorPoint.x, c.transform.position.z - anchorPoint.z), 0) / copies.length : 0;
      const missing = plan.count - copies.length;
      const parts = [
        oldIsGroup
          ? `Rebuilt ${folderName} with ${copies.length} copies in ${shape}${anchorName ? ` around "${anchorName}"` : ""}: each about ${sizeText(size)}${vary ? ", each with its own turn and size" : ""}.`
          : `${old ? "Changed" : "Built"} ${spec.name} into ${copies.length} copies in ${shape}${anchorName ? ` around "${anchorName}"` : ""}: each about ${sizeText(size)}${vary ? ", each with its own turn and size" : ""}.`,
        plan.pattern === "ring" ? ` The ring is ${r1(ringR * 2)} m across.` : "",
        old && oldLongest !== undefined && sizeChanged
          ? oldIsGroup
            ? ` Before, there were ${Number(old.params.count) || oldParts.length} copies of about ${r1(oldLongest)} m on the longest side.`
            : ` Before, ${oldName} was ${r1(oldLongest)} m on its longest side.`
          : "",
        reuse ? " All copies are the model you had; no new model was made." : modelNote ? ` The model has ${modelNote}.` : "",
        plan.gaps ? ` The ring is too long for ${LAYOUT_MAX_COUNT} copies of this size, so it has gaps. Ask for bigger copies to close it.` : "",
        missing > 0 ? ` ${missing} of ${plan.count} copies had no free ground and were left out.` : "",
        anchorNote
      ];
      return {
        nodeIds: [folderId, ...copies.map((c) => c.id)],
        summary: parts.join(""),
        ...(dropped.length || missing > 0 ? { skipped: [...dropped, ...(missing > 0 ? [`${missing} copies: no free ground`] : [])] } : {}),
        next: nextFor(folderName, true)
      };
    }

    // 3a. One object that is in the scene: changed in place (the same node, one undo step).
    if (oldFirst && !oldIsGroup) {
      const scale = nodeScaleOf(oldFirst);
      // The node may be scaled by hand: the fit size is in the node's own space.
      const exact = stored ? (stored.sizeMeters ?? Math.max(...stored.spec.size)) * scale : oldLongest;
      const world = sizeChanged ? asked! : exact;
      const fit = world !== undefined ? world / scale : undefined;
      const { footprint, size } = measure(spec, fit);
      const colored = swap?.roles ?? [];
      if (reuse && !sizeChanged && colored.length === 0) {
        return { nodeIds: [oldFirst.id], summary: `${oldName} is ${r1(exact ?? 0)} m on its longest side already, so nothing changed. Say how big it must be.`, skipped: ["no change"] };
      }
      const name = !reuse && stored && oldFirst.name === stored.spec.name ? spec.name : oldFirst.name;
      const nextNode = {
        ...oldFirst,
        name,
        metadata: { ...oldFirst.metadata, params: JSON.stringify({ spec, ...(fit ? { sizeMeters: fit } : {}) } satisfies PartsParams), footprint, ...objectMetadata(note) }
      } as GeometryNode;
      editor.execute(nodeBatchCommand(editor.scene, `change ${name}`, { update: [nextNode] }));
      ctx.step(name, sizeChanged ? `${r1(exact ?? 0)} m to ${r1(world ?? 0)} m` : colored.length ? "new colors" : "changed");
      const worldSize = size.map((v) => r1(v * scale));
      const parts = [
        sizeChanged && exact !== undefined
          ? `Made ${name} ${world! >= exact ? "bigger" : "smaller"} in place: its longest side went from ${r1(exact)} m to ${r1(world!)} m (now about ${sizeText(worldSize)}).`
          : reuse
            ? `Changed the colors of ${name} in place.`
            : `Changed ${name} in place (${change ?? subject}): it has ${modelNote} now, about ${sizeText(worldSize)}.`,
        colored.length && (sizeChanged || !reuse) ? ` New colors: ${colored.join(", ")}.` : colored.length ? ` Roles: ${colored.join(", ")}.` : "",
        reuse ? " It is the same model at the same place; no new model was made." : " It stands at the same place."
      ];
      return { nodeIds: [oldFirst.id], summary: parts.join(""), ...(dropped.length ? { skipped: dropped } : {}), next: nextFor(name, false) };
    }

    // 3b. A group that becomes one object again: one node at the center of the group.
    if (old && oldIsGroup) {
      const { footprint, size } = measure(spec, worldLongest);
      const y = oldFirst?.transform.position.y ?? 0;
      let i = 1;
      while (editor.scene.nodes.has(`node:resource:parts:${i}`)) i++;
      const node: GroupNode = {
        id: `node:resource:parts:${i}`,
        kind: "group",
        name: spec.name,
        transform: makeTransform(vec3(old.facts.center.x, y, old.facts.center.z)),
        data: {},
        metadata: { resource: ENTRY_ID, seed: 1, params: JSON.stringify({ spec, ...(worldLongest ? { sizeMeters: worldLongest } : {}) } satisfies PartsParams), footprint, ...objectMetadata(note) }
      };
      editor.execute(nodeBatchCommand(editor.scene, `change ${old.title}`, { add: [node], remove: oldIds }));
      markBuildReveal([node.id]);
      ctx.step(spec.name, "one object");
      return {
        nodeIds: [node.id],
        summary: `Changed ${old.title} into one ${spec.name}, about ${sizeText(size)}, at the center of the group.${reuse ? " It is the same model; no new model was made." : ""}`,
        ...(dropped.length ? { skipped: dropped } : {}),
        next: nextFor(spec.name, false)
      };
    }

    // 3c. A new object: placed near the anchor and shown stage by stage.
    const sizeMeters = asked;
    const { footprint, size: finalSize } = measure(spec, sizeMeters);
    let spot = { x: ctx.anchor.x, y: 0, z: ctx.anchor.z };
    /** The thing it was asked to stand beside ("a cactus next to the puddle"), when it is in the scene. */
    let beside: string | undefined;
    try {
      const scene = placementSceneOf(editor, { x: ctx.anchor.x, y: 0, z: ctx.anchor.z });
      let anchor = { x: ctx.anchor.x, z: ctx.anchor.z, radius: 0, terrain: true, name: "anchor" };
      const aroundRef = typeof params.around === "string" ? params.around : undefined;
      const named = aroundRef ? resolveLayoutAnchor(aroundRef, scene) : undefined;
      if (named && typeof named !== "string" && named.r > 0) {
        // Just outside that thing, not at its center (a puddle is no obstacle, so the center is free).
        anchor = { x: named.x, z: named.z, radius: named.r, terrain: false, name: "around" };
        beside = scene.nodes.find((n) => n.id === aroundRef)?.name ?? aroundRef;
      }
      const found = findSpots(1, footprint, scene, anchor, beside ? "near" : undefined, { needsLand: true }) ?? findSpots(1, footprint, scene, anchor, beside ? "near" : undefined, { needsLand: false });
      if (found?.[0]) spot = found[0];
      else beside = undefined;
    } catch {
      // No scene digest (tests, an empty editor): the anchor itself.
    }

    const base: PartsParams = { spec, ...(sizeMeters ? { sizeMeters } : {}) };
    const staged = spec.stages.length;
    const doneBefore = editor.commands.done.length;
    const [nodeId] = placeResource(ENTRY_ID, spot, { params: staged > 1 ? { ...base, shown: 1 } : base, name: spec.name });
    if (!nodeId) return { nodeIds: [], summary: `Could not place ${spec.name}.` };
    const chain: Command[] = editor.commands.done.length === doneBefore + 1 ? [editor.commands.done[doneBefore]!] : [];
    ctx.step(spec.stages[0]!.name, `${spec.stages[0]!.parts.length} parts`);

    const setParams = (p: PartsParams) => {
      const node = editor.scene.getNode(nodeId);
      if (!node) return false;
      // The words it was modeled from stay on the node, for a later change of it.
      const next = { ...node, metadata: { ...node.metadata, params: JSON.stringify(p), footprint, ...objectMetadata(note) } } as GeometryNode;
      const cmd = createSetNodeCommand(editor.scene, nodeId, next);
      editor.execute(cmd);
      chain.push(cmd);
      return true;
    };

    let aborted: unknown = null;
    for (let k = 2; k <= staged; k++) {
      try {
        await ctx.pause(STAGE_PAUSE_MS);
      } catch (error) {
        aborted = error;
        break;
      }
      if (k === staged) break; // the final update below shows the last stage
      if (!setParams({ ...base, shown: k })) break;
      ctx.step(spec.stages[k - 1]!.name, `${spec.stages[k - 1]!.parts.length} parts`);
    }
    // Final params: the full spec (no "shown"), so save and undo keep the finished object.
    // On abort the object is completed at once; the run then stops.
    if (setParams(base) && !aborted && staged > 1) ctx.step(spec.stages[staged - 1]!.name, `${spec.stages[staged - 1]!.parts.length} parts`);
    const finalNode = editor.scene.getNode(nodeId);
    if (finalNode) foldUndo(editor, chain, finalNode, `model ${spec.name}`);
    if (aborted) throw aborted;

    return {
      nodeIds: [nodeId],
      summary: `Modeled ${spec.name} from ${modelNote}, about ${sizeText(finalSize)}.${beside ? ` It stands beside "${beside}".` : placeNote(ctx.anchor, spot, footprint)}`,
      ...(dropped.length ? { skipped: dropped } : {}),
      next: nextFor(spec.name, false)
    };
  }
};
