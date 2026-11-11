// Game mode overlay. Low chrome over the 3D view; sizes follow the viewport area (container
// queries and a measured width), not the window, because a docked chat makes the area narrower.
//
// States:
// - wrapping: the editor is shown; a top left stack holds the badge, the wrap progress card
//   (Skip = Enter) and the physics pill. The bottom center has the build dock then.
// - playing: badge top left, physics pill top right, crosshair (first person), hints bottom center.
// - tools: the editor is shown; the top left stack holds the badge, "Editing in game mode" with
//   Resume play (Tab), and the physics pill. No crosshair, no player hints.
// The bottom right corner stays free for the Ask Theras orb (bottom-32 right-5).
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  Atom,
  ChevronDown,
  Eye,
  Footprints,
  Gamepad2,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquare,
  MousePointerClick,
  Pause,
  Play,
  RotateCcw,
  Undo2,
  Wrench
} from "lucide-react";
import { toast } from "sonner";
import { useSnapshot } from "valtio";
import type { EditorCore } from "@theras/editor-core";
import { Kbd } from "@/components/ui/kbd";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { focusGameChat, installGameKeys } from "@/lib/game/game-input";
import {
  exitGameMode,
  gameStore,
  playerPose,
  setBodyMode,
  toggleGameTools,
  type BodyInfo,
  type BodyMode,
  type GamePhase
} from "@/lib/game/game-store";
import { findPlayerStart, setPlayerStart } from "@/lib/game/player-start";
import { cn } from "@/lib/utils";
import { askTherasStore } from "@/state/ask-theras";
import { uiStore } from "@/state/ui-store";

// ── Pure helpers (tested in tests/game-ui.test.ts) ─────────────────────────

export type HudMode = "off" | "wrapping" | "playing" | "tools";

/** Which overlay state to draw. */
export function hudMode(game: { active: boolean; phase: GamePhase; tools: boolean }): HudMode {
  if (!game.active || game.phase === "off") return "off";
  if (game.phase === "wrapping") return "wrapping";
  return game.tools ? "tools" : "playing";
}

export type HintId = "look" | "move" | "run" | "jump" | "push" | "view" | "tools" | "chat";

/** Hints in the order they are shown, with an estimated width in px (11 to 12 px text). */
export const HINTS: { id: HintId; width: number }[] = [
  { id: "look", width: 116 },
  { id: "move", width: 60 },
  { id: "run", width: 62 },
  { id: "jump", width: 70 },
  { id: "push", width: 62 },
  { id: "view", width: 50 },
  { id: "tools", width: 58 },
  { id: "chat", width: 76 }
];
/** Most useful first: these stay when the bar gets narrow. */
const HINT_PRIORITY: HintId[] = ["look", "move", "chat", "tools", "view", "push", "run", "jump"];
export const HINT_GAP = 12;
/** Side margins (2 x 1rem) plus the bar padding (2 x 0.875rem). */
const HINT_CHROME = 32 + 28;
const HINT_MAX_BAR = 760;

/** The hint budget in px for a container width. */
export function hintBudget(containerWidth: number) {
  return Math.min(containerWidth - 32, HINT_MAX_BAR) - (HINT_CHROME - 32);
}

/** Which hints fit one line in a container this wide, in display order. "look" only while the pointer is free. */
export function pickHints(containerWidth: number, pointerFree: boolean): HintId[] {
  const budget = hintBudget(containerWidth);
  const widthOf = new Map(HINTS.map((h) => [h.id, h.width]));
  const chosen = new Set<HintId>();
  let used = 0;
  for (const id of HINT_PRIORITY) {
    if (id === "look" && !pointerFree) continue;
    const add = widthOf.get(id)! + (chosen.size > 0 ? HINT_GAP : 0);
    if (used + add > budget) continue;
    chosen.add(id);
    used += add;
  }
  return HINTS.map((h) => h.id).filter((id) => chosen.has(id));
}

