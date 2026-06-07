export type DiscoverIntelMode = "market" | "clinical";

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
};

export type DiscoverTimelineResult = {
  ok: true;
  upcoming: DiscoverEvent[];
  past: DiscoverEvent[];
  meta: {
    past_days: number;
    ahead_days: number;
    universe: number;
  };
};
