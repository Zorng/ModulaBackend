import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { requireV0Auth } from "../../api/middleware.js";

type MockResponse = {
  statusCode: number;
  body: unknown;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

describe("requireV0Auth middleware", () => {
  beforeEach(() => {
    process.env.JWT_SECRET = "unit-test-secret";
  });

  it("returns 401 when bearer token is missing", () => {
    const req: any = { headers: {} };
    const res = createMockResponse();
    const next = jest.fn();

    requireV0Auth(req, res as any, next as any);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("returns 401 when token scope is not v0", () => {
    const token = jwt.sign(
      { accountId: "acc-1", scope: "v1" },
      process.env.JWT_SECRET as string
    );
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();
    const next = jest.fn();

    requireV0Auth(req, res as any, next as any);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("attaches auth claims and calls next for valid token", () => {
    const token = jwt.sign(
      { accountId: "acc-1", tenantId: "tenant-1", branchId: "branch-1", scope: "v0" },
      process.env.JWT_SECRET as string
    );
    const req: any = { headers: { authorization: `Bearer ${token}` } };
    const res = createMockResponse();
    const next = jest.fn();

    requireV0Auth(req, res as any, next as any);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.v0Auth).toEqual({
      accountId: "acc-1",
      tenantId: "tenant-1",
      branchId: "branch-1",
    });
  });
});
