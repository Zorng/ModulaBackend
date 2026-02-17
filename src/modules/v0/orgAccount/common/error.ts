export class V0OrgAccountError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "V0OrgAccountError";
  }
}

export type OrgActorContext = {
  accountId: string;
  tenantId: string | null;
  branchId: string | null;
};
