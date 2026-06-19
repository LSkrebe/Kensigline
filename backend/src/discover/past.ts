import { db } from "../core/db.js";
import { mapDocumentToDiscoverEvent, type DocumentDiscoverRow } from "./map.js";
import type { DiscoverEvent } from "./types.js";

function isFlowFeedKind(feedKind: string | null | undefined) {
  const fk = String(feedKind ?? "").toLowerCase();
  return fk === "insider" || fk === "politicians" || fk === "institutions";
}

function isEventOnUtcToday(eventAt: string | null | undefined) {
  const raw = String(eventAt ?? "").trim();
  if (!raw) return false;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return false;
  const now = new Date();
  return (
    d.getUTCFullYear() === now.getUTCFullYear() &&
    d.getUTCMonth() === now.getUTCMonth() &&
    d.getUTCDate() === now.getUTCDate()
  );
}

function flowTodayCountsByTicker(rows: DocumentDiscoverRow[]) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    if (!isFlowFeedKind(row.feed_kind) || !isEventOnUtcToday(row.event_at)) continue;
    const ticker = String(row.ticker ?? "").trim().toUpperCase();
    if (!ticker) continue;
    counts.set(ticker, (counts.get(ticker) ?? 0) + 1);
  }
  return counts;
}

export async function loadPastDiscoverEvents(opts: {
  pastDays: number;
  limit: number;
}): Promise<DiscoverEvent[]> {
  const rows = await db.query<DocumentDiscoverRow>(
    `
    SELECT
      d.id,
      upper(trim(d.ticker)) AS ticker,
      COALESCE(NULLIF(trim(c.name), ''), upper(trim(d.ticker))) AS company_name,
      d.event_at::text AS event_at,
      COALESCE(NULLIF(trim(d.title), ''), NULLIF(trim(d.feed_label), ''), d.source_key) AS title,
      d.source_key,
      d.feed_kind,
      d.analysis,
      d.url,
      d.program_drug,
      d.program_phase,
      d.program_keys,
      d.doc_kind,
      c.industry,
      d.data
    FROM documents d
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(d.ticker))
    WHERE d.ticker IS NOT NULL
      AND d.event_at IS NOT NULL
      AND d.event_at >= date_trunc('day', now()) - ($1 || ' days')::interval
      AND d.event_at < date_trunc('day', now()) + interval '1 day'
      AND (
        (
          d.feed_kind IN ('research', 'pharma')
          AND d.show_on_ticker IS NOT FALSE
          AND d.analysis IS NOT NULL
          AND length(trim(d.analysis)) > 0
        )
        OR (
          d.feed_kind IN ('insider', 'politicians', 'institutions')
          AND d.source_key IN ('Form 4', 'Form 3', 'Form 5', 'PTR', '13F')
        )
      )
    ORDER BY d.event_at DESC, d.parsed_at DESC
    LIMIT $2
    `,
    [String(Math.max(1, opts.pastDays)), opts.limit],
  );

  const universe = new Set(rows.map((r) => String(r.ticker ?? "").trim().toUpperCase()).filter(Boolean));
  const todayCounts = flowTodayCountsByTicker(rows);
  return rows.map((row) => {
    const ticker = String(row.ticker ?? "").trim().toUpperCase();
    return mapDocumentToDiscoverEvent(row, universe, { todayCount: todayCounts.get(ticker) ?? 0 });
  });
}
