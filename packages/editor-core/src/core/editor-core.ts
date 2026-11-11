import { createCommandStack, type CommandStack } from "../commands/command-stack";
import {
  createSceneDocument,
  createSceneDocumentSnapshot,
  loadSceneDocumentSnapshot,
  type SceneDocument,
  type SceneDocumentSnapshot
} from "../document/scene-document";
import { createEventBus, type EventBus } from "../events/event-bus";
import {
  createSelectionState,
  type SelectionMode,
  type SelectionState
} from "../selection/selection";

type EditorEvents = {
  "scene:changed": { reason: string; revision: number; nodeIds: string[]; entityIds: string[] };
  "selection:changed": { mode: SelectionMode; ids: string[]; revision: number };
  "command:executed": { label: string; doneCount: number; undoneCount: number; revision: number };
  "command:undone": { label: string; doneCount: number; undoneCount: number; revision: number };
  "command:redone": { label: string; doneCount: number; undoneCount: number; revision: number };
};

export type EditorCore = {
  scene: SceneDocument;
  selection: SelectionState;
  commands: CommandStack;
  events: EventBus<EditorEvents>;
  addNode: (node: Parameters<SceneDocument["addNode"]>[0], reason?: string) => void;
  removeNode: (nodeId: string, reason?: string) => void;
  addEntity: (entity: Parameters<SceneDocument["addEntity"]>[0], reason?: string) => void;
  removeEntity: (entityId: string, reason?: string) => void;
  exportSnapshot: () => SceneDocumentSnapshot;
  importSnapshot: (snapshot: SceneDocumentSnapshot, reason?: string) => void;
  select: (ids: Iterable<string>, mode?: SelectionMode) => void;
  clearSelection: () => void;
  execute: (command: Parameters<CommandStack["push"]>[0]) => void;
  undo: () => void;
  redo: () => void;
};

export function createEditorCore(scene = createSceneDocument()): EditorCore {
  const selection = createSelectionState();
  const commands = createCommandStack();
  const events = createEventBus<EditorEvents>();

  const emitSceneChange = (reason: string, nodeIds: string[] = [], entityIds: string[] = []) => {
    events.emit("scene:changed", {
      reason,
      revision: scene.revision,
      nodeIds,
      entityIds
    });
  };

  const emitSelectionChange = () => {
    events.emit("selection:changed", {
      mode: selection.mode,
      ids: [...selection.ids],
      revision: selection.revision
    });
  };

  const emitCommandChange = (eventType: "command:executed" | "command:undone" | "command:redone", label: string) => {
    events.emit(eventType, {
      label,
      doneCount: commands.done.length,
      undoneCount: commands.undone.length,
      revision: scene.revision
    });
  };

  return {
    scene,
    selection,
    commands,
    events,
    addNode(node, reason = "node:add") {
      scene.addNode(node);
      emitSceneChange(reason, [node.id], []);
    },
    removeNode(nodeId, reason = "node:remove") {
      const removed = scene.removeNode(nodeId);

      if (!removed) {
        return;
      }

      if (selection.has(nodeId)) {
        selection.remove(nodeId);
        emitSelectionChange();
      }

      emitSceneChange(reason, [nodeId], []);
    },
    addEntity(entity, reason = "entity:add") {
      scene.addEntity(entity);
      emitSceneChange(reason, [], [entity.id]);
    },
    removeEntity(entityId, reason = "entity:remove") {
      const removed = scene.removeEntity(entityId);

      if (!removed) {
        return;
      }

      emitSceneChange(reason, [], [entityId]);
    },
    exportSnapshot() {
      return createSceneDocumentSnapshot(scene);
    },
    importSnapshot(snapshot, reason = "scene:import") {
      loadSceneDocumentSnapshot(scene, snapshot);
      selection.clear();
      emitSelectionChange();
      emitSceneChange(reason);
    },
    select(ids, mode = selection.mode) {
      selection.set(ids, mode);
      emitSelectionChange();
    },
    clearSelection() {
      selection.clear();
      emitSelectionChange();
    },
    execute(command) {
      const previousRevision = scene.revision;
      commands.push(command, scene);

      if (scene.revision === previousRevision) {
        scene.touch();
      }

      emitCommandChange("command:executed", command.label);
      emitSceneChange(`command:${command.label}`);
    },
    undo() {
      const previousRevision = scene.revision;
      const command = commands.undo(scene);

      if (!command) {
        return;
      }

      if (scene.revision === previousRevision) {
        scene.touch();
      }

      emitCommandChange("command:undone", command.label);
      emitSceneChange(`undo:${command.label}`);
    },
    redo() {
      const previousRevision = scene.revision;
      const command = commands.redo(scene);

      if (!command) {
        return;
      }

      if (scene.revision === previousRevision) {
        scene.touch();
      }

      emitCommandChange("command:redone", command.label);
      emitSceneChange(`redo:${command.label}`);
    }
  };
}
