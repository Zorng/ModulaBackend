import type { ActionMetadata } from "./types.js";

export const ACTION_METADATA: Record<string, ActionMetadata> = {
  "auth.context.tenants.list": { scope: "GLOBAL", effect: "READ" },
  "auth.context.tenant.select": { scope: "TENANT", effect: "READ" },
  "auth.context.branches.list": { scope: "TENANT", effect: "READ" },
  "auth.context.branch.select": { scope: "BRANCH", effect: "READ" },
  "org.membership.invite": {
    scope: "TENANT",
    effect: "WRITE",
    allowedRoles: ["OWNER", "ADMIN"],
  },
  "org.membership.invitations.list": { scope: "GLOBAL", effect: "READ" },
  "org.membership.invitation.accept": { scope: "GLOBAL", effect: "WRITE" },
  "org.membership.invitation.reject": { scope: "GLOBAL", effect: "WRITE" },
  "org.membership.role.change": {
    scope: "TENANT",
    effect: "WRITE",
    allowedRoles: ["OWNER", "ADMIN"],
  },
  "org.membership.revoke": {
    scope: "TENANT",
    effect: "WRITE",
    allowedRoles: ["OWNER", "ADMIN"],
  },
  "auth.membership.branches.assign": {
    scope: "TENANT",
    effect: "WRITE",
    allowedRoles: ["OWNER", "ADMIN"],
  },
  "tenant.provision": { scope: "GLOBAL", effect: "WRITE" },
  "attendance.checkIn": {
    scope: "BRANCH",
    effect: "WRITE",
    entitlementKey: "module.workforce",
  },
  "attendance.checkOut": {
    scope: "BRANCH",
    effect: "WRITE",
    entitlementKey: "module.workforce",
  },
  "attendance.listMine": {
    scope: "BRANCH",
    effect: "READ",
    entitlementKey: "module.workforce",
  },
  "org.tenant.current.read": { scope: "TENANT", effect: "READ" },
  "org.branches.accessible.read": { scope: "TENANT", effect: "READ" },
  "org.branch.current.read": { scope: "BRANCH", effect: "READ" },
  "subscription.state.current.read": { scope: "TENANT", effect: "READ" },
  "subscription.entitlements.currentBranch.read": {
    scope: "BRANCH",
    effect: "READ",
  },
  "audit.view": {
    scope: "TENANT",
    effect: "READ",
    allowedRoles: ["OWNER", "ADMIN"],
  },
};
