import {
  V0OperationalNotificationRepository,
  type V0CashSessionCloseContextRow,
  type V0OperationalNotificationInboxRow,
  type V0VoidRequestNotificationContextRow,
} from "../infra/repository.js";
import {
  V0OperationalNotificationRealtimeBroker,
  type V0OperationalNotificationRealtimeEvent,
} from "./realtime.js";
import { V0PullSyncRepository } from "../../pullSync/infra/repository.js";
import {
  buildOffsetPaginatedResult,
  type OffsetPaginatedResult,
} from "../../../../../shared/pagination.js";

export class V0OperationalNotificationService {
  constructor(
    private readonly repo: V0OperationalNotificationRepository,
    private readonly realtime: V0OperationalNotificationRealtimeBroker,
    private readonly syncRepo?: V0PullSyncRepository
  ) {}

  async emit(input: {
    tenantId: string;
    branchId: string;
    type: string;
    subjectType: string;
    subjectId: string;
    title: string;
    body: string;
    payload: Record<string, unknown> | null;
    dedupeKey: string;
    recipientAccountIds: readonly string[];
  }) {
    const notification = await this.repo.upsertNotification({
      tenantId: input.tenantId,
      branchId: input.branchId,
      type: input.type,
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      title: input.title,
      body: input.body,
      payload: input.payload,
      dedupeKey: input.dedupeKey,
    });

    await this.repo.insertRecipients({
      notificationId: notification.id,
      tenantId: input.tenantId,
      branchId: input.branchId,
      recipientAccountIds: input.recipientAccountIds,
    });

    if (notification.was_inserted && input.recipientAccountIds.length > 0) {
      if (this.syncRepo) {
        await Promise.all(
          input.recipientAccountIds.map((recipientAccountId) =>
            this.syncRepo!.appendChange({
              tenantId: input.tenantId,
              branchId: input.branchId,
              accountId: recipientAccountId,
              moduleKey: "operationalNotification",
              entityType: "operational_notification",
              entityId: notification.id,
              operation: "UPSERT",
              revision: `operationalNotification:${notification.id}:created`,
              data: {
                notificationId: notification.id,
                type: notification.type,
                subjectType: notification.subject_type,
                subjectId: notification.subject_id,
                title: notification.title,
                body: notification.body,
                payload: notification.payload,
                createdAt: notification.created_at.toISOString(),
                isRead: false,
                readAt: null,
              },
              changedAt: notification.created_at,
            })
          )
        );
      }

      const unreadCountByAccountId = new Map<string, number>();
      await Promise.all(
        input.recipientAccountIds.map(async (accountId) => {
          const unreadCount = await this.repo.getUnreadCount({
            tenantId: input.tenantId,
            branchId: input.branchId,
            recipientAccountId: accountId,
          });
          unreadCountByAccountId.set(accountId, unreadCount);
        })
      );
      this.realtime.publishCreated({
        tenantId: input.tenantId,
        branchId: input.branchId,
        recipientAccountIds: input.recipientAccountIds,
        notification: {
          id: notification.id,
          type: notification.type,
          subjectType: notification.subject_type,
          subjectId: notification.subject_id,
          title: notification.title,
          body: notification.body,
          payload: notification.payload,
          createdAt: notification.created_at.toISOString(),
        },
        unreadCountByAccountId,
      });
    }

    return notification;
  }

  subscribeRealtime(
    input: {
      tenantId: string;
      branchId: string;
      recipientAccountId: string;
    },
    listener: (event: V0OperationalNotificationRealtimeEvent) => void
  ): () => void {
    return this.realtime.subscribe(
      {
        tenantId: input.tenantId,
        branchId: input.branchId,
        accountId: input.recipientAccountId,
      },
      listener
    );
  }