/** The estimated width in px of a hint list (for tests and checks). */
export function hintsWidth(ids: HintId[]) {
  const widthOf = new Map(HINTS.map((h) => [h.id, h.width]));
  return ids.reduce((sum, id, i) => sum + widthOf.get(id)! + (i > 0 ? HINT_GAP : 0), 0);
}

/** Yaw (radians, 0 = toward -z) of a horizontal facing direction. */
export function yawFromForward(forward: { x: number; z: number }) {
  return Math.atan2(-forward.x, -forward.z);
}

export type MarkMode = "solid" | "loose" | "trunk" | "ghost";
export type PhysicsTally = Record<MarkMode, number> & { total: number };

/**
 * Wrapped objects under each node, in one pass over the colliders: each collider adds one to
 * every ancestor. Ghost overrides (no collider) are counted as ghost.
 */
export function tallyBodiesByAncestor(
  bodies: Readonly<Record<string, Readonly<BodyInfo>>>,
  overrides: Readonly<Record<string, BodyMode>>,
  parentOf: (id: string) => string | undefined
): Map<string, PhysicsTally> {
  const out = new Map<string, PhysicsTally>();
  const add = (id: string, mode: MarkMode) => {
    const seen = new Set<string>();
    for (let p = parentOf(id); p && !seen.has(p); p = parentOf(p)) {
      seen.add(p);
      let t = out.get(p);
      if (!t) out.set(p, (t = { solid: 0, loose: 0, trunk: 0, ghost: 0, total: 0 }));
      t[mode] += 1;
      t.total += 1;
    }
  };
  for (const [id, body] of Object.entries(bodies)) add(id, body.mode);
  for (const [id, mode] of Object.entries(overrides)) if (mode === "ghost" && !bodies[id]) add(id, "ghost");
  return out;
}

/** The mode that most wrapped objects under a folder have (for its mark icon). */
export function dominantMode(t: PhysicsTally): MarkMode {
  const order: MarkMode[] = ["solid", "loose", "trunk", "ghost"];
  return order.reduce((best, m) => (t[m] > t[best] ? m : best), "solid" as MarkMode);
}

/** A click on a tree mark: default, loose, ghost, solid, then default again. */
export function nextBodyMode(current: BodyMode | undefined): BodyMode | "default" {
  if (current === undefined) return "loose";
  if (current === "loose") return "ghost";
  if (current === "ghost") return "solid";
  return "default";
}

// ── Components ──────────────────────────────────────────────────────────────

const GLASS = "pointer-events-auto rounded-2xl border border-white/10 bg-[#0b1512]/72 shadow-[0_18px_60px_rgba(4,12,10,0.45)] backdrop-blur-xl";
const SMALL_BUTTON = "flex items-center justify-center gap-1.5 rounded-xl bg-white/8 px-2.5 py-1.5 text-[11px] font-medium text-white/85 hover:bg-white/14 hover:text-white disabled:opacity-40";
const KBD = "h-4 bg-white/10 text-[10px] text-white/60";

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-xl bg-white/6 p-0.5">
      {options.map((o) => (
        <button
          className={cn(
            "min-w-0 flex-1 truncate rounded-[10px] px-2 py-1 text-[11px] font-medium text-white/60 transition-colors hover:text-white",
            value === o.value && "bg-emerald-500/20 text-emerald-200 shadow-[inset_0_0_0_1px_rgba(52,211,153,0.25)]"
          )}
          key={o.value}
          onClick={() => onChange(o.value)}
          type="button"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] font-semibold tracking-[0.14em] text-white/45 uppercase">{label}</div>
      {children}
    </div>
  );
}

const MODE_LABEL: Record<BodyMode, string> = { loose: "Loose", solid: "Solid", ghost: "Ghost" };
const NEXT_MODE: Record<BodyMode, BodyMode> = { loose: "solid", solid: "ghost", ghost: "loose" };

