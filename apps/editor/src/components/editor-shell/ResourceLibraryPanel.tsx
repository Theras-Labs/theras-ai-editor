// Resource library browser: search the local and external entries, apply a sky, or put an
// object in the dock so the next tap places it.
import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { buildSlotStore, upsertSlot } from "@/lib/build-slots/store";
import type { SlotIcon } from "@/lib/build-slots/types";
import { RESOURCES, searchResources } from "@/lib/resources/catalog";
import { SCANNED_TAG, isScannedId } from "@/lib/resources/external/scanned";
import { scannedTotal, searchScanned } from "@/lib/resources/external/scanned-search";
import { placeResource, resourceIdsInScene } from "@/lib/resources/place";
import { aiContextDrag } from "@/lib/ai-context";
import type { ResourceEntry, ResourceKind, ResourceSource } from "@/lib/resources/types";

type Filter = { label: string; kind?: ResourceKind; source?: ResourceSource; tag?: string };

/** The user stopped typing for this long: one search request goes to the Theras server. */
const SCANNED_SEARCH_DELAY_MS = 350;

const FILTERS: Filter[] = [
  { label: "All" },
  { label: "Buildings", kind: "building" },
  { label: "Landmarks", kind: "landmark" },
  { label: "Features", kind: "feature" },
  { label: "Plants", kind: "plant" },
  { label: "Water", kind: "water" },
  { label: "Places", kind: "environment" },
  { label: "Creatures", kind: "creature" },
  { label: "Skies", kind: "sky" },
  { label: "Blocks", kind: "recipe" },
  { label: "External", source: "external" },
  // Photo scans of real products from an external source (resources/external/scanned.ts).
  { label: "Scanned", tag: SCANNED_TAG }
];

const KIND_ICON: Record<ResourceKind, SlotIcon> = {
  landmark: "landmark",
  feature: "box",
  plant: "flower",
  recipe: "box",
  terrain: "soil",
  environment: "landmark",
  building: "house",
  creature: "landmark",
  water: "water",
  sky: "sky",
  hdri: "sky"
};

function iconFor(entry: ResourceEntry): SlotIcon {
  if (entry.tags.includes("bridge") || entry.id.endsWith(":bridge")) return "bridge";
  if (entry.tags.includes("light") || entry.tags.includes("lantern")) return "lantern";
  if (entry.tags.includes("tower")) return "tower";
  if (entry.tags.includes("house") || entry.tags.includes("shed")) return "house";
  if (entry.tags.includes("flower")) return "flower";
  if (entry.tags.includes("border")) return "fence";
  return KIND_ICON[entry.kind];
}

/** Puts the entry in the dock (reusing a slot that already holds it) and makes it active. */
function useInDock(entry: ResourceEntry) {
  const slots = buildSlotStore.slots;
  let index = slots.findIndex((s) => s.kind === "resource" && s.resourceId === entry.id);
  if (index < 0) {
    const slot = { id: `lib-${entry.id}`, label: entry.name.slice(0, 18), icon: iconFor(entry), kind: "resource" as const, resourceId: entry.id };
    try {
      index = upsertSlot(slot);
    } catch {
      index = upsertSlot(slot, slots.length - 1); // dock full: replace the last slot
    }
  }
  buildSlotStore.activeIndex = index;
}

