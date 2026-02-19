import { describe, expect, it } from "@jest/globals";
import { V0OperationalNotificationRealtimeBroker } from "../../app/realtime.js";

describe("V0OperationalNotificationRealtimeBroker", () => {
  it("publishes created notifications only to matching scope subscribers", () => {
    const broker = new V0OperationalNotificationRealtimeBroker();
    const receivedByManager: string[] = [];
    const receivedByCashier: string[] = [];

    broker.subscribe(
      {
        tenantId: "tenant-1",
        branchId: "branch-1",
        accountId: "manager-1",
      },
      (event) => {
        receivedByManager.push(event.data.notificationId);
      }
    );

    broker.subscribe(
      {
        tenantId: "tenant-1",
        branchId: "branch-1",
        accountId: "cashier-1",
      },
      (event) => {
        receivedByCashier.push(event.data.notificationId);
      }
    );

    broker.publishCreated({
      tenantId: "tenant-1",
      branchId: "branch-1",
      recipientAccountIds: ["manager-1"],
      notification: {
        id: "notif-1",
        type: "CASH_SESSION_CLOSED",
        subjectType: "CASH_SESSION",
        subjectId: "session-1",
        title: "Cash session closed",
        body: "Variance USD 0.00, KHR 0.00",
        payload: { varianceUsd: 0, varianceKhr: 0 },
        createdAt: new Date().toISOString(),
      },
      unreadCountByAccountId: new Map([["manager-1", 3]]),
    });

    expect(receivedByManager).toEqual(["notif-1"]);
    expect(receivedByCashier).toEqual([]);
  });
});
