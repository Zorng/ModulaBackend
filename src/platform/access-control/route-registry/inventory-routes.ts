import type { ProtectedRoute } from "../types.js";

export const INVENTORY_ROUTES: ProtectedRoute[] = [
  {
    method: "GET",
    pattern: /^\/inventory\/categories$/,
    actionKey: "inventory.categories.list",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/categories$/,
    actionKey: "inventory.categories.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/inventory\/categories\/[^/]+$/,
    actionKey: "inventory.categories.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/categories\/[^/]+\/archive$/,
    actionKey: "inventory.categories.archive",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/items$/,
    actionKey: "inventory.items.list",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/items\/[^/]+$/,
    actionKey: "inventory.items.read",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/items$/,
    actionKey: "inventory.items.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/inventory\/items\/[^/]+$/,
    actionKey: "inventory.items.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/items\/[^/]+\/archive$/,
    actionKey: "inventory.items.archive",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/items\/[^/]+\/restore$/,
    actionKey: "inventory.items.restore",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/restock-batches$/,
    actionKey: "inventory.restockBatches.list",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/restock-batches$/,
    actionKey: "inventory.restockBatches.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/inventory\/restock-batches\/[^/]+$/,
    actionKey: "inventory.restockBatches.updateMeta",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/restock-batches\/[^/]+\/archive$/,
    actionKey: "inventory.restockBatches.archive",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/inventory\/adjustments$/,
    actionKey: "inventory.adjustments.apply",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/journal$/,
    actionKey: "inventory.journal.list",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/journal\/all$/,
    actionKey: "inventory.journal.listAll",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/stock\/branch$/,
    actionKey: "inventory.stock.branch.read",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/inventory\/stock\/aggregate$/,
    actionKey: "inventory.stock.aggregate.read",
    tenantSource: "token",
  },
];
