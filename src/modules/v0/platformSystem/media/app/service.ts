import {
  type TenantImageArea,
  uploadTenantScopedImageToR2,
} from "../../../../../platform/storage/r2-image-storage.js";

export const V0_MEDIA_IMAGE_AREAS: ReadonlyArray<TenantImageArea> = [
  "menu",
  "inventory",
  "tenant",
  "profile",
] as const;

export class V0MediaError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0MediaError";
  }
}

type UploadTenantImageInput = {
  tenantId: string;
  area: string;
  fileBuffer: Buffer;
  mimeType: string;
  originalFilename: string;
};

export class V0MediaService {
  async uploadTenantImage(input: UploadTenantImageInput) {
    const tenantId = String(input.tenantId ?? "").trim();
    if (!tenantId) {
      throw new V0MediaError(403, "TENANT_CONTEXT_REQUIRED", "tenant context required");
    }

    const area = String(input.area ?? "").trim().toLowerCase();
    if (!isTenantImageArea(area)) {
      throw new V0MediaError(
        422,
        "UPLOAD_INVALID_AREA",
        `area must be one of: ${V0_MEDIA_IMAGE_AREAS.join(", ")}`
      );
    }

    return uploadTenantScopedImageToR2({
      tenantId,
      area,
      fileBuffer: input.fileBuffer,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    });
  }
}

function isTenantImageArea(value: string): value is TenantImageArea {
  return (V0_MEDIA_IMAGE_AREAS as ReadonlyArray<string>).includes(value);
}
