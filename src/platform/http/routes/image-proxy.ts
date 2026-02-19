import { Router, Request, Response } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { log } from "#logger";
import {
  buildTenantImageObjectKey,
  type TenantImageArea,
} from "../../storage/r2-image-storage.js";

const router = Router();

/**
 * Image Proxy Route
 * Proxies images from R2 with proper CORS headers
 * This allows frontend to access images without CORS issues
 */

let s3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3Client) {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 configuration not found");
    }

    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  return s3Client;
}

/**
 * GET /images/:tenantId/:area/:filename
 * Proxy images from R2 with CORS headers
 */
router.get("/images/:tenantId/:area/:filename", async (req: Request, res: Response) => {
    try {
      const { tenantId, area: requestedArea, filename } = req.params;
      const bucketName = process.env.R2_BUCKET_NAME || "modula-images";

      // Construct S3 key
      const area = normalizeArea(requestedArea);
      if (!area) {
        res.status(404).json({ error: "Image not found" });
        return;
      }
      const key = buildTenantImageObjectKey({
        tenantId,
        area,
        filename,
      });

      // Fetch from R2
      const client = getS3Client();
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key,
      });

      const response = await client.send(command);

      // Set proper headers
      res.set({
        "Content-Type": response.ContentType || "image/jpeg",
        "Cache-Control": "public, max-age=31536000", // Cache for 1 year
        "Access-Control-Allow-Origin": "*", // Allow all origins
        "Access-Control-Allow-Methods": "GET",
      });

      // Stream the image
      if (response.Body) {
        const stream = response.Body as any;
        stream.pipe(res);
      } else {
        res.status(404).json({ error: "Image not found" });
      }
    } catch (error) {
      log.error("image_proxy.fetch_failed", {
        event: "image_proxy.fetch_failed",
        requestId: req.v0Context?.requestId,
        tenantId: req.params?.tenantId,
        area: req.params?.area,
        filename: req.params?.filename,
        error: error instanceof Error ? error.message : String(error),
      });

      if ((error as any).name === "NoSuchKey") {
        res.status(404).json({ error: "Image not found" });
      } else {
        res.status(500).json({ error: "Failed to fetch image" });
      }
    }
});

function normalizeArea(value: string): TenantImageArea | null {
  const area = String(value ?? "").trim().toLowerCase();
  switch (area) {
    case "menu":
    case "inventory":
    case "tenant":
    case "profile":
      return area;
    default:
      return null;
  }
}

export { router as imageProxyRouter };
