// Scene templates gallery, grouped by where a template comes from: Island kit islands,
// desert worlds, the alley arena, and the user's own imported projects. Start a scene
// from one, or add it to the current scene. One undo step either way.
// The import field scans a project folder (local server) and adds a card for it; a project's
// reference images can be sent to Ask Theras to build from.
import { FolderInput, ImageIcon, LayoutTemplate, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useSnapshot } from "valtio";
import type { EditorCore } from "@theras/editor-core";
import { Button } from "@/components/ui/button";
import { readAttachment, type CopilotAttachment } from "@/lib/copilot/attachments";
import { describeImport, importProject, projectFileUrl, projectStore, type ImportedProject } from "@/lib/projects/projects";
import { PROCEDURAL_GROUP, SCENE_TEMPLATES, applyTemplate, projectTemplates, templateAvailable, type SceneTemplate } from "@/lib/resources/templates";
import { uiLayoutStore } from "@/state/ui-layout-store";

const GROUP_ORDER = [PROCEDURAL_GROUP, "Your projects", "Island kit", "Desert", "Alley arena", "Start"];
const GROUP_NOTE: Record<string, string> = {
  [PROCEDURAL_GROUP]: "Made by code only: no image file, no model file, no download. Written by Claude Fable 5.2.",
  "Your projects": "Imported from a folder on this computer. The place is rebuilt from the project's own files.",
  "Island kit": "Editable islands: shape the land with Soil, Stone and Water.",
  Desert: "Desert worlds. Import the project folder to send its reference views to Ask Theras.",
  "Alley arena": "A cobbled arena with drawn textures. Walk it in game mode.",
  Start: ""
};

