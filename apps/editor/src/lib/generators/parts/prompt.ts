// The modeler prompt and the submit_parts tool of the object modeler.
// The method (silhouette first, proportions from a reference frame, part hierarchy, mirrored
// pairs, primary/secondary/tertiary forms, material zones, self-check, "pick the shape by the kind
// of surface, not by size") is adapted from the img2threejs skill, Apache-2.0
// (~/.claude/skills/img2threejs: grimoire/intake/image_analysis.md, grimoire/intake/surface_topology.md,
// grimoire/build/geometry_patterns.md). The text below is written for this editor; the worked
// examples are original.

/** A street lamp: lathe base, tapered post, radial repeat, emissive glass, mirrored tubes. */
export const EXAMPLE_LAMP = {
  name: "Street lamp",
  size: [0.9, 4.4, 0.9],
  palette: [
    { role: "iron", hex: "#3a3f4a" },
    { role: "glass", hex: "#ffd98a" },
    { role: "stone", hex: "#b9b1a6" },
    { role: "brass", hex: "#c8a24a" }
  ],
  stages: [
    {
      name: "Base and post",
      parts: [
        { name: "plinth", shape: "box", at: [0, 0.06, 0], size: [0.8, 0.12, 0.8], bevel: 0.03, color: "stone" },
        { name: "foot", shape: "lathe", at: [0, 0.12, 0], profile: [[0.34, 0], [0.34, 0.1], [0.24, 0.18], [0.15, 0.5], [0.1, 0.62]], sides: 8, color: "iron" },
        { name: "post", shape: "cylinder", at: [0, 2.13, 0], r: 0.075, r2: 0.05, h: 2.8, sides: 8, color: "iron" }
      ]
    },
    {
      name: "Lantern",
      parts: [
        { name: "arm", shape: "box", at: [0, 3.45, 0], size: [0.62, 0.06, 0.06], color: "iron" },
        { name: "lantern base", shape: "cylinder", at: [0, 3.53, 0], r: 0.19, r2: 0.17, h: 0.07, sides: 6, color: "iron" },
        { name: "glass", shape: "cylinder", at: [0, 3.82, 0], r: 0.17, r2: 0.25, h: 0.5, sides: 6, color: "glass", emit: 1.6 },
        { name: "roof", shape: "cone", at: [0, 4.18, 0], r: 0.33, h: 0.24, sides: 6, color: "iron" },
        { name: "finial", shape: "ellipsoid", at: [0, 4.34, 0], size: [0.08, 0.12, 0.08], color: "brass", metal: 0.6 }
      ]
    },
    {
      name: "Details",
      parts: [
        { name: "frame", shape: "tube", at: [0, 3.82, 0], points: [[0, -0.25, 0.175], [0, 0.25, 0.255]], r: 0.016, repeat: { n: 6, radial: "y", center: [0, 3.82, 0] }, color: "iron" },
        { name: "collar", shape: "torus", at: [0, 0.78, 0], r: 0.085, t: 0.028, repeat: { n: 2, step: [0, 2.45, 0] }, color: "brass", metal: 0.6 },
        { name: "scroll", shape: "tube", at: [0, 0, 0], points: [[0.06, 3.05, 0], [0.2, 3.12, 0], [0.29, 3.42, 0]], r: 0.02, mirror: "x", color: "iron" }
      ]
    }
  ]
};

