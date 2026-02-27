import type { Pool, PoolClient } from "pg";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export type V0KhqrAttemptStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "EXPIRED"
  | "SUPERSEDED"
  | "CANCELLED"
  | "PENDING_CONFIRMATION";

export type V0KhqrVerificationStatus =
  | "CONFIRMED"
  | "UNPAID"
  | "MISMATCH"
  | "EXPIRED"
  | "NOT_FOUND";

export type V0KhqrCurrency = "USD" | "KHR";
export type V0SaleType = "DINE_IN" | "TAKEAWAY" | "DELIVERY";
export type V0KhqrProvider = "BAKONG" | "STUB";
export type V0PaymentIntentStatus =
  | "WAITING_FOR_PAYMENT"
  | "PAID_CONFIRMED"
  | "FINALIZED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED_PROOF";

export type V0PaymentIntentRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_id: string | null;
  status: V0PaymentIntentStatus;
  payment_method: "KHQR" | "CASH";
  tender_currency: V0KhqrCurrency;
  tender_amount: number;
  expected_to_account_id: string | null;
  expires_at: Date | null;
  paid_confirmed_at: Date | null;
  finalized_at: Date | null;
  cancelled_at: Date | null;
  reason_code: string | null;
  active_attempt_id: string | null;
  checkout_lines_snapshot: unknown;
  checkout_totals_snapshot: unknown;
  pricing_snapshot: unknown;
  metadata_snapshot: unknown;
  created_by_account_id: string | null;
  created_at: Date;
  updated_at: Date;
};

export type V0KhqrPaymentAttemptRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  payment_intent_id: string;
  sale_id: string | null;
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

export type V0BranchKhqrReceiverRow = {
  khqr_receiver_account_id: string | null;
  khqr_receiver_name: string | null;
};

export type V0SaleKhqrSnapshotRow = {
  id: string;
  tenant_id: string;
  branch_id: string;
  sale_type: V0SaleType;
  status: "PENDING" | "FINALIZED" | "VOID_PENDING" | "VOIDED";
  payment_method: "CASH" | "KHQR";
  tender_currency: V0KhqrCurrency;
  tender_amount: number;
  paid_amount: number;
  grand_total_usd: number;
  grand_total_khr: number;
  khqr_md5: string | null;
  khqr_to_account_id: string | null;
  khqr_hash: string | null;
  khqr_confirmed_at: Date | null;
  finalized_at: Date | null;
  finalized_by_account_id: string | null;
};

export type V0SaleKhqrLineSnapshotInput = {
  menuItemId: string;
  menuItemNameSnapshot: string;
  unitPrice: number;
  quantity: number;
  lineDiscountAmount: number;
  lineTotalAmount: number;
  modifierSnapshot: unknown;
};

