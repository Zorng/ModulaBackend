import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0KhqrAttemptStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "PENDING_CONFIRMATION";

export type V0KhqrVerificationStatus =
  | "CONFIRMED"
  | "UNPAID"
  | "MISMATCH"
  | "EXPIRED"
  | "NOT_FOUND";

export type V0KhqrCurrency = "USD" | "KHR";
export type V0KhqrProvider = "BAKONG" | "STUB";

export type V0KhqrPaymentAttemptRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string;
  md5: string;
  status: V0KhqrAttemptStatus;
  expected_amount: number;
  expected_currency: V0KhqrCurrency;
  expected_to_account_id: string;
  expires_at: Date | null;
  paid_confirmed_at: Date | null;
  superseded_by_attempt_id: string | null;
  last_verification_status: V0KhqrVerificationStatus | null;
  last_verification_reason_code: string | null;
  last_verification_at: Date | null;
  provider_reference: string | null;
  provider_confirmed_amount: number | null;
  provider_confirmed_currency: V0KhqrCurrency | null;
  provider_confirmed_to_account_id: string | null;
  provider_confirmed_at: Date | null;
  created_by_account_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type V0KhqrConfirmationEvidenceRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  attempt_id: string;
  provider: V0KhqrProvider;
  verification_status: V0KhqrVerificationStatus;
  reason_code: string | null;
  proof_payload: Record<string, unknown> | null;
  provider_event_id: string | null;
  provider_tx_hash: string | null;
  provider_confirmed_amount: number | null;
  provider_confirmed_currency: V0KhqrCurrency | null;
  provider_confirmed_to_account_id: string | null;
  occurred_at: Date;
  created_at: Date;
};

export type V0KhqrReconciliationCandidateRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
};

const ATTEMPT_SELECT_FIELDS = `
  id,
  tenant_id,
  branch_id,
  sale_id::TEXT AS sale_id,
  md5,
  status,
  expected_amount::FLOAT8 AS expected_amount,
  expected_currency,
  expected_to_account_id,
  expires_at,
  paid_confirmed_at,
  superseded_by_attempt_id,
  last_verification_status,
  last_verification_reason_code,
  last_verification_at,
  provider_reference,
  provider_confirmed_amount::FLOAT8 AS provider_confirmed_amount,
  provider_confirmed_currency,
  provider_confirmed_to_account_id,
  provider_confirmed_at,
  created_by_account_id,
  created_at,
  updated_at
`;

const EVIDENCE_SELECT_FIELDS = `
  id,
  tenant_id,
  branch_id,
  attempt_id,
  provider,
  verification_status,
  reason_code,
  proof_payload,
  provider_event_id,
  provider_tx_hash,
  provider_confirmed_amount::FLOAT8 AS provider_confirmed_amount,
  provider_confirmed_currency,
  provider_confirmed_to_account_id,
  occurred_at,
  created_at
`;

export class V0KhqrPaymentRepository {
  constructor(private readonly db: Queryable) {}

  async listReconciliationCandidates(input: {
    limit: number;
    recheckWindowMinutes: number;
  }): Promise<V0KhqrReconciliationCandidateRow[]> {
    const result = await this.db.query<V0KhqrReconciliationCandidateRow>(
      `SELECT
         id,
         tenant_id,
         branch_id
       FROM v0_khqr_payment_attempts
       WHERE status IN ('WAITING_FOR_PAYMENT', 'PENDING_CONFIRMATION')
         AND (
           last_verification_at IS NULL
           OR last_verification_at <= NOW() - make_interval(mins => $2::INT)
         )
       ORDER BY COALESCE(last_verification_at, created_at) ASC
       LIMIT $1`,
      [input.limit, input.recheckWindowMinutes]
    );
    return result.rows;
  }

