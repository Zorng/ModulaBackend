import { Router, type Response } from "express";
import type { Pool } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0_KHQR_PAYMENT_ACTION_KEYS } from "../app/command-contract.js";
import {
  V0KhqrPaymentError,
  V0KhqrPaymentService,
} from "../app/service.js";
import { V0KhqrProviderError } from "../app/payment-provider.js";
import { V0KhqrPaymentRepository } from "../infra/repository.js";
import type { V0KhqrPaymentProvider } from "../app/payment-provider.js";

type KhqrResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0KhqrPaymentRouter(input: {
  service: V0KhqrPaymentService;
  provider: V0KhqrPaymentProvider;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.post("/webhooks/provider", async (req, res) => {
    try {
      const body = asRecord(req.body);
      const event = input.provider.parseWebhookEvent({
        headers: req.headers as unknown as Record<string, unknown>,
        body,
      });

      const result = await transactionManager.withTransaction(async (client) => {
        const txService = new V0KhqrPaymentService(
          new V0KhqrPaymentRepository(client),
          input.provider
        );
        return txService.ingestWebhookEvent({ event });
      });

      res.status(result.status === "IGNORED" ? 202 : 200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/sales/:saleId/generate", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.generate;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const saleId = assertUuid(req.params.saleId, "saleId");
      const body = parseGenerateBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          saleId,
          body,
        },
        handler: async () => {
          const data = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            return txService.generateForSale({
              actor,
              saleId,
              expiresInSeconds: body.expiresInSeconds,
            });
          });

          return {
            statusCode: 201,
            body: {
              success: true,
              data,
            },
          };
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/attempts", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.attemptRegister;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const body = parseRegisterBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          body,
        },
        handler: async () => {
          const writeResult = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            return txService.registerAttempt({
              actor,
              saleId: body.saleId,
              md5: body.md5,
              amount: body.amount,
              currency: body.currency,
              expiresAt: body.expiresAt,
            });
          });
          return {
            statusCode: writeResult.created ? 201 : 200,
            body: {
              success: true,
              data: writeResult.attempt,
            },
          };
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/attempts/:attemptId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const attemptId = assertUuid(req.params.attemptId, "attemptId");
      const data = await input.service.getAttemptById({
        actor,
        attemptId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get(
    "/attempts/by-md5/:md5",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const md5 = assertMd5(req.params.md5, "md5");
        const data = await input.service.getAttemptByMd5({
          actor,
          md5,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post("/confirm", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    const actor = req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(req.headers);
    const actionKey = V0_KHQR_PAYMENT_ACTION_KEYS.confirm;

    try {
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      const body = parseConfirmBody(req.body);
      const tenantId = normalizeOptionalString(actor.tenantId);
      const branchId = normalizeOptionalString(actor.branchId);

      const result = await input.idempotencyService.execute<KhqrResponseBody>({
        idempotencyKey,
        actionKey,
        scope: "BRANCH",
        tenantId,
        branchId,
        payload: {
          body,
        },
        handler: async () => {
          const data = await transactionManager.withTransaction(async (client) => {
            const txService = new V0KhqrPaymentService(
              new V0KhqrPaymentRepository(client),
              input.provider
            );
            return txService.confirmByMd5({
              actor,
              md5: body.md5,
            });
          });

          return {
            statusCode: 200,
            body: {
              success: true,
              data: {
                verificationStatus: data.verificationStatus,
                attempt: data.attempt,
                ...(data.mismatchReasonCode
                  ? { mismatchReasonCode: data.mismatchReasonCode }
                  : {}),
              },
            },
          };
        },
      });

      if (result.replayed) {
        res.setHeader("Idempotency-Replayed", "true");
      }
      res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function parseRegisterBody(body: unknown): {
  saleId: string;
  md5: string;
  amount: number;
  currency: "USD" | "KHR";
  expiresAt: Date | null;
} {
  const record = asRecord(body);
  const saleId = assertUuid(record.saleId, "saleId");
  const md5 = assertMd5(record.md5, "md5");
  const amount = assertPositiveNumber(record.amount, "amount");
  const currency = assertCurrency(record.currency);
  const expiresAt = parseOptionalIsoDate(record.expiresAt, "expiresAt");
  return {
    saleId,
    md5,
    amount,
    currency,
    expiresAt,
  };
}

function parseConfirmBody(body: unknown): { md5: string } {
  const record = asRecord(body);
  return {
    md5: assertMd5(record.md5, "md5"),
  };
}

function parseGenerateBody(body: unknown): { expiresInSeconds: number | null } {
  const record = asRecord(body ?? {});
  const raw = record.expiresInSeconds;
  if (raw === undefined || raw === null || String(raw).trim().length === 0) {
    return { expiresInSeconds: null };
  }
  const numeric = Number(raw);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "expiresInSeconds must be a positive number"
    );
  }
  return { expiresInSeconds: Math.floor(numeric) };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "body must be an object"
    );
  }
  return value as Record<string, unknown>;
}

function assertUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid UUID`
    );
  }
  return normalized;
}

function assertMd5(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !MD5_PATTERN.test(normalized)) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid md5 hash`
    );
  }
  return normalized.toLowerCase();
}

function assertPositiveNumber(value: unknown, fieldName: string): number {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue <= 0) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be greater than 0`
    );
  }
  return Number(numberValue.toFixed(2));
}

function assertCurrency(value: unknown): "USD" | "KHR" {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (normalized !== "USD" && normalized !== "KHR") {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      "currency must be USD or KHR"
    );
  }
  return normalized;
}

function parseOptionalIsoDate(value: unknown, fieldName: string): Date | null {
  if (value === undefined || value === null || String(value).trim().length === 0) {
    return null;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    throw new V0KhqrPaymentError(
      422,
      "KHQR_ATTEMPT_PAYLOAD_INVALID",
      `${fieldName} must be a valid ISO datetime`
    );
  }
  return parsed;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function handleError(res: Response, error: unknown): void {
  if (
    error instanceof V0KhqrPaymentError ||
    error instanceof V0IdempotencyError ||
    error instanceof V0KhqrProviderError
  ) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof Error && isPostgresUniqueViolation(error)) {
    res.status(409).json({
      success: false,
      error: "khqr attempt already exists",
      code: "KHQR_ATTEMPT_ALREADY_EXISTS",
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

function isPostgresUniqueViolation(error: Error): boolean {
  const code = (error as Error & { code?: string }).code;
  return code === "23505";
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MD5_PATTERN = /^[0-9a-f]{32}$/i;