const ATTEMPT_SELECT_FIELDS = `
  id,
  tenant_id,
  branch_id,
  payment_intent_id,
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

const PAYMENT_INTENT_SELECT_FIELDS = `
  id,
  tenant_id,
  branch_id,
  sale_id::TEXT AS sale_id,
  status,
  payment_method,
  tender_currency,
  tender_amount::FLOAT8 AS tender_amount,
  expected_to_account_id,
  expires_at,
  paid_confirmed_at,
  finalized_at,
  cancelled_at,
  reason_code,
  active_attempt_id,
  checkout_lines_snapshot,
  checkout_totals_snapshot,
  pricing_snapshot,
  metadata_snapshot,
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

  async hasOpenCashSession(input: {
    tenantId: string;
    branchId: string;
  }): Promise<boolean> {
    const result = await this.db.query<{ id: string }>(
      `SELECT id
       FROM v0_cash_sessions
       WHERE tenant_id = $1
         AND branch_id = $2
         AND status = 'OPEN'
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return Boolean(result.rows[0]);
  }

  async findBranchKhqrReceiver(input: {
    tenantId: string;
    branchId: string;
  }): Promise<V0BranchKhqrReceiverRow | null> {
    const result = await this.db.query<V0BranchKhqrReceiverRow>(
      `SELECT
         khqr_receiver_account_id,
         khqr_receiver_name
       FROM branches
       WHERE tenant_id = $1
         AND id = $2
       LIMIT 1`,
      [input.tenantId, input.branchId]
    );
    return result.rows[0] ?? null;
  }

  async lockSaleForKhqrGeneration(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
  }): Promise<V0SaleKhqrSnapshotRow | null> {
    const result = await this.db.query<V0SaleKhqrSnapshotRow>(
      `SELECT
         id,
         tenant_id,
         branch_id,
         sale_type,
         status,
         payment_method,
         tender_currency,
         tender_amount::FLOAT8 AS tender_amount,
         paid_amount::FLOAT8 AS paid_amount,
         grand_total_usd::FLOAT8 AS grand_total_usd,
         grand_total_khr::FLOAT8 AS grand_total_khr,
         khqr_md5,
         khqr_to_account_id,
         khqr_hash,
         khqr_confirmed_at,
         finalized_at,
         finalized_by_account_id
       FROM v0_sales
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId, input.branchId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async updateSaleKhqrReference(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    md5: string;
    toAccountId: string;
    khqrHash: string | null;
  }): Promise<void> {
    await this.db.query(
      `UPDATE v0_sales
       SET khqr_md5 = $4,
           khqr_to_account_id = $5,
           khqr_hash = COALESCE($6, khqr_hash),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.md5,
        input.toAccountId,
        input.khqrHash,
      ]
    );
  }

  async markSaleFinalizedFromKhqr(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    md5: string;
    toAccountId: string;
    khqrHash: string | null;
    khqrConfirmedAt: Date | null;
    finalizedByAccountId: string | null;
  }): Promise<V0SaleKhqrSnapshotRow | null> {
    const result = await this.db.query<V0SaleKhqrSnapshotRow>(
      `UPDATE v0_sales
       SET status = 'FINALIZED',
           khqr_md5 = COALESCE(khqr_md5, $4),
           khqr_to_account_id = COALESCE(khqr_to_account_id, $5),
           khqr_hash = COALESCE($6, khqr_hash),
           khqr_confirmed_at = COALESCE($7, khqr_confirmed_at),
           finalized_at = COALESCE(finalized_at, NOW()),
           finalized_by_account_id = COALESCE(finalized_by_account_id, $8),
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
         AND status = 'PENDING'
       RETURNING
         id,
         tenant_id,
         branch_id,
         sale_type,
         status,
         payment_method,
         tender_currency,
         tender_amount::FLOAT8 AS tender_amount,
         paid_amount::FLOAT8 AS paid_amount,
         grand_total_usd::FLOAT8 AS grand_total_usd,
         grand_total_khr::FLOAT8 AS grand_total_khr,
         khqr_md5,
         khqr_to_account_id,
         khqr_hash,
         khqr_confirmed_at,
         finalized_at,
         finalized_by_account_id`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.md5,
        input.toAccountId,
        input.khqrHash,
        input.khqrConfirmedAt,
        input.finalizedByAccountId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async createPendingSaleForKhqrIntent(input: {
    tenantId: string;
    branchId: string;
    saleType: V0SaleType;
    tenderCurrency: V0KhqrCurrency;
    tenderAmount: number;
    khqrMd5: string;
    khqrToAccountId: string;
    khqrHash: string | null;
    khqrConfirmedAt: Date | null;
    subtotalUsd: number;
    subtotalKhr: number;
    discountUsd: number;
    discountKhr: number;
    vatUsd: number;
    vatKhr: number;
    grandTotalUsd: number;
    grandTotalKhr: number;
    saleFxRateKhrPerUsd: number;
    saleKhrRoundingEnabled: boolean;
    saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
    saleKhrRoundingGranularity: 100 | 1000;
    paidAmount: number;
  }): Promise<V0SaleKhqrSnapshotRow> {
    const result = await this.db.query<V0SaleKhqrSnapshotRow>(
      `INSERT INTO v0_sales (
         tenant_id,
         branch_id,
         order_ticket_id,
         status,
         payment_method,
         tender_currency,
         tender_amount,
         cash_received_tender_amount,
         cash_change_tender_amount,
         khqr_md5,
         khqr_to_account_id,
         khqr_hash,
         khqr_confirmed_at,
         subtotal_usd,
         subtotal_khr,
         discount_usd,
         discount_khr,
         vat_usd,
         vat_khr,
         grand_total_usd,
         grand_total_khr,
         sale_fx_rate_khr_per_usd,
         sale_khr_rounding_enabled,
         sale_khr_rounding_mode,
         sale_khr_rounding_granularity,
         subtotal_amount,
         discount_amount,
         vat_amount,
         total_amount,
         paid_amount,
         sale_type
       )
       VALUES (
         $1,
         $2,
         NULL,
         'PENDING',
         'KHQR',
         $3,
         $4::NUMERIC(14,2),
         NULL,
         0::NUMERIC(14,2),
         $5,
         $6,
         $7,
         $8,
         $9::NUMERIC(14,2),
         $10::NUMERIC(14,2),
         $11::NUMERIC(14,2),
         $12::NUMERIC(14,2),
         $13::NUMERIC(14,2),
         $14::NUMERIC(14,2),
         $15::NUMERIC(14,2),
         $16::NUMERIC(14,2),
         $17::NUMERIC(14,4),
         $18,
         $19,
         $20,
         $9::NUMERIC(14,2),
         $11::NUMERIC(14,2),
         $13::NUMERIC(14,2),
         $15::NUMERIC(14,2),
         $21::NUMERIC(14,2),
         $22
       )
       RETURNING
         id,
         tenant_id,
         branch_id,
         sale_type,
         status,
         payment_method,
         tender_currency,
         tender_amount::FLOAT8 AS tender_amount,
         paid_amount::FLOAT8 AS paid_amount,
         grand_total_usd::FLOAT8 AS grand_total_usd,
         grand_total_khr::FLOAT8 AS grand_total_khr,
         khqr_md5,
         khqr_to_account_id,
         khqr_hash,
         khqr_confirmed_at,
         finalized_at,
         finalized_by_account_id`,
      [
        input.tenantId,
        input.branchId,
        input.tenderCurrency,
        input.tenderAmount,
        input.khqrMd5,
        input.khqrToAccountId,
        input.khqrHash,
        input.khqrConfirmedAt,
        input.subtotalUsd,
        input.subtotalKhr,
        input.discountUsd,
        input.discountKhr,
        input.vatUsd,
        input.vatKhr,
        input.grandTotalUsd,
        input.grandTotalKhr,
        input.saleFxRateKhrPerUsd,
        input.saleKhrRoundingEnabled,
        input.saleKhrRoundingMode,
        input.saleKhrRoundingGranularity,
        input.paidAmount,
        input.saleType,
      ]
    );
    return result.rows[0];
  }

  async createSaleLineForKhqrIntent(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    line: V0SaleKhqrLineSnapshotInput;
  }): Promise<void> {
    await this.db.query(
      `INSERT INTO v0_sale_lines (
         tenant_id,
         branch_id,
         sale_id,
         order_ticket_line_id,
         menu_item_id,
         menu_item_name_snapshot,
         unit_price,
         quantity,
         line_discount_amount,
         line_total_amount,
         modifier_snapshot
       )
       VALUES (
         $1,
         $2,
         $3,
         NULL,
         $4::UUID,
         $5,
         $6::NUMERIC(14,2),
         $7::NUMERIC(12,3),
         $8::NUMERIC(14,2),
         $9::NUMERIC(14,2),
         $10::JSONB
       )`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.line.menuItemId,
        input.line.menuItemNameSnapshot,
        input.line.unitPrice,
        input.line.quantity,
        input.line.lineDiscountAmount,
        input.line.lineTotalAmount,
        JSON.stringify(input.line.modifierSnapshot ?? []),
      ]
    );
  }

  async markPaymentIntentFinalized(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    saleId: string;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `UPDATE v0_payment_intents
       SET status = 'FINALIZED',
           sale_id = COALESCE(sale_id, $4::UUID),
           finalized_at = COALESCE(finalized_at, NOW()),
           reason_code = NULL,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [input.tenantId, input.branchId, input.paymentIntentId, input.saleId]
    );
    return result.rows[0] ?? null;
  }

  async lockPaymentIntentByIdForUpdate(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `SELECT
         ${PAYMENT_INTENT_SELECT_FIELDS}
       FROM v0_payment_intents
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1
       FOR UPDATE`,
      [input.tenantId, input.branchId, input.paymentIntentId]
    );
    return result.rows[0] ?? null;
  }

  async ensurePaymentIntentForSale(input: {
    tenantId: string;
    branchId: string;
    saleId: string;
    tenderAmount: number;
    tenderCurrency: V0KhqrCurrency;
    expectedToAccountId: string;
    expiresAt: Date | null;
    createdByAccountId: string | null;
  }): Promise<V0PaymentIntentRow> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `INSERT INTO v0_payment_intents (
         tenant_id,
         branch_id,
         sale_id,
         status,
         payment_method,
         tender_currency,
         tender_amount,
         expected_to_account_id,
         expires_at,
         created_by_account_id
       )
       VALUES (
         $1,
         $2,
         $3::UUID,
         'WAITING_FOR_PAYMENT',
         'KHQR',
         $4,
         $5::NUMERIC(14,2),
         $6,
         $7,
         $8
       )
       ON CONFLICT (tenant_id, branch_id, sale_id)
       DO UPDATE
       SET tender_currency = EXCLUDED.tender_currency,
           tender_amount = EXCLUDED.tender_amount,
           expected_to_account_id = EXCLUDED.expected_to_account_id,
           expires_at = EXCLUDED.expires_at,
           status = CASE
             WHEN v0_payment_intents.status IN ('FINALIZED', 'PAID_CONFIRMED')
               THEN v0_payment_intents.status
             ELSE 'WAITING_FOR_PAYMENT'
           END,
           reason_code = CASE
             WHEN v0_payment_intents.status IN ('FINALIZED', 'PAID_CONFIRMED')
               THEN v0_payment_intents.reason_code
             ELSE NULL
           END,
           cancelled_at = CASE
             WHEN v0_payment_intents.status IN ('FINALIZED', 'PAID_CONFIRMED')
               THEN v0_payment_intents.cancelled_at
             ELSE NULL
           END,
           updated_at = NOW()
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.saleId,
        input.tenderCurrency,
        input.tenderAmount,
        input.expectedToAccountId,
        input.expiresAt,
        input.createdByAccountId,
      ]
    );
    return result.rows[0];
  }

  async createPaymentIntentForCheckout(input: {
    tenantId: string;
    branchId: string;
    paymentMethod: "KHQR" | "CASH";
    tenderCurrency: V0KhqrCurrency;
    tenderAmount: number;
    expectedToAccountId: string | null;
    expiresAt: Date | null;
    checkoutLinesSnapshot: unknown;
    checkoutTotalsSnapshot: unknown;
    pricingSnapshot: unknown;
    metadataSnapshot: unknown;
    createdByAccountId: string | null;
  }): Promise<V0PaymentIntentRow> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `INSERT INTO v0_payment_intents (
         tenant_id,
         branch_id,
         sale_id,
         status,
         payment_method,
         tender_currency,
         tender_amount,
         expected_to_account_id,
         expires_at,
         checkout_lines_snapshot,
         checkout_totals_snapshot,
         pricing_snapshot,
         metadata_snapshot,
         created_by_account_id
       )
       VALUES (
         $1,
         $2,
         NULL,
         'WAITING_FOR_PAYMENT',
         $3,
         $4,
         $5::NUMERIC(14,2),
         $6,
         $7,
         $8::JSONB,
         $9::JSONB,
         $10::JSONB,
         $11::JSONB,
         $12
       )
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.paymentMethod,
        input.tenderCurrency,
        input.tenderAmount,
        input.expectedToAccountId,
        input.expiresAt,
        JSON.stringify(input.checkoutLinesSnapshot ?? []),
        JSON.stringify(input.checkoutTotalsSnapshot ?? {}),
        JSON.stringify(input.pricingSnapshot ?? {}),
        JSON.stringify(input.metadataSnapshot ?? {}),
        input.createdByAccountId,
      ]
    );
    return result.rows[0];
  }

  async findPaymentIntentById(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `SELECT
         ${PAYMENT_INTENT_SELECT_FIELDS}
       FROM v0_payment_intents
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       LIMIT 1`,
      [input.tenantId, input.branchId, input.paymentIntentId]
    );
    return result.rows[0] ?? null;
  }

  async setPaymentIntentActiveAttempt(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    activeAttemptId: string;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `UPDATE v0_payment_intents
       SET active_attempt_id = $4,
           status = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN status
             ELSE 'WAITING_FOR_PAYMENT'
           END,
           reason_code = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN reason_code
             ELSE NULL
           END,
           cancelled_at = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN cancelled_at
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.paymentIntentId,
        input.activeAttemptId,
      ]
    );
    return result.rows[0] ?? null;
  }

  async recordPaymentIntentVerificationOutcome(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    verificationStatus: V0KhqrVerificationStatus;
    reasonCode: string | null;
    providerConfirmedAt: Date | null;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `UPDATE v0_payment_intents
       SET status = CASE
             WHEN status IN ('FINALIZED', 'CANCELLED') THEN status
             WHEN $4 = 'CONFIRMED' THEN 'PAID_CONFIRMED'
             WHEN $4 = 'MISMATCH' THEN 'FAILED_PROOF'
             WHEN $4 = 'EXPIRED' THEN 'EXPIRED'
             ELSE status
           END,
           paid_confirmed_at = CASE
             WHEN status IN ('FINALIZED', 'CANCELLED') THEN paid_confirmed_at
             WHEN $4 = 'CONFIRMED' THEN COALESCE($6, NOW())
             ELSE paid_confirmed_at
           END,
           reason_code = CASE
             WHEN status IN ('FINALIZED', 'CANCELLED') THEN reason_code
             WHEN $4 = 'CONFIRMED' THEN NULL
             ELSE COALESCE($5, reason_code)
           END,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.paymentIntentId,
        input.verificationStatus,
        input.reasonCode,
        input.providerConfirmedAt,
      ]
    );
    return result.rows[0] ?? null;
  }

  async cancelPaymentIntent(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    reasonCode: string | null;
  }): Promise<V0PaymentIntentRow | null> {
    const result = await this.db.query<V0PaymentIntentRow>(
      `UPDATE v0_payment_intents
       SET status = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN status
             ELSE 'CANCELLED'
           END,
           cancelled_at = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN cancelled_at
             ELSE COALESCE(cancelled_at, NOW())
           END,
           reason_code = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN reason_code
             ELSE COALESCE($4, reason_code, 'KHQR_ATTEMPT_CANCELLED')
           END,
           active_attempt_id = CASE
             WHEN status IN ('FINALIZED', 'PAID_CONFIRMED') THEN active_attempt_id
             ELSE NULL
           END,
           updated_at = NOW()
       WHERE tenant_id = $1
         AND branch_id = $2
         AND id = $3
       RETURNING
         ${PAYMENT_INTENT_SELECT_FIELDS}`,
      [input.tenantId, input.branchId, input.paymentIntentId, input.reasonCode]
    );
    return result.rows[0] ?? null;
  }

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
    paymentIntentId: string;
    saleId?: string | null;
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
         payment_intent_id,
         sale_id,
         md5,
         status,
         expected_amount,
         expected_currency,
         expected_to_account_id,
         expires_at,
         created_by_account_id
       )
       VALUES ($1, $2, $3::UUID, $4::UUID, $5, 'WAITING_FOR_PAYMENT', $6::NUMERIC(14,2), $7, $8, $9, $10)
       RETURNING
         ${ATTEMPT_SELECT_FIELDS}`,
      [
        input.tenantId,
        input.branchId,
        input.paymentIntentId,
        input.saleId ?? null,
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

  async assignSaleToIntentAttempts(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    saleId: string;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH updated AS (
         UPDATE v0_khqr_payment_attempts
         SET sale_id = COALESCE(sale_id, $4::UUID),
             updated_at = NOW()
         WHERE tenant_id = $1
           AND branch_id = $2
           AND payment_intent_id = $3::UUID
         RETURNING id
       )
       SELECT COUNT(*)::TEXT AS count
       FROM updated`,
      [input.tenantId, input.branchId, input.paymentIntentId, input.saleId]
    );
    return Number(result.rows[0]?.count ?? "0");
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

  async lockUniqueAttemptByMd5ForUpdate(input: {
    md5: string;
  }): Promise<{
    attempt: V0KhqrPaymentAttemptRow | null;
    ambiguous: boolean;
  }> {
    const result = await this.db.query<V0KhqrPaymentAttemptRow>(
      `SELECT
         ${ATTEMPT_SELECT_FIELDS}
       FROM v0_khqr_payment_attempts
       WHERE md5 = $1
       ORDER BY created_at DESC
       LIMIT 2
       FOR UPDATE`,
      [input.md5]
    );

    if (result.rows.length === 0) {
      return { attempt: null, ambiguous: false };
    }
    if (result.rows.length > 1) {
      return { attempt: null, ambiguous: true };
    }

    return { attempt: result.rows[0], ambiguous: false };
  }

  async markOtherActiveAttemptsAsSuperseded(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
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
           AND payment_intent_id = $3::UUID
           AND id <> $4
           AND status IN ('WAITING_FOR_PAYMENT', 'PENDING_CONFIRMATION')
         RETURNING id
       )
       SELECT COUNT(*)::TEXT AS count
       FROM updated`,
      [
        input.tenantId,
        input.branchId,
        input.paymentIntentId,
        input.supersededByAttemptId,
      ]
    );
    return Number(result.rows[0]?.count ?? "0");
  }

  async markAttemptsCancelledForIntent(input: {
    tenantId: string;
    branchId: string;
    paymentIntentId: string;
    reasonCode: string | null;
  }): Promise<number> {
    const result = await this.db.query<{ count: string }>(
      `WITH updated AS (
         UPDATE v0_khqr_payment_attempts
         SET status = 'CANCELLED',
             last_verification_reason_code = COALESCE(
               $4,
               last_verification_reason_code,
               'KHQR_ATTEMPT_CANCELLED'
             ),
             updated_at = NOW()
         WHERE tenant_id = $1
           AND branch_id = $2
           AND payment_intent_id = $3::UUID
           AND status IN ('WAITING_FOR_PAYMENT', 'PENDING_CONFIRMATION')
         RETURNING id
       )
       SELECT COUNT(*)::TEXT AS count
       FROM updated`,
      [input.tenantId, input.branchId, input.paymentIntentId, input.reasonCode]
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
             WHEN status IN ('SUPERSEDED', 'CANCELLED') THEN status
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
