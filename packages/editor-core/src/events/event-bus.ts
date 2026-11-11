type Handler<T> = (payload: T) => void;

export type EventBus<EventMap extends Record<string, unknown>> = {
  emit: <Key extends keyof EventMap>(type: Key, payload: EventMap[Key]) => void;
  on: <Key extends keyof EventMap>(type: Key, handler: Handler<EventMap[Key]>) => () => void;
  once: <Key extends keyof EventMap>(type: Key, handler: Handler<EventMap[Key]>) => () => void;
  clear: <Key extends keyof EventMap>(type?: Key) => void;
};

export function createEventBus<EventMap extends Record<string, unknown>>(): EventBus<EventMap> {
  const handlers = new Map<keyof EventMap, Set<Handler<EventMap[keyof EventMap]>>>();

  return {
    emit(type, payload) {
      const current = handlers.get(type);

      current?.forEach((handler) => {
        handler(payload);
      });
    },
    on(type, handler) {
      const current = handlers.get(type) ?? new Set();
      current.add(handler as Handler<EventMap[keyof EventMap]>);
      handlers.set(type, current);

      return () => {
        current.delete(handler as Handler<EventMap[keyof EventMap]>);
      };
    },
    once(type, handler) {
      const unsubscribe = this.on(type, (payload) => {
        unsubscribe();
        handler(payload);
      });

      return unsubscribe;
    },
    clear(type) {
      if (type) {
        handlers.delete(type);
        return;
      }

      handlers.clear();
    }
  };
}
