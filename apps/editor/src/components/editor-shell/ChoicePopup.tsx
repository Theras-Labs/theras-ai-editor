// Choice popup: before a build, the director asks which tree, which building kit or which
// meaning the user wants. The request comes from lib/copilot/choices.ts (requestChoices).
// It shows inside the chat UI when the chat is open (docked, floating, bar, bubble), else as
// a card in the middle of the viewport. Only the card takes the pointer: the camera still
// moves when you drag outside it.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Box, Building2, Check, ChevronDown, Flower2, Landmark, Mountain, Sparkles, Trees, Waves, X } from "lucide-react";
import { TherasIcon } from "@/components/editor-shell/icons";
import { Kbd } from "@/components/ui/kbd";
import { SlotIcon } from "@/lib/build-slots/slot-icon";
import { getChoiceRequest, requestChoices, subscribeChoices, type ChoiceRequest } from "@/lib/copilot/choices";
import { assembleAnswers, initialSelection, toggleOption, type ChoiceSelection } from "@/lib/copilot/choice-answers";
import type { ChoiceOption, ChoiceQuestion } from "@/lib/copilot/director/types";
import { getResource } from "@/lib/resources/catalog";
import type { ResourceKind } from "@/lib/resources/types";
import { cn } from "@/lib/utils";

/** Where the popup sits. panel = docked or floating chat; center = no chat open. */
export type ChoicePlacement = "panel" | "bar" | "bubble" | "center";

export function useChoiceRequest(): ChoiceRequest | null {
  return useSyncExternalStore(subscribeChoices, getChoiceRequest, getChoiceRequest);
}

const KIND_ICON: Partial<Record<ResourceKind, typeof Box>> = {
  plant: Trees,
  building: Building2,
  landmark: Landmark,
  water: Waves,
  terrain: Mountain,
  feature: Flower2
};

function FallbackIcon({ option }: { option: ChoiceOption }) {
  const kind = option.resourceId ? getResource(option.resourceId)?.kind : undefined;
  const Icon = (kind && KIND_ICON[kind]) || Sparkles;
  return <Icon className="size-6 text-emerald-200/55" strokeWidth={1.5} />;
}

/** Thumbnail: image (data URL), else the library preview, else a 3D render as in the dock, else an icon. */
function ChoiceThumb({ option, map }: { option: ChoiceOption; map?: boolean }) {
  const entry = option.resourceId ? getResource(option.resourceId) : undefined;
  const fallback = <FallbackIcon option={option} />;
  // A map is a plan seen from above: show all of it, with no padding.
  const img = map ? "size-full object-contain" : "size-full object-contain p-1";
  let content: ReactNode = fallback;
  if (option.image) content = <img alt="" className={img} draggable={false} src={option.image} />;
  else if (entry?.preview) content = <img alt="" className={img} draggable={false} loading="lazy" src={entry.preview} />;
  else if (entry?.create && option.resourceId) {
    // Same renderer and cache as the dock slots (lib/build-slots/thumbnail.ts).
    content = <SlotIcon className={img} fallback={fallback} slot={{ id: `choice-${option.resourceId}`, label: option.label, icon: "box", kind: "resource", resourceId: option.resourceId }} />;
  }
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center overflow-hidden rounded-xl",
        map ? "aspect-[3/2] bg-[#14201c]" : "aspect-[4/3] bg-[radial-gradient(ellipse_at_50%_35%,rgba(255,255,255,0.09),rgba(255,255,255,0.02)_70%)]"
      )}
    >
      {content}
    </div>
  );
}

function OptionCard({
  option,
  selected,
  suggested,
  multiple,
  shortcut,
  map,
  onPick
}: {
  option: ChoiceOption;
  selected: boolean;
  suggested: boolean;
  multiple?: boolean;
  shortcut?: number;
  map?: boolean;
  onPick: () => void;
}) {
  return (
    <button
      aria-pressed={selected}
      className={cn(
        "group relative flex min-w-0 flex-col gap-1.5 rounded-2xl border p-1.5 pb-2 text-left outline-none transition",
        "focus-visible:ring-2 focus-visible:ring-emerald-300/50",
        selected
          ? "border-emerald-300/70 bg-emerald-400/[0.12] shadow-[0_0_0_1px_rgba(110,231,183,0.25),0_8px_24px_rgba(16,185,129,0.12)]"
          : "border-white/12 bg-[#111c18] hover:border-white/25 hover:bg-[#16231e]"
      )}
      data-no-ai-drag
      onClick={onPick}
      title={option.hint ? `${option.label}: ${option.hint}` : option.label}
      type="button"
    >
      <ChoiceThumb map={map} option={option} />
      <span className="flex min-w-0 items-start gap-1 px-1">
        {/* Labels and hints wrap to 2 lines; the full text is in the title. */}
        <span className={cn("line-clamp-2 min-w-0 break-words text-[12px] leading-tight font-semibold", selected ? "text-white" : "text-white/85")}>{option.label}</span>
        {shortcut !== undefined && shortcut <= 9 ? (
          <span aria-hidden className="mt-px ml-auto shrink-0 rounded border border-white/15 px-1 text-[9px] leading-3.5 text-white/40 tabular-nums">
            {shortcut}
          </span>
        ) : null}
      </span>
      {option.hint ? <span className="line-clamp-2 break-words px-1 text-[10px] leading-snug text-white/55">{option.hint}</span> : null}
      {suggested ? (
        <span className="absolute left-2.5 top-2.5 rounded-full bg-black/70 px-1.5 py-px text-[9px] font-bold tracking-wide text-emerald-200 uppercase">
          Suggested
        </span>
      ) : null}
      <span
        className={cn(
          "absolute right-2.5 top-2.5 flex size-4.5 items-center justify-center border transition",
          multiple ? "rounded-md" : "rounded-full",
          selected ? "border-emerald-300 bg-emerald-400 text-black" : "border-white/30 bg-black/30 text-transparent"
        )}
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    </button>
  );
}

