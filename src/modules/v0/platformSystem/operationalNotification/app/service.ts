import {
  V0OperationalNotificationRepository,
  type V0CashSessionCloseContextRow,
  type V0OperationalNotificationInboxRow,
} from "../infra/repository.js";
import {
  V0OperationalNotificationRealtimeBroker,
  type V0OperationalNotificationRealtimeEvent,
} from "./realtime.js";

export class V0OperationalNotificationService {
  constructor(
    private readonly repo: V0OperationalNotificationRepository,
    private readonly realtime: V0OperationalNotificationRealtimeBroker
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
  }): Promise<V0OperationalNotificationInboxRow[]> {
    return this.repo.listInbox(input);
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
    return updated?.read_at ?? null;
  }

  markAllRead(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<number> {
    return this.repo.markAllRead(input);
  }

  listOperationalRecipientAccountIdsForCashSessionZView(input: {
    tenantId: string;
    branchId: string;
  }): Promise<string[]> {
    return this.repo.listOperationalRecipientAccountIdsForCashSessionZView(input);
  }

  getCashSessionCloseContext(input: {
    tenantId: string;
    cashSessionId: string;
  }): Promise<V0CashSessionCloseContextRow | null> {
    return this.repo.getCashSessionCloseContext(input);
  }
}
