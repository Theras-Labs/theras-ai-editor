import { parseAnimationEditorDocument, type AnimationEditorDocument, type ClipReference, type EditorGraphNode } from "@theras/anim-schema";
import type { ImportedPreviewClip } from "./preview-assets";

function normalizeClipKey(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isClipNode(node: EditorGraphNode): node is Extract<EditorGraphNode, { kind: "clip" }> {
  return node.kind === "clip";
}

function toClipReference(clip: ImportedPreviewClip): ClipReference {
  return {
    id: clip.id,
    name: clip.reference.name,
    duration: clip.reference.duration,
    source: clip.reference.source ?? clip.source
  };
}

function mergeClipReferences(documentClips: ClipReference[], importedClips: ImportedPreviewClip[]): ClipReference[] {
  const referencesById = new Map<string, ClipReference>();
  const orderedIds: string[] = [];

  documentClips.forEach((clip) => {
    referencesById.set(clip.id, { ...clip });
    orderedIds.push(clip.id);
  });

  importedClips.forEach((clip) => {
    const reference = toClipReference(clip);
    if (!referencesById.has(reference.id)) {
      orderedIds.push(reference.id);
    }
    referencesById.set(reference.id, reference);
  });

  return orderedIds.flatMap((id) => {
    const clip = referencesById.get(id);
    return clip ? [clip] : [];
  });
}

function buildClipLookup(clipReferences: ClipReference[], importedClips: ImportedPreviewClip[]): Map<string, ClipReference> {
  const clipLookup = new Map<string, ClipReference>();
  const importedIds = new Set(importedClips.map((clip) => clip.id));
  const preferredReferences = importedClips.map(toClipReference);
  const fallbackReferences = clipReferences.filter((clip) => !importedIds.has(clip.id));

  [...preferredReferences, ...fallbackReferences].forEach((clip) => {
    const idKey = normalizeClipKey(clip.id);
    const nameKey = normalizeClipKey(clip.name);

    if (idKey && !clipLookup.has(idKey)) {
      clipLookup.set(idKey, clip);
    }

    if (nameKey && !clipLookup.has(nameKey)) {
      clipLookup.set(nameKey, clip);
    }
  });

  return clipLookup;
}

export function synchronizeAnimationDocument(sourceDocument: unknown, importedClips: ImportedPreviewClip[]): AnimationEditorDocument {
  const document = parseAnimationEditorDocument(sourceDocument);
  const nextDocument = structuredClone(document);
  nextDocument.clips = mergeClipReferences(nextDocument.clips, importedClips);

  const clipsById = new Map(nextDocument.clips.map((clip) => [clip.id, clip]));
  const importedClipIds = new Set(importedClips.map((clip) => clip.id));
  const clipLookup = buildClipLookup(nextDocument.clips, importedClips);

  nextDocument.graphs = nextDocument.graphs.map((graph) => ({
    ...graph,
    nodes: graph.nodes.map((node) => {
      if (!isClipNode(node)) {
        return node;
      }

      const hasImportedBinding = node.clipId ? importedClipIds.has(node.clipId) : false;
      if (node.clipId && hasImportedBinding && clipsById.has(node.clipId)) {
        return node;
      }

      const matchedClip = clipLookup.get(normalizeClipKey(node.name)) ?? (node.clipId ? clipLookup.get(normalizeClipKey(node.clipId)) : undefined);
      if (!matchedClip) {
        return node;
      }

      return {
        ...node,
        clipId: matchedClip.id
      };
    })
  }));

  return nextDocument;
}