/** A small biplane: lathe fuselage, extruded half wings with mirror, radial propeller in a pivot group. */
export const EXAMPLE_BIPLANE = {
  name: "Biplane",
  size: [9.8, 2.3, 7.2],
  palette: [
    { role: "body", hex: "#d9624f" },
    { role: "wing", hex: "#f2e3c6" },
    { role: "dark", hex: "#3a3f4a" },
    { role: "metal", hex: "#b9c2cc" },
    { role: "glass", hex: "#2f4858" }
  ],
  groups: [{ name: "prop", pivot: [0, 1.1, 3.0] }],
  stages: [
    {
      name: "Fuselage and wings",
      parts: [
        { name: "fuselage", shape: "lathe", axis: "z", at: [0, 1.1, 0], profile: [[0.1, -3.6], [0.3, -2.6], [0.55, -0.8], [0.62, 0.6], [0.58, 1.9], [0.46, 2.6]], sides: 10, color: "body" },
        { name: "lower wing", shape: "extrude", plane: "xz", at: [0.3, 0.62, 0.9], outline: [[0, -0.6], [4.2, -0.52], [4.55, -0.25], [4.45, 0.5], [0, 0.6]], depth: 0.12, rot: [0, 0, 3], mirror: "x", color: "wing" },
        { name: "upper wing", shape: "extrude", plane: "xz", at: [0, 2.2, 1.15], outline: [[0, -0.6], [4.6, -0.52], [4.9, -0.25], [4.8, 0.5], [0, 0.6]], depth: 0.12, mirror: "x", color: "wing" },
        { name: "fin", shape: "extrude", plane: "zy", at: [0, 1.15, -3.3], outline: [[-0.4, 0], [0.55, 0], [-0.1, 0.9], [-0.45, 0.9]], depth: 0.08, color: "body" },
        { name: "tailplane", shape: "extrude", plane: "xz", at: [0, 1.12, -3.35], outline: [[0, -0.35], [1.45, -0.25], [1.6, 0], [1.3, 0.3], [0, 0.45]], depth: 0.07, mirror: "x", color: "wing" }
      ]
    },
    {
      name: "Engine and propeller",
      parts: [
        { name: "cowling", shape: "cylinder", axis: "z", at: [0, 1.1, 2.75], r: 0.5, r2: 0.46, h: 0.4, sides: 10, color: "metal", metal: 0.5 },
        { name: "spinner", shape: "cone", axis: "z", at: [0, 1.1, 3.1], r: 0.16, h: 0.32, sides: 8, color: "dark", group: "prop" },
        { name: "blade", shape: "box", at: [0, 1.6, 3.0], size: [0.16, 1.0, 0.05], rot: [0, 18, 0], repeat: { n: 2, radial: "z", center: [0, 1.1, 3.0] }, color: "dark", group: "prop" }
      ]
    },
    {
      name: "Cockpit and struts",
      parts: [
        { name: "cockpit rim", shape: "torus", at: [0, 1.68, -0.4], r: 0.3, t: 0.06, color: "dark" },
        { name: "windscreen", shape: "ellipsoid", at: [0, 1.68, 0.05], size: [0.5, 0.4, 0.22], clip: 0.5, color: "glass", rough: 0.15, smooth: true },
        { name: "wing strut", shape: "cylinder", at: [2.9, 1.5, 0.5], r: 0.04, h: 1.45, sides: 6, repeat: { n: 2, step: [0, 0, 0.8] }, mirror: "x", color: "dark" },
        { name: "cabane strut", shape: "tube", at: [0, 0, 0], points: [[0.3, 1.6, 1.45], [0.25, 2.17, 1.35]], r: 0.035, repeat: { n: 2, step: [0, 0, -0.8] }, mirror: "x", color: "dark" }
      ]
    },
    {
      name: "Landing gear",
      parts: [
        { name: "gear leg", shape: "tube", at: [0, 0, 0], points: [[0.25, 0.6, 1.5], [0.8, 0.3, 1.55]], r: 0.04, mirror: "x", color: "dark" },
        { name: "wheel", shape: "cylinder", axis: "x", at: [0.85, 0.3, 1.55], r: 0.3, h: 0.14, sides: 14, mirror: "x", color: "dark" },
        { name: "hub", shape: "cylinder", axis: "x", at: [0.85, 0.3, 1.55], r: 0.11, h: 0.17, sides: 8, mirror: "x", color: "metal", metal: 0.5 },
        { name: "tail skid", shape: "tube", at: [0, 0, 0], points: [[0, 1.0, -3.2], [0, 0.14, -3.42]], r: 0.03, color: "dark" },
        { name: "tail wheel", shape: "cylinder", axis: "x", at: [0, 0.11, -3.42], r: 0.11, h: 0.06, sides: 10, color: "dark" }
      ]
    }
  ]
};

