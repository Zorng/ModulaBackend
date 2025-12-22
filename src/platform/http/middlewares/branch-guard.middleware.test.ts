import { describe, expect, it, jest } from "@jest/globals";
import { requireActiveBranch } from "./branch-guard.middleware.js";

function makeRes() {
  const res: any = {
    statusCode: 200,
    body: undefined,
  };
  res.status = jest.fn().mockImplementation((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn().mockImplementation((body: any) => {
    res.body = body;
    return res;
  });
  return res;
}

describe("requireActiveBranch middleware", () => {
  it("calls next when branch is active", async () => {
    const middleware = requireActiveBranch({
      operation: "test.write",
      resolveBranchId: (req) => req.body?.branchId,
    });

    const branchGuardPort = {
      assertBranchActive: jest.fn().mockResolvedValue(undefined),
    };
    const auditDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const req: any = {
      method: "POST",
      originalUrl: "/write",
      body: { branchId: "branch-target" },
      user: {
        tenantId: "tenant-1",
        branchId: "branch-user",
        employeeId: "emp-1",
        role: "CASHIER",
      },
      app: {
        locals: {
          branchGuardPort,
          auditDb,
        },
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(branchGuardPort.assertBranchActive).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      branchId: "branch-target",
    });
    expect(auditDb.query).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects operational write when branch is frozen and writes denial audit", async () => {
    const middleware = requireActiveBranch({
      operation: "test.write",
      resolveBranchId: (req) => req.body?.branchId,
    });

    const branchGuardPort = {
      assertBranchActive: jest.fn().mockRejectedValue({ code: "BRANCH_FROZEN" }),
    };
    const auditDb = {
      query: jest.fn().mockResolvedValue({ rows: [] }),
    };

    const req: any = {
      method: "POST",
      originalUrl: "/write",
      body: { branchId: "branch-target" },
      user: {
        tenantId: "tenant-1",
        branchId: "branch-user",
        employeeId: "emp-1",
        role: "CASHIER",
      },
      app: {
        locals: {
          branchGuardPort,
          auditDb,
        },
      },
    };
    const res = makeRes();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body).toEqual({
      error: "Branch is frozen",
      code: "BRANCH_FROZEN",
    });

    expect(auditDb.query).toHaveBeenCalledTimes(1);
    const [sql, values] = auditDb.query.mock.calls[0];
    expect(String(sql)).toContain("INSERT INTO activity_log");
    expect(values[0]).toBe("tenant-1");
    expect(values[1]).toBe("branch-target");
    expect(values[2]).toBe("emp-1");
    expect(values[3]).toBe("ACTION_REJECTED_BRANCH_FROZEN");
    expect(values[5]).toBe("branch-target");
    const details = JSON.parse(values[6]);
    expect(details.reason).toBe("BRANCH_FROZEN");
    expect(details.operation).toBe("test.write");
  });
});