function QuestionBlock({
  question,
  selection,
  numbered,
  onPick
}: {
  question: ChoiceQuestion;
  selection: string[];
  numbered: boolean;
  onPick: (optionId: string) => void;
}) {
  const map = question.kind === "map";
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-0.5">
        <h3 className="min-w-0 break-words text-[12px] font-semibold text-white/90">{question.title}</h3>
        <span className="text-[10px] text-white/45">{question.multiple ? "Pick one or more" : "Pick one"}</span>
        {numbered ? <span className="ml-auto hidden text-[10px] text-white/40 @[420px]:inline">Keys 1 to {Math.min(9, question.options.length)}</span> : null}
      </div>
      {/* Maps: cards at least 160 px wide (2 per row in a 520 px chat, more when wide).
          Other questions: compact cards, up to 6 per row. */}
      <div
        className={cn(
          "grid gap-2",
          map
            ? "[grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]"
            : "[grid-template-columns:repeat(auto-fill,minmax(max(96px,calc((100%_-_5*0.5rem)/6)),1fr))]"
        )}
      >
        {question.options.map((option, i) => (
          <OptionCard
            key={option.id}
            map={map}
            multiple={question.multiple}
            onPick={() => onPick(option.id)}
            option={option}
            selected={selection.includes(option.id)}
            shortcut={numbered ? i + 1 : undefined}
            suggested={option.id === question.suggested}
          />
        ))}
      </div>
    </section>
  );
}

function isEditable(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT";
}

