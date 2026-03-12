import { Router, type Response } from "express";
import type { Pool } from "pg";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import {
  buildInventoryCommandDedupeKey,
  V0_INVENTORY_ACTION_KEYS,
  V0_INVENTORY_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0InventoryError, V0InventoryService } from "../app/service.js";
import { V0InventoryRepository } from "../infra/repository.js";

type InventoryResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
      details?: Record<string, unknown>;
    };

type WriteScope = "TENANT" | "BRANCH";

export function createV0InventoryRouter(input: {
  service: V0InventoryService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);

  router.get("/categories", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listCategories({
        actor,
        status: asString(req.query?.status),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/categories", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_INVENTORY_ACTION_KEYS.categoriesCreate,
      eventType: V0_INVENTORY_EVENT_TYPES.stockCategoryCreated,
      endpoint: "/v0/inventory/categories",
      entityType: "inventory_stock_category",
      writeScope: "TENANT",
      transactionManager,
      handler: async (service) =>
        service.createCategory({
          actor: req.v0Auth!,
          body: req.body,
        }),
      commandParts: [],
    });
  });

  router.patch(
    "/categories/:categoryId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.categoriesUpdate,
        eventType: V0_INVENTORY_EVENT_TYPES.stockCategoryUpdated,
        endpoint: "/v0/inventory/categories/:categoryId",
        entityType: "inventory_stock_category",
        writeScope: "TENANT",
        transactionManager,
        handler: async (service) =>
          service.updateCategory({
            actor: req.v0Auth!,
            categoryId: req.params.categoryId,
            body: req.body,
          }),
        commandParts: [req.params.categoryId],
      });
    }
  );

  router.post(
    "/categories/:categoryId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.categoriesArchive,
        eventType: V0_INVENTORY_EVENT_TYPES.stockCategoryArchived,
        endpoint: "/v0/inventory/categories/:categoryId/archive",
        entityType: "inventory_stock_category",
        writeScope: "TENANT",
        transactionManager,
        handler: async (service) =>
          service.archiveCategory({
            actor: req.v0Auth!,
            categoryId: req.params.categoryId,
          }),
        commandParts: [req.params.categoryId],
      });
    }
  );

  router.get("/items", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listStockItems({
        actor,
        status: asString(req.query?.status),
        categoryId: asString(req.query?.categoryId),
        search: asString(req.query?.search),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/items/:stockItemId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.getStockItem({
        actor,
        stockItemId: req.params.stockItemId,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/items", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_INVENTORY_ACTION_KEYS.itemsCreate,
      eventType: V0_INVENTORY_EVENT_TYPES.stockItemCreated,
      endpoint: "/v0/inventory/items",
      entityType: "inventory_stock_item",
      writeScope: "TENANT",
      transactionManager,
      handler: async (service) =>
        service.createStockItem({
          actor: req.v0Auth!,
          body: req.body,
        }),
      commandParts: [],
    });
  });

  router.patch(
    "/items/:stockItemId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.itemsUpdate,
        eventType: V0_INVENTORY_EVENT_TYPES.stockItemUpdated,
        endpoint: "/v0/inventory/items/:stockItemId",
        entityType: "inventory_stock_item",
        writeScope: "TENANT",
        transactionManager,
        handler: async (service) =>
          service.updateStockItem({
            actor: req.v0Auth!,
            stockItemId: req.params.stockItemId,
            body: req.body,
          }),
        commandParts: [req.params.stockItemId],
      });
    }
  );

  router.post(
    "/items/:stockItemId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.itemsArchive,
        eventType: V0_INVENTORY_EVENT_TYPES.stockItemArchived,
        endpoint: "/v0/inventory/items/:stockItemId/archive",
        entityType: "inventory_stock_item",
        writeScope: "TENANT",
        transactionManager,
        handler: async (service) =>
          service.archiveStockItem({
            actor: req.v0Auth!,
            stockItemId: req.params.stockItemId,
          }),
        commandParts: [req.params.stockItemId],
      });
    }
  );

  router.post(
    "/items/:stockItemId/restore",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.itemsRestore,
        eventType: V0_INVENTORY_EVENT_TYPES.stockItemRestored,
        endpoint: "/v0/inventory/items/:stockItemId/restore",
        entityType: "inventory_stock_item",
        writeScope: "TENANT",
        transactionManager,
        handler: async (service) =>
          service.restoreStockItem({
            actor: req.v0Auth!,
            stockItemId: req.params.stockItemId,
          }),
        commandParts: [req.params.stockItemId],
      });
    }
  );

  router.get("/restock-batches", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listRestockBatches({
        actor,
        branchId: asString(req.query?.branchId),
        status: asString(req.query?.status),
        stockItemId: asString(req.query?.stockItemId),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/restock-batches", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_INVENTORY_ACTION_KEYS.restockBatchesCreate,
      eventType: V0_INVENTORY_EVENT_TYPES.restockBatchRecorded,
      endpoint: "/v0/inventory/restock-batches",
      entityType: "inventory_restock_batch",
      writeScope: "BRANCH",
      transactionManager,
      resolveBranchId: (req) => toObject(req.body).branchId,
      handler: async (service, idempotencyKey) =>
        service.createRestockBatch({
          actor: req.v0Auth!,
          idempotencyKey,
          body: req.body,
        }),
      commandParts: [],
    });
  });

  router.patch(
    "/restock-batches/:batchId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.restockBatchesUpdateMeta,
        eventType: V0_INVENTORY_EVENT_TYPES.restockBatchMetadataUpdated,
        endpoint: "/v0/inventory/restock-batches/:batchId",
        entityType: "inventory_restock_batch",
        writeScope: "BRANCH",
        transactionManager,
        resolveBranchId: (req) => toObject(req.body).branchId,
        handler: async (service) =>
          service.updateRestockBatchMetadata({
            actor: req.v0Auth!,
            batchId: req.params.batchId,
            body: req.body,
          }),
        commandParts: [req.params.batchId],
      });
    }
  );

  router.post(
    "/restock-batches/:batchId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_INVENTORY_ACTION_KEYS.restockBatchesArchive,
        eventType: V0_INVENTORY_EVENT_TYPES.restockBatchArchived,
        endpoint: "/v0/inventory/restock-batches/:batchId/archive",
        entityType: "inventory_restock_batch",
        writeScope: "BRANCH",
        transactionManager,
        resolveBranchId: (req) => asString(req.query?.branchId),
        handler: async (service) =>
          service.archiveRestockBatch({
            actor: req.v0Auth!,
            batchId: req.params.batchId,
            branchId: asString(req.query?.branchId) ?? "",
          }),
        commandParts: [req.params.batchId],
      });
    }
  );

  router.post("/adjustments", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_INVENTORY_ACTION_KEYS.adjustmentsApply,
      eventType: V0_INVENTORY_EVENT_TYPES.adjustmentRecorded,
      endpoint: "/v0/inventory/adjustments",
      entityType: "inventory_journal_entry",
      writeScope: "BRANCH",
      transactionManager,
      resolveBranchId: (req) => toObject(req.body).branchId,
      handler: async (service, idempotencyKey) =>
        service.applyAdjustment({
          actor: req.v0Auth!,
          idempotencyKey,
          body: req.body,
        }),
      commandParts: [],
    });
  });

  router.get("/journal", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listJournal({
        actor,
        branchId: asString(req.query?.branchId),
        stockItemId: asString(req.query?.stockItemId),
        reasonCode: asString(req.query?.reasonCode),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/journal/all", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listJournalAll({
        actor,
        branchId: asString(req.query?.branchId),
        stockItemId: asString(req.query?.stockItemId),
        reasonCode: asString(req.query?.reasonCode),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/stock/branch", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.readBranchStock({
        actor,
        branchId: asString(req.query?.branchId),
        includeArchivedItems: asBoolean(req.query?.includeArchivedItems),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/stock/aggregate", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.readAggregateStock({
        actor,
        includeArchivedItems: asBoolean(req.query?.includeArchivedItems),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;

  async function executeWrite(inputWrite: {
    req: V0AuthRequest;
    res: Response;
    idempotencyService: V0IdempotencyService;
    actionKey: string;
    eventType: string;
    entityType: string;
    endpoint: string;
    writeScope: WriteScope;
    transactionManager: TransactionManager;
    resolveBranchId?: (req: V0AuthRequest) => unknown;
    handler: (service: V0InventoryService, idempotencyKey: string) => Promise<unknown>;
    commandParts: ReadonlyArray<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const commandIdempotencyKey = idempotencyKey ?? "";
    const actionKey = inputWrite.actionKey;

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId =
        inputWrite.writeScope === "BRANCH"
          ? normalizeOptionalString(inputWrite.resolveBranchId?.(inputWrite.req))
          : null;

      const result = await inputWrite.idempotencyService.execute<InventoryResponseBody>({
        idempotencyKey,
        actionKey,
        scope: inputWrite.writeScope,
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          query: inputWrite.req.query,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0InventoryService(new V0InventoryRepository(client));
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);

            const commandData = await inputWrite.handler(txService, commandIdempotencyKey);
            const entityId = String((commandData as { id?: string })?.id ?? tenantId);
            const dedupeKey = buildInventoryCommandDedupeKey(
              actionKey,
              commandIdempotencyKey,
              "SUCCESS",
              inputWrite.commandParts
            );

            await txAuditService.recordEvent({
              tenantId,
              branchId: branchId || null,
              actorAccountId: actor.accountId,
              actionKey,
              outcome: "SUCCESS",
              reasonCode: null,
              entityType: inputWrite.entityType,
              entityId,
              dedupeKey,
              metadata: {
                endpoint: inputWrite.endpoint,
                replayed: false,
              },
            });

            const outbox = await txOutboxRepository.insertEvent({
              tenantId,
              branchId: branchId || null,
              actionKey,
              eventType: inputWrite.eventType,
              actorType: "ACCOUNT",
              actorId: actor.accountId,
              entityType: inputWrite.entityType,
              entityId,
              outcome: "SUCCESS",
              dedupeKey,
              payload: {
                endpoint: inputWrite.endpoint,
                replayed: false,
              },
            });

            if (outbox.inserted && outbox.row) {
              const syncData = toSyncData(commandData);
              const extraChanges = collectExtraSyncChanges(commandData);
              if (inputWrite.writeScope === "BRANCH" && branchId) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId,
                  moduleKey: "inventory",
                  entityType: inputWrite.entityType,
                  entityId,
                  operation: "UPSERT",
                  revision: `inventory:${outbox.row.id}`,
                  data: syncData,
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });

                for (const extra of extraChanges) {
                  await txSyncRepository.appendChange({
                    tenantId,
                    branchId,
                    moduleKey: "inventory",
                    entityType: extra.entityType,
                    entityId: extra.entityId,
                    operation: "UPSERT",
                    revision: `inventory:${outbox.row.id}:${extra.entityType}`,
                    data: extra.data,
                    changedAt: outbox.row.occurred_at,
                    sourceOutboxId: outbox.row.id,
                  });
                }
              }

              if (inputWrite.writeScope === "TENANT") {
                const activeBranchIds = await txSyncRepository.listActiveBranchIdsByTenant(tenantId);
                for (const activeBranchId of activeBranchIds) {
                  await txSyncRepository.appendChange({
                    tenantId,
                    branchId: activeBranchId,
                    moduleKey: "inventory",
                    entityType: inputWrite.entityType,
                    entityId,
                    operation: "UPSERT",
                    revision: `inventory:${outbox.row.id}:${activeBranchId}`,
                    data: syncData,
                    changedAt: outbox.row.occurred_at,
                    sourceOutboxId: outbox.row.id,
                  });
                }
              }
            }

            return commandData;
          });

          return {
            statusCode: 200,
            body: {
              success: true,
              data,
            },
          };
        },
      });

      if (result.replayed) {
        inputWrite.res.setHeader("Idempotency-Replayed", "true");
      }
      inputWrite.res.status(result.statusCode).json(result.body);
    } catch (error) {
      handleError(inputWrite.res, error);
    }
  }
}

