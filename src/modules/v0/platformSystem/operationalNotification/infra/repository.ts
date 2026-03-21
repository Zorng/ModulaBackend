import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0OperationalNotificationRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  type: string;
  subject_type: string;
  subject_id: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  dedupe_key: string;
  created_at: Date;
  was_inserted: boolean;
};

export type V0OperationalNotificationInboxRow = V0OperationalNotificationRow & {
  read_at: Date | null;
};

export type V0OperationalNotificationRecipientRow = {
  id: string;
  notification_id: string;
  tenant_id: string;
  branch_id: string;
  recipient_account_id: string;
  read_at: Date | null;
  created_at: Date;
};

export type V0OperationalNotificationReadMarkRow = {
  notification_id: string;
  read_at: Date;
};

export type V0CashSessionCloseContextRow = {
  tenant_id: string;
  branch_id: string;
  cash_session_id: string;
  close_reason: "NORMAL_CLOSE" | "FORCE_CLOSE";
  closed_at: Date;
  variance_usd: number;
  variance_khr: number;
};

export type V0VoidRequestNotificationContextRow = {
  tenant_id: string;
  branch_id: string;
  void_request_id: string;
  sale_id: string;
  requested_by_account_id: string;
  reviewed_by_account_id: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reason: string;
  review_note: string | null;
  requested_at: Date;
  reviewed_at: Date | null;
};

export class V0OperationalNotificationRepository {
  constructor(private readonly db: Queryable) {}

  async upsertNotification(input: {
    tenantId: string;
    branchId: string;
    type: string;
    subjectType: string;
    subjectId: string;
    title: string;
    body: string;
    payload: Record<string, unknown> | null;
    dedupeKey: string;
  }): Promise<V0OperationalNotificationRow> {
    const result = await this.db.query<V0OperationalNotificationRow>(
      `INSERT INTO v0_operational_notifications (
         tenant_id,
         branch_id,
         type,
         subject_type,
         subject_id,
         title,
         body,
         payload,
         dedupe_key
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::JSONB, $9)
       ON CONFLICT (tenant_id, dedupe_key)
       DO UPDATE SET dedupe_key = EXCLUDED.dedupe_key
       RETURNING
         id,
         tenant_id,
         branch_id,
         type,
         subject_type,
         subject_id,
         title,
         body,
         payload,
         dedupe_key,
         created_at,
         (xmax = 0) AS was_inserted`,
      [
        input.tenantId,
        input.branchId,
        input.type,
        input.subjectType,
        input.subjectId,
        input.title,
        input.body,
        input.payload === null ? null : JSON.stringify(input.payload),
        input.dedupeKey,
      ]
    );
    return result.rows[0];
  }

  async insertRecipients(input: {
    notificationId: string;
    tenantId: string;
    branchId: string;
    recipientAccountIds: readonly string[];
  }): Promise<void> {
    if (input.recipientAccountIds.length === 0) {
      return;
    }

    await this.db.query(
      `INSERT INTO v0_operational_notification_recipients (
         notification_id,
         tenant_id,
         branch_id,
         recipient_account_id
       )
       SELECT $1, $2, $3, account_id
       FROM UNNEST($4::UUID[]) AS account_id
       ON CONFLICT (notification_id, recipient_account_id) DO NOTHING`,
      [input.notificationId, input.tenantId, input.branchId, input.recipientAccountIds]
    );
  }