  async lockAttemptByIdForUpdate(input: {
    attemptId: string;
  }): Promise<V0KhqrPaymentAttemptRow | null> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `SELECT
         ${ATTEMPT_SELECT_FIELDS}
       FROM v0_khqr_payment_attempts
       WHERE id = $1
       LIMIT 1
       FOR UPDATE`,
      [input.attemptId]
    );
    return result.rows[0] ?? null;
  }

  async createAttempt(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    md5: string;
    expectedAmount: number;
    expectedCurrency: V0KhqrCurrency;
    expectedToAccountId: string;
    expiresAt: Date | null;
    createdByAccountId: string | null;
  }): Promise<V0KhqrPaymentAttemptRow> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `INSERT INTO v0_khqr_payment_attempts (
         tenant_id,
         branch_id,
         sale_id,
         md5,
         status,
         expected_amount,
         expected_currency,
         expected_to_account_id,
         expires_at,
         created_by_account_id
       )
       VALUES ($1, $2, $3::UUID, $4, 'WAITING_FOR_PAYMENT', $5::NUMERIC(14,2), $6, $7, $8, $9)
       RETURNING
         ${ATTEMPT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.md5,
        input.expectedAmount,
        input.expectedCurrency,
        input.expectedToAccountId,
        input.expiresAt,
        input.createdByAccountId,
      ]
    );
    return result.rows[0];
  }

  async findAttemptById(input: {
    tenantId: string;
    branchId: string;
    attemptId: string;
  }): Promise<V0KhqrPaymentAttemptRow | null> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `SELECT
         ${ATTEMPT_SELECT_FIELDS}
       FROM v0_khqr_payment_attempts
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.attemptId]
    );
    return result.rows[0] ?? null;
  }

  async findAttemptByMd5(input: {
    tenantId: string;
    branchId: string;
    md5: string;
  }): Promise<V0KhqrPaymentAttemptRow | null> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `SELECT
         ${ATTEMPT_SELECT_FIELDS}
       FROM v0_khqr_payment_attempts
       WHERE tenant_id = $1
         AND branch_id = $2
         AND md5 = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.md5]
    );
    return result.rows[0] ?? null;
  }

  async lockAttemptByMd5ForUpdate(input: {
    tenantId: string;
    branchId: string;
    md5: string;
  }): Promise<V0KhqrPaymentAttemptRow | null> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `SELECT
         ${ATTEMPT_SELECT_FIELDS}
       FROM v0_khqr_payment_attempts
       WHERE tenant_id = $1
         AND branch_id = $2
         AND md5 = $3
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId, input.branchId, input.md5]
    );
    return result.rows[0] ?? null;
  }

  async markOtherActiveAttemptsAsSuperseded(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    supersededByAttemptId: string;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH updated AS (
         UPDATE v0_khqr_payment_attempts
         SET status = 'SUPERSEDED',
             superseded_by_attempt_id = $4,
             updated_at = NOW()
         WHERE tenant_id = $1
           AND branch_id = $2
           AND sale_id = $3::UUID
           AND id <> $4
           AND status IN ('WAITING_FOR_PAYMENT', 'PENDING_CONFIRMATION')
         RETURNING id
       )
       SELECT COUNT(*)::TEXT AS count
       FROM updated`,
      [input.tenantId, input.branchId, input.saleId, input.supersededByAttemptId]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async recordVerificationOutcome(input: {
    tenantId: string;
    branchId: string;
    attemptId: string;
    verificationStatus: V0KhqrVerificationStatus;
    reasonCode: string | null;
    verifiedAt: Date;
    providerReference: string | null;
    providerConfirmedAmount: number | null;
    providerConfirmedCurrency: V0KhqrCurrency | null;
    providerConfirmedToAccountId: string | null;
    providerConfirmedAt: Date | null;
  }): Promise<V0KhqrPaymentAttemptRow | null> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `UPDATE v0_khqr_payment_attempts
       SET status = CASE
             WHEN status = 'SUPERSEDED' THEN status
             WHEN $4 = 'CONFIRMED' THEN 'PAID_CONFIRMED'
             WHEN $4 = 'EXPIRED' THEN 'EXPIRED'
             WHEN $4 = 'MISMATCH' THEN 'PENDING_CONFIRMATION'
             ELSE status
           END,
           paid_confirmed_at = CASE
             WHEN $4 = 'CONFIRMED' THEN COALESCE($11, NOW())
             ELSE paid_confirmed_at
           END,
           last_verification_status = $4,
           last_verification_reason_code = $5,
           last_verification_at = $6,
           provider_reference = COALESCE($7::TEXT, provider_reference),
           provider_confirmed_amount = CASE
             WHEN $8::NUMERIC(14,2) IS NOT NULL THEN $8::NUMERIC(14,2)
             ELSE provider_confirmed_amount
           END,
           provider_confirmed_currency = COALESCE($9::VARCHAR(3), provider_confirmed_currency),
           provider_confirmed_to_account_id = COALESCE($10::TEXT, provider_confirmed_to_account_id),
           provider_confirmed_at = COALESCE($11::TIMESTAMPTZ, provider_confirmed_at),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING
         ${ATTEMPT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.attemptId,
        input.verificationStatus,
        input.reasonCode,
        input.verifiedAt,
        input.providerReference,
        input.providerConfirmedAmount,
        input.providerConfirmedCurrency,
        input.providerConfirmedToAccountId,
        input.providerConfirmedAt,
      ]
    );
    return result.rows[0] ?? null;
  }

  async insertConfirmationEvidence(input: {
    tenantId: string;
    branchId: string;
    attemptId: string;
    provider: V0KhqrProvider;
    verificationStatus: V0KhqrVerificationStatus;
    reasonCode: string | null;
    proofPayload: Record<string, unknown> | null;
    providerEventId: string | null;
    providerTxHash: string | null;
    providerConfirmedAmount: number | null;
    providerConfirmedCurrency: V0KhqrCurrency | null;
    providerConfirmedToAccountId: string | null;
    occurredAt: Date;
  }): Promise<V0KhqrConfirmationEvidenceRow> {
    const result = await this.db.query<V0KhqrConfirmationEvidenceRow>(
      `INSERT INTO v0_khqr_payment_confirmation_evidences (
         tenant_id,
         branch_id,
         attempt_id,
         provider,
         verification_status,
         reason_code,
         proof_payload,
         provider_event_id,
         provider_tx_hash,
         provider_confirmed_amount,
         provider_confirmed_currency,
         provider_confirmed_to_account_id,
         occurred_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7::JSONB,
         $8::TEXT,
         $9::TEXT,
         $10::NUMERIC(14,2),
         $11::VARCHAR(3),
         $12::TEXT,
         $13
       )
       RETURNING
         ${EVIDENCE_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.attemptId,
        input.provider,
        input.verificationStatus,
        input.reasonCode,
        input.proofPayload === null ? null : JSON.stringify(input.proofPayload),
        input.providerEventId,
        input.providerTxHash,
        input.providerConfirmedAmount,
        input.providerConfirmedCurrency,
        input.providerConfirmedToAccountId,
        input.occurredAt,
      ]
    );
    return result.rows[0];
  }

  async insertConfirmationEvidenceIfAbsent(input: {
    tenantId: string;
    branchId: string;
    attemptId: string;
    provider: V0KhqrProvider;
    verificationStatus: V0KhqrVerificationStatus;
    reasonCode: string | null;
    proofPayload: Record<string, unknown> | null;
    providerEventId: string | null;
    providerTxHash: string | null;
    providerConfirmedAmount: number | null;
    providerConfirmedCurrency: V0KhqrCurrency | null;
    providerConfirmedToAccountId: string | null;
    occurredAt: Date;
  }): Promise<{ inserted: boolean; row: V0KhqrConfirmationEvidenceRow | null }> {
    const result = await this.db.query<V0KhqrConfirmationEvidenceRow>(
      `INSERT INTO v0_khqr_payment_confirmation_evidences (
         tenant_id,
         branch_id,
         attempt_id,
         provider,
         verification_status,
         reason_code,
         proof_payload,
         provider_event_id,
         provider_tx_hash,
         provider_confirmed_amount,
         provider_confirmed_currency,
         provider_confirmed_to_account_id,
         occurred_at
       )
       VALUES (
         $1,
         $2,
         $3,
         $4,
         $5,
         $6,
         $7::JSONB,
         $8::TEXT,
         $9::TEXT,
         $10::NUMERIC(14,2),
         $11::VARCHAR(3),
         $12::TEXT,
         $13
       )
       ON CONFLICT (tenant_id, branch_id, provider, provider_event_id)
       WHERE provider_event_id IS NOT NULL
       DO NOTHING
       RETURNING
         ${EVIDENCE_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.attemptId,
        input.provider,
        input.verificationStatus,
        input.reasonCode,
        input.proofPayload === null ? null : JSON.stringify(input.proofPayload),
        input.providerEventId,
        input.providerTxHash,
        input.providerConfirmedAmount,
        input.providerConfirmedCurrency,
        input.providerConfirmedToAccountId,
        input.occurredAt,
      ]
    );
    const row = result.rows[0] ?? null;
    return { inserted: Boolean(row), row };
  }

  async findConfirmationEvidenceByProviderEvent(input: {
    tenantId: string;
    branchId: string;
    provider: V0KhqrProvider;
    providerEventId: string;
  }): Promise<V0KhqrConfirmationEvidenceRow | null> {
    const result = await this.db.query<V0KhqrConfirmationEvidenceRow>(
      `SELECT
         ${EVIDENCE_SELECT_FIELDS}
       FROM v0_khqr_payment_confirmation_evidences
       WHERE tenant_id = $1
         AND branch_id = $2
         AND provider = $3
         AND provider_event_id = $4
       LIMIT 1`,
      [input.tenantId, input.branchId, input.provider, input.providerEventId]
    );
    return result.rows[0] ?? null;
  }

  async listConfirmationEvidenceByAttempt(input: {
    tenantId: string;
    branchId: string;
    attemptId: string;
  }): Promise<V0KhqrConfirmationEvidenceRow[]> {
    const result = await this.db.query<V0KhqrConfirmationEvidenceRow>(
      `SELECT
         ${EVIDENCE_SELECT_FIELDS}
       FROM v0_khqr_payment_confirmation_evidences
       WHERE tenant_id = $1
         AND branch_id = $2
         AND attempt_id = $3
       ORDER BY occurred_at DESC, created_at DESC`,
      [input.tenantId, input.branchId, input.attemptId]
    );
    return result.rows;
  }
}
