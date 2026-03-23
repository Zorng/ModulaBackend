import { Router, type Response } from "express";
import type { Pool } from "pg";
import multer from "multer";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { TransactionManager } from "../../../../../platform/db/transactionManager.js";
import {
  getIdempotencyKeyFromHeader,
  V0IdempotencyError,
  V0IdempotencyService,
} from "../../../../../platform/idempotency/service.js";
import { V0CommandOutboxRepository } from "../../../../../platform/outbox/repository.js";
import { V0PullSyncRepository } from "../../../platformSystem/pullSync/infra/repository.js";
import { uploadSingleImage } from "../../../../../platform/http/middleware/multer.js";
import {
  deriveObjectKeyFromImageUrl,
  uploadTenantScopedImageToR2,
  V0ImageStorageError,
} from "../../../../../platform/storage/r2-image-storage.js";
import { V0MediaUploadRepository } from "../../../../../platform/media-uploads/repository.js";
import { V0AuditService } from "../../../audit/app/service.js";
import { V0AuditRepository } from "../../../audit/infra/repository.js";
import {
  buildMenuCommandDedupeKey,
  V0_MENU_ACTION_KEYS,
  V0_MENU_EVENT_TYPES,
} from "../app/command-contract.js";
import { V0MenuError, V0MenuService } from "../app/service.js";
import { V0MenuRepository } from "../infra/repository.js";

type MenuResponseBody =
  | {
      success: true;
      data: unknown;
    }
  | {
      success: false;
      error: string;
      code?: string;
    };

