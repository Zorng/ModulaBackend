import type { V0AuthRepository } from "../infra/repository.js";
import { V0AuthAccountService } from "./auth-account.service.js";
import { V0AuthMembershipService } from "./membership.service.js";
import { V0AuthTenantProvisioningService } from "./tenant-provisioning.service.js";

export { V0AuthError } from "./common.js";

export class V0AuthService {
  private readonly accountService: V0AuthAccountService;
  private readonly membershipService: V0AuthMembershipService;
  private readonly tenantProvisioningService: V0AuthTenantProvisioningService;

  constructor(repo: V0AuthRepository) {
    this.accountService = new V0AuthAccountService(repo);
    this.membershipService = new V0AuthMembershipService(repo);
    this.tenantProvisioningService = new V0AuthTenantProvisioningService(repo);
  }

  register(...args: Parameters<V0AuthAccountService["register"]>) {
    return this.accountService.register(...args);
  }

  sendRegistrationOtp(...args: Parameters<V0AuthAccountService["sendRegistrationOtp"]>) {
    return this.accountService.sendRegistrationOtp(...args);
  }

  verifyRegistrationOtp(...args: Parameters<V0AuthAccountService["verifyRegistrationOtp"]>) {
    return this.accountService.verifyRegistrationOtp(...args);
  }

  login(...args: Parameters<V0AuthAccountService["login"]>) {
    return this.accountService.login(...args);
  }

  refresh(...args: Parameters<V0AuthAccountService["refresh"]>) {
    return this.accountService.refresh(...args);
  }

  logout(...args: Parameters<V0AuthAccountService["logout"]>) {
    return this.accountService.logout(...args);
  }

  inviteMembership(...args: Parameters<V0AuthMembershipService["inviteMembership"]>) {
    return this.membershipService.inviteMembership(...args);
  }

  listInvitationInbox(...args: Parameters<V0AuthMembershipService["listInvitationInbox"]>) {
    return this.membershipService.listInvitationInbox(...args);
  }

  acceptInvitation(...args: Parameters<V0AuthMembershipService["acceptInvitation"]>) {
    return this.membershipService.acceptInvitation(...args);
  }

  rejectInvitation(...args: Parameters<V0AuthMembershipService["rejectInvitation"]>) {
    return this.membershipService.rejectInvitation(...args);
  }

  changeMembershipRole(...args: Parameters<V0AuthMembershipService["changeMembershipRole"]>) {
    return this.membershipService.changeMembershipRole(...args);
  }

  revokeMembership(...args: Parameters<V0AuthMembershipService["revokeMembership"]>) {
    return this.membershipService.revokeMembership(...args);
  }

  assignMembershipBranches(
    ...args: Parameters<V0AuthMembershipService["assignMembershipBranches"]>
  ) {
    return this.membershipService.assignMembershipBranches(...args);
  }

  createTenantWithFirstBranch(
    ...args: Parameters<V0AuthTenantProvisioningService["createTenantWithFirstBranch"]>
  ) {
    return this.tenantProvisioningService.createTenantWithFirstBranch(...args);
  }
}
