export type AnalyseModelRow = {
  label: string;
  values: (number | string)[];
  kind?: "pct" | "growth" | "eps";
  readOnly?: boolean;
  driverKind?: string;
  rollsUpToRevenue?: boolean;
};

export type AnalyseValuationConfig = {
  targetPe: number;
  marketPrice: number | null;
  marketCapBillions: number | null;
  enterpriseValueBillions: number | null;
  bridgeDriverLabels: string[];
};

export type AnalyseModel = {
  currency: string;
  unitNote?: string;
  estimateFromIndex: number;
  quarters: string[];
  driverSectionTitle?: string;
  driverUnitHint?: string;
  historicalModel: AnalyseModelRow[];
  businessDrivers: AnalyseModelRow[];
  valuationConfig: AnalyseValuationConfig;
  sources?: {
    historical: "sec_companyfacts" | null;
    drivers: "documents" | "derived" | null;
    forward: "documents" | null;
  };
};

export type AnalyseRevenueOverlay = {
  values: number[];
};

export type AnalyseModelPayload = {
  ok: true;
  ticker: string;
  model: AnalyseModel;
  revenueOverlay: AnalyseRevenueOverlay;
  partial?: boolean;
};
