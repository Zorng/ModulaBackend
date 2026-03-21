import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import { S3Client } from "@aws-sdk/client-s3";
import { V0MediaError, V0MediaService } from "../../app/service.js";

describe("v0 media service upload permissions", () => {
  const originalEnv = { ...process.env };
  const uploadsRepo = {
    findActiveMembershipRole: jest.fn(),
    createPendingUpload: jest.fn(),
  };

  const service = new V0MediaService(uploadsRepo as never);

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...originalEnv,
      R2_ACCOUNT_ID: "acct",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET_NAME: "bucket",
      R2_PUBLIC_URL: "https://cdn.example.com",
    };

    jest.spyOn(S3Client.prototype, "send").mockResolvedValue({} as never);

    uploadsRepo.createPendingUpload.mockResolvedValue({
      id: "upload-id",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it("allows cashier to upload payment-proof images", async () => {
    uploadsRepo.findActiveMembershipRole.mockResolvedValue("CASHIER");

    const uploaded = await service.uploadTenantImage({
      tenantId: "tenant-id",
      area: "payment-proof",
      fileBuffer: Buffer.from("proof"),
      mimeType: "image/png",
      originalFilename: "proof.png",
      uploadedByAccountId: "account-id",
    });

    expect(uploaded.area).toBe("payment-proof");
    expect(S3Client.prototype.send).toHaveBeenCalledTimes(1);
    expect(uploadsRepo.createPendingUpload).toHaveBeenCalledTimes(1);
  });

  it("still blocks cashier from uploading non-proof tenant images", async () => {
    uploadsRepo.findActiveMembershipRole.mockResolvedValue("CASHIER");

    await expect(
      service.uploadTenantImage({
        tenantId: "tenant-id",
        area: "tenant",
        fileBuffer: Buffer.from("logo"),
        mimeType: "image/png",
        originalFilename: "logo.png",
        uploadedByAccountId: "account-id",
      })
    ).rejects.toMatchObject({
      statusCode: 403,
      code: "PERMISSION_DENIED",
    });

    expect(S3Client.prototype.send).not.toHaveBeenCalled();
    expect(uploadsRepo.createPendingUpload).not.toHaveBeenCalled();
  });
});
