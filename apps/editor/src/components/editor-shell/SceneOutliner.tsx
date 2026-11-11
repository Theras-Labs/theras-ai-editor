// Blender-style scene tree: folders (group nodes) with open/closed icons, indent guides,
// child counts, full names, inline rename (double-click), right-click menu, and drag and
// drop to move objects into or out of folders. Every change is one undo step.
import { useEffect, useMemo, useRef, useState, type ComponentType, type DragEvent, type ReactNode } from "react";
import {
  Bot,
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  ChevronsDownUp,
  ChevronsUpDown,
  CloudSun,
  Crosshair,
  Eye,
  EyeOff,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  FolderX,
  Landmark,
  Lightbulb,
  Lock,
  LockOpen,
  Mountain,
  Package,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  User,
  Wand2,
  Waves,
  BrickWall,
  Move3d,
  TreePine,
  Ghost
} from "lucide-react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { gameStore, setBodyMode, type BodyMode } from "@/lib/game/game-store";
import { dominantMode, nextBodyMode, tallyBodiesByAncestor, type MarkMode, type PhysicsTally } from "@/components/editor-shell/GameHud";
import { createDeleteSelectionCommand, type EditorCore } from "@theras/editor-core";
import { resolveSceneGraph, type Entity, type GeometryNode } from "@theras/shared";
import { groupNodes, moveNodesTo, organizeByName, renameNode, ungroup } from "@/lib/outliner";
import { writeAiContext } from "@/lib/ai-context";
import { cn } from "@/lib/utils";

export type SceneOutlinerProps = {
  editor: EditorCore;
  entities: Entity[];
  nodes: GeometryNode[];
  hiddenIds: string[];
  lockedIds: string[];
  effectiveHiddenIds: string[];
  effectiveLockedIds: string[];
  selectedNodeIds: string[];
  interactive?: boolean;
  onSelectNodes: (ids: string[]) => void;
  onFocusNode: (id: string) => void;
  onToggleSceneItemLock: (id: string) => void;
  onToggleSceneItemVisibility: (id: string) => void;
  onAskAi?: (prompt: string) => void;
  /** Header slot for the dock/float/close buttons of the host. */
  headerActions?: ReactNode;
  onHeaderPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
};

type Row = {
  id: string;
  type: "node" | "entity";
  name: string;
  kind: string;
  depth: number;
  parentId?: string;
  childCount: number;
  isFolder: boolean;
  resource?: string;
};

/** Row height in px (Tailwind h-6). Rows are windowed: only the visible ones are in the DOM. */
const ROW_HEIGHT = 24;
const OVERSCAN = 12;

type DropTarget = { id: string | null; mode: "into" | "beside" | "root" } | null;

/** A folder is a plain group: not a library object, not a lake. */
function isPlainFolder(node: GeometryNode) {
  return node.kind === "group" && typeof node.metadata?.resource !== "string" && typeof node.metadata?.lakeOf !== "string";
}

function iconFor(row: Row): { Icon: ComponentType<{ className?: string }>; color: string } {
  if (row.type === "entity") return { Icon: row.kind === "player-spawn" ? User : Sparkles, color: "text-sky-300/80" };
  if (row.resource?.startsWith("lh:terrain")) return { Icon: Mountain, color: "text-emerald-300/80" };
  if (row.resource === "lh:lake") return { Icon: Waves, color: "text-sky-300/85" };
  if (row.resource && (row.resource.includes(":sky:") || row.resource.includes("hdri"))) return { Icon: CloudSun, color: "text-sky-300/80" };
  if (row.resource) return { Icon: Landmark, color: "text-amber-200/80" };
  switch (row.kind) {
    case "light":
      return { Icon: Lightbulb, color: "text-yellow-200/80" };
    case "mesh":
    case "brush":
      return { Icon: Boxes, color: "text-foreground/50" };
    case "model":
      return { Icon: Package, color: "text-violet-200/80" };
    case "primitive":
      return { Icon: Box, color: "text-foreground/50" };
    default:
      return { Icon: Bot, color: "text-foreground/50" };
  }
}

