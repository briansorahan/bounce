import type { DomainEvent, EventBus } from "../../src/shared/event-bus";

/**
 * RecordingEventBus — captures all emitted event batches for test assertions.
 *
 * Behaves exactly like EventBusImpl: handlers are called synchronously inline.
 * Additionally, every batch is appended to the public `batches` array so tests
 * can inspect what was emitted.
 */
export class RecordingEventBus implements EventBus {
  public readonly batches: DomainEvent[][] = [];
  private handlers = new Set<(events: DomainEvent[]) => void>();

  emit(events: DomainEvent | DomainEvent[]): void {
    const batch = Array.isArray(events) ? events : [events];
    this.batches.push(batch);
    for (const h of this.handlers) h(batch);
  }

  on(handler: (events: DomainEvent[]) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Flat list of all emitted events across all batches. */
  get all(): DomainEvent[] {
    return this.batches.flat();
  }

  /** Reset recorded batches. */
  reset(): void {
    this.batches.length = 0;
  }
}
