// Top bar: brand and menus on the left, the Ask Theras pill in the center, and compact
// segmented controls on the right. Every control has a tooltip with its shortcut.
import { Gamepad2, LayoutTemplate, ListTree, Lock, LockOpen, PanelBottom, PanelTop, Pause, Play, Redo2, RotateCcw, Sparkles, Undo2 } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { ThinkingOrb } from "thinking-orbs";
import { useSnapshot } from "valtio";
import { Kbd } from "@/components/ui/kbd";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSeparator,
  MenubarShortcut,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger
} from "@/components/ui/menubar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { TherasIcon } from "@/components/editor-shell/icons";
import type { CopilotSessionStatus } from "@/lib/copilot/types";
import { displayKeys, keysFor, shortcutStore } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";
import { animationStore } from "@/lib/animation-clock";
import { resetPanelLayout, uiLayoutStore } from "@/state/ui-layout-store";
import { savedScenesStore } from "@/lib/saved-scenes";
import { postFxStore } from "@/lib/post-fx";
import { uiStore, type ViewportQuality } from "@/state/ui-store";

type EditorMenuBarProps = {
  aiStatus?: CopilotSessionStatus;
  canRedo: boolean;
  canUndo: boolean;
  copilotOpen: boolean;
  gameConnectionControl?: ReactNode;
  logicViewerOpen: boolean;
  onAsk?: () => void;
  /** Starts game mode (walk the scene with physics). */
  onPlay?: () => void;
  onClearSelection: () => void;
  onCreateBrush: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onGroupSelection: () => void;
  onExportEngine: () => void;
  onExportGltf: () => void;
  onExportSceneDocument: () => void;
  onFocusSelection: () => void;
  onImportSceneDocument: () => void;
  onLoadWhmap: () => void;
  onNewFile: () => void;
  onRedo: () => void;
  onSaveWhmap: () => void;
  onToggleCopilot: () => void;
  onToggleLogicViewer: () => void;
  onToggleViewportQuality: () => void;
  onUndo: () => void;
  viewportQuality: ViewportQuality;
};

const QUALITIES: ViewportQuality[] = [0.5, 0.75, 1, 1.5];

const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
/** Shortcut label; macOS gets the key symbols. */
const sym = (k: string) => (isMac ? k.replace(/Cmd ?/g, "\u2318").replace(/Shift ?/g, "\u21e7").replace(/Alt ?/g, "\u2325").replace(/Ctrl ?/g, "\u2303") : k);
const keys = (id: string) => sym(displayKeys(keysFor(id)));
const menuContent = "min-w-52 rounded-xl border border-white/10 bg-[#0b1311]/95 p-1 shadow-[0_18px_48px_rgba(0,0,0,0.5)] backdrop-blur-xl";
const item = "rounded-md text-[12px]";
const trigger = "h-7 rounded-md px-2 text-[12px] font-normal text-foreground/60 hover:bg-white/6 hover:text-foreground data-popup-open:bg-white/8 data-popup-open:text-foreground";

