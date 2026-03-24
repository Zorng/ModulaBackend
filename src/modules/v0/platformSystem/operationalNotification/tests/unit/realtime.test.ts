import { describe, expect, it } from "@jest/globals";
import { V0OperationalNotificationRealtimeBroker } from "../../app/realtime.js";

describe("V0OperationalNotificationRealtimeBroker", () => {
  it("publishes created notifications only to matching account subscribers across tenants", () => {
    const broker = new V0OperationalNotificationRealtimeBroker();
    const receivedByManager: string[] = [];
    const receivedByCashier: string[] = [];

    broker.subscribe(
      {
        accountId: "manager-1",
      },
      (event) => {
        receivedByManager.push(event.data.notificationId);
      }
    );

    broker.subscribe(
      {
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
        tenantName: "Tenant One",
        branchName: "Main Branch",
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

    broker.publishCreated({
      tenantId: "tenant-2",
      branchId: "branch-9",
      recipientAccountIds: ["manager-1"],
      notification: {
        id: "notif-2",
        tenantName: "Tenant Two",
        branchName: "North Branch",
        type: "VOID_APPROVAL_NEEDED",
        subjectType: "SALE",
        subjectId: "sale-2",
        title: "Void approval needed",
        body: "Sale requires approval",
        payload: { saleId: "sale-2" },
        createdAt: new Date().toISOString(),
      },
      unreadCountByAccountId: new Map([["manager-1", 4]]),
    });

    expect(receivedByManager).toEqual(["notif-1", "notif-2"]);
  });
});
