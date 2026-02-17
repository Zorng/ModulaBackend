import "express";

declare global {
  namespace Express {
    interface Request {
      v0Auth?: {
        accountId: string;
        tenantId: string | null;
        branchId: string | null;
      };
      v0Context?: {
        requestId: string;
        startedAtMs: number;
        actorType?: "ACCOUNT" | "SYSTEM";
        actorAccountId?: string;
        tenantId?: string | null;
        branchId?: string | null;
        actionKey?: string;
        idempotencyKey?: string;
        outboxId?: string;
      };
    }
  }
}

export {};