  listInbox(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    unreadOnly: boolean;
    type: string | null;
    limit: number;
    offset: number;
  }): Promise<
    OffsetPaginatedResult<{
      id: string;
      tenantId: string;
      branchId: string;
      type: string;
      subjectType: string;
      subjectId: string;
      title: string;
      body: string;
      dedupeKey: string;
      payload: Record<string, unknown> | null;
      createdAt: string;
      isRead: boolean;
      readAt: string | null;
    }>
  > {
    return this.listInboxWithMeta(input);
  }

  getUnreadCount(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<number> {
    return this.repo.getUnreadCount(input);
  }

  getInboxItem(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    notificationId: string;
  }): Promise<V0OperationalNotificationInboxRow | null> {
    return this.repo.getInboxItem(input);
  }

  async markRead(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    notificationId: string;
  }): Promise<Date | null> {
    const updated = await this.repo.markRead(input);
    if (updated && this.syncRepo) {
      await this.syncRepo.appendChange({
        tenantId: input.tenantId,
        branchId: input.branchId,
        accountId: input.recipientAccountId,
        moduleKey: "operationalNotification",
        entityType: "operational_notification",
        entityId: input.notificationId,
        operation: "UPSERT",
        revision: `operationalNotification:${input.notificationId}:read:${updated.read_at?.getTime() ?? Date.now()}`,
        data: {
          notificationId: input.notificationId,
          isRead: true,
          readAt: updated.read_at?.toISOString() ?? null,
        },
        changedAt: updated.read_at ?? new Date(),
      });
    }
    return updated?.read_at ?? null;
  }

  markAllRead(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<number> {
    return this.markAllReadWithSync(input);
  }

  listOperationalRecipientAccountIdsForCashSessionZView(input: {
    tenantId: string;
    branchId: string;
  }): Promise<string[]> {
    return this.repo.listOperationalRecipientAccountIdsForCashSessionZView(input);
  }

  listOperationalRecipientAccountIdsForBranchManagerialReview(input: {
    tenantId: string;
    branchId: string;
  }): Promise<string[]> {
    return this.repo.listOperationalRecipientAccountIdsForBranchManagerialReview(input);
  }

  getCashSessionCloseContext(input: {
    tenantId: string;
    cashSessionId: string;
  }): Promise<V0CashSessionCloseContextRow | null> {
    return this.repo.getCashSessionCloseContext(input);
  }

  getVoidRequestNotificationContext(input: {
    tenantId: string;
    branchId: string;
    voidRequestId: string;
  }): Promise<V0VoidRequestNotificationContextRow | null> {
    return this.repo.getVoidRequestNotificationContext(input);
  }

  private async markAllReadWithSync(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<number> {
    const updatedRows = await this.repo.markAllRead(input);
    if (updatedRows.length > 0 && this.syncRepo) {
      await Promise.all(
        updatedRows.map((row) =>
          this.syncRepo!.appendChange({
            tenantId: input.tenantId,
            branchId: input.branchId,
            accountId: input.recipientAccountId,
            moduleKey: "operationalNotification",
            entityType: "operational_notification",
            entityId: row.notification_id,
            operation: "UPSERT",
            revision: `operationalNotification:${row.notification_id}:read:${row.read_at.getTime()}`,
            data: {
              notificationId: row.notification_id,
              isRead: true,
              readAt: row.read_at.toISOString(),
            },
            changedAt: row.read_at,
          })
        )
      );
    }
    return updatedRows.length;
  }

  private async listInboxWithMeta(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    unreadOnly: boolean;
    type: string | null;
    limit: number;
    offset: number;
  }): Promise<
    OffsetPaginatedResult<{
      id: string;
      tenantId: string;
      branchId: string;
      type: string;
      subjectType: string;
      subjectId: string;
      title: string;
      body: string;
      dedupeKey: string;
      payload: Record<string, unknown> | null;
      createdAt: string;
      isRead: boolean;
      readAt: string | null;
    }>
  > {
    const [rows, total] = await Promise.all([
      this.repo.listInbox(input),
      this.repo.countInbox(input),
    ]);
    return buildOffsetPaginatedResult({
      items: rows.map(mapInboxItem),
      limit: input.limit,
      offset: input.offset,
      total,
    });
  }
}

function mapInboxItem(row: V0OperationalNotificationInboxRow) {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    type: row.type,
    subjectType: row.subject_type,
    subjectId: row.subject_id,
    title: row.title,
    body: row.body,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    createdAt: row.created_at.toISOString(),
    isRead: Boolean(row.read_at),
    readAt: row.read_at ? row.read_at.toISOString() : null,
  };
}