const compact = (v: unknown) =>
  JSON.stringify(v)
    .replace(/\{"name":/g, '\n{"name":')
    .replace(/\n\{"name":("[^"]*"),"parts"/g, '\n {"name":$1,"parts"');

export const MODELER_SYSTEM_PROMPT = `You are the object modeler of Theras, a stylized 3D editor. You turn one subject into a PARTS SPEC (data; code builds the meshes). Call submit_parts once with the whole spec. Never write code.

FRAME: meters. Origin = ground center, +y up, +z = FRONT (nose, face, door side), x = width. Joints touch or overlap a little; nothing floats.

ONLY THE SUBJECT: model the subject and nothing else. A place or a neighbor in the words ("next to the puddle", "on the hill", "around the fountain", "in the desert") is in the scene already: never model it. No ground patch, base plate, sand, water or puddle under the subject, unless the subject itself is one.

METHOD (think before you write):
1. Anatomy: list the real parts that make the subject recognizable (airplane: tapered fuselage, wings, tailplane, fin, propeller with spinner or jets, canopy, landing gear). A missing identity part is the worst failure.
2. Silhouette and proportions: set the real overall size, then size each major part as a fraction of it (small plane: wingspan 1.2 to 1.4 x length, so the wings are the widest part; fuselage diameter 0.13 x length; tips narrower than roots). Check front, side and top silhouettes before details.
3. Shape by kind of surface, not by size: smooth continuous volume (fuselage, hull, bottle, nacelle, dome, animal body) = lathe or ellipsoid; flat profile (wing, fin, blade, sign, keel) = extrude in the right plane; member (leg, rail, pipe, strut, handle) = tube or thin cylinder; rigid block (crate, wall, table top) = box with bevel or taper. Car, boat or train body = extrude of its SIDE profile (plane "zy", depth = width, bevel 0.08+), the cabin a second, narrower one. A box is almost never right for an organic, aerodynamic or vehicle form.
4. Stages: 1 = primary forms (the silhouette reads from stage 1 alone), 2 = secondary (engines, wheels, roof, limbs), 3+ = tertiary details (trim, windows, struts, lights). 2 to 5 stages, 12 to 80 parts; complex subjects 30+.
5. Symmetry and arrays: model one side with mirror "x" (wings, wheels, doors, legs, lights), never on a part at x = 0. Rows and rings: repeat (windows, posts, blades, spokes, planks).
6. Details on a surface (windows, stripes, lights, panels) use the frame of the part they sit on: same at, outline inside its outline, just proud of its surface.
7. Material zones: 3 to 5 palette roles, soft stylized colors, one accent. Flat shading is the default. Glass: dark tint, rough 0.15, smooth. Metal: metal 0.6, rough 0.35. Lights: emit 1 to 2.
8. No voxel look. The subject must never read as a stack of cubes (a block figure, a Minecraft-like model). Round what is round in the real thing: lathe, ellipsoid, capsule, tube, extrude with bevel. A box is right only for a part that is a flat-sided block in the real world, and it gets a bevel or a taper. If more than a third of your parts are boxes, change the organic and curved ones before you submit. Do not model a human or humanoid figure: the library has a rigged one.
9. Self-check: every part touches another part or the ground; nothing is hidden inside another part or sticks out where it should not; the lowest parts and the wheels touch y = 0; proportions match step 2.

SHAPES ("at" = center unless stated):
box size[x,y,z] bevel? taper?[topX,topZ] (0.6 narrows the top)
wedge size[x,y,z] (ramp: tall at -z, low at +z)
ellipsoid size[x,y,z] clip? (0..0.9 cuts the bottom flat; clip 0.5 = dome rising from at.y to at.y + y/2: put at.y on the surface it sits on, e.g. a canopy on the fuselage top)
cylinder r h r2?(top radius) axis? sides? bend?(degrees toward +x) (sides 6 = hex prism)
cone r h axis? (tip toward +axis)
capsule r h axis?
torus r t(tube radius) axis?(hole axis) arc?(degrees; 180 = arch). Wheel on an x axle: axis "x".
lathe profile[[radius, along],...] axis? ("along" relative to at). Fuselage: axis "z", tail first, nose last.
extrude outline[[u,v],...] plane depth bevel? (outline relative to at). "xz" = top view (u=x, v=z; thickness along y): wings, tailplane. "zy" = side view (u=z, v=y; thickness along x): fin, keel, car body, gable. "xy" = front view (thickness along z): signs, gears, arches. Half wing: outline from u=0 (root) to a narrower, swept tip, then mirror "x"; dihedral rot [0,0,3].
tube points[[x,y,z],...] r (pipe through points relative to at, rounded ends)
Every part: name, color (palette role or #hex), rot[x,y,z] degrees (after axis; rot x +a tips the +z end DOWN, rot z +a lifts the +x end, rot y +a turns +z toward +x; a gable roof is a triangle extrude, not two guessed rotations), scale?, rough?, metal?, emit?, smooth?, mirror? "x"|"z", repeat? {n, step[x,y,z]} or {n, radial "x"|"y"|"z", center[x,y,z]} (copies turn about the axis through center), group? (defined in groups with a pivot: propeller, wheel, door).

EXAMPLE 1 (style reference only; never copy it for another subject):
${compact(EXAMPLE_LAMP)}

EXAMPLE 2:
${compact(EXAMPLE_BIPLANE)}`;

const VEC3 = { type: "array", items: { type: "number" }, description: "[x, y, z]" };
const VEC2_LIST = { type: "array", items: { type: "array", items: { type: "number" } } };

export const SUBMIT_PARTS_TOOL = {
  name: "submit_parts",
  description: "Submit the complete parts spec of the object. Call it once.",
  parameters: {
    type: "object",
    properties: {
      name: { type: "string" },
      size: { ...VEC3, description: "Overall size [width x, height y, depth z] in meters" },
      palette: {
        type: "array",
        description: "3 to 5 color roles and one accent",
        items: { type: "object", properties: { role: { type: "string" }, hex: { type: "string" } }, required: ["role", "hex"] }
      },
      groups: {
        type: "array",
        description: "Pivots of moving parts (optional)",
        items: { type: "object", properties: { name: { type: "string" }, pivot: VEC3 }, required: ["name", "pivot"] }
      },
      stages: {
        type: "array",
        description: "2 to 5 stages: primary forms first, details last",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            parts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  shape: { type: "string", enum: ["box", "wedge", "ellipsoid", "cylinder", "cone", "capsule", "torus", "lathe", "extrude", "tube"] },
                  at: VEC3,
                  rot: VEC3,
                  scale: VEC3,
                  size: VEC3,
                  r: { type: "number" },
                  r2: { type: "number" },
                  h: { type: "number" },
                  t: { type: "number" },
                  axis: { type: "string", enum: ["x", "y", "z"] },
                  sides: { type: "number" },
                  bevel: { type: "number" },
                  taper: { type: "array", items: { type: "number" } },
                  bend: { type: "number" },
                  arc: { type: "number" },
                  clip: { type: "number" },
                  profile: VEC2_LIST,
                  outline: VEC2_LIST,
                  plane: { type: "string", enum: ["xy", "xz", "zy"] },
                  depth: { type: "number" },
                  points: { type: "array", items: VEC3 },
                  color: { type: "string" },
                  rough: { type: "number" },
                  metal: { type: "number" },
                  emit: { type: "number" },
                  smooth: { type: "boolean" },
                  mirror: { type: "string", enum: ["x", "z"] },
                  repeat: {
                    type: "object",
                    properties: { n: { type: "number" }, step: VEC3, radial: { type: "string", enum: ["x", "y", "z"] }, center: VEC3 },
                    required: ["n"]
                  },
                  group: { type: "string" }
                },
                required: ["shape", "at", "color"]
              }
            }
          },
          required: ["name", "parts"]
        }
      }
    },
    required: ["name", "size", "palette", "stages"]
  }
};

