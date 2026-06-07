import { db } from "../core/db.js";
import { mapDocumentToDiscoverEvent, type DocumentDiscoverRow } from "./map.js";
import type { DiscoverEvent } from "./types.js";

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
      COALESCE(NULLIF(trim(d.feed_label), ''), NULLIF(trim(d.title), ''), d.source_key) AS title,
      d.source_key,
      d.feed_kind,
      d.analysis,
      d.url,
      d.program_drug,
      d.program_phase,
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
  return rows.map((row) => mapDocumentToDiscoverEvent(row, universe));
}
