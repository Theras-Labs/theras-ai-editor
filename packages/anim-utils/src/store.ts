export type Unsubscribe = () => void;

export class Emitter<TPayload = void> {
  private listeners = new Set<(payload: TPayload) => void>();

  emit(payload: TPayload): void {
    for (const listener of this.listeners) {
      listener(payload);
    }
  }

  subscribe(listener: (payload: TPayload) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