function asString(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }
  return typeof value === "string" ? value : undefined;
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | undefined {
  const str = asString(value);
  if (!str) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  const str = asString(value);
  if (!str) {
    return undefined;
  }
  const normalized = str.trim().toLowerCase();
  if (normalized === "true" || normalized === "1") {
    return true;
  }
  if (normalized === "false" || normalized === "0") {
    return false;
  }
  return undefined;
}

function toSyncData(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}

function collectExtraSyncChanges(
  commandData: unknown
): Array<{ entityType: string; entityId: string; data: Record<string, unknown> }> {
  if (!commandData || typeof commandData !== "object" || Array.isArray(commandData)) {
    return [];
  }

  const record = commandData as Record<string, unknown>;
  const extra: Array<{ entityType: string; entityId: string; data: Record<string, unknown> }> = [];

  const journalEntry = record.journalEntry;
  if (journalEntry && typeof journalEntry === "object" && !Array.isArray(journalEntry)) {
    const journalRecord = journalEntry as Record<string, unknown>;
    const id = typeof journalRecord.id === "string" ? journalRecord.id : null;
    if (id) {
      extra.push({
        entityType: "inventory_journal_entry",
        entityId: id,
        data: journalRecord as Record<string, unknown>,
      });
    }
  }

  const branchStock = record.branchStockProjection;
  if (branchStock && typeof branchStock === "object" && !Array.isArray(branchStock)) {
    const stockRecord = branchStock as Record<string, unknown>;
    const id = typeof stockRecord.id === "string" ? stockRecord.id : null;
    if (id) {
      extra.push({
        entityType: "inventory_branch_stock_projection",
        entityId: id,
        data: stockRecord as Record<string, unknown>,
      });
    }
  }

  return extra;
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0InventoryError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  if (isUniqueViolation(error)) {
    res.status(409).json({
      success: false,
      error: "inventory uniqueness conflict",
      code: mapUniqueViolationCode(error.constraint),
    });
    return;
  }

  res.status(500).json({
    success: false,
    error: error instanceof Error ? error.message : "internal server error",
  });
}

function isUniqueViolation(error: unknown): error is { code: string; constraint?: string } {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error as { code?: string }).code === "23505"
  );
}

function mapUniqueViolationCode(constraint: string | undefined): string {
  if (!constraint) {
    return "INVENTORY_UNIQUE_CONSTRAINT";
  }
  if (constraint === "uq_v0_inventory_categories_tenant_name_active") {
    return "INVENTORY_STOCK_CATEGORY_DUPLICATE_NAME";
  }
  if (constraint === "uq_v0_inventory_items_tenant_name_active") {
    return "INVENTORY_STOCK_ITEM_DUPLICATE_NAME";
  }
  if (constraint === "uq_v0_inventory_external_source_anchor") {
    return "INVENTORY_DUPLICATE_EXTERNAL_MOVEMENT";
  }
  return "INVENTORY_UNIQUE_CONSTRAINT";
}
