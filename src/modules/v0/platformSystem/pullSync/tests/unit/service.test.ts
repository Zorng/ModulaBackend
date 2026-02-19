import { describe, expect, it, jest } from "@jest/globals";
import {
  V0PullSyncService,
  buildModuleScopeHash,
  normalizeModuleScopes,
} from "../../app/service.js";
import type { V0PullSyncRepository } from "../../infra/repository.js";

describe("v0 sync service", () => {
  it("normalizes module scopes and falls back to full set", () => {
    expect(normalizeModuleScopes(undefined)).toEqual([
      "policy",
      "menu",
      "discount",
      "cashSession",
      "attendance",
      "operationalNotification",
    ]);

    expect(normalizeModuleScopes(["menu", "invalid", "menu", "policy"]))
      .toEqual(["menu", "policy"]);
  });

  it("builds deterministic module scope hash", () => {
    const a = buildModuleScopeHash(["menu", "policy"]);
    const b = buildModuleScopeHash(["policy", "menu", "menu"]);
    expect(a).toBe(b);
  });

  it("pulls N+1 and returns hasMore with next cursor sequence", async () => {
    const repo: Pick<V0PullSyncRepository, "listChangesAfterSequence"> = {
      listChangesAfterSequence: jest.fn(async () => [
        {
          id: "1",
          sequence: "10",
          tenant_id: "t1",
          branch_id: "b1",
          account_id: null,
          module_key: "menu",
          entity_type: "menu_item",
          entity_id: "e1",
          operation: "UPSERT",
          revision: "r1",
          data: { a: 1 },
          changed_at: new Date(),
          source_outbox_id: null,
          created_at: new Date(),
        },
        {
          id: "2",
          sequence: "11",
          tenant_id: "t1",
          branch_id: "b1",
          account_id: null,
          module_key: "menu",
          entity_type: "menu_item",
          entity_id: "e2",
          operation: "UPSERT",
          revision: "r2",
          data: { a: 2 },
          changed_at: new Date(),
          source_outbox_id: null,
          created_at: new Date(),
        },
      ]),
    };

    const service = new V0PullSyncService(repo as unknown as V0PullSyncRepository);
    const result = await service.pull({
      accountId: "a1",
      tenantId: "t1",
      branchId: "b1",
      cursorSequence: "0",
      limit: 1,
      moduleScopes: ["menu", "policy"],
    });

    expect(result.hasMore).toBe(true);
    expect(result.changes).toHaveLength(1);
    expect(result.nextCursorSequence).toBe("10");
  });
});
