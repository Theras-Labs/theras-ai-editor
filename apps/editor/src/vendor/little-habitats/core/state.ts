// Ports index-BwioI7A7.js 12542-12555 (fa GameState).
import type { Events } from './events';
import type { Tool } from './world';

export class GameState { // fa (12542)
  events: Events;
  tool: Tool = `soil`;
  photoMode = false;

  constructor(events: Events) {
    this.events = events;
  }

  /** Emits tool:changed { tool } when the tool changes. */
  setTool(tool: Tool): void {
    if (tool !== this.tool) {
      this.tool = tool;
      this.events.emit(`tool:changed`, { tool });
    }
  }

  /** Emits ui:photo-mode { enabled } when the mode changes. */
  setPhotoMode(enabled: boolean): void {
    if (enabled !== this.photoMode) {
      this.photoMode = enabled;
      this.events.emit(`ui:photo-mode`, { enabled });
    }
  }
}