export function TemplateGallery({
  editor,
  onAsk
}: {
  editor: EditorCore;
  /** Sends a prompt (with images) to Ask Theras and opens it. */
  onAsk?: (prompt: string, attachments?: CopilotAttachment[]) => void;
}) {
  const layout = useSnapshot(uiLayoutStore);
  const projects = useSnapshot(projectStore);
  const [path, setPath] = useState("");
  if (!layout.templatesOpen) return null;
  const close = () => (uiLayoutStore.templatesOpen = false);

  const all = [...projectTemplates(projects.projects as ImportedProject[]), ...SCENE_TEMPLATES];
  const groups = GROUP_ORDER.map((group) => ({ group, items: all.filter((t) => t.group === group) })).filter((g) => g.items.length > 0);

  // No blocking confirm: a template is one undo step, and the toast offers Undo.
  const use = (template: SceneTemplate, replace: boolean) => {
    try {
      applyTemplate(editor, template.id, replace);
    } catch (error) {
      toast(`Could not start ${template.name}`, { description: error instanceof Error ? error.message : String(error) });
      return;
    }
    close();
    toast(replace ? `Started from ${template.name}` : `${template.name} added`, {
      description: "Land, sky and objects are in place. Everything stays editable.",
      duration: 10000,
      action: { label: "Undo", onClick: () => editor.undo() }
    });
  };

  const runImport = async () => {
    const target = path.trim();
    if (!target) return;
    try {
      const project = await importProject(target);
      setPath("");
      toast(`Imported ${project.name}`, { description: describeImport(project), duration: 8000 });
    } catch (error) {
      toast("Import failed", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const askFromReference = async (project: ImportedProject, file: string) => {
    if (!onAsk) return;
    try {
      const res = await fetch(projectFileUrl(project.id, file));
      if (!res.ok) throw new Error(`The server answered ${res.status}. Import the project again.`);
      const blob = await res.blob();
      const attachments = await readAttachment(new File([blob], file.split("/").pop() ?? "reference.jpg", { type: blob.type || "image/jpeg" }));
      close();
      onAsk(
        `Build this place from the reference image (${project.name}): match its layout, shapes, colors and mood at human scale. Use library models and kit pieces first.`,
        attachments
      );
    } catch (error) {
      toast("Could not send the reference", { description: error instanceof Error ? error.message : String(error) });
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onPointerDown={close}>
      <div
        className="flex max-h-[86vh] w-[min(900px,100%)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a1210]/92 shadow-2xl backdrop-blur-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <LayoutTemplate className="size-4 text-emerald-300" />
          <div className="flex-1">
            <div className="text-[13px] font-medium text-foreground/90">Scene templates</div>
            <div className="text-[11px] text-muted-foreground">Land, sky and objects in one step. Everything stays editable, and Undo reverts it.</div>
          </div>
          <button className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground" onClick={close} type="button">
            <X className="size-4" />
          </button>
        </div>

        {/* Project import */}
        <form
          className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void runImport();
          }}
        >
          <FolderInput className="size-4 shrink-0 text-muted-foreground" />
          <input
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 font-mono text-[11.5px] text-foreground placeholder:text-muted-foreground/70 focus:border-emerald-400/40 focus:outline-none"
            onChange={(e) => setPath(e.target.value)}
            placeholder="Import a project folder: /path/to/your/game"
            value={path}
          />
          <Button disabled={!path.trim() || Boolean(projects.busy)} size="sm" type="submit" variant="outline">
            {projects.busy ? <Loader2 className="animate-spin" /> : null} Import
          </Button>
        </form>
        {projects.error ? <div className="border-b border-white/10 px-4 py-1.5 text-[11px] text-amber-300/90">{projects.error}</div> : null}

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
          {groups.map(({ group, items }) => (
            <section key={group}>
              <div className="mb-2 flex items-baseline gap-2">
                <h3 className="text-[12px] font-semibold tracking-wide text-foreground/85">{group}</h3>
                {GROUP_NOTE[group] ? <span className="text-[11px] text-muted-foreground">{GROUP_NOTE[group]}</span> : null}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((t) => {
                  const ready = templateAvailable(t);
                  const project = group === "Your projects" ? (projects.projects as ImportedProject[]).find((p) => `project:${p.root}` === t.id) : undefined;
                  return (
                    <div className="group flex flex-col overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20" key={t.id}>
                      <button
                        className="relative h-24 w-full text-left disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!ready}
                        onClick={() => use(t, true)}
                        style={{ background: t.preview }}
                        title={ready ? "Start with this template" : "This place is not in this build yet"}
                        type="button"
                      >
                        <span className="absolute bottom-2 left-3 text-[14px] font-semibold text-white drop-shadow">{t.name}</span>
                      </button>
                      <div className="flex flex-1 flex-col gap-3 p-3">
                        <p className="text-[11.5px] leading-snug text-muted-foreground">{t.description}</p>
                        {project && project.references.length > 0 ? (
                          <div>
                            <div className="mb-1 flex items-center gap-1 text-[10.5px] text-muted-foreground">
                              <ImageIcon className="size-3" /> References: click one to build from it
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1">
                              {project.references.slice(0, 16).map((file) => (
                                <button
                                  className="size-12 shrink-0 overflow-hidden rounded border border-white/10 hover:border-emerald-300/60"
                                  key={file}
                                  onClick={() => void askFromReference(project, file)}
                                  title={`Build from ${file.split("/").pop()}`}
                                  type="button"
                                >
                                  <img alt="" className="size-full object-cover" loading="lazy" src={projectFileUrl(project.id, file)} />
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        <div className="mt-auto flex gap-2">
                          <Button className="flex-1 bg-emerald-500 text-emerald-950 hover:bg-emerald-400" disabled={!ready} onClick={() => use(t, true)} size="sm">
                            {ready ? "Start with this" : "Not ready"}
                          </Button>
                          <Button disabled={!ready} onClick={() => use(t, false)} size="sm" title="Add to the current scene (keeps what is there)" variant="outline">
                            <Plus /> Add
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {(projects.projects as ImportedProject[])
            .filter((p) => projectTemplates([p]).length === 0)
            .map((p) => (
              <p className="text-[11px] text-muted-foreground" key={p.root}>
                {p.name}: no environment found. {p.models.length ? `Its ${p.models.length} models are in the library under "Project: ${p.name}".` : ""}
              </p>
            ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