export function GameHud({ editor, nameOf }: { editor: EditorCore; nameOf: (id: string) => string | undefined }) {
  const game = useSnapshot(gameStore);
  const ask = useSnapshot(askTherasStore);
  const chatOpen = useSnapshot(uiStore).copilotPanelOpen;
  const mode = hudMode(game);
  const rootRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1024);

  // Keys for the wrap phase (and the tools view). The player also installs them; they are added once.
  useEffect(() => (game.active ? installGameKeys() : undefined), [game.active]);

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, [mode === "off"]);

  if (mode === "off") return null;
  const editorShown = mode !== "playing";
  const orbShown = chatOpen && ask.layout === "bubble";
  const barShown = chatOpen && ask.layout === "bar";

  return (
    <div className="@container pointer-events-none absolute inset-0 z-30 select-none" ref={rootRef}>
      {editorShown ? (
        // The editor is shown: everything of the game sits in one stack at the right, under the
        // tool bar row. The top left has the view switch, the document panel and (when open) the
        // scene tree with the physics marks, so the stack must not be there. The dock is below.
        <div className="absolute top-14 right-3 bottom-28 flex w-[min(18rem,calc(100%-1.5rem))] flex-col items-end gap-2">
          <Badge view={game.view} />
          {mode === "wrapping" ? <WrapCard nameOf={nameOf} /> : <ToolsChip />}
          <PhysicsPanel align="end" editor={editor} nameOf={nameOf} />
        </div>
      ) : (
        <>
          <div className="absolute top-3 left-3">
            <Badge view={game.view} />
          </div>
          {/* The right column ends above the hints, or above the orb when the orb is shown. */}
          <div
            className={cn(
              "absolute top-3 right-3 flex w-[min(18rem,calc(100%-1.5rem))] flex-col items-end gap-2",
              orbShown ? "bottom-[13rem]" : "bottom-16"
            )}
          >
            <PhysicsPanel align="end" editor={editor} nameOf={nameOf} />
          </div>
          {game.view === "first" ? <Crosshair /> : null}
          {barShown ? null : <Hints pointerLocked={game.pointerLocked} width={width} />}
        </>
      )}
    </div>
  );
}

function Badge({ view }: { view: "first" | "third" }) {
  return (
    <div className={cn(GLASS, "flex max-w-full items-center gap-2 py-1.5 pr-1.5 pl-3")}>
      <Gamepad2 className="size-4 shrink-0 text-emerald-300" />
      <span className="truncate text-[12px] font-semibold text-white/90 @max-md:hidden">Game mode</span>
      <span className="truncate text-[11px] text-white/45 @max-lg:hidden">{view === "first" ? "First person" : "Third person"}</span>
      <button
        className="ml-1 flex shrink-0 items-center gap-1.5 rounded-xl bg-white/8 px-2.5 py-1 text-[11px] font-medium text-white/80 hover:bg-white/14 hover:text-white @max-md:ml-0"
        onClick={() => exitGameMode()}
        title="Back to the editor (Esc)"
        type="button"
      >
        <LogOut className="size-3.5" /> Exit <Kbd className={cn(KBD, "@max-md:hidden")}>Esc</Kbd>
      </button>
    </div>
  );
}

function WrapCard({ nameOf }: { nameOf: (id: string) => string | undefined }) {
  const wrap = useSnapshot(gameStore).wrap;
  const ratio = wrap.total > 0 ? Math.min(1, wrap.done / wrap.total) : 0;
  const current = wrap.current ? (nameOf(wrap.current) ?? wrap.current) : null;
  return (
    <div className={cn(GLASS, "w-full space-y-2 px-3 py-2.5")} role="status">
      <div className="flex items-center gap-2">
        <Spinner className="size-3.5 shrink-0 text-emerald-300" />
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/90">Wrapping the scene in physics</span>
        <span className="shrink-0 text-[11px] tabular-nums text-white/55">
          {wrap.done} / {wrap.total || "…"}
        </span>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-white/10">
        <div className="h-full rounded-full bg-emerald-400 transition-[width] duration-200" style={{ width: `${ratio * 100}%` }} />
      </div>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/45">{current ?? "Reading the scene"}</span>
        <button className={cn(SMALL_BUTTON, "shrink-0 py-1")} onClick={() => (gameStore.skipWrapTick += 1)} title="Finish the wrap at once (Enter)" type="button">
          Skip <Kbd className={KBD}>Enter</Kbd>
        </button>
      </div>
    </div>
  );
}

