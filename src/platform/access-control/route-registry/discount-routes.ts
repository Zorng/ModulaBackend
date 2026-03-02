import type { ProtectedRoute } from "../types.js";

export const DISCOUNT_ROUTES: ProtectedRoute[] = [
  {
    method: "GET",
    pattern: /^\/discount\/rules$/,
    actionKey: "discount.rules.list",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/discount\/rules\/[^/]+$/,
    actionKey: "discount.rules.read",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/rules$/,
    actionKey: "discount.rules.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/discount\/rules\/[^/]+$/,
    actionKey: "discount.rules.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/rules\/[^/]+\/activate$/,
    actionKey: "discount.rules.activate",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/rules\/[^/]+\/deactivate$/,
    actionKey: "discount.rules.deactivate",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/rules\/[^/]+\/archive$/,
    actionKey: "discount.rules.archive",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/preflight\/eligible-items$/,
    actionKey: "discount.rules.preflight.eligibleItems",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/discount\/eligibility\/resolve$/,
    actionKey: "discount.eligibility.resolve",
    tenantSource: "token",
    branchSource: "token",
  },
];
