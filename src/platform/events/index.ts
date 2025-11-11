// In-process event bus (will be replaced with message broker later)
import type { DomainEvent } from "../../shared/events.js";

type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => Promise<void>;

class EventBus {
  private handlers = new Map<string, EventHandler[]>();

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

export const eventBus = new EventBus();
