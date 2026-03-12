import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { startV0MediaUploadCleanupDispatcher } from "./cleanup-dispatcher.js";

describe("media upload cleanup dispatcher", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("records nested aggregate connect errors clearly", async () => {
    jest.useFakeTimers();

    const db = {
      query: jest.fn().mockRejectedValue(
        new AggregateError([new Error("connect ETIMEDOUT 3.1.167.181:5432")])
      ),
    };

    const dispatcher = startV0MediaUploadCleanupDispatcher({
      db: db as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(10);

    const status = dispatcher.getStatus();
    expect(status.lastFailureAt).not.toBeNull();
    expect(status.lastError).toContain("connect ETIMEDOUT 3.1.167.181:5432");

    dispatcher.stop();
  });

  it("skips overlapping ticks while a previous cleanup tick is still in flight", async () => {
    jest.useFakeTimers();

    let resolveQuery: any;
    const queryPromise = new Promise<{ rows: [] }>((resolve) => {
      resolveQuery = resolve;
    });

    const db = {
      query: jest.fn().mockImplementation(() => queryPromise),
    };

    const dispatcher = startV0MediaUploadCleanupDispatcher({
      db: db as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(30);
    expect(db.query).toHaveBeenCalledTimes(1);

    if (resolveQuery) {
      resolveQuery({ rows: [] });
    }
    await Promise.resolve();
    await Promise.resolve();

    dispatcher.stop();
  });
});
