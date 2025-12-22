import { describe, expect, it, jest } from "@jest/globals";
import { createBranchRouter } from "../api/router.js";

function makeAuth(user: any) {
  return {
    authenticate: (_req: any, _res: any, next: any) => {
      next();
    },
    requireRole: (allowedRoles: string[]) => {
      return (req: any, res: any, next: any) => {
        if (!req.user) {
          return res.status(401).json({ error: "Authentication required" });
        }
        if (!allowedRoles.includes(req.user.role)) {
          return res
            .status(403)
            .json({ error: "Insufficient permissions for this action" });
        }
        next();
      };
    },
    _user: user,
  };
}

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
    headersSent: false,
  };
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((body: any) => {
    res.body = body;
    res.headersSent = true;
    return res;
  });
  return res;
}

async function runHandlers(handlers: Array<(req: any, res: any, next: any) => any>, req: any, res: any) {
  let idx = 0;
  return await new Promise<void>((resolve, reject) => {
    const next = (err?: any) => {
      if (err) return reject(err);
      if (res.headersSent) return resolve();
      const handler = handlers[idx++];
      if (!handler) return resolve();
      try {
        const ret = handler(req, res, next);
        if (res.headersSent) return resolve();
        if (ret && typeof ret.then === "function") {
          ret.then(() => {
            if (res.headersSent) return resolve();
            next();
          }).catch(reject);
        }
      } catch (e) {
        reject(e);
      }
    };
    next();
  });
}

function getRouteHandlers(router: any, method: string, routePath: string) {
  const layer = router.stack.find(
    (l: any) => l.route && l.route.path === routePath && l.route.methods?.[method]
  );
  if (!layer) {
    throw new Error(`Route not found: ${method.toUpperCase()} ${routePath}`);
  }
  return layer.route.stack.map((s: any) => s.handle);
}

function makeBranch(overrides?: Partial<any>) {
  return {
    id: "branch-1",
    tenant_id: "tenant-1",
    name: "Main Branch",
    address: null,
    contact_phone: null,
    contact_email: null,
    status: "ACTIVE",
    created_at: new Date("2025-01-01T00:00:00.000Z"),
    updated_at: new Date("2025-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

describe("Branch router handlers", () => {
  it("GET / lists accessible branches", async () => {
    const service = {
      listAccessibleBranches: jest.fn().mockResolvedValue([makeBranch()]),
    };
    const auth = makeAuth({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      branchId: "branch-1",
      role: "ADMIN",
    });

    const router = createBranchRouter(service as any, auth as any);
    const handlers = getRouteHandlers(router, "get", "/");

    const req: any = {
      user: auth._user,
    };
    const res = makeRes();

    await runHandlers(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(service.listAccessibleBranches).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      role: "ADMIN",
    });
    expect(res.body.branches).toHaveLength(1);
    expect(res.body.branches[0].id).toBe("branch-1");
  });

  it("PATCH /:branchId is admin-only", async () => {
    const service = {
      updateBranchProfile: jest.fn(),
    };
    const auth = makeAuth({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      branchId: "branch-1",
      role: "CASHIER",
    });

    const router = createBranchRouter(service as any, auth as any);
    const handlers = getRouteHandlers(router, "patch", "/:branchId");

    const req: any = {
      user: auth._user,
      params: { branchId: "branch-1" },
      body: { name: "New Name" },
    };
    const res = makeRes();

    await runHandlers(handlers, req, res);

    expect(res.statusCode).toBe(403);
    expect(service.updateBranchProfile).not.toHaveBeenCalled();
  });

  it("POST /:branchId/unfreeze returns updated branch", async () => {
    const service = {
      unfreezeBranch: jest.fn().mockResolvedValue(makeBranch({ status: "ACTIVE" })),
    };
    const auth = makeAuth({
      tenantId: "tenant-1",
      employeeId: "emp-1",
      branchId: "branch-1",
      role: "ADMIN",
    });

    const router = createBranchRouter(service as any, auth as any);
    const handlers = getRouteHandlers(router, "post", "/:branchId/unfreeze");

    const req: any = {
      user: auth._user,
      params: { branchId: "branch-1" },
      body: {},
    };
    const res = makeRes();

    await runHandlers(handlers, req, res);

    expect(res.statusCode).toBe(200);
    expect(service.unfreezeBranch).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      branchId: "branch-1",
      actorEmployeeId: "emp-1",
    });
    expect(res.body.branch.status).toBe("ACTIVE");
  });
});
