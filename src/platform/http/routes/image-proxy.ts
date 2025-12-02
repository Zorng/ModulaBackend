import { Router, Request, Response } from "express";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

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
 * GET /images/:tenantId/:module/:filename
 * Proxy images from R2 with CORS headers
 */
router.get(
  "/images/:tenantId/:module/:filename",
  async (req: Request, res: Response) => {
    try {
      const { tenantId, module, filename } = req.params;
      const bucketName = process.env.R2_BUCKET_NAME || "modula-menu-images";

      // Construct S3 key
      const key = `tenants/${tenantId}/${module}/${filename}`;

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
      console.error("[Image Proxy] Error:", error);

      if ((error as any).name === "NoSuchKey") {
        res.status(404).json({ error: "Image not found" });
      } else {
        res.status(500).json({ error: "Failed to fetch image" });
      }
    }
  }
);

export { router as imageProxyRouter };