function ToolsChip() {
  return (
    <div className={cn(GLASS, "flex w-full items-center gap-2 py-1.5 pr-1.5 pl-3")}>
      <Wrench className="size-3.5 shrink-0 text-amber-300" />
      <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-white/85">Editing in game mode</span>
      <button
        className="flex shrink-0 items-center gap-1.5 rounded-xl bg-emerald-500 px-2.5 py-1 text-[11px] font-semibold text-emerald-950 hover:bg-emerald-400"
        onClick={() => toggleGameTools()}
        title="Back to the player (Tab)"
        type="button"
      >
        <Play className="size-3.5" /> Resume play <Kbd className="h-4 bg-emerald-950/15 text-[10px] text-emerald-950/70">Tab</Kbd>
      </button>
    </div>
  );
}

function Crosshair() {
  const fire = useSnapshot(gameStore).fire;
  const [pulse, setPulse] = useState<{ key: number; hit: boolean } | null>(null);
  useEffect(() => {
    if (fire.tick === 0) return;
    setPulse({ key: fire.tick, hit: fire.hit });
    const timer = window.setTimeout(() => setPulse(null), 220);
    return () => window.clearTimeout(timer);
  }, [fire.tick, fire.hit]);
  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
      <div
        className={cn(
          "size-1.5 rounded-full shadow-[0_0_0_2px_rgba(0,0,0,0.35)] transition-transform duration-150",
          pulse?.hit ? "scale-150 bg-emerald-300" : "bg-white/85",
          pulse && !pulse.hit && "scale-125"
        )}
      />
      {pulse ? (
        <div
          className={cn(
            "absolute top-1/2 left-1/2 size-5 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full border",
            pulse.hit ? "border-emerald-300/80" : "border-white/50"
          )}
          key={pulse.key}
        />
      ) : null}
    </div>
  );
}

function Hints({ width, pointerLocked }: { width: number; pointerLocked: boolean }) {
  const ids = pickHints(width, !pointerLocked);
  const k = "bg-white/10 text-white/70";
  const items: Record<HintId, ReactNode> = {
    look: <span className="font-medium text-emerald-200">Click to look around</span>,
    move: (
      <span className="flex items-center gap-1">
        <Footprints className="size-3.5 text-white/45" /> <Kbd className={k}>WASD</Kbd>
      </span>
    ),
    run: (
      <span className="flex items-center gap-1">
        <Kbd className={k}>Shift</Kbd> run
      </span>
    ),
    jump: (
      <span className="flex items-center gap-1">
        <Kbd className={k}>Space</Kbd> jump
      </span>
    ),
    push: (
      <span className="flex items-center gap-1">
        <MousePointerClick className="size-3.5 text-white/45" /> push
      </span>
    ),
    view: (
      <span className="flex items-center gap-1">
        <Kbd className={k}>V</Kbd> view
      </span>
    ),
    tools: (
      <button className="pointer-events-auto flex items-center gap-1 text-white/70 hover:text-white" onClick={() => toggleGameTools()} type="button">
        <Kbd className={k}>Tab</Kbd> tools
      </button>
    ),
    chat: (
      <button className="pointer-events-auto flex items-center gap-1 text-white/70 hover:text-white" onClick={() => focusGameChat()} type="button">
        <MessageSquare className="size-3.5 text-white/45" /> <Kbd className={k}>Enter</Kbd> ask
      </button>
    )
  };
  if (ids.length === 0) return null;
  return (
    <div
      className={cn(
        GLASS,
        "absolute bottom-4 left-1/2 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 overflow-hidden px-3.5 py-2 text-[11px] whitespace-nowrap text-white/70 transition-opacity",
        pointerLocked && "opacity-45"
      )}
    >
      {ids.map((id) => (
        <span className="flex shrink-0 items-center" key={id}>
          {items[id]}
        </span>
      ))}
    </div>
  );
}

