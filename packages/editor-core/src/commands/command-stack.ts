import type { SceneDocument } from "../document/scene-document";

export type Command = {
  label: string;
  execute: (scene: SceneDocument) => void;
  undo: (scene: SceneDocument) => void;
};

export type CommandStack = {
  done: Command[];
  undone: Command[];
  push: (command: Command, scene: SceneDocument) => void;
  undo: (scene: SceneDocument) => Command | undefined;
  redo: (scene: SceneDocument) => Command | undefined;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clear: () => void;
};

export function createCommandStack(): CommandStack {
  const stack: CommandStack = {
    done: [],
    undone: [],
    push(command, scene) {
      command.execute(scene);
      stack.done.push(command);
      stack.undone.length = 0;
    },
    undo(scene) {
      const command = stack.done.pop();

      if (!command) {
        return undefined;
      }

      command.undo(scene);
      stack.undone.push(command);

      return command;
    },
    redo(scene) {
      const command = stack.undone.pop();

      if (!command) {
        return undefined;
      }

      command.execute(scene);
      stack.done.push(command);

      return command;
    },
    canUndo() {
      return stack.done.length > 0;
    },
    canRedo() {
      return stack.undone.length > 0;
    },
    clear() {
      stack.done.length = 0;
      stack.undone.length = 0;
    }
  };

  return stack;
}
