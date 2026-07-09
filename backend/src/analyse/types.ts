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
  /** NTM (next 4 estimate quarters) EPS used for headline valuation. */
  ntmEps: number | null;
  ltmEps: number | null;
  priceTarget: number | null;
  valuationBasis: "ntm";
  defaultColumnIndex: number;
  valuationPeriodLabel: string;
  valuationAvailable: boolean;
};

export type ModelQualityGrade = "full" | "limited" | "unavailable";

export type ModelQuality = {
  grade: ModelQualityGrade;
  warnings: string[];
  valuationAvailable: boolean;
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
  modelQuality?: ModelQuality;
  sources?: {
    historical: "sec_companyfacts" | null;
    drivers: "documents" | "derived" | null;
    forward: "historical" | "derived" | null;
  };
  projectionNote?: string;
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
