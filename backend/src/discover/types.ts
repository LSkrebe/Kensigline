export type DiscoverIntelMode = "market";

export type DiscoverEventKind =
  | "catalyst"
  | "filing"
  | "earnings"
  | "trial"
  | "regulatory"
  | "flow";

export type DiscoverMentioned = {
  upstream?: string[];
  downstream?: string[];
};

export type DiscoverEvent = {
  id: string;
  ticker: string;
  companyName: string;
  intelMode: DiscoverIntelMode;
  at: string;
  title: string;
  kind: DiscoverEventKind;
  source: string;
  phase?: string | null;
  programKey?: string | null;
  summary?: string | null;
  url?: string | null;
  impact?: "high" | "medium" | "low" | null;
  mentioned?: DiscoverMentioned | null;
  idea_score?: number;
  idea_best?: boolean;
  idea_reasons?: string[];
};

export type DiscoverMacroEvent = {
  id: string;
  time: string;
  title: string;
  region: "US" | "EU" | "CN" | "UK";
  impact: "high" | "medium" | "low";
};

export type DiscoverMacroDay = {
  date: string;
  events: DiscoverMacroEvent[];
};

