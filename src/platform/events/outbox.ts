// Event outbox pattern for reliable event delivery
import { Pool, PoolClient } from 'pg';
import type { DomainEvent } from '../../shared/events.js';

export interface OutboxEvent {
  id: string;
  tenantId: string;
  type: string;
  payload: DomainEvent;
  createdAt: Date;
  sentAt: Date | null;
}

/**
 * Outbox Service - Writes events to platform_outbox table
 * Events are written in the same transaction as business data
 */
export class OutboxService {
  constructor(private pool: Pool) {}

  /**
   * Save event to outbox table within a transaction
   * This ensures event is saved atomically with business data
   */
  async saveEvent(event: DomainEvent, trx: PoolClient): Promise<void> {
    await trx.query(
      `INSERT INTO platform_outbox (tenant_id, type, payload, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [event.tenantId, event.type, JSON.stringify(event)]
    );
  }

  /**
   * Get unsent events for processing
   */
  async getUnsentEvents(limit = 100): Promise<OutboxEvent[]> {
    const result = await this.pool.query(
      `SELECT id, tenant_id as "tenantId", type, payload, created_at as "createdAt", sent_at as "sentAt"
       FROM platform_outbox
       WHERE sent_at IS NULL
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit]
    );

    return result.rows.map(row => ({
      ...row,
      payload: row.payload as DomainEvent
    }));
  }

  /**
   * Mark event as sent
   */
  async markAsSent(eventId: string): Promise<void> {
    await this.pool.query(
      `UPDATE platform_outbox SET sent_at = NOW() WHERE id = $1`,
      [eventId]
    );
  }

  /**
   * Clean up old sent events
   */
  async cleanupSentEvents(retentionDays = 7): Promise<number> {
    const result = await this.pool.query(
      `SELECT cleanup_sent_outbox_events($1)`,
      [retentionDays]
    );
    return result.rows[0].cleanup_sent_outbox_events;
  }
}

/**
 * Outbox Dispatcher - Background worker that reads from outbox and publishes to event bus
 */
export class OutboxDispatcher {
  private isRunning = false;
  private intervalId?: NodeJS.Timeout;

  constructor(
    private outboxService: OutboxService,
    private eventBus: any, // Your event bus instance
    private intervalMs = 1000 // Poll every second
  ) {}

  /**
   * Start the dispatcher background worker
   */
  start(): void {
    if (this.isRunning) {
      console.log('Outbox dispatcher already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting outbox dispatcher...');

    this.intervalId = setInterval(async () => {
      await this.processOutbox();
    }, this.intervalMs);
  }

  /**
   * Stop the dispatcher
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log('Outbox dispatcher stopped');
  }

  /**
   * Process unsent events from outbox
   */
  private async processOutbox(): Promise<void> {
    try {
      const events = await this.outboxService.getUnsentEvents();

      if (events.length === 0) {
        return;
      }

      console.log(`Processing ${events.length} outbox events...`);

      for (const event of events) {
        try {
          // Publish to event bus
          await this.eventBus.publish(event.payload);
          
          // Mark as sent
          await this.outboxService.markAsSent(event.id);
          
          console.log(`✓ Published event: ${event.type} (${event.id})`);
        } catch (error) {
          console.error(`✗ Failed to publish event ${event.id}:`, error);
          // Event remains unsent and will be retried in next cycle
        }
      }
    } catch (error) {
      console.error('Error processing outbox:', error);
    }
  }
}
