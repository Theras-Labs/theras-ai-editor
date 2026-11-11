// Scenes dialog (File > Save scene / Open scene): named saves in this browser, plus .whmap
// files for disk. Opening a save keeps the current scene first as "Backup before open".
import { Download, FolderOpen, HardDrive, Loader2, Save, Trash2, Upload, X } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { useSnapshot } from "valtio";
import { Button } from "@/components/ui/button";
import {
  BACKUP_NAME,
  deleteNamedScene,
  listSavedScenes,
  openSavedScene,
  openSceneFile,
  saveCurrentScene,
  saveSceneFile,
  savedScenesStore,
  sceneName,
  type SavedSceneMeta
} from "@/lib/saved-scenes";

function when(ms: number) {
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function SavedScenesDialog() {
  const state = useSnapshot(savedScenesStore);
  const [name, setName] = useState("");
  const [saves, setSaves] = useState<SavedSceneMeta[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () =>
    listSavedScenes()
      .then(setSaves)
      .catch((error) => toast("Could not read the saved scenes", { description: String(error) }));

  useEffect(() => {
    if (!state.open) return;
    setName(sceneName());
    void refresh();
  }, [state.open]);

  if (!state.open) return null;
  const close = () => (savedScenesStore.open = false);
  const existing = saves.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase());

  const save = async () => {
    if (existing && !window.confirm(`Replace the save "${existing.name}"?`)) return;
    setBusy("save");
    try {
      const meta = await saveCurrentScene(name);
      toast(`Saved "${meta.name}"`, { description: `${meta.nodeCount} objects, in this browser. Use "Save to file" to keep a copy on disk.` });
      await refresh();
    } catch (error) {
      toast("Save failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const open = async (meta: SavedSceneMeta) => {
    setBusy(meta.id);
    try {
      await openSavedScene(meta);
      toast(`Opened "${meta.name}"`, { description: `The scene you had is saved as "${BACKUP_NAME}".` });
      close();
    } catch (error) {
      toast("Open failed", { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setBusy(null);
    }
  };

  const remove = async (meta: SavedSceneMeta) => {
    if (!window.confirm(`Delete the save "${meta.name}"? This cannot be undone.`)) return;
    await deleteNamedScene(meta.id).catch((error) => toast("Delete failed", { description: String(error) }));
    await refresh();
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" onPointerDown={close}>
      <div
        className="flex max-h-[80vh] w-[min(560px,100%)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#0a1210]/92 shadow-2xl backdrop-blur-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <HardDrive className="size-4 text-emerald-300" />
          <div className="flex-1">
            <div className="text-[13px] font-medium text-foreground/90">Scenes</div>
            <div className="text-[11px] text-muted-foreground">Save the whole scene in this browser, or as a .whmap file to keep on disk.</div>
          </div>
          <button className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-white/8 hover:text-foreground" onClick={close} type="button">
            <X className="size-4" />
          </button>
        </div>

        <form
          className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <input
            autoFocus
            className="h-8 min-w-0 flex-1 rounded-md border border-white/10 bg-white/[0.04] px-2.5 text-[12px] text-foreground placeholder:text-muted-foreground/70 focus:border-emerald-400/40 focus:outline-none"
            onChange={(e) => setName(e.target.value)}
            placeholder="Scene name"
            value={name}
          />
          <Button className="bg-emerald-500 text-emerald-950 hover:bg-emerald-400" disabled={busy !== null} size="sm" type="submit">
            {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} {existing ? "Replace" : "Save"}
          </Button>
        </form>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {saves.length === 0 ? (
            <p className="px-2 py-6 text-center text-[11.5px] text-muted-foreground">No saved scenes in this browser yet.</p>
          ) : (
            saves.map((s) => (
              <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-white/[0.04]" key={s.id}>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] text-foreground/90">{s.name}</div>
                  <div className="text-[10.5px] text-muted-foreground">
                    {when(s.updatedAt)} - {s.nodeCount} objects
                  </div>
                </div>
                <Button disabled={busy !== null} onClick={() => void open(s)} size="sm" variant="outline">
                  {busy === s.id ? <Loader2 className="animate-spin" /> : <FolderOpen />} Open
                </Button>
                <button
                  className="flex size-7 items-center justify-center rounded-md text-muted-foreground opacity-60 hover:bg-white/8 hover:text-red-300 group-hover:opacity-100"
                  onClick={() => void remove(s)}
                  title="Delete this save"
                  type="button"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
          <span className="flex-1 text-[11px] text-muted-foreground">File (.whmap): another browser or computer</span>
          <Button onClick={() => saveSceneFile()} size="sm" variant="outline">
            <Download /> Save to file
          </Button>
          <Button
            onClick={() => {
              close();
              openSceneFile();
            }}
            size="sm"
            variant="outline"
          >
            <Upload /> Open file
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
