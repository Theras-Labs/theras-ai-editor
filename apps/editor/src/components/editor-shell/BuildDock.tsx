// Slot dock: shortcut buttons that place an object with one tap. Select (or Esc) stops
// building, so a click selects, moves and rotates objects again. Keys 1-9 pick a slot,
// R turns the next placement by 90 degrees.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bean, BookOpen, Box, Castle, ChevronDown, ChevronUp, CloudSun, Droplet, Eraser, Fence, Flower2, Gem, Hand, House, Lamp, Landmark, LampWallUp, Mountain, ArrowLeft, ArrowRight, Copy, Pencil, Plus, RotateCw, Sparkles, Trash2, Sprout, Waves, X } from "lucide-react";
import { ResourceLibraryPanel } from "./ResourceLibraryPanel";
import { useSnapshot } from "valtio";
import { subscribeKey } from "valtio/utils";
import { buildSlotStore, removeSlot, resetSlots, rotateSlot, selectSlot, upsertSlot } from "@/lib/build-slots/store";
import { placeResource } from "@/lib/resources/place";
import { slotFromSelection } from "@/lib/build-slots/runner";
import { toast } from "sonner";
import { toolSessionStore } from "@/state/tool-session-store";
import { uiLayoutStore } from "@/state/ui-layout-store";
import type { SlotIcon } from "@/lib/build-slots/types";
import { SlotIcon as SlotIconView } from "@/lib/build-slots/slot-icon";
import { aiContextDrag } from "@/lib/ai-context";
import { createPortal } from "react-dom";

function BridgeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M2 16h20M4 16v-4M20 16v-4M2 12c4-4 16-4 20 0M8 16v-3.5M12 16v-4.5M16 16v-3.5" />
    </svg>
  );
}

function GateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth={2} viewBox="0 0 24 24">
      <path d="M3 5c6 1.5 12 1.5 18 0M5 9h14M7 6v15M17 6v15" />
    </svg>
  );
}

const ICONS: Record<SlotIcon, { node: (cls: string) => ReactNode; color: string }> = {
  landmark: { node: (c) => <Landmark className={c} />, color: "text-[#8a7a5c]" },
  lantern: { node: (c) => <LampWallUp className={c} />, color: "text-[#e0a23a]" },
  sky: { node: (c) => <CloudSun className={c} />, color: "text-[#3d9ccf]" },
  soil: { node: (c) => <Sprout className={c} />, color: "text-[#6a9f3e]" },
  stone: { node: (c) => <Mountain className={c} />, color: "text-[#8d8a83]" },
  water: { node: (c) => <Droplet className={c} />, color: "text-[#3d9ccf]" },
  seeds: { node: (c) => <Bean className={c} />, color: "text-[#a77a45]" },
  bridge: { node: (c) => <BridgeIcon className={c} />, color: "text-[#9a6a40]" },
  gate: { node: (c) => <GateIcon className={c} />, color: "text-[#c9493a]" },
  erase: { node: (c) => <Eraser className={c} />, color: "text-[#b07b9a]" },
  house: { node: (c) => <House className={c} />, color: "text-[#b0703f]" },
  tower: { node: (c) => <Castle className={c} />, color: "text-[#7d7f86]" },
  lamp: { node: (c) => <Lamp className={c} />, color: "text-[#d9a52f]" },
  fence: { node: (c) => <Fence className={c} />, color: "text-[#9a6a40]" },
  flower: { node: (c) => <Flower2 className={c} />, color: "text-[#d0608a]" },
  rock: { node: (c) => <Gem className={c} />, color: "text-[#8d8a83]" },
  box: { node: (c) => <Box className={c} />, color: "text-[#9a6a40]" }
};

