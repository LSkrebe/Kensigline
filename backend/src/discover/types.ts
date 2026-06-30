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
  /** Closest upcoming catalyst/earnings for this ticker (Market Moves footer). */
  next_upcoming?: DiscoverNextUpcoming | null;
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

/** Next catalyst on a Market Moves card (closest upcoming event for the ticker). */
export type DiscoverNextUpcoming = {
  label: string;
  at: string;
  soon: boolean;
};

export type DiscoverTimelineResult = {
  ok: true;
  upcoming: DiscoverEvent[];
  past: DiscoverEvent[];
  /** Green-highlight market move cards (Investigate-aligned aggregation). */
  market_moves: DiscoverEvent[];
  macro: DiscoverMacroDay[];
  moves: Record<string, DiscoverMoveReaction>;
  meta: {
    past_days: number;
    ahead_days: number;
    universe: number;
  };
};
