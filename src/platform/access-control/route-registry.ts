import type { ProtectedRoute } from "./types.js";

export const PROTECTED_ROUTES: ProtectedRoute[] = [
  {
    method: "GET",
    pattern: /^\/auth\/context\/tenants$/,
    actionKey: "auth.context.tenants.list",
  },
  {
    method: "POST",
    pattern: /^\/auth\/context\/tenant\/select$/,
    actionKey: "auth.context.tenant.select",
    tenantSource: "body.tenantId",
  },
  {
    method: "GET",
    pattern: /^\/auth\/context\/branches$/,
    actionKey: "auth.context.branches.list",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/auth\/context\/branch\/select$/,
    actionKey: "auth.context.branch.select",
    tenantSource: "token",
    branchSource: "body.branchId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invite$/,
    actionKey: "org.membership.invite",
    tenantSource: "body.tenantId",
  },
  {
    method: "POST",
    pattern: /^\/org\/memberships\/invite$/,
    actionKey: "org.membership.invite",
    tenantSource: "body.tenantId",
  },
  {
    method: "GET",
    pattern: /^\/auth\/memberships\/invitations$/,
    actionKey: "org.membership.invitations.list",
  },
  {
    method: "GET",
    pattern: /^\/org\/memberships\/invitations$/,
    actionKey: "org.membership.invitations.list",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invitations\/[^/]+\/accept$/,
    actionKey: "org.membership.invitation.accept",
  },
  {
    method: "POST",
    pattern: /^\/org\/memberships\/invitations\/[^/]+\/accept$/,
    actionKey: "org.membership.invitation.accept",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/invitations\/[^/]+\/reject$/,
    actionKey: "org.membership.invitation.reject",
  },
  {
    method: "POST",
    pattern: /^\/org\/memberships\/invitations\/[^/]+\/reject$/,
    actionKey: "org.membership.invitation.reject",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/role$/,
    actionKey: "org.membership.role.change",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/org\/memberships\/[^/]+\/role$/,
    actionKey: "org.membership.role.change",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/revoke$/,
    actionKey: "org.membership.revoke",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/org\/memberships\/[^/]+\/revoke$/,
    actionKey: "org.membership.revoke",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/memberships\/[^/]+\/branches$/,
    actionKey: "auth.membership.branches.assign",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/tenants$/,
    actionKey: "tenant.provision",
  },
  {
    method: "POST",
    pattern: /^\/org\/tenants$/,
    actionKey: "tenant.provision",
  },
  {
    method: "POST",
    pattern: /^\/attendance\/check-in$/,
    actionKey: "attendance.checkIn",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/attendance\/check-out$/,
    actionKey: "attendance.checkOut",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/attendance\/me$/,
    actionKey: "attendance.listMine",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/org\/tenant\/current$/,
    actionKey: "org.tenant.current.read",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/org\/branches\/accessible$/,
    actionKey: "org.branches.accessible.read",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/org\/branch\/current$/,
    actionKey: "org.branch.current.read",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/subscription\/state\/current$/,
    actionKey: "subscription.state.current.read",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/subscription\/entitlements\/current-branch$/,
    actionKey: "subscription.entitlements.currentBranch.read",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/audit\/events$/,
    actionKey: "audit.view",
    tenantSource: "token",
  },
];

export function matchProtectedRoute(
  method: string,
  path: string
): ProtectedRoute | null {
  return (
    PROTECTED_ROUTES.find(
      (candidate) => candidate.method === method && candidate.pattern.test(path)
    ) ?? null
  );
}
