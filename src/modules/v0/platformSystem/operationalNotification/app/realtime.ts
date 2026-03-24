type Scope = {
  accountId: string;
};

export type NotificationCreatedRealtimeEvent = {
  type: "notification.created";
  data: {
    notificationId: string;
    tenantId: string;
    tenantName: string;
    branchId: string;
    branchName: string | null;
    notificationType: string;
    subjectType: string;
    subjectId: string;
    title: string;
    body: string;
    payload: Record<string, unknown> | null;
    createdAt: string;
    unreadCount: number;
  };
};

export type V0OperationalNotificationRealtimeEvent = NotificationCreatedRealtimeEvent;

type Listener = (event: V0OperationalNotificationRealtimeEvent) => void;

export class V0OperationalNotificationRealtimeBroker {
  private readonly listenersByScope = new Map<string, Set<Listener>>();

  subscribe(scope: Scope, listener: Listener): () => void {
    const key = buildScopeKey(scope);
    const listeners = this.listenersByScope.get(key) ?? new Set<Listener>();
    listeners.add(listener);
    this.listenersByScope.set(key, listeners);

    return () => {
      const current = this.listenersByScope.get(key);
      if (!current) {
        return;
      }
      current.delete(listener);
      if (current.size === 0) {
        this.listenersByScope.delete(key);
      }
    };
  }

  publishCreated(input: {
    tenantId: string;
    branchId: string;
    recipientAccountIds: readonly string[];
    notification: {
      id: string;
      tenantName: string;
      branchName: string | null;
      type: string;
      subjectType: string;
      subjectId: string;
      title: string;
      body: string;
      payload: Record<string, unknown> | null;
      createdAt: string;
    };
    unreadCountByAccountId: ReadonlyMap<string, number>;
  }): void {
    for (const accountId of input.recipientAccountIds) {
      const key = buildScopeKey({
        accountId,
      });
      const listeners = this.listenersByScope.get(key);
      if (!listeners || listeners.size === 0) {
        continue;
      }

      const unreadCount = input.unreadCountByAccountId.get(accountId) ?? 0;
      const event: NotificationCreatedRealtimeEvent = {
        type: "notification.created",
        data: {
          notificationId: input.notification.id,
          tenantId: input.tenantId,
          tenantName: input.notification.tenantName,
          branchId: input.branchId,
          branchName: input.notification.branchName,
          notificationType: input.notification.type,
          subjectType: input.notification.subjectType,
          subjectId: input.notification.subjectId,
          title: input.notification.title,
          body: input.notification.body,
          payload: input.notification.payload,
          createdAt: input.notification.createdAt,
          unreadCount,
        },
      };

      for (const listener of listeners) {
        listener(event);
      }
    }
  }
}

function buildScopeKey(scope: Scope): string {
  return scope.accountId;
}
