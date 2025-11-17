// src/platform/events/EventBusAdapter.ts
import type { IEventBus } from "#modules/menu/app/ports.ts";
import type { DomainEvent } from "../../../../shared/events.ts";
import type { PoolClient } from "pg";
import type { pool } from "../../../../platform/db/index.ts";

export class EventBusAdapter implements IEventBus {
  async publish<T extends DomainEvent>(event: T): Promise<void> {
    // simple async log or queue publish
    console.log("[EventBus] Publishing event:", event);
  }

  async publishViaOutbox<T extends DomainEvent>(
    event: T,
    client: PoolClient
  ): Promise<void> {
    // store in DB outbox table for reliable delivery
    await client.query(`INSERT INTO outbox (type, payload) VALUES ($1, $2)`, [
      event.type,
      JSON.stringify(event),
    ]);
  }
}
