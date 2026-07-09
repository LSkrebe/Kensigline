import { db } from "../../core/db.js";
import { parseForwardRevenueGrowthFromText } from "./guidance-parse.js";

export { parseForwardRevenueGrowthFromText } from "./guidance-parse.js";

/** Document source types most likely to mention forward revenue guidance. */
const GUIDANCE_SOURCE_KEYS = ["Earnings transcript", "8-K", "Press release", "10-Q", "10-K"];

export async function forwardRevenueGrowthFromDocuments(ticker: string): Promise<number | null> {
  const t = String(ticker ?? "").trim().toUpperCase();
  if (!t) return null;

  const rows = await db.query<{ analysis: string | null; data: unknown }>(
    `
    SELECT analysis, data
    FROM documents
    WHERE ticker = $1
      AND feed_kind = 'research'
      AND show_on_ticker IS NOT FALSE
      AND source_key = ANY($2::text[])
    ORDER BY event_at DESC NULLS LAST, parsed_at DESC
    LIMIT 10
    `,
    [t, GUIDANCE_SOURCE_KEYS],
  );

  for (const r of rows) {
    const data = r.data as { text_excerpt?: string } | null;
    const excerpt = String(data?.text_excerpt ?? "").trim();
    const body = excerpt.length > 40 ? excerpt : String(r.analysis ?? "");
    const pct = parseForwardRevenueGrowthFromText(body);
    if (pct != null) return pct;
  }

  return null;
}
