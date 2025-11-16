// TODO: Define User entity and domain logic
// Example: User, Role, Session

export interface User {
  id: string;
  tenantId: string;
  email: string;
  passwordHash: string;
  roles: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Role {
  id: string;
  name: string;
  capabilities: string[];
}

export interface Session {
  id: string;
  userId: string;
  token: string;
  expiresAt: Date;
}
