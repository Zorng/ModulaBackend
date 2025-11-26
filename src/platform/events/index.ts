// In-process event bus (will be replaced with message broker later)
import type { DomainEvent } from "../../shared/events.js";
import { Pool, PoolClient } from 'pg';
import { OutboxService } from './outbox.js';

type EventHandler<T extends DomainEvent = DomainEvent> = (
  event: T
) => Promise<void>;

export class EventBus {
  private handlers = new Map<string, EventHandler[]>();
  private outboxService?: OutboxService;

  constructor(private pool?: Pool) {
    if (pool) {
      this.outboxService = new OutboxService(pool);
    }
  }

  subscribe<T extends DomainEvent>(
    eventType: string,
    handler: EventHandler<T>
  ) {
    const existing = this.handlers.get(eventType) || [];
    this.handlers.set(eventType, [...existing, handler as EventHandler]);
  }

  /**
   * Publish event - uses outbox pattern if transaction is provided
   * @param event - Domain event to publish
   * @param trx - Optional transaction client (if provided, event goes to outbox)
   */
  async publish(event: DomainEvent, trx?: PoolClient): Promise<void> {
    // If transaction is provided, save to outbox for reliable delivery
    if (trx && this.outboxService) {
      await this.outboxService.saveEvent(event, trx);
      return;
    }

    // Otherwise, publish directly to in-process handlers
    const handlers = this.handlers.get(event.type) || [];
    await Promise.all(handlers.map((h) => h(event)));
  }
}

export class TransactionManager {
  constructor(private pool: any) {}

  async withTransaction<T>(callback: (trx: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export const eventBus = new EventBus();

// Export outbox classes for use in main server file
export { OutboxService, OutboxDispatcher } from './outbox.js';
