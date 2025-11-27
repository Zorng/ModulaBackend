// In-process event bus (will be replaced with message broker later)
import type { DomainEvent } from "../../shared/events.js";
import { Pool } from "pg";

type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();

  constructor(pool?: Pool) {
    // Pool parameter kept for compatibility with instantiation patterns
    // Currently not used, but may be needed for future event persistence
  }

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ) {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler as EventHandler]);
  }

  async publish(event: DomainEvent): Promise<void> {
    const handlers = this.handlers.get(event.type) || [];
    await Promise.all(handlers.map((h) => h(event)));
  }
}

// Singleton instance for backward compatibility
export const eventBus = new EventBus();

// Re-export TransactionManager for convenience
export { TransactionManager } from "../db/transactionManager.js";