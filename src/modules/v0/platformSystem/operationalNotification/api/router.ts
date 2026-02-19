import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0OperationalNotificationService } from "../app/service.js";

type ActorScope = {
  accountId: string;
  tenantId: string;
  branchId: string;
};

export class V0OperationalNotificationError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0OperationalNotificationError";
  }
}

export function createV0OperationalNotificationRouter(
  service: V0OperationalNotificationService
): Router {
  const router = Router();

  router.get("/inbox", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const limit = normalizeLimit(req.query?.limit);
      const offset = normalizeOffset(req.query?.offset);
      const unreadOnly = normalizeBoolean(req.query?.unreadOnly);
      const type = normalizeOptionalString(req.query?.type);

      const rows = await service.listInbox({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        recipientAccountId: actor.accountId,
        unreadOnly,
        type,
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        data: {
          items: rows.map(mapInboxItem),
          limit,
          offset,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/unread-count", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const unreadCount = await service.getUnreadCount({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        recipientAccountId: actor.accountId,
      });
      res.status(200).json({
        success: true,
        data: { unreadCount },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/:notificationId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const notificationId = assertUuid(req.params.notificationId, "notificationId");

      const item = await service.getInboxItem({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        recipientAccountId: actor.accountId,
        notificationId,
      });
      if (!item) {
        throw new V0OperationalNotificationError(
          404,
          "NOTIFICATION_NOT_FOUND",
          "notification not found"
        );
      }
      res.status(200).json({
        success: true,
        data: mapInboxItem(item),
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post(
    "/:notificationId/read",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = assertActorScope(req);
        const notificationId = assertUuid(req.params.notificationId, "notificationId");

        const readAt = await service.markRead({
          tenantId: actor.tenantId,
          branchId: actor.branchId,
          recipientAccountId: actor.accountId,
          notificationId,
        });
        if (!readAt) {
          throw new V0OperationalNotificationError(
            404,
            "NOTIFICATION_NOT_FOUND",
            "notification not found"
          );
        }
        res.status(200).json({
          success: true,
          data: {
            notificationId,
            isRead: true,
            readAt: readAt.toISOString(),
          },
        });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  router.post("/read-all", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorScope(req);
      const updatedCount = await service.markAllRead({
        tenantId: actor.tenantId,
        branchId: actor.branchId,
        recipientAccountId: actor.accountId,
      });
      res.status(200).json({
        success: true,
        data: { updatedCount },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

function assertActorScope(req: V0AuthRequest): ActorScope {
  const actor = req.v0Auth;
  if (!actor) {
    throw new V0OperationalNotificationError(
      401,
      "INVALID_ACCESS_TOKEN",
      "authentication required"
    );
  }
  const accountId = normalizeRequiredString(actor.accountId, "INVALID_ACCESS_TOKEN");
  const tenantId = normalizeRequiredString(actor.tenantId, "TENANT_CONTEXT_REQUIRED");
  const branchId = normalizeRequiredString(actor.branchId, "BRANCH_CONTEXT_REQUIRED");
  return { accountId, tenantId, branchId };
}

function mapInboxItem(row: {
  id: string;
  tenant_id: string;
  branch_id: string;
  type: string;
  subject_type: string;
  subject_id: string;
  title: string;
  body: string;
  dedupe_key: string;
  payload: Record<string, unknown> | null;
  created_at: Date;
  read_at: Date | null;
}) {
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

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0OperationalNotificationError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }
  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

function normalizeRequiredString(value: unknown, code: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    throw new V0OperationalNotificationError(403, code, code);
  }
  return normalized;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeLimit(value: unknown): number {
  const n = Number(value ?? 50);
  if (!Number.isFinite(n) || n <= 0) {
    return 50;
  }
  return Math.min(Math.floor(n), 200);
}

function normalizeOffset(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.floor(n);
}

function assertUuid(value: unknown, fieldName: string): string {
  const normalized = normalizeOptionalString(value);
  if (!normalized || !UUID_PATTERN.test(normalized)) {
    throw new V0OperationalNotificationError(
      422,
      "NOTIFICATION_VALIDATION_FAILED",
      `${fieldName} must be a valid UUID`
    );
  }
  return normalized;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