export function EditorMenuBar(props: EditorMenuBarProps) {
  const layout = useSnapshot(uiLayoutStore);
  const anim = useSnapshot(animationStore);
  const fx = useSnapshot(postFxStore);
  const busy = props.aiStatus === "thinking" || props.aiStatus === "executing";

  return (
    <div className="flex h-10 items-center gap-3 px-2">
      {/* Left: brand, menus, templates */}
      <div className="flex shrink-0 items-center gap-1">
        <div className="flex items-center gap-2 pr-2 pl-1">
          <span className="flex size-6 items-center justify-center rounded-md bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.12)_inset]">
            <TherasIcon className="size-3.5" />
          </span>
          {/* The name gives its room to the Ask Theras prompt in a narrow window. */}
          <span className="text-[13px] font-semibold tracking-tight text-foreground max-md:hidden">
            Theras<span className="ml-0.5 font-medium text-emerald-400">AI</span>
          </span>
        </div>

        <Menubar className="h-7 gap-0 border-0 bg-transparent p-0 shadow-none">
          <MenubarMenu>
            <MenubarTrigger className={trigger}>File</MenubarTrigger>
            <MenubarContent className={menuContent}>
              <MenubarItem className={item} onClick={props.onNewFile}>
                New scene
              </MenubarItem>
              <MenubarItem className={item} onClick={() => (uiLayoutStore.templatesOpen = true)}>
                New from template...
              </MenubarItem>
              <MenubarItem className={item} onClick={props.onCreateBrush}>
                New brush
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem className={item} onClick={() => (savedScenesStore.open = true)}>
                Save scene...
              </MenubarItem>
              <MenubarItem className={item} onClick={() => (savedScenesStore.open = true)}>
                Open saved scene...
              </MenubarItem>
              <MenubarSeparator />
              <MenubarSub>
                <MenubarSubTrigger className={item}>Import</MenubarSubTrigger>
                <MenubarSubContent className={menuContent}>
                  <MenubarItem className={item} onClick={props.onLoadWhmap}>
                    World (.whmap)
                  </MenubarItem>
                  <MenubarItem className={item} onClick={props.onImportSceneDocument}>
                    Scene (.whdoc)
                  </MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarSub>
                <MenubarSubTrigger className={item}>Export</MenubarSubTrigger>
                <MenubarSubContent className={menuContent}>
                  <MenubarItem className={item} onClick={props.onSaveWhmap}>
                    World (.whmap)
                    <MenubarShortcut>{sym(displayKeys("Mod+S"))}</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem className={item} onClick={props.onExportSceneDocument}>
                    Scene (.whdoc)
                  </MenubarItem>
                  <MenubarItem className={item} onClick={props.onExportGltf}>
                    glTF model
                  </MenubarItem>
                  <MenubarItem className={item} onClick={props.onExportEngine}>
                    Runtime bundle
                  </MenubarItem>
                </MenubarSubContent>
              </MenubarSub>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className={trigger}>Edit</MenubarTrigger>
            <MenubarContent className={menuContent}>
              <MenubarItem className={item} disabled={!props.canUndo} onClick={props.onUndo}>
                Undo
                <MenubarShortcut>{keys("undo")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} disabled={!props.canRedo} onClick={props.onRedo}>
                Redo
                <MenubarShortcut>{keys("redo")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem className={item} onClick={props.onDuplicateSelection}>
                Duplicate
                <MenubarShortcut>{sym(displayKeys("Mod+D"))}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} onClick={props.onGroupSelection}>
                Group selection
                <MenubarShortcut>{keys("group")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} onClick={props.onDeleteSelection}>
                Delete
                <MenubarShortcut>Del</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} onClick={props.onClearSelection}>
                Clear selection
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className={trigger}>View</MenubarTrigger>
            <MenubarContent className={menuContent}>
              <MenubarItem className={item} onClick={props.onFocusSelection}>
                Focus selection
              </MenubarItem>
              <MenubarSeparator />
              <MenubarCheckboxItem checked={layout.treeOpen} className={item} onCheckedChange={(v) => (uiLayoutStore.treeOpen = v)}>
                Scene tree
                <MenubarShortcut>{keys("toggle-tree")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarCheckboxItem checked={layout.dockOpen} className={item} onCheckedChange={(v) => (uiLayoutStore.dockOpen = v)}>
                Build dock
                <MenubarShortcut>{keys("toggle-dock")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarCheckboxItem checked={!layout.toolbarCollapsed} className={item} onCheckedChange={(v) => (uiLayoutStore.toolbarCollapsed = !v)}>
                Tool bar
                <MenubarShortcut>{keys("toggle-toolbar")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarCheckboxItem checked={props.copilotOpen} className={item} onCheckedChange={props.onToggleCopilot}>
                Ask Theras
                <MenubarShortcut>{keys("ai-panel")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarCheckboxItem checked={props.logicViewerOpen} className={item} onCheckedChange={props.onToggleLogicViewer}>
                Logic graph
                <MenubarShortcut>{keys("logic")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarSeparator />
              <MenubarItem className={item} onClick={props.onPlay}>
                Play (game mode)
                <MenubarShortcut>{keys("toggle-game")}</MenubarShortcut>
              </MenubarItem>
              <MenubarCheckboxItem checked={anim.playing} className={item} onCheckedChange={(v) => (animationStore.playing = v)}>
                Animate scene
                <MenubarShortcut>{keys("toggle-animate")}</MenubarShortcut>
              </MenubarCheckboxItem>
              <MenubarSub>
                <MenubarSubTrigger className={item}>Render quality</MenubarSubTrigger>
                <MenubarSubContent className={menuContent}>
                  <MenubarRadioGroup value={props.viewportQuality} onValueChange={(v) => (uiStore.viewportQuality = v as ViewportQuality)}>
                    {QUALITIES.map((q) => (
                      <MenubarRadioItem className={item} key={q} value={q}>
                        {q.toFixed(2)}x pixel ratio
                        {q === 0.5 ? <MenubarShortcut>fast</MenubarShortcut> : q === 1.5 ? <MenubarShortcut>sharp</MenubarShortcut> : null}
                      </MenubarRadioItem>
                    ))}
                  </MenubarRadioGroup>
                </MenubarSubContent>
              </MenubarSub>
              <MenubarItem className={item} onClick={() => (uiLayoutStore.unlocked = !uiLayoutStore.unlocked)}>
                {layout.unlocked ? "Lock panels" : "Unlock panels"}
                <MenubarShortcut>{keys("unlock-ui")}</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} onClick={resetPanelLayout}>
                Reset panel layout
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>

          <MenubarMenu>
            <MenubarTrigger className={trigger}>Help</MenubarTrigger>
            <MenubarContent className={menuContent}>
              <MenubarItem className={item} onClick={() => (shortcutStore.dialogOpen = true)}>
                Keyboard shortcuts
                <MenubarShortcut>{keys("shortcuts")}</MenubarShortcut>
              </MenubarItem>
              <MenubarSeparator />
              <MenubarItem className={item} disabled>
                Select
                <MenubarShortcut>Click</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} disabled>
                Focus object
                <MenubarShortcut>Double click</MenubarShortcut>
              </MenubarItem>
              <MenubarItem className={item} disabled>
                Marquee select
                <MenubarShortcut>Shift drag</MenubarShortcut>
              </MenubarItem>
            </MenubarContent>
          </MenubarMenu>
        </Menubar>

        <span className="mx-1.5 h-4 w-px bg-white/10" />
        <Tip label="Scene templates" detail="Start from an island, meadow or night harbor">
          <button
            aria-label="Scene templates"
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-[12px] text-foreground/60 transition-colors hover:bg-white/6 hover:text-foreground"
            onClick={() => (uiLayoutStore.templatesOpen = true)}
            type="button"
          >
            <LayoutTemplate className="size-3.5" />
            <span className="max-lg:hidden">Templates</span>
          </button>
        </Tip>
      </div>

      {/* Center: Ask Theras (takes the free space between the sides). It never gets smaller than
          its orb, and nothing of it draws over the buttons beside it: in a narrow window the
          prompt was 10 px wide and a click on it landed on Undo. */}
      <div className="flex min-w-9 flex-1 justify-center">
      <button
        aria-label="Ask Theras"
        className={cn(
          "group flex h-7 w-full max-w-[380px] min-w-0 items-center gap-2 overflow-hidden rounded-full border bg-white/[0.04] pr-1 pl-1 text-[12px] transition-colors",
          busy ? "border-emerald-400/30 text-foreground/80" : "border-white/10 text-foreground/45 hover:border-white/20 hover:bg-white/[0.07] hover:text-foreground/75",
          props.copilotOpen && !busy && "border-emerald-400/25"
        )}
        data-no-ai-drag
        onClick={props.onAsk ?? props.onToggleCopilot}
        type="button"
      >
        <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-full">
          <ThinkingOrb size={20} state={props.aiStatus === "executing" ? "shaping" : props.aiStatus === "thinking" ? "searching" : "breathing"} theme="dark" />
        </span>
        <span className={cn("min-w-0 flex-1 truncate text-left", busy && "shimmer")}>{busy ? "Theras is building..." : "Ask Theras to build anything..."}</span>
        <Kbd className="h-5 shrink-0 rounded-full bg-white/8 px-1.5 text-[10px] text-foreground/55 max-md:hidden">{keys("ai-panel")}</Kbd>
      </button>
      </div>

      {/* Right: history, panels, game sync */}
      <div className="flex shrink-0 items-center justify-end gap-1.5">
        <Segment>
          <SegButton disabled={!props.canUndo} label="Undo" detail="Also undoes AI changes" keys={keys("undo")} onClick={props.onUndo}>
            <Undo2 />
          </SegButton>
          <SegButton disabled={!props.canRedo} label="Redo" keys={keys("redo")} onClick={props.onRedo}>
            <Redo2 />
          </SegButton>
        </Segment>

        <Tip
          detail={anim.playing ? "Waves, ripples, wind and windmills move. Click to freeze them." : "Scene motion is frozen. Click to play it."}
          keys={keys("toggle-animate")}
          label={anim.playing ? "Pause animation" : "Play animation"}
        >
          <button
            aria-label={anim.playing ? "Pause animation" : "Play animation"}
            aria-pressed={anim.playing}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors [&_svg]:size-3.5",
              anim.playing ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15" : "border-white/10 bg-white/[0.03] text-foreground/60 hover:bg-white/8 hover:text-foreground"
            )}
            onClick={() => (animationStore.playing = !animationStore.playing)}
            type="button"
          >
            {anim.playing ? <Pause /> : <Play />}
            <span className="max-lg:hidden">Animate</span>
          </button>
        </Tip>

        <Tip detail="Ink lines, glow, exposure, color grade, vignette and grain. Saved with the scene." label="Screen effects">
          <button
            aria-label="Screen effects"
            aria-pressed={fx.open}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2 text-[12px] transition-colors [&_svg]:size-3.5",
              fx.open ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200 hover:bg-emerald-400/15" : "border-white/10 bg-white/[0.03] text-foreground/60 hover:bg-white/8 hover:text-foreground"
            )}
            onClick={() => (postFxStore.open = !postFxStore.open)}
            type="button"
          >
            <Sparkles />
            <span className="max-lg:hidden">Effects</span>
          </button>
        </Tip>

        <Tip
          detail="Walk the scene in third or first person, with physics. Selected objects become loose. Keep asking Theras while you walk."
          keys={keys("toggle-game")}
          label="Play"
        >
          <button
            aria-label="Play"
            className="flex h-7 items-center gap-1.5 rounded-md bg-gradient-to-b from-emerald-400 to-emerald-600 px-2.5 text-[12px] font-semibold text-emerald-950 shadow-[0_0_0_1px_rgba(255,255,255,0.14)_inset,0_4px_14px_rgba(16,185,129,0.25)] transition-[filter] hover:brightness-110 [&_svg]:size-3.5"
            onClick={props.onPlay}
            type="button"
          >
            <Gamepad2 />
            <span className="max-md:hidden">Play</span>
          </button>
        </Tip>

        <Segment>
          <SegButton active={layout.treeOpen} label="Scene tree" keys={keys("toggle-tree")} onClick={() => (uiLayoutStore.treeOpen = !uiLayoutStore.treeOpen)}>
            <ListTree />
          </SegButton>
          <SegButton active={!layout.toolbarCollapsed} label="Tool bar" keys={keys("toggle-toolbar")} onClick={() => (uiLayoutStore.toolbarCollapsed = !uiLayoutStore.toolbarCollapsed)}>
            <PanelTop />
          </SegButton>
          <SegButton active={layout.dockOpen} label="Build dock" keys={keys("toggle-dock")} onClick={() => (uiLayoutStore.dockOpen = !uiLayoutStore.dockOpen)}>
            <PanelBottom />
          </SegButton>
          <SegButton
            active={layout.unlocked}
            detail={layout.unlocked ? "Lock the panels in place" : "Drag panels by their handle"}
            keys={keys("unlock-ui")}
            label={layout.unlocked ? "Lock panels" : "Unlock panels"}
            onClick={() => (uiLayoutStore.unlocked = !uiLayoutStore.unlocked)}
          >
            {layout.unlocked ? <LockOpen /> : <Lock />}
          </SegButton>
          {layout.unlocked ? (
            <SegButton label="Reset panel layout" onClick={resetPanelLayout}>
              <RotateCcw />
            </SegButton>
          ) : null}
        </Segment>

        {props.gameConnectionControl ? <div className="flex h-7 items-center rounded-md border border-white/10 bg-white/[0.03] px-0.5">{props.gameConnectionControl}</div> : null}
      </div>
    </div>
  );
}

