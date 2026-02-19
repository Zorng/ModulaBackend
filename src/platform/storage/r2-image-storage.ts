import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { randomUUID } from "crypto";

export type TenantImageArea = "menu" | "inventory" | "tenant" | "profile";

const TENANT_IMAGE_AREA_PREFIX: Record<TenantImageArea, string> = {
  menu: "menu-item-images",
  inventory: "stock-item-images",
  tenant: "tenant-logo",
  profile: "profile-images",
};

type UploadInput = {
  tenantId: string;
  area: TenantImageArea;
  fileBuffer: Buffer;
  mimeType: string;
  originalFilename: string;
};

export type UploadedTenantImage = {
  imageUrl: string;
  key: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  area: TenantImageArea;
};

export class V0ImageStorageError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "V0ImageStorageError";
  }
}

let s3Client: S3Client | null = null;

export async function uploadTenantScopedImageToR2(
  input: UploadInput
): Promise<UploadedTenantImage> {
  const config = resolveStorageConfig();
  const extension = extensionForMimeType(input.mimeType);
  if (!extension) {
    throw new V0ImageStorageError(
      422,
      "UNSUPPORTED_IMAGE_TYPE",
      "unsupported image type"
    );
  }

  const baseName = sanitizeFilename(input.originalFilename);
  const fileId = `${Date.now()}-${randomUUID()}`;
  const filename = `${fileId}-${baseName}.${extension}`;
  const key = buildTenantImageObjectKey({
    tenantId: input.tenantId,
    area: input.area,
    filename,
  });

  try {
    const command = new PutObjectCommand({
      Bucket: config.bucketName,
      Key: key,
      Body: input.fileBuffer,
      ContentType: input.mimeType,
      CacheControl: "public, max-age=31536000",
      Metadata: {
        tenantId: input.tenantId,
        area: input.area,
      },
    });
    await getS3Client(config).send(command);
  } catch (error) {
    throw new V0ImageStorageError(
      503,
      "IMAGE_UPLOAD_FAILED",
      error instanceof Error ? error.message : "image upload failed"
    );
  }

  return {
    imageUrl: buildImageUrl({
      key,
      tenantId: input.tenantId,
      area: input.area,
      filename,
      publicBaseUrl: config.publicBaseUrl,
      apiBaseUrl: config.apiBaseUrl,
    }),
    key,
    filename,
    mimeType: input.mimeType,
    sizeBytes: input.fileBuffer.length,
    area: input.area,
  };
}

export async function deleteObjectFromR2(input: { objectKey: string }): Promise<void> {
  const config = resolveStorageConfig();
  try {
    const command = new DeleteObjectCommand({
      Bucket: config.bucketName,
      Key: input.objectKey,
    });
    await getS3Client(config).send(command);
  } catch (error) {
    throw new V0ImageStorageError(
      503,
      "IMAGE_DELETE_FAILED",
      error instanceof Error ? error.message : "image delete failed"
    );
  }
}

function resolveStorageConfig(): {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string | null;
  apiBaseUrl: string | null;
} {
  const accountId = normalizeOptionalString(process.env.R2_ACCOUNT_ID);
  const accessKeyId = normalizeOptionalString(process.env.R2_ACCESS_KEY_ID);
  const secretAccessKey = normalizeOptionalString(process.env.R2_SECRET_ACCESS_KEY);
  const bucketName =
    normalizeOptionalString(process.env.R2_BUCKET_NAME) ?? "modula-images";
  const publicBaseUrl = normalizeOptionalString(process.env.R2_PUBLIC_URL);
  const apiBaseUrl = normalizeOptionalString(process.env.API_BASE_URL);

  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new V0ImageStorageError(
      503,
      "IMAGE_STORAGE_NOT_CONFIGURED",
      "image storage is not configured"
    );
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl,
    apiBaseUrl,
  };
}

function getS3Client(config: {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
}): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return s3Client;
}

function extensionForMimeType(mimeType: string): string | null {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };
  return map[mimeType] ?? null;
}

function sanitizeFilename(filename: string): string {
  const name = filename.replace(/\.[^/.]+$/, "");
  const sanitized = name.replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
  const trimmed = sanitized.slice(0, 40);
  return trimmed || "image";
}

function buildImageUrl(input: {
  key: string;
  tenantId: string;
  area: TenantImageArea;
  filename: string;
  publicBaseUrl: string | null;
  apiBaseUrl: string | null;
}): string {
  if (input.publicBaseUrl) {
    return `${trimRightSlash(input.publicBaseUrl)}/${input.key}`;
  }
  const proxyPath = `/images/${input.tenantId}/${input.area}/${input.filename}`;
  if (input.apiBaseUrl) {
    return `${trimRightSlash(input.apiBaseUrl)}${proxyPath}`;
  }
  return proxyPath;
}

export function buildTenantImageObjectKey(input: {
  tenantId: string;
  area: TenantImageArea;
  filename: string;
}): string {
  const prefix = TENANT_IMAGE_AREA_PREFIX[input.area];
  return `${prefix}/${input.tenantId}/${input.filename}`;
}

export function deriveObjectKeyFromImageUrl(input: {
  imageUrl: string;
  tenantId: string;
  area: TenantImageArea;
}): string | null {
  const raw = String(input.imageUrl ?? "").trim();
  if (!raw) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(raw, "http://localhost");
  } catch {
    return null;
  }

  const pathname = parsed.pathname.replace(/^\/+/, "");
  if (!pathname) {
    return null;
  }

  const proxySegments = pathname.split("/");
  if (
    proxySegments[0] === "images" &&
    proxySegments[1] === input.tenantId &&
    proxySegments[2] === input.area &&
    proxySegments[3]
  ) {
    return buildTenantImageObjectKey({
      tenantId: input.tenantId,
      area: input.area,
      filename: proxySegments.slice(3).join("/"),
    });
  }

  const areaPrefix = TENANT_IMAGE_AREA_PREFIX[input.area];
  if (pathname.startsWith(`${areaPrefix}/${input.tenantId}/`)) {
    return pathname;
  }

  return null;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized ? normalized : null;
}

function trimRightSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}
