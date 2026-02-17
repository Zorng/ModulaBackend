export type FirstBranchPaymentVerification = {
  confirmed: boolean;
  reasonCode?: string;
  confirmationReference?: string | null;
};

export interface FirstBranchPaymentVerifier {
  verify(input: {
    tenantId: string;
    requesterAccountId: string;
    paymentToken: string;
  }): Promise<FirstBranchPaymentVerification>;
}

export class StubFirstBranchPaymentVerifier implements FirstBranchPaymentVerifier {
  private readonly acceptedToken = String(
    process.env.V0_FIRST_BRANCH_PAYMENT_STUB_TOKEN ?? "PAID"
  ).trim();

  async verify(input: {
    tenantId: string;
    requesterAccountId: string;
    paymentToken: string;
  }): Promise<FirstBranchPaymentVerification> {
    const token = String(input.paymentToken ?? "").trim();
    if (!token) {
      return {
        confirmed: false,
        reasonCode: "PAYMENT_TOKEN_REQUIRED",
      };
    }

    if (token !== this.acceptedToken) {
      return {
        confirmed: false,
        reasonCode: "PAYMENT_NOT_CONFIRMED",
      };
    }

    return {
      confirmed: true,
      confirmationReference: `stub:${input.tenantId}:${Date.now()}`,
    };
  }
}
