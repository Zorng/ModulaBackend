import { pool as defaultPool } from "./index.js";
import type { Pool, PoolClient } from "pg";
import { log } from "#logger";
import { recordDbTransaction } from "../observability/metrics.js";

type TransactionalPool = Pick<Pool, "connect">;
type TransactionTelemetry = {
  requestId?: string;
  actionKey?: string;
  tenantId?: string | null;
  branchId?: string | null;
};

export class TransactionManager {
  constructor(private readonly db: TransactionalPool = defaultPool) {}

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    telemetry?: TransactionTelemetry
  ): Promise<T> {
    const startedAtMs = Date.now();
    const client = await this.db.connect();
    log.debug("db.transaction.started", {
      event: "db.transaction.started",
      requestId: telemetry?.requestId,
      actionKey: telemetry?.actionKey,
      tenantId: telemetry?.tenantId ?? undefined,
      branchId: telemetry?.branchId ?? undefined,
    });
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      log.info("db.transaction.committed", {
        event: "db.transaction.committed",
        requestId: telemetry?.requestId,
        actionKey: telemetry?.actionKey,
        tenantId: telemetry?.tenantId ?? undefined,
        branchId: telemetry?.branchId ?? undefined,
        durationMs: Date.now() - startedAtMs,
      });
      recordDbTransaction({
        result: "committed",
        durationMs: Date.now() - startedAtMs,
        actionKey: telemetry?.actionKey,
      });
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      log.error("db.transaction.rolled_back", {
        event: "db.transaction.rolled_back",
        requestId: telemetry?.requestId,
        actionKey: telemetry?.actionKey,
        tenantId: telemetry?.tenantId ?? undefined,
        branchId: telemetry?.branchId ?? undefined,
        durationMs: Date.now() - startedAtMs,
        error: err instanceof Error ? err.message : String(err),
      });
      recordDbTransaction({
        result: "rolled_back",
        durationMs: Date.now() - startedAtMs,
        actionKey: telemetry?.actionKey,
      });
      throw err;
    } finally {
      client.release();
    }
  }

  async withOptionalTransaction<T>(input: {
    client?: PoolClient | null;
    callback: (client: PoolClient) => Promise<T>;
    telemetry?: TransactionTelemetry;
  }): Promise<T> {
    if (input.client) {
      return input.callback(input.client);
    }
    return this.withTransaction(input.callback, input.telemetry);
  }
}
