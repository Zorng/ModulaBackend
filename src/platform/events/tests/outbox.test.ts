import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { Pool } from 'pg';
import { OutboxService, OutboxDispatcher } from '../../../platform/events/outbox.js';
import { EventBus } from '../../../platform/events/index.js';

describe('Outbox Pattern Integration', () => {
  let pool: Pool;
  let outboxService: OutboxService;
  let eventBus: EventBus;
  let dispatcher: OutboxDispatcher;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/modula_test'
    });
    
    outboxService = new OutboxService(pool);
    eventBus = new EventBus(pool);
    dispatcher = new OutboxDispatcher(outboxService, eventBus, 500); // 500ms poll
  });

  afterAll(async () => {
    dispatcher.stop();
    await pool.end();
  });

  it('should save event to outbox within transaction', async () => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const event = {
        type: 'sales.draft_created',
        v: 1,
        tenantId: 'test-tenant-id',
        branchId: 'test-branch-id',
        saleId: 'test-sale-id',
        clientUuid: 'test-client-uuid',
        actorId: 'test-actor-id',
        timestamp: new Date().toISOString()
      };

      await outboxService.saveEvent(event as any, client);
      await client.query('COMMIT');

      // Verify event was saved
      const events = await outboxService.getUnsentEvents();
      expect(events.length).toBeGreaterThan(0);
      
      const savedEvent = events.find(e => (e.payload as any).saleId === 'test-sale-id');
      expect(savedEvent).toBeDefined();
      expect(savedEvent?.type).toBe('sales.draft_created');
      expect(savedEvent?.sentAt).toBeNull();
      
      // Cleanup
      if (savedEvent) {
        await outboxService.markAsSent(savedEvent.id);
      }
    } finally {
      client.release();
    }
  });

  it('should publish events via dispatcher', async () => {
    return new Promise<void>(async (resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Event not published within 3 seconds'));
      }, 3000);

      // Subscribe to event
      let eventReceived = false;
      eventBus.subscribe('sales.sale_finalized', async (event) => {
        if ((event as any).saleId === 'dispatcher-test-sale-id') {
          eventReceived = true;
          clearTimeout(timeout);
          resolve();
        }
      });

      // Start dispatcher
      dispatcher.start();

      // Create event in outbox
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        const event = {
          type: 'sales.sale_finalized',
          v: 1,
          tenantId: 'test-tenant-id',
          branchId: 'test-branch-id',
          saleId: 'dispatcher-test-sale-id',
          lines: [{ menuItemId: 'item-1', qty: 2 }],
          totals: {
            subtotalUsd: 10,
            totalUsd: 11,
            totalKhr: 45100,
            vatAmountUsd: 1
          },
          tenders: [{ method: 'CASH', amountUsd: 15, amountKhr: 61500 }],
          finalizedAt: new Date().toISOString(),
          actorId: 'test-actor-id'
        };

        await outboxService.saveEvent(event as any, client);
        await client.query('COMMIT');
      } finally {
        client.release();
      }
    });
  });

  it('should mark events as sent after publishing', async () => {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const event = {
        type: 'sales.fulfillment_updated',
        v: 1,
        tenantId: 'test-tenant-id',
        branchId: 'test-branch-id',
        saleId: 'mark-sent-test-sale-id',
        actorId: 'test-actor-id',
        fulfillmentStatus: 'ready',
        timestamp: new Date().toISOString()
      };

      await outboxService.saveEvent(event as any, client);
      await client.query('COMMIT');

      // Wait for dispatcher to process
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Verify event was marked as sent
      const unsentEvents = await outboxService.getUnsentEvents();
      const stillPending = unsentEvents.find(
        e => (e.payload as any).saleId === 'mark-sent-test-sale-id'
      );
      
      expect(stillPending).toBeUndefined(); // Should be marked as sent
    } finally {
      client.release();
    }
  });

  it('should handle transaction rollback correctly', async () => {
    const client = await pool.connect();
    const initialEventCount = (await outboxService.getUnsentEvents()).length;
    
    try {
      await client.query('BEGIN');
      
      const event = {
        type: 'sales.draft_created',
        v: 1,
        tenantId: 'test-tenant-id',
        branchId: 'test-branch-id',
        saleId: 'rollback-test-sale-id',
        clientUuid: 'test-client-uuid',
        actorId: 'test-actor-id',
        timestamp: new Date().toISOString()
      };

      await outboxService.saveEvent(event as any, client);
      
      // Rollback transaction
      await client.query('ROLLBACK');

      // Verify event was NOT saved
      const events = await outboxService.getUnsentEvents();
      expect(events.length).toBe(initialEventCount);
      
      const rolledBackEvent = events.find(
        e => (e.payload as any).saleId === 'rollback-test-sale-id'
      );
      expect(rolledBackEvent).toBeUndefined();
    } finally {
      client.release();
    }
  });
});
