// Files for the Ask Theras prompt. Everything is turned into what a model can read:
// - images: downscaled JPEG data URLs (the model sees them),
// - videos: a few frames as images, plus a note with the times,
// - code and text (tsx, jsx, ts, js, json, glsl, md...): the text itself,
// - 3D models (glb, gltf): a gltfjsx-style JSX outline of the model (names, meshes,
//   materials, sizes), so the AI can understand or rebuild it.
import type { Object3D } from "three";

export type CopilotAttachment =
  | { kind: "image"; name: string; mime: string; dataUrl: string }
  | { kind: "text"; name: string; text: string };

const MAX_IMAGE_SIDE = 1024;
const VIDEO_FRAMES = 6;
const MAX_TEXT_CHARS = 40_000;
const TEXT_EXTENSIONS = /\.(tsx?|jsx?|mjs|cjs|json|glsl|vert|frag|wgsl|md|txt|html|css|csv|yaml|yml|toml|py|lua)$/i;

export const ACCEPTED_FILES = "image/*,video/*,.ts,.tsx,.js,.jsx,.mjs,.json,.glsl,.vert,.frag,.wgsl,.md,.txt,.html,.css,.glb,.gltf";

async function imageToDataUrl(source: CanvasImageSource, width: number, height: number, maxSide = MAX_IMAGE_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

async function readImage(file: File): Promise<CopilotAttachment> {
  const bitmap = await createImageBitmap(file);
  const dataUrl = await imageToDataUrl(bitmap, bitmap.width, bitmap.height);
  bitmap.close();
  return { kind: "image", name: file.name || "image", mime: "image/jpeg", dataUrl };
}

async function readVideo(file: File): Promise<CopilotAttachment[]> {
  const url = URL.createObjectURL(file);
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.src = url;
    await new Promise<void>((resolve, reject) => {
      video.onloadeddata = () => resolve();
      video.onerror = () => reject(new Error(`Cannot read the video ${file.name}`));
    });
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const out: CopilotAttachment[] = [];
    const times: string[] = [];
    for (let i = 0; i < VIDEO_FRAMES; i++) {
      const t = duration > 0 ? ((i + 0.5) / VIDEO_FRAMES) * duration : 0;
      await new Promise<void>((resolve) => {
        video.onseeked = () => resolve();
        video.currentTime = t;
      });
      out.push({ kind: "image", name: `${file.name} at ${t.toFixed(1)} s`, mime: "image/jpeg", dataUrl: await imageToDataUrl(video, video.videoWidth, video.videoHeight, 768) });
      times.push(`${t.toFixed(1)} s`);
      if (duration === 0) break;
    }
    out.unshift({
      kind: "text",
      name: file.name,
      text: `Video "${file.name}" (${duration.toFixed(1)} s). The next ${out.length} images are frames at ${times.join(", ")}.`
    });
    return out;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function hex(color: { getHexString?: () => string } | undefined) {
  return color?.getHexString ? `#${color.getHexString()}` : undefined;
}

/** A gltfjsx-like outline: one JSX line per object, with geometry size and material. */
function modelOutline(root: Object3D, fileName: string, animations: string[]): string {
  const lines: string[] = [];
  const fmt = (v: number) => Number(v.toFixed(3));
  const walk = (o: Object3D, depth: number) => {
    if (lines.length > 400) return;
    const pad = "  ".repeat(depth + 1);
    const mesh = o as unknown as {
      isMesh?: boolean;
      geometry?: { boundingBox: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null; computeBoundingBox: () => void; attributes: { position?: { count: number } } };
      material?: { name?: string; color?: { getHexString: () => string }; map?: unknown } | Array<{ name?: string }>;
    };
    const props: string[] = [];
    if (o.name) props.push(`name="${o.name}"`);
    if (o.position.lengthSq() > 1e-8) props.push(`position={[${fmt(o.position.x)}, ${fmt(o.position.y)}, ${fmt(o.position.z)}]}`);
    if (Math.abs(o.rotation.x) + Math.abs(o.rotation.y) + Math.abs(o.rotation.z) > 1e-4) props.push(`rotation={[${fmt(o.rotation.x)}, ${fmt(o.rotation.y)}, ${fmt(o.rotation.z)}]}`);
    if (Math.abs(o.scale.x - 1) + Math.abs(o.scale.y - 1) + Math.abs(o.scale.z - 1) > 1e-4) props.push(`scale={[${fmt(o.scale.x)}, ${fmt(o.scale.y)}, ${fmt(o.scale.z)}]}`);
    if (mesh.isMesh && mesh.geometry) {
      mesh.geometry.computeBoundingBox();
      const b = mesh.geometry.boundingBox;
      if (b) props.push(`/* size ${fmt(b.max.x - b.min.x)} x ${fmt(b.max.y - b.min.y)} x ${fmt(b.max.z - b.min.z)}, ${mesh.geometry.attributes.position?.count ?? 0} vertices */`);
      const mat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      if (mat) props.push(`material="${(mat as { name?: string }).name || "material"}"${hex((mat as { color?: { getHexString: () => string } }).color) ? ` color="${hex((mat as { color?: { getHexString: () => string } }).color)}"` : ""}${(mat as { map?: unknown }).map ? " textured" : ""}`);
    }
    const tag = mesh.isMesh ? "mesh" : o.type === "Bone" ? "bone" : "group";
    if (o.children.length === 0) lines.push(`${pad}<${tag} ${props.join(" ")} />`);
    else {
      lines.push(`${pad}<${tag} ${props.join(" ")}>`);
      o.children.forEach((c) => walk(c, depth + 1));
      lines.push(`${pad}</${tag}>`);
    }
  };
  walk(root, 0);
  return [
    `3D model "${fileName}" as a gltfjsx-style outline${animations.length ? `; animations: ${animations.join(", ")}` : ""}:`,
    "```jsx",
    "<group>",
    ...lines,
    "</group>",
    "```",
    lines.length > 400 ? "(outline cut after 400 lines)" : ""
  ].join("\n");
}

async function readModel(file: File): Promise<CopilotAttachment[]> {
  const [{ GLTFLoader }, three] = await Promise.all([import("three/examples/jsm/loaders/GLTFLoader.js"), import("three")]);
  const loader = new GLTFLoader();
  const data = file.name.toLowerCase().endsWith(".gltf") ? await file.text() : await file.arrayBuffer();
  try {
    const gltf = await loader.parseAsync(data, "");
    const box = new three.Box3().setFromObject(gltf.scene);
    const size = box.getSize(new three.Vector3());
    const text = `${modelOutline(gltf.scene, file.name, gltf.animations.map((a) => a.name))}\nOverall size: ${size.x.toFixed(2)} x ${size.y.toFixed(2)} x ${size.z.toFixed(2)} m. To place the real model, drop the file on the viewport.`;
    return [{ kind: "text", name: file.name, text }];
  } catch (error) {
    // A .gltf with external .bin or textures cannot load from one file: send the JSON instead.
    if (typeof data === "string") return [{ kind: "text", name: file.name, text: `glTF JSON "${file.name}":\n${data.slice(0, MAX_TEXT_CHARS)}` }];
    throw new Error(`Cannot read the model ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** Turns one file into prompt attachments. */
export async function readAttachment(file: File): Promise<CopilotAttachment[]> {
  const name = file.name.toLowerCase();
  if (file.type.startsWith("image/")) return [await readImage(file)];
  if (file.type.startsWith("video/") || /\.(mov|mp4|webm|m4v)$/.test(name)) return readVideo(file);
  if (/\.(glb|gltf)$/.test(name)) return readModel(file);
  if (file.type.startsWith("text/") || TEXT_EXTENSIONS.test(name)) {
    const raw = await file.text();
    const ext = name.split(".").pop() ?? "";
    const cut = raw.length > MAX_TEXT_CHARS ? `${raw.slice(0, MAX_TEXT_CHARS)}\n... (cut, ${raw.length} characters in total)` : raw;
    return [{ kind: "text", name: file.name, text: `File "${file.name}":\n\`\`\`${ext}\n${cut}\n\`\`\`` }];
  }
  throw new Error(`${file.name}: this file type is not supported (images, videos, code, text, glb and gltf are).`);
}

/** Plain-text form of attachments, for providers that take text only. */
export function attachmentsAsText(attachments: CopilotAttachment[] | undefined) {
  return (attachments ?? [])
    .map((a) => (a.kind === "text" ? a.text : `[image: ${a.name}]`))
    .join("\n\n");
}
