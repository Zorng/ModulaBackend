import type { BranchPolicyPatch, BranchPolicyRow } from "../infra/repository.js";
import { V0PolicyRepository } from "../infra/repository.js";

type ActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};

export class V0PolicyError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0PolicyError";
  }
}

type BranchPolicyDto = {
  tenantId: string;
  branchId: string;
  saleVatEnabled: boolean;
  saleVatRatePercent: number;
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: "NEAREST" | "UP" | "DOWN";
  saleKhrRoundingGranularity: "100" | "1000";
  createdAt: string;
  updatedAt: string;
};

export type UpdateBranchPolicyResult = {
  policy: BranchPolicyDto;
  updatedFields: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
};

export class V0PolicyService {
  constructor(private readonly repo: V0PolicyRepository) {}

  async getCurrentBranchPolicy(input: { actor: ActorContext }): Promise<BranchPolicyDto> {
    const scope = assertBranchContext(input.actor);
    await this.repo.ensureDefaultPolicyForBranch(scope);
    const row = await this.repo.getBranchPolicy(scope);
    if (!row) {
      throw new V0PolicyError(404, "branch policy not found");
    }
    return mapPolicyRow(row);
  }

  async updateCurrentBranchPolicy(input: {
    actor: ActorContext;
    patch: unknown;
  }): Promise<UpdateBranchPolicyResult> {
    const scope = assertBranchContext(input.actor);
    const patch = normalizePatch(input.patch);

    await this.repo.ensureDefaultPolicyForBranch(scope);
    const before = await this.repo.getBranchPolicy(scope);
    if (!before) {
      throw new V0PolicyError(404, "branch policy not found");
    }

    const after = await this.repo.upsertBranchPolicyPatch({
      tenantId: scope.tenantId,
      branchId: scope.branchId,
      patch,
    });
    if (!after) {
      throw new V0PolicyError(404, "branch policy not found");
    }

    const diff = buildPolicyDiff(before, after);
    return {
      policy: mapPolicyRow(after),
      updatedFields: diff.updatedFields,
      oldValues: diff.oldValues,
      newValues: diff.newValues,
    };
  }
}

function assertBranchContext(actor: ActorContext): {
  accountId: string;
  tenantId: string;
  branchId: string;
} {
  const accountId = String(actor.accountId ?? "").trim();
  const tenantId = String(actor.tenantId ?? "").trim();
  const branchId = String(actor.branchId ?? "").trim();
  if (!accountId) {
    throw new V0PolicyError(401, "authentication required");
  }
  if (!tenantId) {
    throw new V0PolicyError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
  }
  if (!branchId) {
    throw new V0PolicyError(403, "branch context required", "BRANCH_CONTEXT_REQUIRED");
  }
  return { accountId, tenantId, branchId };
}

