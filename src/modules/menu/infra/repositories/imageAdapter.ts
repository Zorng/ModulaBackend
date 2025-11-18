import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import type { IImageStoragePort } from "../../app/ports.js";
import crypto from "crypto";

/**
 * Cloudflare R2 Image Storage Adapter
 * Implements IImageStoragePort using Cloudflare R2 (S3-compatible)
 *
 * R2 Configuration:
 * - Bucket name: Your R2 bucket name
 * - Public URL: Your R2 public domain (e.g., https://pub-xxxxx.r2.dev)
 * - Access Key ID: R2 API token
 * - Secret Access Key: R2 API secret
 */
export class CloudflareR2ImageAdapter implements IImageStoragePort {
  private client: S3Client;
  private bucketName: string;
  private publicBaseUrl: string;

  // Allowed file types and max size
  private readonly ALLOWED_MIME_TYPES = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
  ];
  private readonly MAX_FILE_SIZE = 0.3 * 1024 * 1024; // 5MB

  constructor() {
    // Get config from environment variables
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME || "modula-menu-images";
    this.publicBaseUrl = process.env.R2_PUBLIC_URL || "";

    // Validate required config
    if (!accountId || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "Missing R2 configuration. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
      );
    }

    // Initialize S3 client for R2
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Upload image to R2 and return public URL
   *
   * @param file - Image buffer
   * @param filename - Original filename
   * @param tenantId - Tenant ID for organizing files
   * @returns Public URL to access the image
   */
  async uploadImage(
    file: Buffer,
    filename: string,
    tenantId: string
  ): Promise<string> {
    // Validate file size
    if (file.length > this.MAX_FILE_SIZE) {
      throw new Error(
        `File too large. Maximum size is ${this.MAX_FILE_SIZE / 1024 / 1024}MB`
      );
    }

    // Detect MIME type from buffer (magic bytes)
    const mimeType = this.detectMimeType(file);
    if (!mimeType || !this.ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw new Error(
        `Invalid file type. Allowed: ${this.ALLOWED_MIME_TYPES.join(", ")}`
      );
    }

    // Generate unique filename to prevent collisions
    const ext = this.getExtensionFromMimeType(mimeType);
    const uniqueId = crypto.randomUUID();
    const timestamp = Date.now();
    const sanitizedFilename = this.sanitizeFilename(filename);

    // Key format: tenant/{tenantId}/menu/{timestamp}-{uuid}-{filename}
    const key = `tenants/${tenantId}/menu/${timestamp}-${uniqueId}-${sanitizedFilename}.${ext}`;

    try {
      // Upload to R2
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: mimeType,
        CacheControl: "public, max-age=31536000", // Cache for 1 year
        Metadata: {
          tenantId,
          originalFilename: sanitizedFilename,
          uploadedAt: new Date().toISOString(),
        },
      });

      await this.client.send(command);

      // Return public URL
      const publicUrl = `${this.publicBaseUrl}/${key}`;

      console.log(`[R2] Image uploaded: ${publicUrl}`);
      return publicUrl;
    } catch (error) {
      console.error("[R2] Upload failed:", error);
      throw new Error(
        `Failed to upload image: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Delete image from R2
   * Extracts key from public URL and deletes the object
   */
  async deleteImage(imageUrl: string, tenantId: string): Promise<void> {
    try {
      // Extract key from URL
      // Example: https://pub-xxxxx.r2.dev/tenants/abc/menu/123-uuid-file.jpg
      const key = this.extractKeyFromUrl(imageUrl);

      if (!key) {
        console.warn(`[R2] Invalid URL format, skipping delete: ${imageUrl}`);
        return;
      }

      // Verify key belongs to this tenant (security check)
      if (!key.startsWith(`tenants/${tenantId}/`)) {
        throw new Error("Cannot delete image from another tenant");
      }

      // Delete from R2
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.client.send(command);

      console.log(`[R2] Image deleted: ${key}`);
    } catch (error) {
      console.error("[R2] Delete failed:", error);
      // Don't throw - deletion is optional cleanup
      // Image might already be deleted or URL might be external
    }
  }

  /**
   * Validate image URL format
   * Checks if URL is valid and matches expected R2 domain
   */
  isValidImageUrl(url: string): boolean {
    try {
      const parsed = new URL(url);

      // Must be HTTPS
      if (parsed.protocol !== "https:") {
        return false;
      }

      // Check if it matches our R2 public domain OR any valid image URL
      // (Allow external URLs for flexibility)
      const isR2Url = this.publicBaseUrl && url.startsWith(this.publicBaseUrl);
      const hasImageExtension = /\.(jpg|jpeg|png|webp)$/i.test(parsed.pathname);

      return isR2Url || hasImageExtension;
    } catch {
      return false;
    }
  }

  /**
   * PRIVATE HELPERS
   */

  /**
   * Detect MIME type from file buffer (magic bytes)
   */
  private detectMimeType(buffer: Buffer): string | null {
    // Check magic bytes (first few bytes of file)
    if (buffer.length < 4) return null;

    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
      return "image/jpeg";
    }

    // PNG: 89 50 4E 47
    if (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    ) {
      return "image/png";
    }

    // WebP: 52 49 46 46 ... 57 45 42 50
    if (
      buffer[0] === 0x52 &&
      buffer[1] === 0x49 &&
      buffer[2] === 0x46 &&
      buffer[3] === 0x46 &&
      buffer[8] === 0x57 &&
      buffer[9] === 0x45 &&
      buffer[10] === 0x42 &&
      buffer[11] === 0x50
    ) {
      return "image/webp";
    }

    return null;
  }

  /**
   * Get file extension from MIME type
   */
  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
    };
    return map[mimeType] || "jpg";
  }

  /**
   * Sanitize filename (remove special chars, limit length)
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/\.[^/.]+$/, "") // Remove extension
      .replace(/[^a-zA-Z0-9-_]/g, "-") // Replace special chars with dash
      .toLowerCase()
      .slice(0, 50); // Max 50 chars
  }

  /**
   * Extract S3 key from public URL
   */
  private extractKeyFromUrl(url: string): string | null {
    try {
      const parsed = new URL(url);
      // Remove leading slash
      return parsed.pathname.slice(1);
    } catch {
      return null;
    }
  }
}

export function createImageStorageAdapter(): IImageStoragePort {
  return new CloudflareR2ImageAdapter();
}
