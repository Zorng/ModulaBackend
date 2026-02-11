import type { PoolClient } from "pg";

export type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export type AuditDenialReason =
  | "PERMISSION_DENIED"
  | "POLICY_BLOCKED"
  | "VALIDATION_FAILED"
  | "BRANCH_FROZEN"
  | "TENANT_FROZEN"
  | "DEPENDENCY_MISSING";

export type AuditActorType = "EMPLOYEE" | "SYSTEM";

export interface AuditLogRecord {
  id: string;
  tenant_id: string;
  branch_id?: string | null;
  employee_id?: string | null;
  actor_role?: string | null;
  actor_type: AuditActorType;
  action_type: string;
  resource_type?: string | null;
  resource_id?: string | null;
  details?: Record<string, any> | null;
  ip_address?: string | null;
  user_agent?: string | null;
  outcome: AuditOutcome;
  denial_reason?: AuditDenialReason | null;
  occurred_at: Date;
  created_at: Date;
  client_event_id?: string | null;
}

export interface AuditWriterPort {
  write(entry: {
    tenantId: string;
    branchId?: string;
    employeeId?: string;
    actorRole?: string | null;
    actionType: string;
    resourceType?: string;
    resourceId?: string;
    outcome?: AuditOutcome;
    denialReason?: AuditDenialReason;
    occurredAt?: Date;
    clientEventId?: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }, client?: PoolClient): Promise<void>;
}

export interface AuditQueryPort {
  list(params: {
    tenantId: string;
    from?: Date;
    to?: Date;
    branchId?: string;
    employeeId?: string;
    actionType?: string;
    outcome?: AuditOutcome;
    denialReason?: AuditDenialReason;
    page?: number;
    limit?: number;
  }): Promise<{
    logs: AuditLogRecord[];
    page: number;
    limit: number;
    total: number;
  }>;

  getById(params: { tenantId: string; id: string }): Promise<AuditLogRecord | null>;
}
