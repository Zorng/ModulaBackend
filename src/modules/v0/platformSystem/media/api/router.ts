import { Router, type Response } from "express";
import multer from "multer";
import { requireV0Auth, type V0AuthRequest } from "../../../auth/api/middleware.js";
import { uploadSingleImage } from "../../../../../platform/http/middleware/multer.js";
import { V0ImageStorageError } from "../../../../../platform/storage/r2-image-storage.js";
import { V0MediaError, V0MediaService } from "../app/service.js";

export function createV0MediaRouter(service: V0MediaService): Router {
  const router = Router();

  router.post("/images/upload", requireV0Auth, async (req: V0AuthRequest, res: Response) => {
    try {
      await runUploadSingleImage(req, res);

      const actor = req.v0Auth;
      if (!actor) {
        res.status(401).json({ success: false, error: "authentication required" });
        return;
      }
      if (!req.file) {
        throw new V0MediaError(422, "UPLOAD_FILE_REQUIRED", "image file is required");
      }

      const uploaded = await service.uploadTenantImage({
        tenantId: String(actor.tenantId ?? ""),
        area: String(req.body?.area ?? ""),
        fileBuffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalFilename: req.file.originalname,
        uploadedByAccountId: String(actor.accountId ?? "").trim() || null,
      });

      res.status(200).json({
        success: true,
        data: {
          imageUrl: uploaded.imageUrl,
          key: uploaded.key,
          filename: uploaded.filename,
          mimeType: uploaded.mimeType,
          sizeBytes: uploaded.sizeBytes,
          area: uploaded.area,
        },
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
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

  if (error instanceof V0MediaError || error instanceof V0ImageStorageError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      code: error.code,
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
