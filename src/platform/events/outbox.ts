// Event outbox pattern for reliable event delivery
import { PoolClient } from "pg";
import type { DomainEvent } from "../../shared/events.js";
import { eventBus } from "./index.js";

/**
 * Write event to outbox table within a transaction
 * This ensures atomicity: either both business write + event succeed, or both fail
 */
export async function publishToOutbox(
  event: DomainEvent,
  client: PoolClient
): Promise<void> {
  const payload = JSON.stringify(event);

  await client.query(
    `INSERT INTO platform_outbox (tenant_id, type, payload, created_at)
     VALUES ($1, $2, $3, NOW())`,
    [event.tenantId, event.type, payload]
  );
}

/**
 * Background dispatcher - polls outbox and publishes to in-process bus
 * In production, run this as a separate worker or cron job
 */
export async function startOutboxDispatcher(db: any, intervalMs = 1000) {
  setInterval(async () => {
    try {
      // Fetch unsent events (with row locking to prevent duplicate processing)
      const result = await db.query(
        `SELECT id, payload FROM platform_outbox 
         WHERE sent_at IS NULL 
         ORDER BY created_at ASC 
         LIMIT 100
         FOR UPDATE SKIP LOCKED`
      );

      for (const row of result.rows) {
        // PostgreSQL JSONB is already parsed by pg library, no need to JSON.parse
        const event = (typeof row.payload === 'string' 
          ? JSON.parse(row.payload) 
          : row.payload) as DomainEvent;

        // Publish to in-process bus
        await eventBus.publish(event);

        // Mark as sent
        await db.query(
          `UPDATE platform_outbox SET sent_at = NOW() WHERE id = $1`,
          [row.id]
        );
      }
    } catch (error) {
      console.error("Outbox dispatcher error:", error);
      // TODO: Add proper logging and alerting
    }
  }, intervalMs);
}

/**
 * Helper to publish events during development (bypasses outbox for quick testing)
 * Use publishToOutbox in production code
 */
export async function publishDirect(event: DomainEvent): Promise<void> {
  await eventBus.publish(event);
}