export function createV0MenuRouter(input: {
  service: V0MenuService;
  idempotencyService: V0IdempotencyService;
  db: Pool;
}): Router {
  const router = Router();
  const transactionManager = new TransactionManager(input.db);
  const mediaUploadsRepo = new V0MediaUploadRepository(input.db);

  router.post("/images/upload", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      await runUploadSingleImage(req, res);

      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      if (!tenantId) {
        throw new V0MenuError(403, "tenant context required", "TENANT_CONTEXT_REQUIRED");
      }
      if (!req.file) {
        throw new V0MenuError(422, "image file is required", "UPLOAD_FILE_REQUIRED");
      }

      const uploaded = await uploadTenantScopedImageToR2({
        tenantId,
        area: "menu",
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalFilename: req.file.originalname,
      });

      await mediaUploadsRepo.createPendingUpload({
        tenantId,
        area: "menu",
        objectKey:
          deriveObjectKeyFromImageUrl({
            imageUrl: uploaded.imageUrl,
            tenantId,
            area: "menu",
          }) ?? uploaded.key,
        imageUrl: uploaded.imageUrl,
        mimeType: uploaded.mimeType,
        sizeBytes: uploaded.sizeBytes,
        uploadedByAccountId: actor.accountId,
      });

      res.status(200).json({
        success: true,
        data: {
          imageUrl: uploaded.imageUrl,
          key: uploaded.key,
          filename: uploaded.filename,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/items", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listItems({
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

  router.get("/items/all", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listAllItems({
        actor,
        status: asString(req.query?.status),
        categoryId: asString(req.query?.categoryId),
        search: asString(req.query?.search),
        branchId: asString(req.query?.branchId),
        limit: asNumber(req.query?.limit),
        offset: asNumber(req.query?.offset),
      });

      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.get("/items/:menuItemId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.getItem({
        actor,
        menuItemId: req.params.menuItemId,
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
      actionKey: V0_MENU_ACTION_KEYS.createItem,
      scope: "TENANT",
      eventType: V0_MENU_EVENT_TYPES.itemCreated,
      entityType: "menu_item",
      endpoint: "/v0/menu/items",
      transactionManager,
      handler: async (txService) => txService.createMenuItem({ actor: req.v0Auth!, body: req.body }),
    });
  });

  router.patch("/items/:menuItemId", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_MENU_ACTION_KEYS.updateItem,
      scope: "TENANT",
      eventType: V0_MENU_EVENT_TYPES.itemUpdated,
      entityType: "menu_item",
      endpoint: "/v0/menu/items/:menuItemId",
      transactionManager,
      handler: async (txService) =>
        txService.updateMenuItem({
          actor: req.v0Auth!,
          menuItemId: req.params.menuItemId,
          body: req.body,
        }),
    });
  });

  router.post(
    "/items/:menuItemId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.archiveItem,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.itemArchived,
        entityType: "menu_item",
        endpoint: "/v0/menu/items/:menuItemId/archive",
        transactionManager,
        handler: async (txService) =>
          txService.archiveMenuItem({
            actor: req.v0Auth!,
            menuItemId: req.params.menuItemId,
          }),
      });
    }
  );

  router.post(
    "/items/:menuItemId/restore",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.restoreItem,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.itemRestored,
        entityType: "menu_item",
        endpoint: "/v0/menu/items/:menuItemId/restore",
        transactionManager,
        handler: async (txService) =>
          txService.restoreMenuItem({
            actor: req.v0Auth!,
            menuItemId: req.params.menuItemId,
          }),
      });
    }
  );

  router.put(
    "/items/:menuItemId/visibility",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.setItemVisibility,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.itemVisibilitySet,
        entityType: "menu_item",
        entityIdResolver: (data) => String((data as { menuItemId: string }).menuItemId),
        endpoint: "/v0/menu/items/:menuItemId/visibility",
        transactionManager,
        handler: async (txService) =>
          txService.setMenuItemVisibility({
            actor: req.v0Auth!,
            menuItemId: req.params.menuItemId,
            body: req.body,
          }),
      });
    }
  );

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
      actionKey: V0_MENU_ACTION_KEYS.createCategory,
      scope: "TENANT",
      eventType: V0_MENU_EVENT_TYPES.categoryCreated,
      entityType: "menu_category",
      endpoint: "/v0/menu/categories",
      transactionManager,
      handler: async (txService) => txService.createCategory({ actor: req.v0Auth!, name: req.body?.name }),
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
        actionKey: V0_MENU_ACTION_KEYS.updateCategory,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.categoryUpdated,
        entityType: "menu_category",
        endpoint: "/v0/menu/categories/:categoryId",
        transactionManager,
        handler: async (txService) =>
          txService.updateCategory({
            actor: req.v0Auth!,
            categoryId: req.params.categoryId,
            body: req.body,
          }),
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
        actionKey: V0_MENU_ACTION_KEYS.archiveCategory,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.categoryArchived,
        entityType: "menu_category",
        endpoint: "/v0/menu/categories/:categoryId/archive",
        transactionManager,
        handler: async (txService) =>
          txService.archiveCategory({
            actor: req.v0Auth!,
            categoryId: req.params.categoryId,
          }),
      });
    }
  );

  router.get("/modifier-groups", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const data = await input.service.listModifierGroups({
        actor,
        status: asString(req.query?.status),
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error);
    }
  });

  router.post("/modifier-groups", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    await executeWrite({
      req,
      res,
      idempotencyService: input.idempotencyService,
      actionKey: V0_MENU_ACTION_KEYS.createModifierGroup,
      scope: "TENANT",
      eventType: V0_MENU_EVENT_TYPES.modifierGroupCreated,
      entityType: "modifier_group",
      endpoint: "/v0/menu/modifier-groups",
      transactionManager,
      handler: async (txService) =>
        txService.createModifierGroup({
          actor: req.v0Auth!,
          name: req.body?.name,
          selectionMode: req.body?.selectionMode,
          minSelections: req.body?.minSelections,
          maxSelections: req.body?.maxSelections,
          isRequired: req.body?.isRequired,
        }),
    });
  });

  router.patch(
    "/modifier-groups/:groupId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.updateModifierGroup,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierGroupUpdated,
        entityType: "modifier_group",
        endpoint: "/v0/menu/modifier-groups/:groupId",
        transactionManager,
        handler: async (txService) =>
          txService.updateModifierGroup({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
            body: req.body,
          }),
      });
    }
  );

  router.post(
    "/modifier-groups/:groupId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.archiveModifierGroup,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierGroupArchived,
        entityType: "modifier_group",
        endpoint: "/v0/menu/modifier-groups/:groupId/archive",
        transactionManager,
        handler: async (txService) =>
          txService.archiveModifierGroup({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
          }),
      });
    }
  );

  router.post(
    "/modifier-groups/:groupId/options",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.createModifierOption,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierOptionCreated,
        entityType: "modifier_option",
        endpoint: "/v0/menu/modifier-groups/:groupId/options",
        transactionManager,
        handler: async (txService) =>
          txService.createModifierOption({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
            label: req.body?.label,
            priceDelta: req.body?.priceDelta,
            componentDeltas: req.body?.componentDeltas,
          }),
      });
    }
  );

  router.patch(
    "/modifier-groups/:groupId/options/:optionId",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.updateModifierOption,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierOptionUpdated,
        entityType: "modifier_option",
        endpoint: "/v0/menu/modifier-groups/:groupId/options/:optionId",
        transactionManager,
        handler: async (txService) =>
          txService.updateModifierOption({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
            optionId: req.params.optionId,
            body: req.body,
          }),
      });
    }
  );

  router.post(
    "/modifier-groups/:groupId/options/:optionId/archive",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.archiveModifierOption,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierOptionArchived,
        entityType: "modifier_option",
        endpoint: "/v0/menu/modifier-groups/:groupId/options/:optionId/archive",
        transactionManager,
        handler: async (txService) =>
          txService.archiveModifierOption({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
            optionId: req.params.optionId,
          }),
      });
    }
  );

  router.post(
    "/modifier-groups/:groupId/options/:optionId/restore",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.restoreModifierOption,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierOptionRestored,
        entityType: "modifier_option",
        endpoint: "/v0/menu/modifier-groups/:groupId/options/:optionId/restore",
        transactionManager,
        handler: async (txService) =>
          txService.restoreModifierOption({
            actor: req.v0Auth!,
            groupId: req.params.groupId,
            optionId: req.params.optionId,
          }),
      });
    }
  );

  router.put(
    "/items/:menuItemId/modifier-option-effects",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.replaceModifierOptionEffects,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.modifierOptionEffectsReplaced,
        entityType: "menu_item",
        entityIdResolver: (data) => String((data as { menuItemId: string }).menuItemId),
        endpoint: "/v0/menu/items/:menuItemId/modifier-option-effects",
        transactionManager,
        handler: async (txService) =>
          txService.replaceModifierOptionEffectsForMenuItem({
            actor: req.v0Auth!,
            menuItemId: req.params.menuItemId,
            body: req.body,
          }),
      });
    }
  );

  router.put(
    "/items/:menuItemId/composition",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      await executeWrite({
        req,
        res,
        idempotencyService: input.idempotencyService,
        actionKey: V0_MENU_ACTION_KEYS.upsertComposition,
        scope: "TENANT",
        eventType: V0_MENU_EVENT_TYPES.compositionUpserted,
        entityType: "menu_item",
        entityIdResolver: (data) => String((data as { menuItemId: string }).menuItemId),
        endpoint: "/v0/menu/items/:menuItemId/composition",
        transactionManager,
        handler: async (txService) =>
          txService.upsertComposition({
            actor: req.v0Auth!,
            menuItemId: req.params.menuItemId,
            body: req.body,
          }),
      });
    }
  );

  router.post(
    "/items/:menuItemId/composition/evaluate",
    requireV0Auth,
    async (req: V0AuthRequest, res: Response) => {
      try {
        const actor = req.v0Auth;
        if (!actor) {
          res.status(401).json({ success: false, error: "authentication required" });
          return;
        }
        const data = await input.service.evaluateComposition({
          actor,
          menuItemId: req.params.menuItemId,
          body: req.body,
        });
        res.status(200).json({ success: true, data });
      } catch (error) {
        handleError(res, error);
      }
    }
  );

  return router;

  async function executeWrite(inputWrite: {
    req: V0AuthRequest;
    res: Response;
    idempotencyService: V0IdempotencyService;
    actionKey: string;
    scope: "TENANT" | "BRANCH";
    eventType: string;
    entityType: string;
    endpoint: string;
    transactionManager: TransactionManager;
    entityIdResolver?: (data: unknown) => string;
    handler: (service: V0MenuService) => Promise<unknown>;
  }): Promise<void> {
    const actor = inputWrite.req.v0Auth;
    const idempotencyKey = getIdempotencyKeyFromHeader(inputWrite.req.headers);
    const actionKey = inputWrite.actionKey;

    try {
      if (!actor) {
        inputWrite.res.status(401).json({ success: false, error: "authentication required" });
        return;
      }

      const tenantId = String(actor.tenantId ?? "").trim();
      const branchId = String(actor.branchId ?? "").trim();

      const result = await inputWrite.idempotencyService.execute<MenuResponseBody>({
        idempotencyKey,
        actionKey,
        scope: inputWrite.scope,
        tenantId,
        branchId,
        payload: {
          params: inputWrite.req.params,
          body: inputWrite.req.body,
        },
        handler: async () => {
          const data = await inputWrite.transactionManager.withTransaction(async (client) => {
            const txService = new V0MenuService(
              new V0MenuRepository(client),
              new V0MediaUploadRepository(client)
            );
            const txAuditService = new V0AuditService(new V0AuditRepository(client));
            const txOutboxRepository = new V0CommandOutboxRepository(client);
            const txSyncRepository = new V0PullSyncRepository(client);

            const commandData = await inputWrite.handler(txService);
            const entityId =
              inputWrite.entityIdResolver?.(commandData) ??
              String((commandData as { id?: string })?.id ?? branchId ?? tenantId);
            const dedupeKey = buildMenuCommandDedupeKey(actionKey, idempotencyKey, "SUCCESS");

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
              const syncBranchIds = await txSyncRepository.listActiveBranchIdsByTenant(
                tenantId
              );
              const targetBranchIds =
                syncBranchIds.length > 0 ? syncBranchIds : branchId ? [branchId] : [];

              for (const targetBranchId of targetBranchIds) {
                await txSyncRepository.appendChange({
                  tenantId,
                  branchId: targetBranchId,
                  moduleKey: "menu",
                  entityType: inputWrite.entityType,
                  entityId,
                  operation: "UPSERT",
                  revision: `menu:${outbox.row.id}`,
                  data: toSyncData(commandData),
                  changedAt: outbox.row.occurred_at,
                  sourceOutboxId: outbox.row.id,
                });
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

function asNumber(value: unknown): number | undefined {
  const str = asString(value);
  if (!str) {
    return undefined;
  }
  const parsed = Number(str);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toSyncData(data: unknown): Record<string, unknown> {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return { value: data };
}

function handleError(res: Response, error: unknown): void {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(400).json({
        success: false,
        error: "image must be less than 5MB",
        code: "UPLOAD_FILE_TOO_LARGE",
      });
      return;
    }
    if (error.code === "LIMIT_UNEXPECTED_FILE") {
      res.status(400).json({
        success: false,
        error: "unexpected file field; use 'image'",
        code: "UPLOAD_INVALID_FIELD",
      });
      return;
    }
    res.status(400).json({
      success: false,
      error: error.message,
      code: "UPLOAD_BAD_REQUEST",
    });
    return;
  }

  if (error instanceof V0ImageStorageError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (error instanceof V0IdempotencyError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.code,
      code: error.code,
    });
    return;
  }
  if (error instanceof V0MenuError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  if (isUniqueViolation(error)) {
    res.status(409).json({
      success: false,
      error: "menu uniqueness conflict",
      code: mapUniqueViolationCode(error.constraint),
    });
    return;
  }

  if (error instanceof Error && error.message.startsWith("Invalid file type:")) {
    res.status(422).json({
      success: false,
      error: error.message,
      code: "UPLOAD_INVALID_TYPE",
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
    return "MENU_UNIQUE_CONSTRAINT";
  }
  if (constraint === "v0_menu_items_tenant_id_name_key") {
    return "MENU_ITEM_DUPLICATE_NAME";
  }
  if (constraint === "v0_menu_categories_tenant_id_name_key") {
    return "MENU_CATEGORY_DUPLICATE_NAME";
  }
  if (constraint === "v0_menu_modifier_groups_tenant_id_name_key") {
    return "MODIFIER_GROUP_DUPLICATE_NAME";
  }
  if (constraint === "v0_menu_modifier_options_tenant_id_modifier_group_id_label_key") {
    return "MODIFIER_OPTION_DUPLICATE_LABEL";
  }
  if (constraint === "v0_menu_item_base_components_tenant_id_menu_item_id_stock_item_id_key") {
    return "MENU_COMPOSITION_DUPLICATE_BASE_COMPONENT";
  }
  if (
    constraint ===
    "v0_menu_modifier_option_component_deltas_tenant_id_modifier_option_id_stock_item_id_key"
  ) {
    return "MENU_COMPOSITION_DUPLICATE_OPTION_COMPONENT";
  }
  return "MENU_UNIQUE_CONSTRAINT";
}

function runUploadSingleImage(req: V0AuthRequest, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    (uploadSingleImage as unknown as (
      request: V0AuthRequest,
      response: Response,
      next: (err?: unknown) => void
    ) => void)(req, res, (err?: unknown) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}