function ChoiceCard({ request, placement }: { request: ChoiceRequest; placement: ChoicePlacement }) {
  const { questions } = request;
  const [selection, setSelection] = useState<ChoiceSelection>(() => initialSelection(questions));
  const [note, setNote] = useState("");
  const cardRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const submit = () => request.resolve(assembleAnswers(questions, selection, note));
  // "Use suggested" resets the options but keeps the note the user wrote.
  const useSuggested = () => request.resolve(assembleAnswers(questions, initialSelection(questions), note));
  const pick = (question: ChoiceQuestion, optionId: string) => setSelection((s) => toggleOption(s, question, optionId));

  // Latest handlers for the key listener (it is attached once per request).
  const handlers = useRef({ submit, useSuggested, pick });
  handlers.current = { submit, useSuggested, pick };

  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      const inCard = !!cardRef.current && cardRef.current.contains(e.target as Node);
      // Typing in another field (the prompt, a property input) is not for the popup.
      if (isEditable(e.target) && !inCard) return;
      if (e.key === "Enter" && !e.shiftKey) {
        // A focused option card handles Enter as a click; elsewhere Enter continues.
        if (inCard && (e.target as HTMLElement).tagName === "BUTTON" && e.target !== continueRef.current) return;
        e.preventDefault();
        e.stopPropagation();
        handlers.current.submit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        handlers.current.useSuggested();
      } else if (/^[1-9]$/.test(e.key) && !isEditable(e.target)) {
        const first = questions[0];
        const option = first?.options[Number(e.key) - 1];
        if (!first || !option) return;
        e.preventDefault();
        e.stopPropagation(); // the dock also uses number keys
        handlers.current.pick(first, option.id);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [request.id, questions]);

  // Shows a fade and a "More below" sign while options are hidden under the footer.
  // It updates on scroll and on size change only.
  const bodyRef = useRef<HTMLDivElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const measure = () => {
    const el = bodyRef.current;
    if (el) setMoreBelow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  };
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    for (const child of Array.from(el.children)) observer.observe(child);
    return () => observer.disconnect();
  }, [questions]);

  const changed = useMemo(() => {
    const base = initialSelection(questions);
    return questions.some((q) => (selection[q.id] ?? []).join("|") !== (base[q.id] ?? []).join("|"));
  }, [questions, selection]);

  return (
    <div
      aria-label={request.title}
      aria-modal="false"
      className={cn(
        // Opaque surface: the chat and the scene must not show through.
        "@container pointer-events-auto flex min-h-0 flex-col overflow-hidden rounded-2xl border border-white/15 bg-[#0b1512] text-foreground",
        "shadow-[0_24px_64px_rgba(0,0,0,0.65),0_0_0_1px_rgba(0,0,0,0.4),inset_0_1px_0_rgba(255,255,255,0.08)]",
        "animate-in fade-in-0 zoom-in-95 duration-150",
        placement === "center" && "max-h-[min(100%,760px)] w-[min(760px,100%)]",
        placement === "bubble" && "max-h-[min(70vh,calc(100dvh-15rem))] w-[min(460px,calc(100vw-40px))]",
        placement === "bar" && "max-h-[min(60vh,calc(100dvh-20rem))] w-full",
        placement === "panel" && "max-h-full w-full"
      )}
      data-no-ai-drag
      onPointerDown={(e) => e.stopPropagation()}
      ref={cardRef}
      role="dialog"
    >
      <div className="flex shrink-0 items-start gap-2.5 border-b border-white/10 bg-[#0e1a16] px-3.5 py-3">
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-emerald-400/15 text-emerald-300">
          <TherasIcon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold tracking-[0.16em] text-emerald-300/80 uppercase">Before I build</div>
          {/* The AI's one-sentence understanding: up to 3 lines, the full text in the title. */}
          <h2 className="line-clamp-3 break-words text-[14px] leading-snug font-semibold text-white/95" title={request.title}>
            {request.title}
          </h2>
        </div>
        <button
          className="flex size-7 shrink-0 items-center justify-center rounded-lg text-white/50 hover:bg-white/10 hover:text-white"
          onClick={useSuggested}
          title="Close and use the suggested options (Esc)"
          type="button"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3.5 py-3 [scrollbar-width:thin]" onScroll={measure} ref={bodyRef}>
          {questions.map((question, i) => (
            <QuestionBlock
              key={question.id}
              numbered={i === 0}
              onPick={(optionId) => pick(question, optionId)}
              question={question}
              selection={selection[question.id] ?? []}
            />
          ))}
          <label className="block space-y-1.5">
            <span className="px-0.5 text-[11px] font-medium text-white/60">Note (optional)</span>
            <input
              className="h-9 w-full rounded-xl border border-white/12 bg-[#111c18] px-3 text-[12px] text-white outline-none transition placeholder:text-white/30 focus:border-emerald-300/50 focus:bg-[#14211c]"
              maxLength={500}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything to change? e.g. 'like this but taller'"
              value={note}
            />
          </label>
        </div>
        {moreBelow ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex h-10 items-end justify-center bg-gradient-to-t from-[#0b1512] to-transparent pb-1">
            <span className="flex items-center gap-1 rounded-full border border-white/12 bg-[#0e1a16] px-2 py-px text-[10px] text-white/60">
              <ChevronDown className="size-3" /> More below
            </span>
          </div>
        ) : null}
      </div>

      {/* The buttons are always fully visible. The key hints move to their own line below the
          buttons when there is no room, and hide in a very narrow card. */}
      <div className="flex shrink-0 flex-wrap-reverse items-center justify-end gap-x-3 gap-y-1.5 border-t border-white/10 bg-[#0e1a16] px-3.5 py-2.5">
        <span className="mr-auto hidden shrink-0 items-center gap-1 whitespace-nowrap text-[10px] text-white/40 @[340px]:flex">
          <Kbd>Enter</Kbd> continue
          <span className="ml-1.5" />
          <Kbd>Esc</Kbd> suggested
        </span>
        <div className="flex max-w-full shrink-0 flex-wrap items-center justify-end gap-1.5">
          <button
            className="h-8 whitespace-nowrap rounded-xl px-3 text-[12px] font-medium text-white/70 transition hover:bg-white/10 hover:text-white"
            onClick={useSuggested}
            type="button"
          >
            Use suggested
          </button>
          <button
            className="h-8 whitespace-nowrap rounded-xl bg-emerald-400 px-4 text-[12px] font-semibold text-black shadow-[0_6px_20px_rgba(16,185,129,0.3)] outline-none transition hover:bg-emerald-300 focus-visible:ring-2 focus-visible:ring-emerald-200/70"
            onClick={submit}
            ref={continueRef}
            type="button"
          >
            {changed || note.trim() ? "Continue with my choice" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Renders the open choice request at one placement, or nothing. Mount exactly one per screen:
 * the chat layouts mount their own; EditorShell mounts "center" only while no chat is open.
 */
export function ChoicePopup({ placement, className }: { placement: ChoicePlacement; className?: string }) {
  const request = useChoiceRequest();
  if (!request) return null;
  const card = <ChoiceCard key={request.id} placement={placement} request={request} />;
  if (placement === "center") {
    // The wrapper dims the scene and lets pointer events through, so the camera still moves outside the card.
    return <div className={cn("pointer-events-none absolute inset-0 z-[45] flex items-center justify-center bg-black/40 p-4", className)}>{card}</div>;
  }
  if (placement === "panel") {
    // Covers the message list and dims it. Clicks and wheel events go through outside the card.
    return <div className={cn("pointer-events-none absolute inset-0 z-20 flex flex-col justify-end bg-black/55 p-2.5 pb-2", className)}>{card}</div>;
  }
  if (placement === "bubble") {
    return <div className={cn("pointer-events-none absolute bottom-full right-0 mb-3 flex justify-end", className)}>{card}</div>;
  }
  return <div className={className}>{card}</div>;
}

// ── Dev helper ───────────────────────────────────────────────

const SAMPLE_TREES: ChoiceOption[] = [
  { id: "nature:tree:cherry-blossom", label: "Cherry blossom", hint: "Pink spring canopy", resourceId: "nature:tree:cherry-blossom" },
  { id: "nature:tree:fir", label: "Fir", hint: "Slim, dark, evergreen", resourceId: "nature:tree:fir" },
  { id: "nature:tree:oak-round", label: "Oak", hint: "Full, green crown", resourceId: "nature:tree:oak-round" },
  { id: "nature:tree:birch", label: "Birch", hint: "Tall, pale trunk", resourceId: "nature:tree:birch" },
  { id: "nature:tree:palm", label: "Palm", hint: "Beach and tropics", resourceId: "nature:tree:palm" },
  { id: "nature:tree:pine-tiered", label: "Tiered pine", hint: "Stylized layers", resourceId: "nature:tree:pine-tiered" }
];

/** A simple plan seen from above (192 x 128) for the sample map question. */
function samplePlan(path: string, extra = ""): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 128" width="192" height="128">` +
    `<rect width="192" height="128" fill="#4d7a3a"/>` +
    `<path d="${path}" fill="none" stroke="#3b82c4" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
    extra +
    `<rect x="84" y="52" width="24" height="24" fill="#8a6f52" stroke="#2b2118" stroke-width="2"/>` +
    `</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const SAMPLE_MAPS: ChoiceOption[] = [
  { id: "north", label: "River to the north", hint: "The river bends above the castle", image: samplePlan("M0 30 C50 10 140 50 192 20") },
  { id: "around", label: "River around the castle", hint: "A moat that follows the walls", image: samplePlan("M0 64 C30 20 160 20 192 64 C160 110 30 110 0 64") },
  { id: "through", label: "River through the valley", hint: "Straight line from west to east", image: samplePlan("M0 100 L192 96") },
  {
    id: "lake",
    label: "River that ends in a lake",
    hint: "A lagoon with clear water in the south east",
    image: samplePlan("M0 20 C60 30 110 70 150 100", `<ellipse cx="160" cy="104" rx="26" ry="18" fill="#3b82c4"/>`)
  },
  { id: "two", label: "Two small streams", hint: "They meet at the bridge", image: samplePlan("M0 10 L96 64 L192 10 M96 64 L96 128") }
];

declare global {
  interface Window {
    __therasTestChoices?: () => Promise<unknown>;
  }
}

if (import.meta.env.DEV && typeof window !== "undefined") {
  /** Development only: opens the popup with a sample map question and tree questions, and logs the answer. */
  window.__therasTestChoices = async () => {
    const options = SAMPLE_TREES.filter((o) => !!getResource(o.resourceId!));
    const missing = SAMPLE_TREES.filter((o) => !getResource(o.resourceId!)).map((o) => o.id);
    if (missing.length) console.warn("[choices] Not in the library:", missing);
    const answers = await requestChoices("I'll add a winding river through the castle garden, with trees along its banks and a small lagoon of clear water near the gate.", [
      { id: "layout", title: "Where should the river go?", kind: "map", options: SAMPLE_MAPS, suggested: "around" },
      { id: "tree", title: "Which trees?", kind: "taste", options, suggested: options[0]?.id ?? "", multiple: true },
      {
        id: "meaning",
        title: "Where should they go?",
        options: [
          { id: "path", label: "Along the paths", hint: "Rows that frame the walk" },
          { id: "grove", label: "In a grove", hint: "One dense group" },
          { id: "scatter", label: "Scattered", hint: "Natural spread" }
        ],
        suggested: "grove"
      }
    ]);
    console.info("[choices] answer:", answers);
    return answers;
  };
}
