import {
  deriveObjectKeyFromImageUrl,
  type TenantImageArea,
  uploadTenantScopedImageToR2,
} from "../../../../../platform/storage/r2-image-storage.js";
import {
  V0MediaUploadRepository,
  type MediaUploadMembershipRole,
} from "../../../../../platform/media-uploads/repository.js";

export const V0_MEDIA_IMAGE_AREAS: ReadonlyArray<TenantImageArea> = [
  "menu",
  "inventory",
  "tenant",
  "profile",
  "payment-proof",
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
  uploadedByAccountId: string | null;
};

export class V0MediaService {
  constructor(private readonly uploadsRepo: V0MediaUploadRepository) {}

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

    await this.assertAreaUploadAllowed({
      tenantId,
      area,
      accountId: input.uploadedByAccountId,
    });

    const uploaded = await uploadTenantScopedImageToR2({
      tenantId,
      area,
      fileBuffer: input.fileBuffer,
      mimeType: input.mimeType,
      originalFilename: input.originalFilename,
    });

    await this.uploadsRepo.createPendingUpload({
      tenantId,
      area,
      objectKey:
        deriveObjectKeyFromImageUrl({
          imageUrl: uploaded.imageUrl,
          tenantId,
          area,
        }) ?? uploaded.key,
      imageUrl: uploaded.imageUrl,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      uploadedByAccountId: input.uploadedByAccountId,
    });

    return uploaded;
  }

  private async assertAreaUploadAllowed(input: {
    tenantId: string;
    area: TenantImageArea;
    accountId: string | null;
  }): Promise<void> {
    const accountId = String(input.accountId ?? "").trim();
    if (!accountId) {
      throw new V0MediaError(403, "PERMISSION_DENIED", "permission denied");
    }

    const role = await this.uploadsRepo.findActiveMembershipRole({
      tenantId: input.tenantId,
      accountId,
    });
    if (!role) {
      throw new V0MediaError(403, "PERMISSION_DENIED", "permission denied");
    }

    const allowedRoles =
      input.area === "payment-proof"
        ? PAYMENT_PROOF_UPLOAD_ROLES
        : STANDARD_IMAGE_UPLOAD_ROLES;
    if (!allowedRoles.has(role)) {
      throw new V0MediaError(403, "PERMISSION_DENIED", "permission denied");
    }
  }
}

function isTenantImageArea(value: string): value is TenantImageArea {
  return (V0_MEDIA_IMAGE_AREAS as ReadonlyArray<string>).includes(value);
}

const STANDARD_IMAGE_UPLOAD_ROLES = new Set<MediaUploadMembershipRole>([
  "OWNER",
  "ADMIN",
  "MANAGER",
]);

const PAYMENT_PROOF_UPLOAD_ROLES = new Set<MediaUploadMembershipRole>([
  "OWNER",
  "ADMIN",
  "MANAGER",
  "CASHIER",
]);
