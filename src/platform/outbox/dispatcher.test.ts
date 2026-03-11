import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { startV0CommandOutboxDispatcher } from "./dispatcher.js";

describe("v0 command outbox dispatcher", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("records failure instead of crashing when db.connect times out", async () => {
    jest.useFakeTimers();

    const db = {
      connect: jest.fn().mockRejectedValue(new Error("connect timeout")),
    };

    const dispatcher = startV0CommandOutboxDispatcher({
      db: db as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(10);

    const status = dispatcher.getStatus();
    expect(status.lastFailureAt).not.toBeNull();
    expect(status.lastError).toBe("connect timeout");

    dispatcher.stop();
  });

  it("skips overlapping ticks while a previous tick is still in flight", async () => {
    jest.useFakeTimers();

    let resolveConnect: any = null;
    const connectPromise = new Promise<any>((resolve) => {
      resolveConnect = resolve;
    });

    const client = {
      query: jest
        .fn()
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ rows: [{ count: "0" }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce(undefined),
      release: jest.fn(),
    };

    const db = {
      connect: jest.fn().mockImplementation(() => connectPromise),
    };

    const dispatcher = startV0CommandOutboxDispatcher({
      db: db as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(30);
    expect(db.connect).toHaveBeenCalledTimes(1);

    if (resolveConnect) {
      resolveConnect(client);
    }
    await Promise.resolve();
    await Promise.resolve();

    dispatcher.stop();
  });
});