function PhysicsPanel({ align, editor, nameOf }: { align: "start" | "end"; editor: EditorCore; nameOf: (id: string) => string | undefined }) {
  const game = useSnapshot(gameStore);
  // Bumped after "Set here", so the start point line reads the scene again.
  const [, setStartRevision] = useState(0);
  const targets = Object.entries(game.overrides);
  const status = game.stats.building ? "Building colliders" : game.paused ? "Paused" : "Running";
  const start = game.panelOpen ? findPlayerStart(editor) : null;

  const setStartHere = () => {
    if (!playerPose.valid) return;
    try {
      setPlayerStart(editor, { ...playerPose.position }, yawFromForward(playerPose.forward));
      setStartRevision((n) => n + 1);
      toast.success("Start point set here");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not set the start point");
    }
  };

  return (
    <>
      <button
        className={cn(GLASS, "flex max-w-full shrink-0 items-center gap-2 px-3 py-1.5 text-[12px] text-white/85 hover:text-white")}
        onClick={() => (gameStore.panelOpen = !gameStore.panelOpen)}
        title={`Physics: ${game.stats.solid} solid, ${game.stats.loose} loose. ${status}.`}
        type="button"
      >
        <Atom className="size-4 shrink-0 text-emerald-300" />
        <span className="font-semibold @max-md:hidden">Physics</span>
        <span className="flex items-center gap-1 tabular-nums text-white/55">
          <span className="size-1.5 rounded-full bg-teal-300" />
          {game.stats.solid}
          <span className="@max-md:hidden">solid</span>
          <span className="ml-1 size-1.5 rounded-full bg-orange-300" />
          {game.stats.loose}
          <span className="@max-md:hidden">loose</span>
        </span>
        {game.stats.building ? (
          <Spinner className="size-3.5 shrink-0 text-emerald-300" />
        ) : (
          <span className={cn("size-2 shrink-0 rounded-full", game.paused ? "bg-amber-400" : "bg-emerald-400")} />
        )}
        <ChevronDown className={cn("size-3.5 shrink-0 text-white/50 transition-transform", game.panelOpen && "rotate-180")} />
      </button>

      {game.panelOpen && (
        <div className={cn(GLASS, "min-h-0 w-full space-y-3 overflow-y-auto overscroll-contain p-3", align === "end" ? "self-end" : "self-start")}>
          <div className="flex items-center gap-1.5">
            <button className={cn(SMALL_BUTTON, "flex-1")} onClick={() => (gameStore.paused = !gameStore.paused)} title="Run or pause physics (P)" type="button">
              {game.paused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
              {game.paused ? "Run" : "Pause"}
            </button>
            <button className={cn(SMALL_BUTTON, "flex-1")} onClick={() => (gameStore.resetTick += 1)} title="Put loose objects back (X)" type="button">
              <Undo2 className="size-3.5" /> Reset objects
            </button>
          </div>

          {game.phase === "playing" ? (
            <button className={cn(SMALL_BUTTON, "w-full")} onClick={() => toggleGameTools()} title="Editor tools inside game mode (Tab)" type="button">
              {game.tools ? <Play className="size-3.5" /> : <Wrench className="size-3.5" />}
              {game.tools ? "Resume play" : "Show editor tools"}
              <Kbd className={KBD}>Tab</Kbd>
            </button>
          ) : null}

          <Row label="Start point">
            <div className="flex items-center gap-1.5 text-[11px] text-white/70">
              <MapPin className={cn("size-3.5 shrink-0", start ? "text-emerald-300" : "text-white/40")} />
              <span className="min-w-0 truncate">{start ? "Marker: Player start" : "Automatic: open ground near the view"}</span>
            </div>
            <div className="flex gap-1.5">
              <button
                className={cn(SMALL_BUTTON, "flex-1")}
                disabled={!playerPose.valid || game.phase !== "playing"}
                onClick={setStartHere}
                title="Put the Player start marker where the player stands, facing the same way"
                type="button"
              >
                <LocateFixed className="size-3.5" /> Set here
              </button>
              <button className={cn(SMALL_BUTTON, "flex-1")} onClick={() => (gameStore.respawnTick += 1)} title="Back to the start point (R)" type="button">
                <RotateCcw className="size-3.5" /> Go to start
              </button>
            </div>
          </Row>

          <Row label="View">
            <Segmented
              onChange={(v) => (gameStore.view = v)}
              options={[
                { value: "first", label: "First person" },
                { value: "third", label: "Third person" }
              ]}
              value={game.view}
            />
          </Row>

          <Row label="Colliders on">
            <Segmented
              onChange={(v) => (gameStore.scope = v)}
              options={[
                { value: "scene", label: "Whole scene" },
                { value: "targets", label: "Targets only" }
              ]}
              value={game.scope}
            />
          </Row>

          <Row label="Loose objects (fall, can be pushed)">
            <Segmented
              onChange={(v) => (gameStore.looseDefault = v)}
              options={[
                { value: "none", label: "Targets" },
                { value: "small", label: "Targets + small props" }
              ]}
              value={game.looseDefault}
            />
          </Row>

          <Row label={`Gravity ${game.gravity.toFixed(1)} m/s²`}>
            <input
              aria-label="Gravity"
              className="w-full accent-emerald-400"
              max={20}
              min={0}
              onChange={(e) => (gameStore.gravity = Number(e.target.value))}
              step={0.1}
              type="range"
              value={game.gravity}
            />
            <div className="flex gap-1">
              {[
                ["Off", 0],
                ["Moon", 1.62],
                ["Mars", 3.71],
                ["Earth", 9.81]
              ].map(([label, g]) => (
                <button
                  className={cn(
                    "flex-1 rounded-lg bg-white/6 py-0.5 text-[10px] text-white/60 hover:text-white",
                    Math.abs(game.gravity - (g as number)) < 0.01 && "bg-emerald-500/18 text-emerald-200"
                  )}
                  key={label}
                  onClick={() => (gameStore.gravity = g as number)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          </Row>

          <label className="flex items-center justify-between gap-2 text-[11px] text-white/75">
            <span className="flex min-w-0 items-center gap-1.5">
              <Eye className="size-3.5 shrink-0 text-white/50" /> <span className="truncate">Show colliders</span> <span className="text-white/35">(C)</span>
            </span>
            <Switch checked={game.showColliders} onCheckedChange={(v) => (gameStore.showColliders = v)} size="sm" />
          </label>

          <Row label={`Targets (${targets.length})`}>
            {targets.length === 0 ? (
              <p className="text-[11px] leading-snug text-white/45">
                No targets. Select objects before Play, click a mark in the scene tree, or ask Theras, for example "make the barrels loose".
              </p>
            ) : (
              <div className="max-h-36 space-y-1 overflow-y-auto pr-1">
                {targets.map(([id, mode]) => (
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/5 px-2 py-1" key={id}>
                    <span className="min-w-0 flex-1 truncate text-[11px] text-white/80">{nameOf(id) ?? id}</span>
                    <button
                      className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] text-emerald-200 hover:bg-white/14"
                      onClick={() => setBodyMode([id], NEXT_MODE[mode])}
                      title="Change: loose, solid, ghost"
                      type="button"
                    >
                      {MODE_LABEL[mode]}
                    </button>
                    <button
                      className="text-[10px] text-white/40 hover:text-white"
                      onClick={() => setBodyMode([id], "default")}
                      title="Remove the target"
                      type="button"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Row>
        </div>
      )}
    </>
  );
}
