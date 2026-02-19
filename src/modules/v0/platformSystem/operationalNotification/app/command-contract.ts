export const V0_OPERATIONAL_NOTIFICATION_ACTION_KEYS = {
  listInbox: "operationalNotification.inbox.list",
  streamInbox: "operationalNotification.inbox.stream",
  unreadCount: "operationalNotification.inbox.unreadCount",
  readOne: "operationalNotification.read",
  markRead: "operationalNotification.read.mark",
  markAllRead: "operationalNotification.read.markAll",
} as const;

export const V0_OPERATIONAL_NOTIFICATION_EVENT_TYPES = {
  emitted: "OPERATIONAL_NOTIFICATION_EMITTED",
  read: "OPERATIONAL_NOTIFICATION_READ",
} as const;
