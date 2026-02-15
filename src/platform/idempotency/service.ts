import { createHash } from "crypto";
import {
  V0IdempotencyRepository,
  type IdempotencyRecordRow,
} from "./repository.js";

export class V0IdempotencyError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0IdempotencyError";
  }
}

type IdempotencyScope = "TENANT" | "BRANCH";

type ExecuteInput<TBody> = {
  idempotencyKey: string | null;
  actionKey: string;
  scope: IdempotencyScope;
  tenantId: string | null;
  branchId: string | null;
  payload: unknown;
  handler: () => Promise<{ statusCode: number; body: TBody }>;
};

export class V0IdempotencyService {
  constructor(private readonly repo: V0IdempotencyRepository) {}

  async execute<TBody>(
    input: ExecuteInput<TBody>
  ): Promise<{ statusCode: number; body: TBody; replayed: boolean }> {
    const key = normalizeIdempotencyKey(input.idempotencyKey);
    if (!key) {
      throw new V0IdempotencyError(
        422,
        "IDEMPOTENCY_KEY_REQUIRED",
        "idempotency key is required"
      );
    }

    const tenantId = String(input.tenantId ?? "").trim();
    if (!tenantId) {
      throw new V0IdempotencyError(403, "TENANT_CONTEXT_REQUIRED", "tenant context required");
    }
    const branchId =
      input.scope === "BRANCH" ? String(input.branchId ?? "").trim() : null;
    if (input.scope === "BRANCH" && !branchId) {
      throw new V0IdempotencyError(403, "BRANCH_CONTEXT_REQUIRED", "branch context required");
    }

    const scopeFingerprint = buildScopeFingerprint({
      tenantId,
      branchId,
    });
    const payloadHash = hashPayload(input.payload);

    const started = await this.repo.tryStart({
      scopeFingerprint,
      tenantId,
      branchId,
      actionKey: input.actionKey,
      idempotencyKey: key,
      payloadHash,
    });

    if (started.started) {
      return this.applyAndComplete({
        record: started.record,
        handler: input.handler,
      });
    }

    const existing = await this.repo.findExisting({
      scopeFingerprint,
      actionKey: input.actionKey,
      idempotencyKey: key,
    });
    if (!existing) {
      throw new V0IdempotencyError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "operation is currently being processed"
      );
    }
    if (existing.payload_hash !== payloadHash) {
      throw new V0IdempotencyError(
        409,
        "IDEMPOTENCY_CONFLICT",
        "idempotency key already used with a different payload"
      );
    }
    if (existing.status !== "COMPLETED") {
      throw new V0IdempotencyError(
        409,
        "IDEMPOTENCY_IN_PROGRESS",
        "operation is currently being processed"
      );
    }

    return {
      statusCode: existing.response_status ?? 200,
      body: (existing.response_body ?? { success: true }) as TBody,
      replayed: true,
    };
  }

  private async applyAndComplete<TBody>(input: {
    record: IdempotencyRecordRow;
    handler: () => Promise<{ statusCode: number; body: TBody }>;
  }): Promise<{ statusCode: number; body: TBody; replayed: boolean }> {
    try {
      const result = await input.handler();
      await this.repo.complete({
        recordId: input.record.id,
        responseStatus: result.statusCode,
        responseBody: result.body,
      });
      return {
        statusCode: result.statusCode,
        body: result.body,
        replayed: false,
      };
    } catch (error) {
      await this.repo.clearProcessing(input.record.id);
      throw error;
    }
  }
}

function normalizeIdempotencyKey(value: string | null): string | null {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    return null;
  }
  if (normalized.length > 120) {
    return null;
  }
  return normalized;
}

function buildScopeFingerprint(input: {
  tenantId: string;
  branchId: string | null;
}): string {
  return `${input.tenantId}::${input.branchId ?? "-"}`;
}

function hashPayload(payload: unknown): string {
  const canonical = stableStringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }

  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b)
  );
  const body = entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",");
  return `{${body}}`;
}

export function getIdempotencyKeyFromHeader(headers: {
  [key: string]: string | string[] | undefined;
}): string | null {
  const raw = headers["idempotency-key"];
  if (Array.isArray(raw)) {
    return raw[0] ?? null;
  }
  return raw ?? null;
}