export function BuildDock({ onAskAi }: { onAskAi: (prompt: string) => void }) {
  const snap = useSnapshot(buildSlotStore);
  // Picking any tool in the top tool bar (Select, Transform...) stops placing.
  useEffect(
    () =>
      subscribeKey(toolSessionStore, "activeToolId", () => {
        if (buildSlotStore.activeIndex !== null) selectSlot(null);
      }),
    []
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState("");
  const [islandBusy, setIslandBusy] = useState(false);
  const layoutSnap = useSnapshot(uiLayoutStore);
  const libraryOpen = layoutSnap.libraryOpen;
  const setLibraryOpen = (open: boolean) => {
    uiLayoutStore.libraryOpen = open;
  };
  const [slotMenu, setSlotMenu] = useState<{ index: number; x: number; y: number } | null>(null);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem("theras:dock-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const stripRef = useRef<HTMLDivElement>(null);
  const big = snap.touchMode;
  const activeSlot = snap.activeIndex !== null ? snap.slots[snap.activeIndex] : undefined;

  useEffect(() => {
    try {
      localStorage.setItem("theras:dock-collapsed", collapsed ? "1" : "0");
    } catch {
      // per-viewer convenience only
    }
  }, [collapsed]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey) return;
      // Alt+1..9 picks a slot (plain 1..6 are the editor tool keys).
      const digit = /^Digit([1-9])$/.exec(e.code);
      if (e.altKey && digit) {
        const index = Number(digit[1]) - 1;
        if (index < buildSlotStore.slots.length) {
          selectSlot(index);
          e.preventDefault();
        }
      } else if (e.altKey) {
        return;
      } else if (e.key === "Escape" && buildSlotStore.activeIndex !== null) {
        selectSlot(null);
      } else if ((e.key === "r" || e.key === "R") && buildSlotStore.activeIndex !== null) {
        rotateSlot();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // A vertical mouse wheel scrolls the slot strip sideways.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [collapsed]);

  // Keep the active slot in view.
  useEffect(() => {
    if (snap.activeIndex === null) return;
    // Scroll only the strip (scrollIntoView would also scroll the page).
    const strip = stripRef.current;
    const el = strip?.querySelector<HTMLElement>(`[data-slot="${snap.activeIndex}"]`);
    if (strip && el) {
      if (el.offsetLeft < strip.scrollLeft) strip.scrollLeft = el.offsetLeft;
      else if (el.offsetLeft + el.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = el.offsetLeft + el.offsetWidth - strip.clientWidth;
    }
  }, [snap.activeIndex]);

  const submitDraft = () => {
    const text = draft.trim();
    if (!text) return;
    const change = /^change slot\s+(\d+)/i.exec(text);
    onAskAi(
      change
        ? `${text}. Replace dock slot ${change[1]} with set_slot (index ${Number(change[1]) - 1}). First check search_resources for a library entry and use kind resource if one fits; otherwise design a recipe of primitive parts. Keep the label short. The icon becomes a 3D preview by itself. Do not place anything in the scene.`
        : `Create a new dock slot for: ${text}. First check search_resources for a library entry and use set_slot with kind resource if one fits; otherwise use set_slot with a recipe of primitive parts. Do not place anything in the scene. Then select it with select_slot.`
    );
    setDraft("");
    setAdding(false);
  };

  const addSelectionSlot = () => {
    const result = slotFromSelection();
    if ("error" in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`Slot ${result.index + 1} "${result.label}" added. Click the scene to place copies.`);
    setDraft("");
    setAdding(false);
  };

  const buildIsland = () => {
    setIslandBusy(true);
    try {
      placeResource("lh:terrain:island");
    } finally {
      setTimeout(() => setIslandBusy(false), 3000);
    }
  };

  const slotSize = big ? "h-[84px] w-[84px]" : "h-[60px] w-[62px]";
  const iconSize = big ? "size-8" : "size-5";
  const label = big ? "text-[13px]" : "text-[11px]";
  const tile = (active: boolean) =>
    `flex ${slotSize} shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px] border-2 transition ${
      active ? "border-emerald-300/70 bg-emerald-400/20 shadow-[0_0_18px_rgba(52,211,153,0.25)]" : "border-transparent hover:-translate-y-0.5 hover:bg-white/10"
    }`;
  const iconButton = "flex size-8 items-center justify-center rounded-xl text-white/70 hover:bg-white/10 hover:text-white";

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-9 z-30 flex flex-col items-center gap-2 px-3">
      {slotMenu ? (
        <SlotMenu
          index={slotMenu.index}
          onAskAi={(text) => {
            setDraft(text);
            setAdding(true);
          }}
          onClose={() => setSlotMenu(null)}
          x={slotMenu.x}
          y={slotMenu.y}
        />
      ) : null}
      {libraryOpen ? <ResourceLibraryPanel onClose={() => setLibraryOpen(false)} /> : null}
      {adding ? (
        <div className="pointer-events-auto flex w-[420px] max-w-full items-center gap-2 rounded-2xl border border-white/15 bg-[#0b1512]/55 p-2 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
          <input
            autoFocus
            className="h-9 flex-1 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitDraft();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="New slot, for example: lamp post, wooden fence, red mushroom"
            value={draft}
          />
          <button className="h-9 rounded-xl bg-[#7fae58] px-3 text-sm font-semibold text-white" onClick={submitDraft} type="button">
            Ask AI
          </button>
          <button
            className="h-9 whitespace-nowrap rounded-xl border border-white/15 bg-white/10 px-3 text-sm font-semibold text-white hover:bg-white/20"
            onClick={addSelectionSlot}
            title="Make a slot from the object that is selected in the scene or the scene tree"
            type="button"
          >
            Use selected
          </button>
        </div>
      ) : null}

      {activeSlot ? (
        <div className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-white/15 bg-black/45 backdrop-blur-xl py-1 pl-3 pr-1 text-[12px] text-white shadow-lg">
          <span className="truncate">
            Placing <b>{activeSlot.label}</b>: tap the scene. {snap.rotation ? `Turned ${snap.rotation * 90} degrees. ` : ""}
            Esc, Stop or any top tool stops placing.
          </span>
          <button
            className="flex h-6 items-center gap-1 rounded-full bg-white/90 px-2 text-[11px] font-semibold text-black"
            onClick={() => selectSlot(null)}
            type="button"
          >
            <X className="size-3" /> Stop
          </button>
        </div>
      ) : null}

      {!layoutSnap.dockOpen ? null : <div className="pointer-events-auto flex max-w-full items-stretch gap-1 rounded-[24px] border border-white/15 bg-[#0b1512]/45 p-1.5 shadow-[0_14px_40px_rgba(0,0,0,0.35),inset_0_1px_0_rgba(255,255,255,0.16)] backdrop-blur-2xl backdrop-saturate-150">
        {collapsed ? <span className="self-center px-2 text-[11px] font-semibold text-white/70">Build</span> : null}

        {!collapsed ? (
          <>
            <button className={`${tile(false)} text-white/80 disabled:opacity-50`} disabled={islandBusy} onClick={buildIsland} title="New Island kit island at the scene center (replaces the current island). Soil, Stone and Water shape it; Shift-tap lowers." type="button">
              <Waves className={`${iconSize} text-[#3d9ccf]`} />
              <span className={`font-semibold ${label}`}>{islandBusy ? "Building" : "Island"}</span>
            </button>
            <button className={`${tile(libraryOpen)} text-white/80`} onClick={() => setLibraryOpen(!libraryOpen)} title="Resource library" type="button">
              <BookOpen className={`${iconSize} text-[#8a6d4a]`} />
              <span className={`font-semibold ${label}`}>Library</span>
            </button>
            <div className="my-2 w-px shrink-0 bg-white/15" />

            {/* Scrolling middle: the slots */}
            <div className="flex min-w-0 items-stretch gap-1 overflow-x-auto [scrollbar-width:thin]" ref={stripRef}>
              {snap.slots.map((slot, index) => {
                const icon = ICONS[slot.icon] ?? ICONS.box;
                return (
                  <button
                    className={`relative ${tile(snap.activeIndex === index)}`}
                    data-no-ai-drag
                    data-slot={index}
                    key={slot.id + index}
                    onClick={() => selectSlot(index)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setSlotMenu({ index, x: e.clientX, y: e.clientY });
                    }}
                    title={`${slot.label} (Alt+${index + 1}). Right-click for options; drag into Ask Theras to ask about it.`}
                    type="button"
                    {...aiContextDrag({
                      kind: "slot",
                      label: `${index + 1} ${slot.label}`,
                      detail: `dock slot index ${index}${slot.resourceId ? `, library ${slot.resourceId}` : slot.recipe ? `, ${slot.recipe.parts.length} parts` : ""}${slot.scale && slot.scale !== 1 ? `, size ${slot.scale}` : ""}`
                    })}
                  >
                    <SlotIconView className={`${big ? "size-10" : "size-7"} ${icon.color}`} fallback={icon.node(`${iconSize} ${icon.color}`)} slot={slot as never} />
                    <span className={`max-w-full truncate px-1 font-semibold text-white/85 ${label}`}>{slot.label}</span>
                    {index < 9 ? <span className="absolute left-1.5 top-1 text-[9px] font-semibold text-white/40">{index + 1}</span> : null}
                    {slot.scale && slot.scale !== 1 ? <span className="absolute right-1.5 top-1 text-[9px] font-semibold text-emerald-200/80">{slot.scale}x</span> : null}
                  </button>
                );
              })}
            </div>

            <div className="my-2 w-px shrink-0 bg-white/15" />
            {/* Fixed right: options */}
            <div className="grid shrink-0 grid-cols-2 content-center gap-0.5">
              <button className={iconButton} onClick={() => setAdding(!adding)} title="Add a slot: ask AI, or use the selected object" type="button">
                <Plus className="size-4" />
              </button>
              <button className={iconButton} onClick={rotateSlot} title={`Turn placement (R). Now ${snap.rotation * 90} degrees`} type="button">
                <RotateCw className="size-4" style={{ transform: `rotate(${snap.rotation * 90}deg)` }} />
              </button>
              <button
                className={`flex size-8 items-center justify-center rounded-xl ${snap.touchMode ? "bg-emerald-400/20 text-emerald-200" : "text-white/70 hover:bg-white/10 hover:text-white"}`}
                onClick={() => {
                  buildSlotStore.touchMode = !buildSlotStore.touchMode;
                }}
                title="Touch mode: bigger dock, tap to place, long press to erase"
                type="button"
              >
                <Hand className="size-4" />
              </button>
              <button
                className={`${iconButton} text-[9px] font-semibold`}
                onClick={() => {
                  if (window.confirm("Reset the dock to the default slots?")) resetSlots();
                }}
                title="Reset the dock"
                type="button"
              >
                Reset
              </button>
            </div>
          </>
        ) : null}
        <button className={`${iconButton} self-center`} onClick={() => setCollapsed(!collapsed)} title={collapsed ? "Show the dock" : "Hide the dock"} type="button">
          {collapsed ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
      </div>}
    </div>
  );
}

/** Right-click menu of a dock slot. */
function SlotMenu({ index, x, y, onClose, onAskAi }: { index: number; x: number; y: number; onClose: () => void; onAskAi: (text: string) => void }) {
  const snap = useSnapshot(buildSlotStore);
  const slot = snap.slots[index];
  useEffect(() => {
    const close = () => onClose();
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [onClose]);
  if (!slot) return null;
  const scale = slot.scale ?? 1;
  const setScale = (v: number) => {
    const live = buildSlotStore.slots[index];
    if (live) live.scale = Math.round(Math.min(8, Math.max(0.1, v)) * 100) / 100;
  };
  const move = (dir: -1 | 1) => {
    const j = index + dir;
    const slots = buildSlotStore.slots;
    if (j < 0 || j >= slots.length) return;
    const [item] = slots.splice(index, 1);
    slots.splice(j, 0, item!);
    onClose();
  };
  const item = "flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[12px] text-white/85 hover:bg-white/10";
  return createPortal(
    <div
      className="fixed z-[90] w-max min-w-56 overflow-hidden rounded-xl border border-white/15 bg-[#0d1714]/90 py-1 shadow-2xl backdrop-blur-xl"
      onPointerDown={(e) => e.stopPropagation()}
      style={{ left: Math.min(x, window.innerWidth - 250), top: Math.max(8, Math.min(y - 300, window.innerHeight - 320)) }}
    >
      <div className="px-3 pb-1 pt-1.5 text-[10px] font-semibold tracking-wide text-white/45 uppercase">
        Slot {index + 1}: {slot.label}
      </div>
      <button
        className={item}
        onClick={() => {
          const name = window.prompt("Slot name", slot.label);
          const live = buildSlotStore.slots[index];
          if (name && live) live.label = name.slice(0, 18);
          onClose();
        }}
        type="button"
      >
        <Pencil className="size-3.5" /> Rename
      </button>
      <div className="flex items-center gap-2 px-3 py-1.5 text-[12px] text-white/85">
        <span className="w-16 text-white/60" title={slot.terrainTool ? "On an island: 1 = one terrain point, 2 or more = a wider brush" : "Size of every placement"}>
          {slot.terrainTool ? "Brush size" : "Default size"}
        </span>
        <button className="size-6 rounded-md bg-white/10 hover:bg-white/20" onClick={() => setScale(scale / 1.25)} type="button">-</button>
        <input
          className="h-6 w-14 rounded-md border border-white/15 bg-white/10 text-center text-[11px] text-white outline-none"
          onChange={(e) => setScale(Number(e.target.value) || 1)}
          step={0.1}
          type="number"
          value={scale}
        />
        <button className="size-6 rounded-md bg-white/10 hover:bg-white/20" onClick={() => setScale(scale * 1.25)} type="button">+</button>
        <button className="ml-1 text-[10px] text-white/45 hover:text-white" onClick={() => setScale(1)} type="button">reset</button>
      </div>
      <button className={item} onClick={() => { onAskAi(`Change slot ${index + 1} (${slot.label}) to: `); onClose(); }} type="button">
        <Sparkles className="size-3.5" /> Change with AI...
      </button>
      {slot.iconSvg ? (
        <button
          className={item}
          onClick={() => {
            const live = buildSlotStore.slots[index];
            if (live) delete live.iconSvg;
            onClose();
          }}
          type="button"
        >
          <Box className="size-3.5" /> Use 3D preview as icon
        </button>
      ) : null}
      <button className={item} onClick={() => move(-1)} type="button">
        <ArrowLeft className="size-3.5" /> Move left
      </button>
      <button className={item} onClick={() => move(1)} type="button">
        <ArrowRight className="size-3.5" /> Move right
      </button>
      <button
        className={item}
        onClick={() => {
          try {
            upsertSlot({ ...structuredClone(buildSlotStore.slots[index]!), id: `${slot.id}-copy-${Date.now().toString(36)}`, label: `${slot.label} copy`.slice(0, 18) });
          } catch (e) {
            window.alert(e instanceof Error ? e.message : String(e));
          }
          onClose();
        }}
        type="button"
      >
        <Copy className="size-3.5" /> Duplicate
      </button>
      <button
        className={`${item} text-rose-300`}
        onClick={() => {
          removeSlot(index);
          onClose();
        }}
        type="button"
      >
        <Trash2 className="size-3.5" /> Remove slot
      </button>
    </div>,
    document.body
  );
}
