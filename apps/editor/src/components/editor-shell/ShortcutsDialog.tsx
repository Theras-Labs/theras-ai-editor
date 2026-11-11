// Lists every keyboard shortcut. Click a key to record a new one; Reset goes back to the default.
import { useEffect, useState } from "react";
import { Keyboard, RotateCcw, X } from "lucide-react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { SHORTCUT_ACTIONS, displayKeys, eventToKeys, keysFor, shortcutStore } from "@/lib/shortcuts";

export function ShortcutsDialog() {
  const snap = useSnapshot(shortcutStore);
  const [recording, setRecording] = useState<string | null>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(null);
        return;
      }
      const keys = eventToKeys(e);
      if (!keys) return;
      shortcutStore.overrides[recording] = keys;
      setRecording(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording]);

  if (!snap.dialogOpen) return null;
  const groups = [...new Set(SHORTCUT_ACTIONS.map((a) => a.group))];
  const clash = (id: string) => {
    const keys = keysFor(id).toUpperCase();
    return SHORTCUT_ACTIONS.some((a) => a.id !== id && keysFor(a.id).toUpperCase() === keys);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onPointerDown={() => (shortcutStore.dialogOpen = false)}>
      <div
        className="max-h-[80vh] w-[min(520px,100%)] overflow-hidden rounded-2xl border border-white/15 bg-[#0b1512]/85 shadow-2xl backdrop-blur-2xl"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
          <Keyboard className="size-4 text-emerald-300" />
          <div className="flex-1 text-sm font-semibold text-white/90">Keyboard shortcuts</div>
          <button className="flex size-7 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white" onClick={() => (shortcutStore.dialogOpen = false)} type="button">
            <X className="size-4" />
          </button>
        </div>
        <div className="max-h-[calc(80vh-52px)] overflow-y-auto px-4 py-3">
          {groups.map((group) => (
            <div className="mb-3" key={group}>
              <div className="mb-1 text-[10px] font-semibold tracking-[0.16em] text-white/40 uppercase">{group}</div>
              {SHORTCUT_ACTIONS.filter((a) => a.group === group).map((action) => {
                const custom = snap.overrides[action.id] !== undefined;
                return (
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-white/5" key={action.id}>
                    <span className="flex-1 text-[12px] text-white/80">{action.label}</span>
                    {action.fixed ? (
                      <kbd className="rounded-md border border-white/10 bg-white/5 px-2 py-0.5 text-[11px] text-white/50">{displayKeys(action.defaultKeys)}</kbd>
                    ) : (
                      <>
                        <button
                          className={`rounded-md border px-2 py-0.5 text-[11px] ${
                            recording === action.id
                              ? "border-emerald-300/70 bg-emerald-400/20 text-emerald-100"
                              : clash(action.id)
                                ? "border-amber-300/60 bg-amber-400/10 text-amber-100"
                                : "border-white/15 bg-white/8 text-white/85 hover:border-white/30"
                          }`}
                          onClick={() => setRecording(action.id)}
                          title={clash(action.id) ? "Another action uses the same keys" : "Click, then press the new keys (Esc cancels)"}
                          type="button"
                        >
                          {recording === action.id ? "Press keys..." : displayKeys(keysFor(action.id))}
                        </button>
                        <button
                          className="flex size-6 items-center justify-center rounded-md text-white/35 hover:text-white disabled:opacity-0"
                          disabled={!custom}
                          onClick={() => {
                            delete shortcutStore.overrides[action.id];
                          }}
                          title="Back to the default"
                          type="button"
                        >
                          <RotateCcw className="size-3" />
                        </button>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body
  );
}