function normalizePatch(input: unknown): BranchPolicyPatch {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new V0PolicyError(422, "policy patch must be an object", "POLICY_VALIDATION_FAILED");
  }

  const body = input as Record<string, unknown>;
  const patch: BranchPolicyPatch = {};

  if (Object.prototype.hasOwnProperty.call(body, "saleVatEnabled")) {
    if (typeof body.saleVatEnabled !== "boolean") {
      throw new V0PolicyError(422, "saleVatEnabled must be boolean", "POLICY_VALIDATION_FAILED");
    }
    patch.saleVatEnabled = body.saleVatEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(body, "saleVatRatePercent")) {
    const value = toFiniteNumber(body.saleVatRatePercent, "saleVatRatePercent");
    if (value < 0 || value > 100) {
      throw new V0PolicyError(
        422,
        "saleVatRatePercent must be in range [0, 100]",
        "POLICY_VALIDATION_FAILED"
      );
    }
    patch.saleVatRatePercent = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "saleFxRateKhrPerUsd")) {
    const value = toFiniteNumber(body.saleFxRateKhrPerUsd, "saleFxRateKhrPerUsd");
    if (value <= 0) {
      throw new V0PolicyError(
        422,
        "saleFxRateKhrPerUsd must be greater than 0",
        "POLICY_VALIDATION_FAILED"
      );
    }
    patch.saleFxRateKhrPerUsd = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "saleKhrRoundingEnabled")) {
    if (typeof body.saleKhrRoundingEnabled !== "boolean") {
      throw new V0PolicyError(
        422,
        "saleKhrRoundingEnabled must be boolean",
        "POLICY_VALIDATION_FAILED"
      );
    }
    patch.saleKhrRoundingEnabled = body.saleKhrRoundingEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(body, "saleKhrRoundingMode")) {
    const value = String(body.saleKhrRoundingMode ?? "").trim().toUpperCase();
    if (value !== "NEAREST" && value !== "UP" && value !== "DOWN") {
      throw new V0PolicyError(
        422,
        "saleKhrRoundingMode must be one of NEAREST|UP|DOWN",
        "POLICY_VALIDATION_FAILED"
      );
    }
    patch.saleKhrRoundingMode = value;
  }

  if (Object.prototype.hasOwnProperty.call(body, "saleKhrRoundingGranularity")) {
    const numeric = Number(body.saleKhrRoundingGranularity);
    if (numeric !== 100 && numeric !== 1000) {
      throw new V0PolicyError(
        422,
        "saleKhrRoundingGranularity must be 100 or 1000",
        "POLICY_VALIDATION_FAILED"
      );
    }
    patch.saleKhrRoundingGranularity = numeric;
  }

  if (Object.keys(patch).length === 0) {
    throw new V0PolicyError(422, "policy patch is empty", "POLICY_PATCH_EMPTY");
  }

  return patch;
}

function toFiniteNumber(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new V0PolicyError(422, `${fieldName} must be a number`, "POLICY_VALIDATION_FAILED");
  }
  return parsed;
}

function mapPolicyRow(row: BranchPolicyRow): BranchPolicyDto {
  return {
    tenantId: row.tenant_id,
    branchId: row.branch_id,
    saleVatEnabled: row.sale_vat_enabled,
    saleVatRatePercent: row.sale_vat_rate_percent,
    saleFxRateKhrPerUsd: row.sale_fx_rate_khr_per_usd,
    saleKhrRoundingEnabled: row.sale_khr_rounding_enabled,
    saleKhrRoundingMode: row.sale_khr_rounding_mode,
    saleKhrRoundingGranularity: String(row.sale_khr_rounding_granularity) as "100" | "1000",
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

function buildPolicyDiff(before: BranchPolicyRow, after: BranchPolicyRow): {
  updatedFields: string[];
  oldValues: Record<string, unknown>;
  newValues: Record<string, unknown>;
} {
  const fields: ReadonlyArray<{
    key: string;
    before: unknown;
    after: unknown;
  }> = [
    { key: "saleVatEnabled", before: before.sale_vat_enabled, after: after.sale_vat_enabled },
    {
      key: "saleVatRatePercent",
      before: before.sale_vat_rate_percent,
      after: after.sale_vat_rate_percent,
    },
    {
      key: "saleFxRateKhrPerUsd",
      before: before.sale_fx_rate_khr_per_usd,
      after: after.sale_fx_rate_khr_per_usd,
    },
    {
      key: "saleKhrRoundingEnabled",
      before: before.sale_khr_rounding_enabled,
      after: after.sale_khr_rounding_enabled,
    },
    {
      key: "saleKhrRoundingMode",
      before: before.sale_khr_rounding_mode,
      after: after.sale_khr_rounding_mode,
    },
    {
      key: "saleKhrRoundingGranularity",
      before: String(before.sale_khr_rounding_granularity),
      after: String(after.sale_khr_rounding_granularity),
    },
  ];

  const updatedFields: string[] = [];
  const oldValues: Record<string, unknown> = {};
  const newValues: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.before !== field.after) {
      updatedFields.push(field.key);
      oldValues[field.key] = field.before;
      newValues[field.key] = field.after;
    }
  }

  return { updatedFields, oldValues, newValues };
}
