export type SaleKhrRoundingMode = "NEAREST" | "UP" | "DOWN";
export type SaleKhrRoundingGranularity = 100 | 1000;

export type BranchPolicyDefaults = {
  saleVatEnabled: boolean;
  saleVatRatePercent: number;
  saleFxRateKhrPerUsd: number;
  saleKhrRoundingEnabled: boolean;
  saleKhrRoundingMode: SaleKhrRoundingMode;
  saleKhrRoundingGranularity: SaleKhrRoundingGranularity;
  saleAllowPayLater: boolean;
  saleAllowManualExternalPaymentClaim: boolean;
};

export const V0_BRANCH_POLICY_DEFAULTS: BranchPolicyDefaults = {
  saleVatEnabled: false,
  saleVatRatePercent: 0,
  saleFxRateKhrPerUsd: 4100,
  saleKhrRoundingEnabled: true,
  saleKhrRoundingMode: "NEAREST",
  saleKhrRoundingGranularity: 100,
  saleAllowPayLater: false,
  saleAllowManualExternalPaymentClaim: false,
};
