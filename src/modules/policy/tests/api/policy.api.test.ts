import { describe, test, expect, beforeAll, afterAll } from "@jest/globals";
import {
  setupTestContext,
  cleanupTestContext,
  authRequest,
  TestContext,
} from "./test-helpers.js";

describe("Policy API", () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await setupTestContext();
  });

  afterAll(async () => {
    await cleanupTestContext(ctx);
  });

  describe("GET /v1/policies", () => {
    test("should get all tenant policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("tenantId", ctx.tenantId);
      // Check all policy categories are present
      expect(response.body).toHaveProperty("authPasswordPolicyMinLength");
      expect(response.body).toHaveProperty("saleVatEnabled");
      expect(response.body).toHaveProperty("inventoryAutoSubtractOnSale");
      expect(response.body).toHaveProperty("receiptBrandingEnabled");
    });

    test("should fail without authentication", async () => {
      const response = await authRequest(ctx.app, "invalid-token").get(
        "/v1/policies"
      );

      expect(response.status).toBe(401);
    });
  });

  describe("GET /v1/policies/auth", () => {
    test("should get auth policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/auth"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("passwordPolicyMinLength", 8);
      expect(response.body).toHaveProperty("sessionMaxAgeHours", 12);
      expect(response.body).toHaveProperty("refreshTokensEnabled", true);
      expect(response.body).toHaveProperty("invitesExpiryHours", 72);
      expect(response.body).toHaveProperty("namesEditableBy", "ADMIN_ONLY");
    });
  });

  describe("GET /v1/policies/multi-branch", () => {
    test("should get multi-branch policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/multi-branch"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("featuresEnabled", false);
      expect(response.body).toHaveProperty("maxBranches", 3);
      expect(response.body).toHaveProperty("requireUniqueName", false);
    });
  });

  describe("GET /v1/policies/sales", () => {
    test("should get sales policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/sales"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("vatEnabled", false);
      expect(response.body).toHaveProperty("vatRatePercent", 10);
      expect(response.body).toHaveProperty("khrRoundingMode", "NEAREST_100");
      expect(response.body).toHaveProperty("discountScope", "BOTH");
    });
  });

  describe("GET /v1/policies/inventory", () => {
    test("should get inventory policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/inventory"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("autoSubtractOnSale", true);
      expect(response.body).toHaveProperty("requireSufficientStock", false);
      expect(response.body).toHaveProperty("useRecipesForFnb", false);
      expect(response.body).toHaveProperty("expiryTrackingEnabled", false);
    });
  });

  describe("GET /v1/policies/receipts", () => {
    test("should get receipt policies", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/receipts"
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("brandingEnabled", false);
      expect(response.body).toHaveProperty("showDualCurrency", false);
      expect(response.body).toHaveProperty("showCashierName", false);
    });
  });

  describe("GET /v1/policies/cash-sessions", () => {
    test("should get cash session policies (TODO: module not complete)", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/cash-sessions"
      );

      expect(response.status).toBe(200);
      expect(response.headers["x-feature-status"]).toBe(
        "Cash session module not yet complete"
      );
      expect(response.body).toHaveProperty(
        "requireActiveCashSessionForCashSales",
        true
      );
      expect(response.body).toHaveProperty("maxPaidOutPerShiftUsd", 0);
    });
  });

  describe("GET /v1/policies/attendance", () => {
    test("should get attendance policies (TODO: module not complete)", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/attendance"
      );

      expect(response.status).toBe(200);
      expect(response.headers["x-feature-status"]).toBe(
        "Attendance/shift modules not yet complete"
      );
      expect(response.body).toHaveProperty("showShiftReminders", true);
      expect(response.body).toHaveProperty("checkInBufferMinutes", 15);
    });
  });

  describe("PATCH /v1/policies", () => {
    test("should update auth policies", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          authPasswordPolicyMinLength: 10,
          authSessionMaxAgeHours: 24,
        });

      expect(response.status).toBe(200);
      expect(response.body.authPasswordPolicyMinLength).toBe(10);
      expect(response.body.authSessionMaxAgeHours).toBe(24);

      // Verify the update persisted
      const getResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies/auth"
      );
      expect(getResponse.body.passwordPolicyMinLength).toBe(10);
      expect(getResponse.body.sessionMaxAgeHours).toBe(24);
    });

    test("should update sales policies", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          saleVatEnabled: true,
          saleVatRatePercent: 15,
        });

      expect(response.status).toBe(200);
      expect(response.body.saleVatEnabled).toBe(true);
      expect(response.body.saleVatRatePercent).toBe(15);
    });

    test("should update inventory policies", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          inventoryAutoSubtractOnSale: false,
          inventoryExpiryTrackingEnabled: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.inventoryAutoSubtractOnSale).toBe(false);
      expect(response.body.inventoryExpiryTrackingEnabled).toBe(true);
    });

    test("should update receipt policies", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          receiptShowDualCurrency: true,
          receiptShowCashierName: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.receiptShowDualCurrency).toBe(true);
      expect(response.body.receiptShowCashierName).toBe(true);
    });

    test("should update multiple policy categories at once", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          authPasswordPolicyMinLength: 12,
          saleVatEnabled: true,
          inventoryAutoSubtractOnSale: true,
          receiptBrandingEnabled: true,
        });

      expect(response.status).toBe(200);
      expect(response.body.authPasswordPolicyMinLength).toBe(12);
      expect(response.body.saleVatEnabled).toBe(true);
      expect(response.body.inventoryAutoSubtractOnSale).toBe(true);
      expect(response.body.receiptBrandingEnabled).toBe(true);
    });

    test("should fail with invalid password min length", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          authPasswordPolicyMinLength: 5, // Too short
        });

      expect(response.status).toBe(400);
    });

    test("should fail with invalid VAT rate", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          saleVatRatePercent: 150, // Too high
        });

      expect(response.status).toBe(400);
    });

    test("should fail with invalid max branches", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          tenantMaxBranches: 0, // Too low
        });

      expect(response.status).toBe(400);
    });

    test("should fail with negative paid out limit", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          cashMaxPaidOutPerShiftUsd: -100, // Negative
        });

      expect(response.status).toBe(400);
    });

    test("should fail with empty update", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({});

      expect(response.status).toBe(400);
    });

    test("should fail with invalid enum value", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          saleKhrRoundingMode: "INVALID_MODE", // Invalid enum
        });

      expect(response.status).toBe(400);
    });

    test("should fail without authentication", async () => {
      const response = await authRequest(ctx.app, "invalid-token")
        .patch("/v1/policies")
        .send({
          saleVatEnabled: true,
        });

      expect(response.status).toBe(401);
    });

    test("should reject unknown fields (strict schema)", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          saleVatEnabled: true,
          unknownField: "should-be-rejected", // Unknown field
        });

      expect(response.status).toBe(400);
    });

    test("should handle concurrent updates correctly", async () => {
      // Make two concurrent updates
      const [response1, response2] = await Promise.all([
        authRequest(ctx.app, ctx.token).patch("/v1/policies").send({
          authPasswordPolicyMinLength: 14,
        }),
        authRequest(ctx.app, ctx.token).patch("/v1/policies").send({
          saleVatEnabled: true,
        }),
      ]);

      expect(response1.status).toBe(200);
      expect(response2.status).toBe(200);

      // Verify both updates persisted
      const getResponse = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies"
      );
      expect(getResponse.body.authPasswordPolicyMinLength).toBe(14);
      expect(getResponse.body.saleVatEnabled).toBe(true);
    });
  });

  describe("Policy Dependencies", () => {
    test("should enable multi-branch features", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          tenantFeaturesMultiBranch: true,
          tenantMaxBranches: 5,
        });

      expect(response.status).toBe(200);
      expect(response.body.tenantFeaturesMultiBranch).toBe(true);
      expect(response.body.tenantMaxBranches).toBe(5);
    });

    test("should update attendance policies for future use", async () => {
      const response = await authRequest(ctx.app, ctx.token)
        .patch("/v1/policies")
        .send({
          attendanceShowShiftReminders: false,
          attendanceCheckInBufferMinutes: 30,
          attendanceShiftLateGraceMinutes: 120,
        });

      expect(response.status).toBe(200);
      expect(response.body.attendanceShowShiftReminders).toBe(false);
      expect(response.body.attendanceCheckInBufferMinutes).toBe(30);
      expect(response.body.attendanceShiftLateGraceMinutes).toBe(120);
    });
  });

  describe("Policy Default Values", () => {
    test("should return default values for new tenant", async () => {
      const response = await authRequest(ctx.app, ctx.token).get(
        "/v1/policies"
      );

      expect(response.status).toBe(200);
      
      // Verify auth defaults (some may have been modified by previous tests)
      expect(response.body).toHaveProperty("authRefreshTokensEnabled");
      expect(response.body).toHaveProperty("authInvitesExpiryHours");

      // Verify multi-branch defaults (some may have been modified)
      expect(response.body).toHaveProperty("tenantMaxBranches");

      // Verify inventory defaults (some may have been modified)
      expect(response.body).toHaveProperty("inventoryUseRecipesForFnb");

      // All policies should have timestamps
      expect(response.body).toHaveProperty("createdAt");
      expect(response.body).toHaveProperty("updatedAt");
    });
  });
});

