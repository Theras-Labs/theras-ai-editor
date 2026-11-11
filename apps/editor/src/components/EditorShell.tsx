import type { EditorCore, SceneSpatialAnalysis } from "@theras/editor-core";
import { gridSnapValues, type DerivedRenderScene } from "@theras/render-pipeline";
import { isInstancingSourceNode } from "@theras/shared";
import type {
  SceneSettings,
  TextureRecord,
} from "@theras/shared";
import { defaultTools } from "@theras/tool-system";
import type { WorkerJob } from "@theras/workers";
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useSnapshot } from "valtio";
import type { CopilotSession } from "@/lib/copilot/types";
import { useEditorActionDomains } from "@/app/editor-action-domains";
import { AiModelPromptBar } from "@/components/editor-shell/AiModelPromptBar";
import { CopilotPanel } from "@/components/editor-shell/CopilotPanel";
import { ChoicePopup } from "@/components/editor-shell/ChoicePopup";
import { BuildDock } from "@/components/editor-shell/BuildDock";
import { Movable } from "@/components/editor-shell/Movable";
import { SceneTreeSidebar } from "@/components/editor-shell/SceneTreeSidebar";
import { uiLayoutStore } from "@/state/ui-layout-store";
import { FloatingWindow } from "@/components/editor-shell/FloatingWindow";
import type { ConversationMeta } from "@/lib/copilot/chat-history";
import type { CopilotAttachment } from "@/lib/copilot/attachments";
import { installUiDragContext } from "@/lib/ai-context";
import { displayKeys, installShortcuts, keysFor, shortcutStore } from "@/lib/shortcuts";
import { ShortcutsDialog } from "@/components/editor-shell/ShortcutsDialog";
import { TemplateGallery } from "@/components/editor-shell/TemplateGallery";
import { SavedScenesDialog } from "@/components/editor-shell/SavedScenesDialog";
import { PostFxPanel } from "@/components/editor-shell/PostFxPanel";
import { Toaster } from "sonner";
import { animationStore } from "@/lib/animation-clock";
import { gameHidesEditor, gameStore, toggleGameMode } from "@/lib/game/game-store";
import { GameHud } from "@/components/editor-shell/GameHud";
import { rescanSavedProjects } from "@/lib/projects/projects";
import { ChevronDown } from "lucide-react";
import { PromptBar, PromptBubble, type AskTherasProps } from "@/components/editor-shell/CopilotPanel";
import { askTherasStore, closeAskTheras, openAskPrompt, setAskLayout, toggleAskTheras } from "@/state/ask-theras";
import { registerSlotEditor } from "@/lib/build-slots/runner";
import { migrateIslandLakes, registerResourceEditor } from "@/lib/resources/place";
import { registerTerrainEditor } from "@/lib/resources/terrain-edit";
import { EditorMenuBar } from "@/components/editor-shell/EditorMenuBar";
import { InspectorSidebar } from "@/components/editor-shell/InspectorSidebar";
import { StatusBar } from "@/components/editor-shell/StatusBar";
import { ToolPaletteContainer } from "@/components/editor-shell/ToolPaletteContainer";
import { LogicViewerSheet } from "@/components/editor-shell/logic-viewer/LogicViewerSheet";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import type { ModelAssetLibraryItem } from "@/lib/model-assets";
import { ConnectedViewportCanvas } from "@/viewport/ConnectedViewportCanvas";
import { projectSessionStore } from "@/state/project-session-store";
import { sceneSessionStore } from "@/state/scene-session-store";
import { toolSessionStore } from "@/state/tool-session-store";
import { uiStore, type ViewportQuality } from "@/state/ui-store";
import {
  getViewModePreset,
  viewportPaneDefinitions,
  type ViewModeId,
  type ViewportPaneId,
} from "@/viewport/viewports";
import { cn } from "@/lib/utils";

