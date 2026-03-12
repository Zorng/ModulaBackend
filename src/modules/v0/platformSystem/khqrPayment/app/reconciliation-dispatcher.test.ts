import { afterEach, describe, expect, it, jest } from "@jest/globals";

const listCandidatesMock = jest.fn();

jest.unstable_mockModule("../infra/repository.js", () => ({
  V0KhqrPaymentRepository: class {
    listReconciliationCandidates = listCandidatesMock;
  },
}));

jest.unstable_mockModule("./payment-provider.js", () => ({
  buildV0KhqrPaymentProviderFromEnv: jest.fn(() => ({})),
}));

jest.unstable_mockModule("../../../../../platform/db/transactionManager.js", () => ({
  TransactionManager: class {
    withTransaction = jest.fn();
  },
}));

const { startV0KhqrReconciliationDispatcher } = await import(
  "./reconciliation-dispatcher.js"
);

describe("khqr reconciliation dispatcher", () => {
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    listCandidatesMock.mockReset();
  });

  it("records nested aggregate errors clearly", async () => {
    jest.useFakeTimers();
    listCandidatesMock.mockRejectedValue(
      new AggregateError([new Error("connect ETIMEDOUT 3.1.167.181:5432")])
    );

    const dispatcher = startV0KhqrReconciliationDispatcher({
      db: {} as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(10);

    const status = dispatcher.getStatus();
    expect(status.lastFailureAt).not.toBeNull();
    expect(status.lastError).toContain("connect ETIMEDOUT 3.1.167.181:5432");

    dispatcher.stop();
  });

  it("skips overlapping ticks while a previous reconciliation tick is still in flight", async () => {
    jest.useFakeTimers();

    let resolveList: any;
    const listPromise = new Promise<[]>((resolve) => {
      resolveList = resolve;
    });
    listCandidatesMock.mockImplementation(() => listPromise);

    const dispatcher = startV0KhqrReconciliationDispatcher({
      db: {} as any,
      pollIntervalMs: 10,
      batchSize: 10,
    });

    await jest.advanceTimersByTimeAsync(30);
    expect(listCandidatesMock).toHaveBeenCalledTimes(1);

    if (resolveList) {
      resolveList([]);
    }
    await Promise.resolve();
    await Promise.resolve();

    dispatcher.stop();
  });
});
