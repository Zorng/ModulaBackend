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
    actionKey: "hr.staff.branch.assign",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/hr\/staff\/memberships\/[^/]+\/branches$/,
    actionKey: "hr.staff.branch.assign",
    tenantSource: "path.membershipId",
  },
  {
    method: "POST",
    pattern: /^\/auth\/tenants$/,
    actionKey: "org.tenant.provision",
  },
  {
    method: "POST",
    pattern: /^\/org\/tenants$/,
    actionKey: "org.tenant.provision",
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
    method: "POST",
    pattern: /^\/org\/branches\/activation\/initiate\/?$/,
    actionKey: "org.branch.activation.initiate",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/org\/branches\/activation\/confirm\/?$/,
    actionKey: "org.branch.activation.confirm",
    tenantSource: "token",
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
  {
    method: "GET",
    pattern: /^\/policy\/current-branch$/,
    actionKey: "policy.currentBranch.read",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/policy\/current-branch$/,
    actionKey: "policy.currentBranch.update",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/menu\/items$/,
    actionKey: "menu.items.list",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/menu\/items\/all$/,
    actionKey: "menu.items.listAll",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/menu\/items\/[^/]+$/,
    actionKey: "menu.items.read",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/items$/,
    actionKey: "menu.items.create",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/menu\/items\/[^/]+$/,
    actionKey: "menu.items.update",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/items\/[^/]+\/archive$/,
    actionKey: "menu.items.archive",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/items\/[^/]+\/restore$/,
    actionKey: "menu.items.restore",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "PUT",
    pattern: /^\/menu\/items\/[^/]+\/visibility$/,
    actionKey: "menu.items.visibility.set",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/menu\/categories$/,
    actionKey: "menu.categories.list",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/categories$/,
    actionKey: "menu.categories.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/menu\/categories\/[^/]+$/,
    actionKey: "menu.categories.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/categories\/[^/]+\/archive$/,
    actionKey: "menu.categories.archive",
    tenantSource: "token",
  },
  {
    method: "GET",
    pattern: /^\/menu\/modifier-groups$/,
    actionKey: "menu.modifierGroups.list",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/modifier-groups$/,
    actionKey: "menu.modifierGroups.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/menu\/modifier-groups\/[^/]+$/,
    actionKey: "menu.modifierGroups.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/modifier-groups\/[^/]+\/archive$/,
    actionKey: "menu.modifierGroups.archive",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/modifier-groups\/[^/]+\/options$/,
    actionKey: "menu.modifierOptions.create",
    tenantSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/menu\/modifier-groups\/[^/]+\/options\/[^/]+$/,
    actionKey: "menu.modifierOptions.update",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/modifier-groups\/[^/]+\/options\/[^/]+\/archive$/,
    actionKey: "menu.modifierOptions.archive",
    tenantSource: "token",
  },
  {
    method: "PUT",
    pattern: /^\/menu\/items\/[^/]+\/composition$/,
    actionKey: "menu.composition.upsert",
    tenantSource: "token",
  },
  {
    method: "POST",
    pattern: /^\/menu\/items\/[^/]+\/composition\/evaluate$/,
    actionKey: "menu.composition.evaluate",
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