// ── Physics marks (game mode) ────────────────────────────────
const MARK_STYLE: Record<MarkMode, { Icon: ComponentType<{ className?: string }>; color: string; label: string }> = {
  solid: { Icon: BrickWall, color: "text-teal-300", label: "solid" },
  loose: { Icon: Move3d, color: "text-orange-300", label: "loose" },
  trunk: { Icon: TreePine, color: "text-lime-300", label: "tree trunk" },
  ghost: { Icon: Ghost, color: "text-foreground/40", label: "ghost" }
};

const NEXT_LABEL: Record<BodyMode | "default", string> = { default: "default", loose: "loose", ghost: "ghost (no collider)", solid: "solid" };

/** The mark at the right of a row: own collider (click cycles the mode) or the count under a folder. */
function PhysicsMark({
  own,
  override,
  tally,
  onCycle
}: {
  own?: { mode: MarkMode; shape?: string };
  override?: BodyMode;
  tally?: PhysicsTally;
  onCycle: () => void;
}) {
  if (own) {
    const style = MARK_STYLE[own.mode];
    const next = NEXT_LABEL[nextBodyMode(override)];
    const what = own.shape ? `${style.label}, ${own.shape} collider` : `${style.label}, no collider`;
    return (
      <button
        className="ml-1 flex size-5 shrink-0 items-center justify-center rounded hover:bg-white/10"
        // A drag from the mark is cancelled, so it never moves the row.
        draggable
        onClick={(e) => {
          e.stopPropagation();
          onCycle();
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        onDragStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        title={`Physics: ${what}${override ? " (set by you)" : ""}. Click: make it ${next}.`}
        type="button"
      >
        <style.Icon className={cn("size-3", style.color)} />
      </button>
    );
  }
  if (tally && tally.total > 0) {
    const style = MARK_STYLE[dominantMode(tally)];
    const parts = (["solid", "loose", "trunk", "ghost"] as MarkMode[]).filter((m) => tally[m] > 0).map((m) => `${tally[m]} ${MARK_STYLE[m].label}`);
    return (
      <span className="ml-1 flex shrink-0 items-center gap-0.5 text-[10px] tabular-nums text-foreground/45" title={`Physics inside: ${parts.join(", ")}`}>
        <style.Icon className={cn("size-3", style.color)} />
        {tally.total}
      </span>
    );
  }
  return null;
}

export function SceneOutliner(props: SceneOutlinerProps) {
  const {
    editor,
    entities,
    nodes,
    selectedNodeIds,
    interactive = true,
    onSelectNodes,
    onFocusNode,
    onToggleSceneItemLock,
    onToggleSceneItemVisibility,
    onAskAi
  } = props;
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  const [drop, setDrop] = useState<DropTarget>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const dragIds = useRef<string[]>([]);
  const listRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewHeight, setViewHeight] = useState(480);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setViewHeight(el.clientHeight));
    observer.observe(el);
    setViewHeight(el.clientHeight);
    return () => observer.disconnect();
  }, []);

  const selected = useMemo(() => new Set(selectedNodeIds), [selectedNodeIds]);
  const hidden = useMemo(() => new Set(props.effectiveHiddenIds), [props.effectiveHiddenIds]);
  const locked = useMemo(() => new Set(props.effectiveLockedIds), [props.effectiveLockedIds]);
  const explicitHidden = useMemo(() => new Set(props.hiddenIds), [props.hiddenIds]);
  const explicitLocked = useMemo(() => new Set(props.lockedIds), [props.lockedIds]);

  const graph = useMemo(() => resolveSceneGraph(nodes, entities), [entities, nodes]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const parentOf = useMemo(() => {
    const map = new Map<string, string | undefined>();
    nodes.forEach((n) => map.set(n.id, n.parentId));
    entities.forEach((e) => map.set(e.id, e.parentId));
    return map;
  }, [entities, nodes]);

  // Physics marks: one store read for the whole list, the folder counts in one pass.
  const physics = useSnapshot(gameStore);
  const bodies = physics.bodies;
  const overrides = physics.overrides;
  const physicsOn = Object.keys(bodies).length > 0;
  const physicsTally = useMemo(
    () => (physicsOn ? tallyBodiesByAncestor(bodies, overrides, (id) => parentOf.get(id)) : null),
    [bodies, overrides, parentOf, physicsOn]
  );

  // Open the folders above a NEW selection (for example a click in the viewport) and
  // bring it into view once. Scene edits do not move the list, so scrolling stays free.
  const selectionKey = selectedNodeIds.join("|");
  const pendingScrollId = useRef<string | null>(null);
  useEffect(() => {
    if (selectedNodeIds.length === 0) return;
    setExpanded((current) => {
      const next = new Set(current);
      let changed = false;
      for (const id of selectedNodeIds) {
        for (let p = parentOf.get(id); p; p = parentOf.get(p)) {
          if (!next.has(p)) {
            next.add(p);
            changed = true;
          }
        }
      }
      return changed ? next : current;
    });
    pendingScrollId.current = selectedNodeIds[0]!;
    // parentOf is read for the new selection only; it is not a trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionKey]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = new Set<string>();
    if (q) {
      for (const n of nodes) if (n.name.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)) matches.add(n.id);
      for (const e of entities) if (e.name.toLowerCase().includes(q) || e.id.toLowerCase().includes(q)) matches.add(e.id);
      for (const id of [...matches]) for (let p = parentOf.get(id); p; p = parentOf.get(p)) matches.add(p);
    }
    const count = (id: string): number => {
      const kids = graph.nodeChildrenByParentId.get(id) ?? [];
      const ents = graph.entityChildrenByParentId.get(id) ?? [];
      return kids.length + ents.length + kids.reduce((s, k) => s + count(k), 0);
    };
    const out: Row[] = [];
    // Like Blender: folders first, then objects, each sorted by name.
    const isFolderNode = (id: string) => {
      const n = nodeById.get(id);
      return !!n && isPlainFolder(n);
    };
    const sorted = (ids: readonly string[]) =>
      [...ids].sort((a, b) => {
        const fa = isFolderNode(a) ? 0 : 1;
        const fb = isFolderNode(b) ? 0 : 1;
        if (fa !== fb) return fa - fb;
        return (nodeById.get(a)?.name ?? "").localeCompare(nodeById.get(b)?.name ?? "", undefined, { numeric: true, sensitivity: "base" });
      });
    const addNode = (id: string, depth: number) => {
      const node = nodeById.get(id);
      if (!node || (q && !matches.has(id))) return;
      const kids = graph.nodeChildrenByParentId.get(id) ?? [];
      const ents = graph.entityChildrenByParentId.get(id) ?? [];
      const isFolder = isPlainFolder(node);
      out.push({
        id,
        type: "node",
        name: node.name,
        kind: node.kind,
        depth,
        parentId: node.parentId,
        childCount: isFolder ? count(id) : kids.length + ents.length,
        isFolder: isFolder || kids.length + ents.length > 0,
        resource:
          typeof node.metadata?.resource === "string" ? node.metadata.resource : typeof node.metadata?.lakeOf === "string" ? "lh:lake" : undefined
      });
      if (!q && !expanded.has(id)) return;
      sorted(kids).forEach((k) => addNode(k, depth + 1));
      ents.forEach((e) => addEntity(e, depth + 1));
    };
    const addEntity = (id: string, depth: number) => {
      const entity = entities.find((e) => e.id === id);
      if (!entity || (q && !matches.has(id))) return;
      out.push({ id, type: "entity", name: entity.name, kind: entity.type, depth, parentId: entity.parentId, childCount: 0, isFolder: false });
    };
    sorted(graph.rootNodeIds).forEach((id) => addNode(id, 0));
    graph.rootEntityIds.forEach((id) => addEntity(id, 0));
    return out;
  }, [entities, expanded, graph, nodeById, nodes, parentOf, query]);

  // Bring a new selection into view (rows are windowed, so scroll by index).
  useEffect(() => {
    const id = pendingScrollId.current;
    const el = listRef.current;
    if (!id || !el) return;
    const index = rows.findIndex((r) => r.id === id);
    if (index < 0) return;
    pendingScrollId.current = null;
    const top = index * ROW_HEIGHT;
    if (top < el.scrollTop || top + ROW_HEIGHT > el.scrollTop + el.clientHeight) el.scrollTop = Math.max(0, top - el.clientHeight / 3);
  }, [rows]);

  const windowStart = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const windowEnd = Math.min(rows.length, Math.ceil((scrollTop + viewHeight) / ROW_HEIGHT) + OVERSCAN);
  const visibleRows = rows.slice(windowStart, windowEnd);

  const folderIds = useMemo(() => nodes.filter((n) => (graph.nodeChildrenByParentId.get(n.id) ?? []).length > 0).map((n) => n.id), [graph, nodes]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice((current) => (current === text ? null : current)), 2600);
  };

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const selectRow = (row: Row, event: React.MouseEvent) => {
    if (!interactive || hidden.has(row.id) || locked.has(row.id)) return;
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      onSelectNodes(selected.has(row.id) ? selectedNodeIds.filter((id) => id !== row.id) : [...selectedNodeIds, row.id]);
    } else onSelectNodes([row.id]);
  };

  const deleteIds = (ids: string[]) => {
    if (ids.length === 0) return;
    editor.execute(createDeleteSelectionCommand(editor.scene, ids));
  };

  const groupSelection = () => {
    const ids = selectedNodeIds.filter((id) => nodeById.has(id));
    if (ids.length === 0) {
      flash("Select objects first (Shift-click to pick several).");
      return;
    }
    const id = groupNodes(editor, ids, "Folder");
    if (id) {
      setExpanded((c) => new Set(c).add(id));
      setRenaming(id);
      onSelectNodes([id]);
    }
  };

  const newFolder = () => {
    if (selectedNodeIds.some((id) => nodeById.has(id))) return groupSelection();
    // An empty folder at the top level.
    const id = `node:group:${Date.now().toString(36)}`;
    editor.execute({
      label: "new folder",
      execute(scene) {
        scene.addNode({ id, kind: "group", name: "Folder", data: {}, transform: { position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } } });
      },
      undo(scene) {
        scene.removeNode(id);
      }
    });
    setRenaming(id);
  };

  // ── Drag and drop ──────────────────────────────────────────
  const onDragStart = (row: Row, e: DragEvent) => {
    if (row.type !== "node" || locked.has(row.id)) {
      e.preventDefault();
      return;
    }
    dragIds.current = selected.has(row.id) ? selectedNodeIds.filter((id) => nodeById.has(id)) : [row.id];
    e.dataTransfer.effectAllowed = "copyMove";
    e.dataTransfer.setData("text/plain", row.name);
    // Dropped on Ask Theras, the row becomes context for a question.
    writeAiContext(e.dataTransfer, {
      kind: row.isFolder && !row.resource ? "folder" : "object",
      label: row.name,
      detail: `${row.id}${row.resource ? `, library ${row.resource}` : `, ${row.kind}`}${row.childCount ? `, ${row.childCount} inside` : ""}`
    });
  };

  const canDropInto = (targetId: string) =>
    dragIds.current.length > 0 &&
    !dragIds.current.includes(targetId) &&
    !dragIds.current.some((id) => {
      for (let p = parentOf.get(targetId); p; p = parentOf.get(p)) if (p === id) return true;
      return false;
    });

  const onRowDragOver = (row: Row, e: DragEvent) => {
    if (dragIds.current.length === 0 || row.type !== "node") return;
    const node = nodeById.get(row.id);
    const intoFolder = !!node && isPlainFolder(node);
    const target: DropTarget = intoFolder ? { id: row.id, mode: "into" } : { id: row.parentId ?? null, mode: row.parentId ? "beside" : "root" };
    if (target.id && !canDropInto(target.id)) return;
    e.preventDefault();
    e.stopPropagation();
    setDrop(intoFolder ? target : { ...target, id: row.id });
  };

  const onRowDrop = (row: Row, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const node = nodeById.get(row.id);
    const intoFolder = !!node && isPlainFolder(node);
    const parentId = intoFolder ? row.id : row.parentId;
    if (moveNodesTo(editor, dragIds.current, parentId)) {
      if (parentId) setExpanded((c) => new Set(c).add(parentId));
    }
    dragIds.current = [];
    setDrop(null);
  };

  const onRootDrop = (e: DragEvent) => {
    e.preventDefault();
    moveNodesTo(editor, dragIds.current, undefined);
    dragIds.current = [];
    setDrop(null);
  };

  // ── Context menu ───────────────────────────────────────────
  const menuRow = menu ? rows.find((r) => r.id === menu.id) : undefined;
  const menuNode = menu ? nodeById.get(menu.id) : undefined;
  const menuItems: { label: string; icon: ComponentType<{ className?: string }>; run: () => void; danger?: boolean; hidden?: boolean }[] = menu
    ? [
        { label: "Rename", icon: Pencil, run: () => setRenaming(menu.id), hidden: menuRow?.type !== "node" },
        { label: "Focus in view", icon: Crosshair, run: () => onFocusNode(menu.id) },
        { label: "Group into folder", icon: FolderPlus, run: groupSelection },
        { label: "Move to top level", icon: FolderInput, run: () => moveNodesTo(editor, [menu.id], undefined), hidden: !menuRow?.parentId },
        { label: "Ungroup (keep contents)", icon: FolderX, run: () => ungroup(editor, menu.id), hidden: !menuNode || !isPlainFolder(menuNode) },
        {
          label: "Select contents",
          icon: Boxes,
          run: () => onSelectNodes(nodes.filter((n) => n.parentId === menu.id).map((n) => n.id)),
          hidden: !menuRow?.childCount
        },
        {
          label: menuRow?.childCount ? `Delete with contents (${menuRow.childCount})` : "Delete",
          icon: Trash2,
          run: () => deleteIds(selected.has(menu.id) ? selectedNodeIds : [menu.id]),
          danger: true
        }
      ]
    : [];

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("pointerdown", close);
    window.addEventListener("blur", close);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("blur", close);
    };
  }, [menu]);

  const toolButton = "flex size-7 items-center justify-center rounded-md text-foreground/50 transition-colors hover:bg-white/8 hover:text-foreground disabled:opacity-30";

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        className={cn("flex shrink-0 items-center justify-between border-b border-white/8 px-2.5 py-1.5", props.onHeaderPointerDown && "cursor-grab select-none active:cursor-grabbing")}
        onPointerDown={props.onHeaderPointerDown}
      >
        <div className="text-[11px] font-medium tracking-[0.18em] text-foreground/55 uppercase">Scene tree</div>
        <div className="flex items-center gap-0.5" onPointerDown={(e) => e.stopPropagation()}>
          {props.headerActions}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 px-2 pt-2">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground/30" />
          <input
            className="h-7 w-full rounded-md border border-white/8 bg-white/5 pl-7 pr-2 text-[11px] text-foreground outline-none placeholder:text-foreground/30 focus:border-emerald-400/40"
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or ID"
            value={query}
          />
        </div>
        <button className={toolButton} onClick={newFolder} title="New folder (groups the selection if something is selected)" type="button">
          <FolderPlus className="size-3.5" />
        </button>
        <button
          className={toolButton}
          onClick={() => {
            const n = organizeByName(editor);
            flash(n ? `Made ${n} folders from shared names. Undo restores the old tree.` : "Nothing to organize by name.");
          }}
          title="Organize by name: puts loose objects that share a name (Bridge, Wall, Tower) into folders"
          type="button"
        >
          <Wand2 className="size-3.5" />
        </button>
        {onAskAi ? (
          <button
            className={toolButton}
            onClick={() =>
              onAskAi(
                "Organize the scene tree like Blender collections. Use list_nodes, then group related objects into clearly named folders and nest them (for example Castle > Tower, Castle > Walls, Castle > Bridge). Do not move, add or delete any objects; only group, move_to_group and rename_node. Leave the environment and the island terrain at the top level."
              )
            }
            title="Organize with AI: the AI groups objects by what they are (Castle > Walls, Tower...)"
            type="button"
          >
            <Sparkles className="size-3.5" />
          </button>
        ) : null}
        <button
          className={toolButton}
          onClick={() => setExpanded((c) => (c.size > 0 ? new Set() : new Set(folderIds)))}
          title={expanded.size > 0 ? "Collapse all" : "Expand all"}
          type="button"
        >
          {expanded.size > 0 ? <ChevronsDownUp className="size-3.5" /> : <ChevronsUpDown className="size-3.5" />}
        </button>
      </div>
      {notice ? <div className="px-3 pt-1.5 text-[10px] text-emerald-300">{notice}</div> : null}

      <div
        className={cn("min-h-0 flex-1 overflow-y-auto px-1.5 pb-6 pt-1.5", drop?.mode === "root" && "bg-emerald-500/5")}
        onDragOver={(e) => {
          if (dragIds.current.length === 0) return;
          e.preventDefault();
          setDrop({ id: null, mode: "root" });
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDrop(null);
        }}
        onDrop={onRootDrop}
        onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
        ref={listRef}
      >
        <div style={{ height: windowStart * ROW_HEIGHT }} />
        {visibleRows.map((row) => {
          const { Icon, color } = iconFor(row);
          const FolderIcon = expanded.has(row.id) ? FolderOpen : Folder;
          const node = row.type === "node" ? nodeById.get(row.id) : undefined;
          const isGroupFolder = !!node && isPlainFolder(node);
          const isSelected = selected.has(row.id);
          const isHidden = hidden.has(row.id);
          const isLocked = locked.has(row.id);
          const isDropInto = drop?.mode === "into" && drop.id === row.id;
          const isDropBeside = drop?.mode === "beside" && drop.id === row.id;
          return (
            <div
              className={cn(
                "group relative flex h-6 shrink-0 items-center rounded-md pr-1 text-[11.5px] transition-colors",
                isSelected ? "bg-emerald-500/18 text-emerald-100" : "text-foreground/75 hover:bg-white/5",
                isHidden && "opacity-50",
                isDropInto && "ring-1 ring-emerald-400/70 bg-emerald-500/12",
                isDropBeside && "shadow-[inset_0_-2px_0_rgba(52,211,153,0.7)]"
              )}
              data-no-ai-drag
              data-row-id={row.id}
              draggable={interactive && row.type === "node"}
              key={row.id}
              onClick={(e) => selectRow(row, e)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (!selected.has(row.id)) onSelectNodes([row.id]);
                setMenu({ x: e.clientX, y: e.clientY, id: row.id });
              }}
              onDragEnd={() => {
                dragIds.current = [];
                setDrop(null);
              }}
              onDragOver={(e) => onRowDragOver(row, e)}
              onDragStart={(e) => onDragStart(row, e)}
              onDrop={(e) => onRowDrop(row, e)}
            >
              {/* Indent guides */}
              {Array.from({ length: row.depth }, (_, i) => (
                <span className="h-full w-3.5 shrink-0 border-l border-white/8" key={i} style={{ marginLeft: i === 0 ? 7 : 0 }} />
              ))}
              {row.isFolder ? (
                <button
                  className="flex size-5 shrink-0 items-center justify-center rounded text-foreground/40 hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle(row.id);
                  }}
                  type="button"
                >
                  {expanded.has(row.id) ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                </button>
              ) : (
                <span className="size-5 shrink-0" />
              )}
              {isGroupFolder ? <FolderIcon className="mr-1.5 size-3.5 shrink-0 text-amber-300/85" /> : <Icon className={cn("mr-1.5 size-3.5 shrink-0", color)} />}

              {renaming === row.id ? (
                <input
                  autoFocus
                  className="h-5 min-w-0 flex-1 rounded border border-emerald-400/50 bg-black/40 px-1 text-[11.5px] text-foreground outline-none"
                  defaultValue={row.name}
                  onBlur={(e) => {
                    renameNode(editor, row.id, e.currentTarget.value);
                    setRenaming(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") e.currentTarget.blur();
                    if (e.key === "Escape") setRenaming(null);
                  }}
                />
              ) : (
                <span
                  className="min-w-0 flex-1 truncate"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    if (row.type === "node") setRenaming(row.id);
                  }}
                  title={`${row.name} (${row.resource ?? row.kind}). Double-click to rename.`}
                >
                  {row.name}
                </span>
              )}
              {row.childCount > 0 ? <span className="ml-1 shrink-0 text-[10px] tabular-nums text-foreground/30">{row.childCount}</span> : null}
              {physicsTally && row.type === "node" ? (
                <PhysicsMark
                  onCycle={() => setBodyMode([row.id], nextBodyMode(overrides[row.id]))}
                  override={overrides[row.id]}
                  own={
                    bodies[row.id]
                      ? { mode: bodies[row.id]!.mode, shape: bodies[row.id]!.shape }
                      : overrides[row.id] === "ghost"
                        ? { mode: "ghost" }
                        : undefined
                  }
                  tally={physicsTally.get(row.id)}
                />
              ) : null}

              <div className="ml-1 flex shrink-0 items-center">
                <button
                  className={cn("flex size-5 items-center justify-center rounded text-foreground/35 hover:text-foreground", isHidden && explicitHidden.has(row.id) && "text-emerald-300")}
                  disabled={!interactive}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSceneItemVisibility(row.id);
                  }}
                  title={isHidden ? "Show" : "Hide"}
                  type="button"
                >
                  {isHidden ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
                </button>
                <button
                  className={cn(
                    "flex size-5 items-center justify-center rounded text-foreground/35 hover:text-foreground",
                    isLocked ? explicitLocked.has(row.id) && "text-emerald-300" : "opacity-0 group-hover:opacity-100"
                  )}
                  disabled={!interactive}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleSceneItemLock(row.id);
                  }}
                  title={isLocked ? "Unlock" : "Lock (cannot be selected)"}
                  type="button"
                >
                  {isLocked ? <Lock className="size-3" /> : <LockOpen className="size-3" />}
                </button>
                <button
                  className="flex size-5 items-center justify-center rounded text-foreground/35 opacity-0 hover:text-rose-300 group-hover:opacity-100"
                  disabled={!interactive || isLocked}
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteIds([row.id]);
                  }}
                  title={row.childCount ? `Delete with contents (${row.childCount}). Undo restores it.` : "Delete. Undo restores it."}
                  type="button"
                >
                  <Trash2 className="size-3" />
                </button>
              </div>
            </div>
          );
        })}
        <div style={{ height: (rows.length - windowEnd) * ROW_HEIGHT }} />
        {rows.length === 0 ? <div className="px-2 py-4 text-center text-[11px] text-foreground/35">{query ? "No match." : "The scene is empty."}</div> : null}
        {drop !== null ? (
          <div className="mt-2 rounded-md border border-dashed border-white/15 px-2 py-2 text-center text-[10px] text-foreground/40">
            Drop here to move to the top level
          </div>
        ) : null}
      </div>

      {/* Portal: a blurred (glass) parent would otherwise move this fixed menu. */}
      {menu ? createPortal(
        <div
          className="fixed z-[80] w-max min-w-56 overflow-hidden rounded-xl border border-white/12 bg-[#0d1714]/95 py-1 shadow-2xl backdrop-blur-xl"
          onPointerDown={(e) => e.stopPropagation()}
          style={{ left: Math.min(menu.x, window.innerWidth - 240), top: Math.max(8, Math.min(menu.y, window.innerHeight - 250)) }}
        >
          {menuItems
            .filter((item) => !item.hidden)
            .map((item) => (
              <button
                className={cn(
                  "flex w-full items-center gap-2 whitespace-nowrap px-3 py-1.5 text-left text-[12px] hover:bg-white/8",
                  item.danger ? "text-rose-300" : "text-foreground/80"
                )}
                key={item.label}
                onClick={() => {
                  setMenu(null);
                  item.run();
                }}
                type="button"
              >
                <item.icon className="size-3.5" />
                {item.label}
              </button>
            ))}
        </div>,
        document.body
      ) : null}
    </div>
  );
}