type EditorShellProps = {
  copilot: {
    session: CopilotSession;
    sendMessage: (prompt: string, attachments?: CopilotAttachment[]) => void;
    abort: () => void;
    clearHistory: () => void;
    isConfigured: boolean;
    lastRunChanges: number;
    refreshConfigured: () => void;
    refineWithAi?: (messageId: string, prompt: string) => void;
    undoLastRun: () => void;
    conversationId: string;
    conversations: ConversationMeta[];
    openConversation: (id: string) => void;
    deleteConversation: (id: string) => void;
  };
  gameConnectionControl?: ReactNode;
  analysis: SceneSpatialAnalysis;
  editor: EditorCore;
  effectiveHiddenSceneItemIds: string[];
  effectiveLockedSceneItemIds: string[];
  jobs: WorkerJob[];
  modelAssets: ModelAssetLibraryItem[];
  renderScene: DerivedRenderScene;
  sceneSettings: SceneSettings;
  textures: TextureRecord[];
  workingSet: {
    activeDocumentId?: string;
    loadedDocumentIds: string[];
    mode: "scene" | "world";
    pinnedDocumentIds: string[];
  };
};

export function EditorShell({
  copilot,
  gameConnectionControl,
  analysis,
  editor,
  effectiveHiddenSceneItemIds,
  effectiveLockedSceneItemIds,
  jobs,
  modelAssets,
  renderScene,
  sceneSettings,
  textures,
  workingSet
}: EditorShellProps) {
  void analysis;
  const {
    aiActions,
    assetActions,
    fileActions,
    history,
    placementActions,
    sceneActions,
    selectionActions
  } = useEditorActionDomains();
  const { canRedo, canUndo, redo: onRedo, undo: onUndo } = history;
  const {
    cancelPlacement: onCancelAiModelPlacement,
    generateModel: onGenerateAiModel,
    updatePrompt: onUpdateAiModelPrompt
  } = aiActions;
  const {
    applyMaterial: onApplyMaterial,
    assignAssetLod: onAssignAssetLod,
    clearAssetLod: onClearAssetLod,
    deleteAsset: onDeleteAsset,
    deleteMaterial: onDeleteMaterial,
    deleteTexture: onDeleteTexture,
    dropImportGlb: onDropImportGlb,
    focusAssetNodes: onFocusAssetNodes,
    importAsset: onImportAsset,
    insertAsset: onInsertAsset,
    selectAsset: onSelectAsset,
    selectMaterial: onSelectMaterial,
    setUvOffset: onSetUvOffset,
    setUvRotation: onSetUvRotation,
    setUvScale: onSetUvScale,
    upsertMaterial: onUpsertMaterial,
    upsertTexture: onUpsertTexture
  } = assetActions;
  const {
    createBrush: onCreateBrush,
    exportEngine: onExportEngine,
    exportGltf: onExportGltf,
    exportSceneDocument: onExportSceneDocument,
    importSceneDocument: onImportSceneDocument,
    loadWhmap: onLoadWhmap,
    newFile: onNewFile,
    saveWhmap: onSaveWhmap
  } = fileActions;
  const {
    placeAsset: onPlaceAsset,
  } = placementActions;
  const {
    meshEditToolbarAction: onMeshEditToolbarAction,
    updateEntityHooks: onUpdateEntityHooks,
    updateEntityProperties: onUpdateEntityProperties,
    updateEntityTransform: onUpdateEntityTransform,
    updateMeshData: onUpdateMeshData,
    updateNodeData: onUpdateNodeData,
    updateNodeHooks: onUpdateNodeHooks,
    updateNodeTransform: onUpdateNodeTransform,
    updateSceneSettings: onUpdateSceneSettings
  } = sceneActions;
  const {
    clearSelection: onClearSelection,
    clipSelection: onClipSelection,
    deleteSelection: onDeleteSelection,
    duplicateSelection: onDuplicateSelection,
    extrudeSelection: onExtrudeSelection,
    focusNode: onFocusNode,
    groupSelection: onGroupSelection,
    mirrorSelection: onMirrorSelection,
    selectNodes: onSelectNodes,
    toggleSceneItemLock: onToggleSceneItemLock,
    toggleSceneItemVisibility: onToggleSceneItemVisibility,
    translateSelection: onTranslateSelection
  } = selectionActions;
  const ui = useSnapshot(uiStore);
  const game = useSnapshot(gameStore);
  // Game mode hides the editor only while the user plays; the wrap phase and the tools view show it.
  const hideEditor = gameHidesEditor(game);
  const toolSession = useSnapshot(toolSessionStore);
  const projectSession = useSnapshot(projectSessionStore);
  const sceneSession = useSnapshot(sceneSessionStore);
  const {
    activeBrushShape,
    activeToolId,
    aiModelDraft,
    aiModelPlacementArmed,
    brushToolMode,
    instanceBrushAlignToNormal,
    instanceBrushAverageNormal,
    instanceBrushDensity,
    instanceBrushRandomness,
    instanceBrushSize,
    instanceBrushSourceNodeId,
    instanceBrushSourceNodeIds,
    instanceBrushYOffsetMin,
    instanceBrushYOffsetMax,
    instanceBrushScaleMin,
    instanceBrushScaleMax,
    materialPaintBrushOpacity,
    materialPaintMode,
    meshEditMode,
    meshEditToolbarAction,
    physicsPlayback,
    physicsRevision,
    sculptBrushRadius,
    sculptBrushStrength,
    sculptMode,
    transformMode
  } = toolSession;
  const activeRightPanel = ui.rightPanel;
  const activeViewportId = ui.activeViewportId;
  const renderMode = ui.renderMode;
  const selectedAssetId = ui.selectedAssetId;
  const selectedMaterialId = ui.selectedMaterialId;
  const viewMode = ui.viewMode;
  const viewportQuality = ui.viewportQuality;
  const viewports = ui.viewports;
  const hiddenSceneItemIds = sceneSession.hiddenSceneItemIds;
  const lockedSceneItemIds = sceneSession.lockedSceneItemIds;
  const selectedFaceIds = sceneSession.selectedMaterialFaceIds;
  const selectedScenePathId = sceneSession.selectedScenePathId;
  // Playing hides the selection (and its boxes); the selection itself is kept for later.
  const selectionEnabled = physicsPlayback === "stopped" && !hideEditor;
  const nodes = Array.from(editor.scene.nodes.values());
  const entities = Array.from(editor.scene.entities.values());
  const materials = Array.from(editor.scene.materials.values());
  const selectedObjectId = selectionEnabled ? editor.selection.ids[0] : undefined;
  const selectedNodeId = selectedObjectId && editor.scene.getNode(selectedObjectId) ? selectedObjectId : undefined;
  const selectedNode = selectedNodeId ? editor.scene.getNode(selectedNodeId) : undefined;
  const selectedEntity = !selectedNodeId && selectedObjectId ? editor.scene.getEntity(selectedObjectId) : undefined;
  const selectedNodeIds = selectionEnabled ? editor.selection.ids : [];
  const selectedNodes = selectedNodeIds
    .map((nodeId) => editor.scene.getNode(nodeId))
    .filter((node): node is NonNullable<typeof node> => Boolean(node));
  const activeToolLabel = defaultTools.find((tool) => tool.id === activeToolId)?.label ?? activeToolId;
  const activeViewport = viewports[activeViewportId];
  const aiModelPlacementActive = Boolean(aiModelDraft);
  const aiModelPrompt = aiModelDraft?.prompt ?? "";
  const aiModelPromptError = aiModelDraft?.error;
  const instanceBrushSourceNode = useMemo(
    () => nodes.find((node) => node.id === instanceBrushSourceNodeId && isInstancingSourceNode(node)),
    [instanceBrushSourceNodeId, nodes]
  );
  const instanceBrushSourceTransform = useMemo(() => {
    if (!instanceBrushSourceNode) {
      return undefined;
    }

    return (
      renderScene.nodeTransforms.get(instanceBrushSourceNode.id) ??
      (workingSet.mode === "world" && workingSet.activeDocumentId
        ? renderScene.nodeTransforms.get(`${workingSet.activeDocumentId}::${instanceBrushSourceNode.id}`)
        : undefined) ??
      instanceBrushSourceNode.transform
    );
  }, [instanceBrushSourceNode, renderScene.nodeTransforms, workingSet.activeDocumentId, workingSet.mode]);

  const viewportAreaRef = useRef<HTMLDivElement | null>(null);
  const [glbDragOver, setGlbDragOver] = useState(false);

  const handleViewportDragOver = (event: DragEvent<HTMLDivElement>) => {
    const hasGlb = Array.from(event.dataTransfer.items).some(
      (item) =>
        item.kind === "file" &&
        (item.type === "model/gltf-binary" ||
          item.type === "model/gltf+json" ||
          item.type === "") // browsers often report empty type for binary files
    );

    if (hasGlb || event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setGlbDragOver(true);
    }
  };

  const handleViewportDragLeave = (event: DragEvent<HTMLDivElement>) => {
    if (!viewportAreaRef.current?.contains(event.relatedTarget as Node)) {
      setGlbDragOver(false);
    }
  };

  const handleViewportDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setGlbDragOver(false);

    const files = Array.from(event.dataTransfer.files).filter((file) => {
      const lower = file.name.toLowerCase();
      return lower.endsWith(".glb") || lower.endsWith(".gltf") || lower.endsWith(".obj");
    });

    if (files.length === 0) {
      return;
    }

    const canvasRect = viewportAreaRef.current?.getBoundingClientRect();

    if (!canvasRect) {
      return;
    }

    void onDropImportGlb(files, event.clientX, event.clientY, canvasRect);
  };

  const handleToggleViewportQuality = () => {
    uiStore.viewportQuality =
      uiStore.viewportQuality === 0.5
        ? 0.75
        : uiStore.viewportQuality === 0.75
          ? 1
          : uiStore.viewportQuality === 1
            ? 1.5
            : 0.5;
  };

  // Show or hide the text prompt (the View menu). The rules are in state/ask-theras.ts.
  const handleToggleCopilot = toggleAskTheras;

  const handleToggleLogicViewer = () => {
    uiStore.logicViewerOpen = !uiStore.logicViewerOpen;
  };

  const editorMenuActions = {
    onClearSelection,
    onCreateBrush,
    onDeleteSelection,
    onDuplicateSelection,
    onExportEngine,
    onExportGltf,
    onExportSceneDocument,
    onGroupSelection,
    onImportSceneDocument,
    onLoadWhmap,
    onNewFile,
    onRedo,
    onSaveWhmap,
    onToggleCopilot: handleToggleCopilot,
    onToggleLogicViewer: handleToggleLogicViewer,
    onToggleViewportQuality: handleToggleViewportQuality,
    onUndo
  };
  const inspectorActions = {
    onApplyMaterial,
    onAssignAssetLod,
    onChangeRightPanel: (panel: typeof activeRightPanel) => {
      uiStore.rightPanel = panel;
    },
    onClearAssetLod,
    onClipSelection,
    onDeleteAsset,
    onDeleteMaterial,
    onDeleteTexture,
    onExtrudeSelection,
    onFocusAssetNodes,
    onFocusNode,
    onImportAsset,
    onInsertAsset,
    onMeshEditToolbarAction,
    onMirrorSelection,
    onPlaceAsset,
    onSelectAsset,
    onSelectMaterial,
    onSelectNodes,
    onSetUvOffset,
    onSetUvRotation,
    onSetUvScale,
    onToggleSceneItemLock,
    onToggleSceneItemVisibility,
    onTranslateSelection,
    onUpdateEntityHooks,
    onUpdateEntityProperties,
    onUpdateEntityTransform,
    onUpdateMeshData,
    onUpdateNodeData,
    onUpdateNodeHooks,
    onUpdateNodeTransform,
    onUpdateSceneSettings,
    onUpsertMaterial,
    onUpsertTexture
  };
  const logicViewerActions = {
    onClose: handleToggleLogicViewer,
    onUpdateEntityHooks,
    onUpdateNodeHooks
  };

  const renderViewportPane = (viewportId: ViewportPaneId) => {
    const definition = viewportPaneDefinitions[viewportId];

    return (
      <ViewportPaneFrame
        key={viewportId}
        label={definition.shortLabel}
      >
        <ConnectedViewportCanvas
          hiddenSceneItemIds={effectiveHiddenSceneItemIds}
          instanceBrushSourceTransform={instanceBrushSourceTransform}
          renderScene={renderScene}
          sceneSettings={sceneSettings}
          selectedEntity={selectedEntity}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          selectedNodes={selectedNodes}
          viewportId={viewportId}
          viewportPlane={definition.plane}
        />
      </ViewportPaneFrame>
    );
  };



  // The AI panel can sit beside the viewport (docked) or float as a window.
  const layout = useSnapshot(uiLayoutStore);
  // The voice orb is never the start layout and is never what Cmd+L or the header prompt opens.
  const { layout: copilotLayout } = useSnapshot(askTherasStore);
  const setCopilotLayout = setAskLayout;
  const askTherasProps: AskTherasProps = {
    conversationId: copilot.conversationId,
    conversations: copilot.conversations,
    isConfigured: copilot.isConfigured,
    lastRunChanges: copilot.lastRunChanges,
    layout: copilotLayout,
    onAbort: copilot.abort,
    onClearHistory: copilot.clearHistory,
    onClose: closeAskTheras,
    onDeleteConversation: copilot.deleteConversation,
    onOpenConversation: copilot.openConversation,
    onRefine: copilot.refineWithAi,
    onSendMessage: copilot.sendMessage,
    onSetLayout: setCopilotLayout,
    onSettingsChanged: copilot.refreshConfigured,
    onUndoLastRun: copilot.undoLastRun,
    session: copilot.session
  };
  // Every titled button can be dragged into the Ask Theras prompt as context.
  useEffect(() => installUiDragContext(), []);

  // Keyboard shortcuts (the list and its keys are in lib/shortcuts.ts and the Shortcuts dialog).
  const shortcutHandlers = useRef<Record<string, () => void>>({});
  shortcutHandlers.current = {
    "toggle-tree": () => (uiLayoutStore.treeOpen = !uiLayoutStore.treeOpen),
    "toggle-dock": () => (uiLayoutStore.dockOpen = !uiLayoutStore.dockOpen),
    "toggle-toolbar": () => (uiLayoutStore.toolbarCollapsed = !uiLayoutStore.toolbarCollapsed),
    "toggle-library": () => {
      uiLayoutStore.dockOpen = true;
      uiLayoutStore.libraryOpen = !uiLayoutStore.libraryOpen;
    },
    "toggle-ui": () => (uiLayoutStore.hideUi = !uiLayoutStore.hideUi),
    "unlock-ui": () => (uiLayoutStore.unlocked = !uiLayoutStore.unlocked),
    "ask-bar": () => {
      setCopilotLayout("bar");
      openAskPrompt();
    },
    "new-chat": () => copilot.clearHistory(),
    "toggle-animate": () => (animationStore.playing = !animationStore.playing),
    // Selected objects become physics targets (loose bodies) for this game session.
    "toggle-game": () => toggleGameMode([...editor.selection.ids]),
    shortcuts: () => (shortcutStore.dialogOpen = true)
  };
  useEffect(
    () =>
      installShortcuts(
        Object.fromEntries(Object.keys(shortcutHandlers.current).map((id) => [id, () => shortcutHandlers.current[id]?.()]))
      ),
    []
  );

  // Imported projects: scan them again once at start (local server only), so their files load.
  useEffect(() => {
    void rescanSavedProjects();
  }, []);

  // Older islands get their separate lake node once per session, after the scene has loaded.
  const migratedIslands = useRef(new Set<string>());
  useEffect(() => {
    const pending = nodes.filter((n) => n.metadata?.terrain === true && !migratedIslands.current.has(n.id));
    if (pending.length === 0) return;
    pending.forEach((n) => migratedIslands.current.add(n.id));
    migrateIslandLakes(editor);
  }, [editor, nodes]);

  useEffect(() => {
    registerSlotEditor(editor);
    registerResourceEditor(editor);
    registerTerrainEditor(editor);
    return () => {
      registerTerrainEditor(null);
      registerSlotEditor(null);
      registerResourceEditor(null);
    };
  }, [editor]);

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,rgba(16,185,129,0.08),transparent_24%),linear-gradient(180deg,#08100d_0%,#050807_100%)] text-foreground">
      {/* Playing hides every editor panel; Ask Theras stays (the keys drive the player). */}
      {!hideEditor && (
      <header className="shrink-0 bg-black/18 backdrop-blur-xl">
        <EditorMenuBar
          {...editorMenuActions}
          aiStatus={copilot.session.status}
          canRedo={canRedo}
          canUndo={canUndo}
          copilotOpen={ui.copilotPanelOpen}
          gameConnectionControl={gameConnectionControl}
          logicViewerOpen={ui.logicViewerOpen}
          // Opens the text prompt, or puts the cursor in it when it is open. Never the voice orb alone.
          onAsk={openAskPrompt}
          onFocusSelection={() => {
            if (selectedObjectId) {
              onFocusNode(selectedObjectId);
            }
          }}
          onPlay={() => toggleGameMode([...editor.selection.ids])}
          viewportQuality={viewportQuality}
        />
      </header>
      )}

      <main className="relative flex min-h-0 flex-1 overflow-hidden">
        {!hideEditor && <SceneTreeSidebar
          editor={editor}
          effectiveHiddenIds={effectiveHiddenSceneItemIds}
          effectiveLockedIds={effectiveLockedSceneItemIds}
          entities={entities}
          hiddenIds={[...hiddenSceneItemIds]}
          interactive={selectionEnabled}
          lockedIds={[...lockedSceneItemIds]}
          nodes={nodes}
          onAskAi={(prompt) => {
            if (!ui.copilotPanelOpen) uiStore.copilotPanelOpen = true;
            void copilot.sendMessage(prompt);
          }}
          onFocusNode={onFocusNode}
          onSelectNodes={onSelectNodes}
          onToggleSceneItemLock={onToggleSceneItemLock}
          onToggleSceneItemVisibility={onToggleSceneItemVisibility}
          selectedNodeIds={selectedNodeIds}
        />}
        <div
          className="relative min-w-0 flex-1"
          onDragLeave={handleViewportDragLeave}
          onDragOver={handleViewportDragOver}
          onDrop={handleViewportDrop}
          ref={viewportAreaRef}
        >
          <div className="absolute inset-0">
            <ViewportLayout renderViewportPane={renderViewportPane} viewMode={game.active ? "3d-only" : viewMode} />
          </div>

          <GameHud editor={editor} nameOf={(id) => editor.scene.getNode(id)?.name} />

          {/* Choice popup in the middle of the viewport while no chat is open (the chat layouts show their own). */}
          {!ui.copilotPanelOpen && <ChoicePopup placement="center" />}

          {!hideEditor && <>
          <Movable id="dock" label="Build dock">
            <BuildDock
              onAskAi={(prompt) => {
                if (!ui.copilotPanelOpen) uiStore.copilotPanelOpen = true;
                void copilot.sendMessage(prompt);
              }}
            />
          </Movable>
          </>}

          {glbDragOver && (
            <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center rounded-sm border-2 border-dashed border-emerald-400/60 bg-emerald-500/8">
              <div className="rounded-2xl bg-black/60 px-6 py-4 text-center backdrop-blur-sm">
                <div className="text-sm font-medium text-emerald-200">Drop GLB to place in scene</div>
                <div className="mt-1 text-xs text-emerald-300/60">Natural scale — placed at cursor position</div>
              </div>
            </div>
          )}

        {!hideEditor && <>
        <Movable id="tools" label="Tool bar" leftInset={layout.treeOpen && layout.treeMode === "docked" ? layout.treeWidth : 0}>
          {layout.toolbarCollapsed ? (
            <div className="pointer-events-none absolute inset-x-0 top-4 z-20 flex justify-center">
              <button
                className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-white/15 bg-[#0b1512]/55 px-3 py-1.5 text-[11px] font-semibold text-white/80 shadow-lg backdrop-blur-xl hover:text-white"
                onClick={() => {
                  uiLayoutStore.toolbarCollapsed = false;
                }}
                title={`Show the tool bar (${displayKeys(keysFor("toggle-toolbar"))})`}
                type="button"
              >
                Tool bar <ChevronDown className="size-3.5" />
              </button>
            </div>
          ) : (
            <ToolPaletteContainer editor={editor} />
          )}
        </Movable>

        <AiModelPromptBar
          active={aiModelPlacementActive}
          armed={aiModelPlacementArmed}
          busy={false}
          error={aiModelPromptError}
          onCancel={onCancelAiModelPlacement}
          onChangePrompt={onUpdateAiModelPrompt}
          onSubmit={onGenerateAiModel}
          prompt={aiModelPrompt}
        />

        {/* <SpatialAnalysisPanel analysis={analysis} /> */}
        <Movable id="inspector" label="Inspector panels">
        <InspectorSidebar
          {...inspectorActions}
          activeRightPanel={activeRightPanel}
          activeToolId={activeToolId}
          effectiveHiddenSceneItemIds={effectiveHiddenSceneItemIds}
          effectiveLockedSceneItemIds={effectiveLockedSceneItemIds}
          entities={entities}
          hiddenSceneItemIds={[...hiddenSceneItemIds]}
          lockedSceneItemIds={[...lockedSceneItemIds]}
          materials={materials}
          meshEditMode={meshEditMode}
          modelAssets={modelAssets}
          nodes={nodes}
          onSelectScenePath={(pathId) => {
            sceneSessionStore.selectedScenePathId = pathId;
          }}
          onSetToolId={(toolId) => {
            toolSessionStore.activeToolId = toolId;
          }}
          sceneSettings={sceneSettings}
          selectedScenePathId={selectedScenePathId}
          selectionEnabled={selectionEnabled}
          selectedEntity={selectedEntity}
          selectedAssetId={selectedAssetId}
          selectedFaceIds={[...selectedFaceIds]}
          selectedMaterialId={selectedMaterialId}
          selectedNode={selectedNode}
          selectedNodeIds={selectedNodeIds}
          textures={textures}
          viewportTarget={activeViewport.camera.target}
        />
        </Movable>

        <StatusBar
          activeBrushShape={activeBrushShape}
          activeToolLabel={activeToolLabel}
          activeViewportId={activeViewportId}
          gridSnapValues={gridSnapValues}
          jobs={jobs}
          meshEditMode={meshEditMode}
          runtimeSyncDebugLabel={projectSession.runtimeSyncDebugLabel}
          selectedNode={selectedNode}
          viewModeLabel={getViewModePreset(viewMode).shortLabel}
          viewport={activeViewport}
        />

        </>}

        {ui.logicViewerOpen && !hideEditor && (
          <LogicViewerSheet
            {...logicViewerActions}
            entities={entities}
            nodes={nodes}
            onNodeClick={(objectId) => {
              onSelectNodes([objectId]);
              if (editor.scene.getNode(objectId)) {
                onFocusNode(objectId);
              }
            }}
          />
        )}
        </div>

        {ui.copilotPanelOpen && copilotLayout === "docked" && (
          // z-40: keeps the panel above the build dock (z-30) when a narrow viewport lets the dock overflow.
          <div className="relative z-40 w-80 shrink-0">
            <CopilotPanel {...askTherasProps} />
          </div>
        )}
        {ui.copilotPanelOpen && copilotLayout === "floating" && (
          <FloatingWindow storageKey="theras:copilot-window">
            {(onHeaderPointerDown) => <CopilotPanel {...askTherasProps} onHeaderPointerDown={onHeaderPointerDown} />}
          </FloatingWindow>
        )}
        {ui.copilotPanelOpen && copilotLayout === "bar" && <PromptBar {...askTherasProps} />}
        {ui.copilotPanelOpen && copilotLayout === "bubble" && <PromptBubble {...askTherasProps} />}
        <ShortcutsDialog />
        <TemplateGallery
          editor={editor}
          onAsk={(prompt, attachments) => {
            if (!ui.copilotPanelOpen) handleToggleCopilot();
            void copilot.sendMessage(prompt, attachments);
          }}
        />
        <SavedScenesDialog />
        <PostFxPanel editor={editor} sceneSettings={sceneSettings} />
        <Toaster offset={{ top: 52 }} position="top-center" theme="dark" toastOptions={{ className: "!bg-[#0b1311]/95 !border-white/10 !backdrop-blur-xl !text-[12px]" }} />
      </main>
    </div>
  );
}

