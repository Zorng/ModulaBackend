import type { ProtectedRoute } from "../types.js";

export const ORG_POLICY_ROUTES: ProtectedRoute[] = [
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
    method: "PATCH",
    pattern: /^\/org\/branch\/current\/khqr-receiver$/,
    actionKey: "org.branch.current.khqrReceiver.update",
    tenantSource: "token",
    branchSource: "token",
  },
  {
    method: "PATCH",
    pattern: /^\/org\/branch\/current\/attendance-location$/,
    actionKey: "org.branch.current.attendanceLocation.update",
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
];
