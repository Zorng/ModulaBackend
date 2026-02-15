import { pool as defaultPool } from "./index.js";
import type { Pool, PoolClient } from "pg";

type TransactionalPool = Pick<Pool, "connect">;

export class TransactionManager {
  constructor(private readonly db: TransactionalPool = defaultPool) {}

  async withTransaction<T>(
    callback: (client: PoolClient) => Promise<T>
  ): Promise<T> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      const result = await callback(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async withOptionalTransaction<T>(input: {
    client?: PoolClient | null;
    callback: (client: PoolClient) => Promise<T>;
  }): Promise<T> {
    if (input.client) {
      return input.callback(input.client);
    }
    return this.withTransaction(input.callback);
  }
}