function Tip({ children, label, detail, keys: shortcut }: { children: ReactElement; label: string; detail?: string; keys?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="flex-col items-start gap-0.5 px-2.5 py-1.5" side="bottom" sideOffset={6}>
        <span className="flex items-center gap-2 text-[12px] font-medium">
          {label}
          {shortcut ? <Kbd className="h-4 text-[10px]">{shortcut}</Kbd> : null}
        </span>
        {detail ? <span className="text-[11px] opacity-70">{detail}</span> : null}
      </TooltipContent>
    </Tooltip>
  );
}

/** reui-style segmented group: one border, thin dividers. */
function Segment({ children }: { children: ReactNode }) {
  return <div className="flex h-7 items-center divide-x divide-white/10 overflow-hidden rounded-md border border-white/10 bg-white/[0.03]">{children}</div>;
}

function SegButton({
  active,
  children,
  detail,
  disabled,
  keys: shortcut,
  label,
  onClick
}: {
  active?: boolean;
  children: ReactNode;
  detail?: string;
  disabled?: boolean;
  keys?: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <Tip detail={detail} keys={shortcut} label={label}>
      <button
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "flex h-full w-7 items-center justify-center text-foreground/55 transition-colors hover:bg-white/8 hover:text-foreground disabled:pointer-events-none disabled:opacity-30 [&_svg]:size-3.5",
          active && "bg-white/[0.06] text-emerald-300"
        )}
        disabled={disabled}
        onClick={onClick}
        type="button"
      >
        {children}
      </button>
    </Tip>
  );
}