function ViewportLayout({
  renderViewportPane,
  viewMode
}: {
  renderViewportPane: (viewportId: ViewportPaneId) => ReactNode;
  viewMode: ViewModeId;
}) {
  const preset = getViewModePreset(viewMode);

  if (preset.layout === "single") {
    return <div className="size-full">{renderViewportPane("perspective")}</div>;
  }

  if (preset.layout === "split") {
    return (
      <ResizablePanelGroup className="size-full" orientation="horizontal">
        <ResizablePanel defaultSize={62} minSize={35}>
          {renderViewportPane("perspective")}
        </ResizablePanel>
        <ViewportSplitHandle />
        <ResizablePanel defaultSize={38} minSize={20}>
          {renderViewportPane(preset.secondaryPaneId)}
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return (
    <ResizablePanelGroup className="size-full" orientation="horizontal">
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("top")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("perspective")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ViewportSplitHandle />
      <ResizablePanel defaultSize={50} minSize={32}>
        <ResizablePanelGroup className="size-full" orientation="vertical">
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("front")}
          </ResizablePanel>
          <ViewportSplitHandle direction="horizontal" />
          <ResizablePanel defaultSize={50} minSize={24}>
            {renderViewportPane("side")}
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}

function ViewportPaneFrame({
  children,
  label
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <div
      className={cn("relative size-full overflow-hidden bg-[#071016]")}
    >
      <div className="pointer-events-none absolute left-3 top-3 z-20 rounded-full bg-black/36 px-2.5 py-1 text-[10px] font-medium tracking-[0.18em] text-foreground/72 uppercase">
        {label}
      </div>
      {children}
    </div>
  );
}

function ViewportSplitHandle({ direction = "vertical" }: { direction?: "horizontal" | "vertical" }) {
  return (
    <ResizableHandle
      className="bg-white/8 after:bg-transparent hover:bg-emerald-400/22 data-dragging:bg-emerald-400/28"
      withHandle={direction === "vertical"}
    />
  );
}
