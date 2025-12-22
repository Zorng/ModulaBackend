export type AuditOutcome = "SUCCESS" | "REJECTED" | "FAILED";

export type AuditDenialReason =
  | "PERMISSION_DENIED"
  | "POLICY_BLOCKED"
  | "VALIDATION_FAILED"
  | "BRANCH_FROZEN"
  | "TENANT_FROZEN"
  | "DEPENDENCY_MISSING";

export type AuditActorType = "EMPLOYEE" | "SYSTEM";

export interface AuditLogEntry {
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

