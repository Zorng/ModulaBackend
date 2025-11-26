// src/modules/menu/infra/adapters/event-bus.adapter.ts
import type { IEventBus } from "../../app/ports.js";
import type { DomainEvent } from "../../../../shared/events.js";
import { eventBus } from "../../../../platform/events/index.js";
import { publishToOutbox } from "../../../../platform/events/outbox.js";
import type { PoolClient } from "pg";

/**
 * EventBus Adapter
 * Implements IEventBus port using platform event infrastructure
 *
 * Bridges the menu module with the platform event system
 */
export class EventBusAdapter implements IEventBus {
  /**
   * Publish event directly (non-transactional, async)
   * Use for non-critical events that don't need guaranteed delivery
   *
   * Example: Menu snapshot updates, cache invalidation
   */
  async publish<T extends DomainEvent>(event: T): Promise<void> {
    try {
      // Use platform event bus
      await eventBus.publish(event);

      // Log for debugging (optional)
      console.log(`[EventBus] Published: ${event.type}`, {
        tenantId: event.tenantId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Log error but don't throw - events are fire-and-forget
      console.error(`[EventBus] Failed to publish ${event.type}:`, error);
    }
  }

  /**
   * Publish event via transactional outbox (reliable delivery)
   * Use for critical events that MUST be delivered
   *
   * Example: Category created, item updated, stock linked
   *
   * This ensures atomicity:
   * - If DB transaction fails, event is NOT saved
   * - If DB transaction succeeds, event WILL be delivered
   */
  async publishViaOutbox<T extends DomainEvent>(
    event: T,
    client: PoolClient
  ): Promise<void> {
    try {
      // Use platform outbox pattern
      await publishToOutbox(event, client);

      // Log for debugging
      console.log(`[EventBus] Saved to outbox: ${event.type}`, {
        tenantId: event.tenantId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Re-throw - this is critical and should fail the transaction
      console.error(
        `[EventBus] Failed to save to outbox ${event.type}:`,
        error
      );
      throw error;
    }
  }
}

/**
 * Factory function for easy instantiation
 * Use this in your module factories
 */
export function createEventBusAdapter(): IEventBus {
  return new EventBusAdapter();
}