export function ResourceLibraryPanel({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>(FILTERS[0]!);
  const [message, setMessage] = useState<string | null>(null);

  // Scanned objects come from the index of the Theras server. One request goes out after the
  // user stops typing (2 letters or more) or opens the "Scanned" filter. Nothing is asked while
  // the panel is idle. The results are library entries after that, so the search below finds them.
  const [scannedTick, setScannedTick] = useState(0);
  const wantsScanned = filter.tag === SCANNED_TAG || (query.trim().length >= 2 && !filter.kind);
  useEffect(() => {
    if (!wantsScanned) return;
    let alive = true;
    const timer = setTimeout(() => {
      void searchScanned(query, 24).then(() => alive && setScannedTick((n) => n + 1));
    }, SCANNED_SEARCH_DELAY_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query, wantsScanned]);

  // Scanned objects that are in the scene: their cards come first and show "in scene".
  const inScene = useMemo(() => new Set([...resourceIdsInScene()].filter(isScannedId)), [scannedTick, message, filter, query]);
  const results = useMemo(() => {
    const tag = filter.tag;
    const found = searchResources(query, { kind: filter.kind, source: tag ? "external" : filter.source }, 200);
    if (!tag) return found;
    const tagged = found.filter((e) => e.tags.includes(tag));
    return [...tagged.filter((e) => inScene.has(e.id)), ...tagged.filter((e) => !inScene.has(e.id))];
  }, [filter, query, scannedTick, inScene]);
  const localCount = RESOURCES.filter((e) => e.source === "local").length;
  const externalCount = RESOURCES.length - localCount;
  const scannedCount = scannedTotal();

  const act = (entry: ResourceEntry) => {
    try {
      if (entry.kind === "sky" || entry.kind === "hdri") {
        placeResource(entry.id);
        setMessage(`Sky set to ${entry.name}.`);
      } else if (entry.kind === "terrain") {
        placeResource(entry.id);
        setMessage("New island. Use Soil, Stone and Water in the dock; Shift-tap lowers.");
      } else {
        useInDock(entry);
        setMessage(`${entry.name} is in the dock. Tap the scene to place it.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <div className="pointer-events-auto flex max-h-[48vh] w-[680px] max-w-[calc(100%-24px)] flex-col overflow-hidden rounded-[24px] border border-white/15 bg-[#0b1512]/55 shadow-[0_14px_40px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl backdrop-saturate-150">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <div className="flex-1">
          <div className="text-sm font-bold text-white/90">Resource library</div>
          <div className="text-[11px] text-white/45">
            {localCount} local, {externalCount} external, by category.
            {scannedCount > 0 ? ` ${scannedCount} scanned objects by search.` : ""}
          </div>
        </div>
        <input
          className="h-8 w-56 rounded-xl border border-white/15 bg-white/10 px-3 text-sm text-white outline-none placeholder:text-white/40"
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search: windmill, night, water..."
          value={query}
        />
        <button className="flex size-8 items-center justify-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white" onClick={onClose} type="button">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-2.5 [scrollbar-width:none]">
        {FILTERS.map((f) => (
          <button
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-semibold ${
              f.label === filter.label ? "bg-emerald-400/80 text-black" : "bg-white/8 text-white/70 hover:bg-white/15"
            }`}
            key={f.label}
            onClick={() => setFilter(f)}
            type="button"
          >
            {f.label}
          </button>
        ))}
      </div>
      {message ? <div className="px-4 pt-2 text-[12px] font-medium text-emerald-300">{message}</div> : null}
      <div className="grid grid-cols-2 gap-2 overflow-y-auto p-4 pt-2.5 sm:grid-cols-3">
        {results.map((entry) => (
          <button
            className="flex flex-col items-start gap-1 rounded-2xl border border-white/10 bg-white/[0.06] p-2.5 text-left transition hover:border-emerald-300/60 hover:bg-white/10"
            data-no-ai-drag
            key={entry.id}
            onClick={() => act(entry)}
            {...aiContextDrag({ kind: "library", label: entry.name, detail: `${entry.id}, ${entry.kind}, ${entry.source} from ${entry.origin}` })}
            title={`${entry.id} | ${entry.origin} | ${entry.license}${entry.creditUrl ? ` | ${entry.creditUrl}` : ""}`}
            type="button"
          >
            {entry.preview ? (
              <img alt="" className="h-20 w-full rounded-xl bg-white/[0.04] object-contain" draggable={false} loading="lazy" src={entry.preview} />
            ) : null}
            <div className="flex w-full items-center gap-1.5">
              <span className="flex-1 truncate text-[13px] font-bold text-white/90">{entry.name}</span>
              <span
                className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase ${
                  entry.source === "local" ? "bg-[#e6f0d6] text-emerald-300" : "bg-[#dcecf6] text-[#2f7fae]"
                }`}
              >
                {entry.source}
              </span>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
              {entry.category ?? entry.kind}
            </span>
            <span className="line-clamp-2 text-[11px] leading-snug text-white/65">{entry.description}</span>
            {/* The credit that the license of an external model asks for (CC BY). */}
            {entry.credit ? (
              <span className="text-[10px] leading-snug text-sky-200/80">
                {inScene.has(entry.id) ? <span className="mr-1 rounded-full bg-emerald-400/80 px-1.5 py-px font-bold uppercase text-black">in scene</span> : null}
                Credit: {entry.credit}
              </span>
            ) : null}
          </button>
        ))}
        {results.length === 0 ? <div className="col-span-full py-6 text-center text-sm text-white/45">No match.</div> : null}
      </div>
    </div>
  );
}
