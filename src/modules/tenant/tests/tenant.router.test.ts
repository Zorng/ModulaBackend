import { describe, expect, it, jest } from "@jest/globals";
import { createTenantRouter } from "../api/router.js";

function createAuthMiddleware(role: string) {
  return {
    authenticate: (req: any, _res: any, next: any) => {
      req.user = {
        tenantId: "tenant-1",
        employeeId: "emp-1",
        branchId: "branch-1",
        role,
      };
      next();
    },
    requireRole: (allowed: string[]) => (req: any, res: any, next: any) => {
      if (!req.user) {
        return res.status(401).json({ error: "Authentication required" });
      }
      if (!allowed.includes(req.user.role)) {
        return res
          .status(403)
          .json({ error: "Insufficient permissions for this action" });
      }
      next();
    },
  };
}

function createRouterHarness(params: {
  role: string;
  tenantServiceOverrides?: Partial<{
    getProfile: any;
    getMetadata: any;
    updateProfile: any;
    updateLogo: any;
  }>;
}) {
  const tenantService = {
    getProfile: jest.fn().mockResolvedValue({
      id: "tenant-1",
      name: "Test Tenant",
      business_type: null,
      status: "ACTIVE",
      logo_url: null,
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      branch_count: 1,
    }),
    getMetadata: jest.fn().mockResolvedValue({
      id: "tenant-1",
      name: "Test Tenant",
      logo_url: null,
      status: "ACTIVE",
    }),
    updateProfile: jest.fn().mockResolvedValue({
      id: "tenant-1",
      name: "Updated Tenant",
      business_type: null,
      status: "ACTIVE",
      logo_url: null,
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    updateLogo: jest.fn().mockResolvedValue({
      id: "tenant-1",
      name: "Test Tenant",
      business_type: null,
      status: "ACTIVE",
      logo_url: "http://localhost/logo.png",
      contact_phone: null,
      contact_email: null,
      contact_address: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
    ...(params.tenantServiceOverrides ?? {}),
  };

  const auth = createAuthMiddleware(params.role);

  const router = createTenantRouter(tenantService as any, auth as any);

  return { router, tenantService };
}

function dispatch(
  router: any,
  req: { method: string; url: string; body?: any; appLocals?: any }
): Promise<{ statusCode: number; body: any }> {
  return new Promise((resolve, reject) => {
    const request: any = {
      method: req.method,
      url: req.url,
      body: req.body,
      headers: {},
      app: { locals: req.appLocals ?? {} },
    };

    const response: any = {
      statusCode: 200,
      status(code: number) {
        this.statusCode = code;
        return this;
      },
      json(payload: any) {
        resolve({ statusCode: this.statusCode, body: payload });
      },
    };

    router.handle(request, response, (err: any) => {
      if (err) return reject(err);
    });
  });
}

describe("Tenant Router", () => {
  it("blocks non-admin access to GET /v1/tenants/me", async () => {
    const { router } = createRouterHarness({ role: "CASHIER" });
    const res = await dispatch(router, { method: "GET", url: "/me" });
    expect(res.statusCode).toBe(403);
  });

  it("allows admin access to GET /v1/tenants/me", async () => {
    const { router, tenantService } = createRouterHarness({ role: "ADMIN" });
    const res = await dispatch(router, { method: "GET", url: "/me" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("tenant.id", "tenant-1");
    expect(tenantService.getProfile).toHaveBeenCalledWith("tenant-1");
  });

  it("allows any authenticated staff to GET /v1/tenants/me/metadata", async () => {
    const { router, tenantService } = createRouterHarness({ role: "CLERK" });
    const res = await dispatch(router, { method: "GET", url: "/me/metadata" });
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("tenant.name", "Test Tenant");
    expect(tenantService.getMetadata).toHaveBeenCalledWith("tenant-1");
  });

  it("returns 422 when tenantService throws a validation error on PATCH /v1/tenants/me", async () => {
    const { router } = createRouterHarness({
      role: "ADMIN",
      tenantServiceOverrides: {
        updateProfile: jest.fn().mockRejectedValue(
          new Error("contact_email is not a valid email address")
        ),
      },
    });

    const res = await dispatch(router, {
      method: "PATCH",
      url: "/me",
      body: { contact_email: "not-an-email" },
    });

    expect(res.statusCode).toBe(422);
  });
});