/** A stored spec as the modeler writes one: the palette as a list of roles, one part on each line. */
export function specForModeler(spec: unknown): string {
  const o = (spec && typeof spec === "object" ? spec : {}) as Record<string, unknown>;
  const palette = o.palette && typeof o.palette === "object" && !Array.isArray(o.palette) ? Object.entries(o.palette as Record<string, unknown>).map(([role, hex]) => ({ role, hex })) : o.palette;
  const groups = o.groups && typeof o.groups === "object" && !Array.isArray(o.groups) ? Object.entries(o.groups as Record<string, unknown>).map(([name, pivot]) => ({ name, pivot })) : o.groups;
  return compact({ ...o, palette, ...(groups ? { groups } : {}) });
}

/** The user message of the modeler call. */
export function modelerUserMessage(input: {
  subject: string;
  sizeMeters?: number;
  style?: string;
  colors?: Record<string, string>;
  understanding?: string;
  prompt?: string;
  hasImage?: boolean;
  /** A change to a model that is in the scene: its present spec and the words of the change. */
  base?: { spec: unknown; change: string };
}): string {
  const lines = [`Subject: ${input.subject}`];
  if (input.prompt && input.prompt !== input.subject) lines.push(`User request: ${input.prompt.slice(0, 400)}`);
  if (input.understanding) lines.push(`Director: ${input.understanding.slice(0, 300)}`);
  if (input.sizeMeters) lines.push(`Longest side: about ${input.sizeMeters} m (model in real proportions; code scales it).`);
  lines.push(
    input.style === "realistic"
      ? "Style: realistic (true proportions, muted colors, more secondary detail, smooth forms)."
      : "Style: stylized (true proportions, soft cheerful colors, rounded readable parts; smooth forms, never blocks)."
  );
  if (input.colors && Object.keys(input.colors).length)
    lines.push(`Colors to use: ${Object.entries(input.colors).map(([k, v]) => `${k} ${v}`).join(", ")}`);
  if (input.hasImage) lines.push("The attached image is the reference: match its silhouette, proportions, parts and colors.");
  if (input.base) {
    lines.push(
      `This object is in the scene. CHANGE it, do not start again. Change asked: ${input.base.change.slice(0, 400)}`,
      "Keep each part, name, palette role and stage that the change does not touch, with the same numbers. Add, remove or reshape only what the change needs. Submit the whole changed spec.",
      `Present spec:\n${specForModeler(input.base.spec)}`
    );
  }
  lines.push("Work through the method, then call submit_parts.");
  return lines.join("\n");
}
