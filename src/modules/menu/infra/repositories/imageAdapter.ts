import { Pool } from "pg";
import { IImageStoragePort } from "#modules/menu/app/ports.js";

export class ImageAdapter implements IImageStoragePort {
  constructor(private pool: Pool) {}

  async uploadImage(
    file: Buffer,
    filename: string,
    tenantId: string
  ): Promise<string> {
    // TODO: Implement actual image upload (e.g., to S3, local, etc.)
    // For now, return a fake URL for demonstration
    return Promise.resolve(
      `https://fake-storage.example.com/${tenantId}/${filename}`
    );
  }

  /**
   * Delete image by URL
   */

  async deleteImage(imageUrl: string, tenantId: string): Promise<void> {
    // TODO: Implement actual image deletion logic
    // For now, do nothing (stub)
    return Promise.resolve();
  }

  /**
   * Validate image URL format
   * (e.g., check if it's a valid HTTP(S) URL or matches expected pattern)
   */

  isValidImageUrl(url: string): boolean {
    // Basic validation: must be http(s) and look like a URL
    try {
      const parsed = new URL(url);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
      return false;
    }
  }
}
