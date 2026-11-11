// Ports index-BwioI7A7.js 12445-12455 (ua, the event bus).

/** Every event name the game emits or listens to. */
export type GameEventName =
  | 'world:changed'
  | 'season:changed'
  | 'dayphase:changed'
  | 'tool:changed'
  | 'ui:photo-mode'
  | 'hover:changed'
  | 'poke:hover'
  | 'plant:sprouted'
  | 'feature:added'
  | 'creature:arrived'
  | 'creature:left'
  | 'creature:call'
  | 'creature:poked'
  | 'landmark:found'
  | 'landmark:poked'
  | 'wonder:formed'
  | 'festival:start'
  | 'festival:burst'
  | 'festival:end';

export type GameEventHandler = (payload: any) => void;

export class Events { // ua (12445)
  handlers = new Map<GameEventName, Set<GameEventHandler>>();

  /** Adds a handler. Returns a function that removes it. */
  on(name: GameEventName, handler: GameEventHandler): () => boolean {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(handler);
    return () => set.delete(handler);
  }

  emit(name: GameEventName, payload?: any): void {
    const set = this.handlers.get(name);
    if (set) for (const handler of [...set]) handler(payload);
  }
}
