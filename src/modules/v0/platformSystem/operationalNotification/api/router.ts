import { Router, type Response } from "express";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { V0OperationalNotificationService } from "../app/service.js";

type ActorScope = {
  accountId: string;
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
      const actor = assertActorAccountScope(req);
      const limit = normalizeLimit(req.query?.limit);
      const offset = normalizeOffset(req.query?.offset);
      const unreadOnly = normalizeBoolean(req.query?.unreadOnly);
      const type = normalizeOptionalString(req.query?.type);
      const tenantId = normalizeOptionalUuid(req.query?.tenantId, "tenantId");
      const branchId = normalizeOptionalUuid(req.query?.branchId, "branchId");

      const data = await service.listInbox({
        recipientAccountId: actor.accountId,
        tenantId,
        branchId,
        unreadOnly,
        type,
        limit,
        offset,
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/unread-count", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorAccountScope(req);
      const unreadCount = await service.getUnreadCount({
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

  router.get("/stream", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorAccountScope(req);
      startSse(res);

      const unreadCount = await service.getUnreadCount({
        recipientAccountId: actor.accountId,
      });
      writeSse(res, "ready", {
        unreadCount,
        serverTime: new Date().toISOString(),
      });

      const unsubscribe = service.subscribeRealtime(
        {
          recipientAccountId: actor.accountId,
        },
        (event) => {
          writeSse(res, event.type, event.data);
        }
      );

      const heartbeat = setInterval(() => {
        if (res.writableEnded) {
          clearInterval(heartbeat);
          return;
        }
        res.write(": keep-alive\n\n");
      }, 25_000);

      const cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      req.on("close", cleanup);
      req.on("aborted", cleanup);
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/:notificationId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = assertActorAccountScope(req);
      const notificationId = assertUuid(req.params.notificationId, "notificationId");

      const item = await service.getInboxItem({
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
        const actor = assertActorAccountScope(req);
        const notificationId = assertUuid(req.params.notificationId, "notificationId");

        const readAt = await service.markRead({
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
      const actor = assertActorAccountScope(req);
      const updatedCount = await service.markAllRead({
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

function startSse(res: Response): void {
  res.status(200);
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();
  res.write("retry: 3000\n\n");
}

function writeSse(res: Response, event: string, data: Record<string, unknown>): void {
  if (res.writableEnded) {
    return;
  }
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function assertActorAccountScope(req: V0AuthRequest): ActorScope {
  const actor = req.v0Auth;
  if (!actor) {
    throw new V0OperationalNotificationError(
      401,
      "INVALID_ACCESS_TOKEN",
      "authentication required"
    );
  }
  const accountId = normalizeRequiredString(actor.accountId, "INVALID_ACCESS_TOKEN");
  return { accountId };
}

function mapInboxItem(row: {
  id: string;
  tenant_id: string;
  tenant_name: string;
  branch_id: string;
  branch_name: string | null;
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
    tenantName: row.tenant_name,
    branchId: row.branch_id,
    branchName: row.branch_name,
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

function normalizeOptionalUuid(value: unknown, fieldName: string): string | null {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return null;
  }
  if (!UUID_PATTERN.test(normalized)) {
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
