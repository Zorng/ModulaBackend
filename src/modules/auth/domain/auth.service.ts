import { 
  User, 
  UserRole, 
  UserStatus, 
  Tenant, 
  Branch, 
  Invite, 
  AuthTokens,
  LoginCredentials,
  RegisterTenantRequest,
  CreateInviteRequest,
  AcceptInviteRequest,
  AuthActionType
} from './entities.js';
import { AuthRepository } from '../infra/repository.js';
import { PasswordService } from './password.service.js';
import { TokenService } from './token.service.js';
import * as crypto from 'crypto';

export class AuthService {
  constructor(
    private authRepo: AuthRepository,
    private tokenService: TokenService,
    private defaultInviteExpiryHours: number = 72
  ) {}

  async registerTenant(request: RegisterTenantRequest): Promise<{ tenant: Tenant; user: User; tokens: AuthTokens }> {
    // Create tenant
    const tenant = await this.authRepo.createTenant({
      name: request.business_name,
      business_type: request.business_type,
      status: 'ACTIVE'
    });

    // Create first branch
    const branch = await this.authRepo.createBranch({
      tenant_id: tenant.id,
      name: 'Main Branch',
      address: 'Primary business location'
    });

    // Hash password
    const passwordHash = await PasswordService.hashPassword(request.password);

    // Create admin user
    const user = await this.authRepo.createUser({
      tenant_id: tenant.id,
      phone: request.phone,
      first_name: request.first_name,
      last_name: request.last_name,
      password_hash: passwordHash,
      status: 'ACTIVE'
    });

    // Create admin assignment
    await this.authRepo.createUserBranchAssignment({
      user_id: user.id,
      branch_id: branch.id,
      role: 'ADMIN',
      active: true
    });

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenant.id,
      branch_id: branch.id,
      user_id: user.id,
      action_type: 'AUTH_INVITE_ACCEPTED',
      resource_type: 'TENANT',
      resource_id: tenant.id,
      details: { business_name: request.business_name }
    });

    // Generate tokens
    const tokens = await this.generateUserTokens(user, branch.id, 'ADMIN');

    return { tenant, user, tokens };
  }

  async login(credentials: LoginCredentials): Promise<{ user: User; tokens: AuthTokens; branchAssignments: any[] }> {
    // Find user by phone across all tenants
    const user = await this.authRepo.findUserByPhoneAnyTenant(credentials.phone);
    
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await PasswordService.verifyPassword(credentials.password, user.password_hash);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const branchAssignments = await this.authRepo.findUserBranchAssignments(user.id);
    if (branchAssignments.length === 0) {
      throw new Error('No branch assignments found');
    }

    // Use the first active branch assignment
    const primaryAssignment = branchAssignments[0];
    const tokens = await this.generateUserTokens(user, primaryAssignment.branch_id, primaryAssignment.role);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: user.tenant_id,
      branch_id: primaryAssignment.branch_id,
      user_id: user.id,
      action_type: 'AUTH_INVITE_ACCEPTED', // Reusing for login
      resource_type: 'USER',
      resource_id: user.id
    });

    return { user, tokens, branchAssignments };
  }

  async createInvite(tenantId: string, adminUserId: string, request: CreateInviteRequest): Promise<Invite> {
    const branch = await this.authRepo.findBranchById(request.branch_id);
    if (!branch || branch.tenant_id !== tenantId) {
      throw new Error('Invalid branch');
    }

    // Check for duplicate invites
    const existingUser = await this.authRepo.findUserByPhone(tenantId, request.phone);
    if (existingUser) {
      throw new Error('User already exists with this phone');
    }

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + (request.expires_in_hours || this.defaultInviteExpiryHours));

    const invite = await this.authRepo.createInvite({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      role: request.role,
      phone: request.phone,
      token_hash: tokenHash,
      first_name: request.first_name,
      last_name: request.last_name,
      note: request.note,
      expires_at: expiresAt
    });

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      branch_id: request.branch_id,
      user_id: adminUserId,
      action_type: 'AUTH_INVITE_CREATED',
      resource_type: 'INVITE',
      resource_id: invite.id,
      details: { role: request.role, phone: request.phone }
    });

    return { ...invite, token_hash: token }; // Return actual token for sending
  }

  async acceptInvite(token: string, request: AcceptInviteRequest): Promise<{ user: User; tokens: AuthTokens }> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const invite = await this.authRepo.findInviteByToken(tokenHash);

    if (!invite) {
      throw new Error('Invalid invite token');
    }

    if (invite.expires_at < new Date()) {
      throw new Error('Invite has expired');
    }

    if (invite.revoked_at) {
      throw new Error('Invite has been revoked');
    }

    if (invite.accepted_at) {
      throw new Error('Invite has already been accepted');
    }

    // Validate password
    if (!PasswordService.validatePasswordStrength(request.password)) {
      throw new Error('Password does not meet strength requirements');
    }

    const passwordHash = await PasswordService.hashPassword(request.password);

    // Create user
    const user = await this.authRepo.createUser({
      tenant_id: invite.tenant_id,
      phone: invite.phone,
      first_name: invite.first_name,
      last_name: invite.last_name,
      password_hash: passwordHash,
      status: 'ACTIVE'
    });

    // Create branch assignment
    await this.authRepo.createUserBranchAssignment({
      user_id: user.id,
      branch_id: invite.branch_id,
      role: invite.role,
      active: true
    });

    // Mark invite as accepted
    await this.authRepo.acceptInvite(invite.id);

    // Generate tokens
    const tokens = await this.generateUserTokens(user, invite.branch_id, invite.role);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: invite.tenant_id,
      branch_id: invite.branch_id,
      user_id: user.id,
      action_type: 'AUTH_INVITE_ACCEPTED',
      resource_type: 'INVITE',
      resource_id: invite.id
    });

    return { user, tokens };
  }

  async refreshTokens(refreshToken: string): Promise<AuthTokens> {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.authRepo.findSessionByRefreshToken(refreshTokenHash);

    if (!session) {
      throw new Error('Invalid refresh token');
    }

    const user = await this.authRepo.findUserById(session.user_id);
    if (!user || user.status !== 'ACTIVE') {
      throw new Error('User not found or inactive');
    }

    const branchAssignments = await this.authRepo.findUserBranchAssignments(user.id);
    if (branchAssignments.length === 0) {
      throw new Error('No active branch assignments');
    }

    const primaryAssignment = branchAssignments[0];
    return this.generateUserTokens(user, primaryAssignment.branch_id, primaryAssignment.role);
  }

  async logout(refreshToken: string): Promise<void> {
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const session = await this.authRepo.findSessionByRefreshToken(refreshTokenHash);
    
    if (session) {
      await this.authRepo.revokeSession(session.id);
    }
  }

  async revokeInvite(tenantId: string, inviteId: string, adminUserId: string): Promise<Invite> {
    const invite = await this.authRepo.revokeInvite(inviteId);

    // Log activity
    await this.authRepo.createActivityLog({
      tenant_id: tenantId,
      user_id: adminUserId,
      action_type: 'AUTH_INVITE_REVOKED',
      resource_type: 'INVITE',
      resource_id: invite.id
    });

    return invite;
  }

  private async generateUserTokens(user: User, branchId: string, role: UserRole): Promise<AuthTokens> {
    const accessToken = this.tokenService.generateAccessToken({
      userId: user.id,
      tenantId: user.tenant_id,
      branchId,
      role
    });

    const refreshToken = this.tokenService.generateRefreshToken();
    const refreshTokenExpiry = this.tokenService.calculateRefreshTokenExpiry();
    const refreshTokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    // Create session
    await this.authRepo.createSession({
        user_id: user.id,
        refresh_token_hash: refreshTokenHash,
        expires_at: refreshTokenExpiry
        });

        return {
        accessToken,
        refreshToken,
        expiresIn: 12 * 60 * 60 // 12 hours in seconds
        };
    }

    private async getDefaultTenantId(): Promise<string> {
        // For demo purposes - in production, you might have a default tenant or multi-tenant lookup
        const tenants = await this.authRepo.findTenantById('00000000-0000-0000-0000-000000000000');
        if (tenants) {
        return tenants.id;
        }
        
        // Create default tenant if doesn't exist
        const defaultTenant = await this.authRepo.createTenant({
        name: 'Default Tenant',
        business_type: 'RETAIL',
        status: 'ACTIVE'
        });
        
        return defaultTenant.id;
    }
}