  async listInbox(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    unreadOnly: boolean;
    type: string | null;
    limit: number;
    offset: number;
  }): Promise<V0OperationalNotificationInboxRow[]> {
    const result = await this.db.query<V0OperationalNotificationInboxRow>(
      `SELECT
         n.id,
         n.tenant_id,
         n.branch_id,
         n.type,
         n.subject_type,
         n.subject_id,
         n.title,
         n.body,
         n.payload,
         n.dedupe_key,
         n.created_at,
         r.read_at
       FROM v0_operational_notification_recipients r
       JOIN v0_operational_notifications n
         ON n.id = r.notification_id
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND r.recipient_account_id = $3
         AND ($4::BOOLEAN = FALSE OR r.read_at IS NULL)
         AND ($5::VARCHAR IS NULL OR n.type = $5)
       ORDER BY n.created_at DESC
       LIMIT $6 OFFSET $7`,
      [
        input.tenantId,
        input.branchId,
        input.recipientAccountId,
        input.unreadOnly,
        input.type,
        input.limit,
        input.offset,
      ]
    );
    return result.rows;
  }

  async countInbox(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    unreadOnly: boolean;
    type: string | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_operational_notification_recipients r
       JOIN v0_operational_notifications n
         ON n.id = r.notification_id
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND r.recipient_account_id = $3
         AND ($4::BOOLEAN = FALSE OR r.read_at IS NULL)
         AND ($5::VARCHAR IS NULL OR n.type = $5)`,
      [
        input.tenantId,
        input.branchId,
        input.recipientAccountId,
        input.unreadOnly,
        input.type,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async getInboxItem(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    notificationId: string;
  }): Promise<V0OperationalNotificationInboxRow | null> {
    const result = await this.db.query<V0OperationalNotificationInboxRow>(
      `SELECT
         n.id,
         n.tenant_id,
         n.branch_id,
         n.type,
         n.subject_type,
         n.subject_id,
         n.title,
         n.body,
         n.payload,
         n.dedupe_key,
         n.created_at,
         r.read_at
       FROM v0_operational_notification_recipients r
       JOIN v0_operational_notifications n
         ON n.id = r.notification_id
       WHERE r.tenant_id = $1
         AND r.branch_id = $2
         AND r.recipient_account_id = $3
         AND r.notification_id = $4
       LIMIT 1`,
      [input.tenantId, input.branchId, input.recipientAccountId, input.notificationId]
    );
    return result.rows[0] ?? null;
  }

  async getUnreadCount(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `SELECT COUNT(*)::TEXT AS count
       FROM v0_operational_notification_recipients
       WHERE tenant_id = $1
         AND branch_id = $2
         AND recipient_account_id = $3
         AND read_at IS NULL`,
      [input.tenantId, input.branchId, input.recipientAccountId]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async markRead(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
    notificationId: string;
  }): Promise<V0OperationalNotificationRecipientRow | null> {
    const result = await this.db.query<V0OperationalNotificationRecipientRow>(
      `UPDATE v0_operational_notification_recipients
       SET read_at = COALESCE(read_at, NOW())
       WHERE tenant_id = $1
         AND branch_id = $2
         AND recipient_account_id = $3
         AND notification_id = $4
       RETURNING
         id,
         notification_id,
         tenant_id,
         branch_id,
         recipient_account_id,
         read_at,
         created_at`,
      [input.tenantId, input.branchId, input.recipientAccountId, input.notificationId]
    );
    return result.rows[0] ?? null;
  }

  async markAllRead(input: {
    tenantId: string;
    branchId: string;
    recipientAccountId: string;
  }): Promise<V0OperationalNotificationReadMarkRow[]> {
    const result = await this.db.query<V0OperationalNotificationReadMarkRow>(
      `UPDATE v0_operational_notification_recipients
       SET read_at = COALESCE(read_at, NOW())
       WHERE tenant_id = $1
         AND branch_id = $2
         AND recipient_account_id = $3
         AND read_at IS NULL
       RETURNING
         notification_id,
         read_at`,
      [input.tenantId, input.branchId, input.recipientAccountId]
    );
    return result.rows;
  }

  async listOperationalRecipientAccountIdsForBranchManagerialReview(input: {
    tenantId: string;
    branchId: string;
  }): Promise<string[]> {
    const entitlement = await this.db.query<{
      enforcement: "ENABLED" | "READ_ONLY" | "DISABLED_VISIBLE";
    }>(
      `SELECT enforcement
       FROM v0_branch_entitlements
       WHERE tenant_id = $1
         AND branch_id = $2
         AND entitlement_key = 'core.pos'
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    if (entitlement.rows[0]?.enforcement === "DISABLED_VISIBLE") {
      return [];
    }

    const result = await this.db.query<{ account_id: string }>(
      `SELECT DISTINCT ba.account_id
       FROM v0_branch_assignments ba
       JOIN v0_tenant_memberships m
         ON m.id = ba.membership_id
       WHERE ba.tenant_id = $1
         AND ba.branch_id = $2
         AND ba.status = 'ACTIVE'
         AND m.status = 'ACTIVE'
         AND m.role_key IN ('OWNER', 'ADMIN', 'MANAGER')`,
      [input.tenantId, input.branchId]
    );
    return result.rows.map((row) => row.account_id);
  }

  async listOperationalRecipientAccountIdsForCashSessionZView(input: {
    tenantId: string;
    branchId: string;
  }): Promise<string[]> {
    return this.listOperationalRecipientAccountIdsForBranchManagerialReview(input);
  }

  async getCashSessionCloseContext(input: {
    tenantId: string;
    cashSessionId: string;
  }): Promise<V0CashSessionCloseContextRow | null> {
    const result = await this.db.query<V0CashSessionCloseContextRow>(
      `SELECT
         tenant_id,
         branch_id,
         cash_session_id,
         close_reason,
         closed_at,
         variance_usd::FLOAT8 AS variance_usd,
         variance_khr::FLOAT8 AS variance_khr
       FROM v0_cash_reconciliation_snapshots
       WHERE tenant_id = $1
         AND cash_session_id = $2
       LIMIT 1`,
      [input.tenantId, input.cashSessionId]
    );
    return result.rows[0] ?? null;
  }

  async getVoidRequestNotificationContext(input: {
    tenantId: string;
    branchId: string;
    voidRequestId: string;
  }): Promise<V0VoidRequestNotificationContextRow | null> {
    const result = await this.db.query<V0VoidRequestNotificationContextRow>(
      `SELECT
         tenant_id,
         branch_id,
         id AS void_request_id,
         sale_id,
         requested_by_account_id,
         reviewed_by_account_id,
         status,
         reason,
         review_note,
         requested_at,
         reviewed_at
       FROM v0_void_requests
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.voidRequestId]
    );
    return result.rows[0] ?? null;
  }
}
