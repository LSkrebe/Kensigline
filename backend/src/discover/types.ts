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

export type DiscoverMoveReaction = {
  movePct: number;
  closes: number[];
};

export type DiscoverTimelineResult = {
  ok: true;
  upcoming: DiscoverEvent[];
  past: DiscoverEvent[];
  macro: DiscoverMacroDay[];
  moves: Record<string, DiscoverMoveReaction>;
  meta: {
    past_days: number;
    ahead_days: number;
    universe: number;
  };
};
