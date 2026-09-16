import { db } from "../core/db.js";
import type { OutcomeEvent } from "./outcomes.js";
export type TrackerEvent = OutcomeEvent & {
  actorId: string;
  actorSlug: string;
  actorName: string;
  companyName: string;
  filingId: string;
  amount: number | null;
  amountRange: string | null;
  shares: number | null;
  role: string | null;
  code: string | null;
  filedAt: string | null;
  quality: string;
  description: string | null;
};
const tables = {
  insider: "insider_transactions",
  politician: "politician_transactions",
  institution: "institution_transactions",
} as const;
export type Category = keyof typeof tables;
export function category(raw: string | null): Category | null {
  return raw && Object.hasOwn(tables, raw) ? (raw as Category) : null;
}
function readableSource(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(
    /^(https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/\d+\/)(\d{18})\/index\.json$/i,
  );
  if (m) {
    const acc = m[2]!;
    return `${m[1]}${acc}/${acc.slice(0, 10)}-${acc.slice(10, 12)}-${acc.slice(12)}-index.htm`;
  }
  return /^https?:\/\//i.test(raw) ? raw : null;
}
export function mapEvent(r: any, kind: Category): TrackerEvent {
  const code = String(r.code ?? "").toUpperCase();
  const type = String(r.transaction_type ?? "").toLowerCase();
  const action =
    kind === "institution"
      ? "holding"
      : kind === "politician"
        ? /^(p|purchase|buy)(\b|$)/i.test(type)
          ? "buy"
          : /^(s|sale|sell)(\b|$)/i.test(type)
            ? "sell"
            : /^(e|exchange)(\b|$)/i.test(type)
              ? "exchange"
              : "other"
        : code === "P"
          ? "buy"
          : code === "S"
            ? "sell"
            : ({ A: "award", F: "tax", M: "exercise", G: "gift" }[code] ??
              "other");
  const instrument =
    kind === "institution"
      ? (r.instrument_type ?? "unclassified")
      : kind === "insider"
        ? r.is_derivative
          ? "derivative"
          : "shares"
        : /\[ST\]/i.test(r.asset_name ?? "")
          ? "shares"
          : /\[OP\]|\b(option|call|put|exercise|strike|expir)/i.test(
                `${r.asset_name ?? ""} ${r.description ?? ""}`,
              )
            ? "derivative"
            : /\b(stock|common|shares)\b/i.test(r.asset_name ?? "")
              ? "shares"
              : "unclassified";
  const quality =
    kind === "institution" && Number(r.data_quality_version ?? 0) < 1
      ? "legacy_unverified"
      : "source_linked";
  return {
    id: r.id,
    ticker: r.ticker,
    category: kind,
    action,
    instrument,
    actorId: r.actor_id,
    actorSlug: r.actor_slug,
    actorName: r.actor_name,
    companyName: r.company_name,
    filingId: r.filing_id,
    reportedAt: quality === "legacy_unverified" ? null : r.reported_at,
    observedAt: r.observed_at,
    filedAt:
      kind === "institution" && quality === "source_linked" ? r.filed_at : null,
    sourceUrl: readableSource(r.source_url),
    amount:
      quality === "legacy_unverified" || kind === "politician"
        ? null
        : r.amount,
    amountRange: r.amount_range ?? null,
    shares: quality === "legacy_unverified" ? null : r.shares,
    role: r.role ?? null,
    code: code || null,
    quality,
    description: r.description ?? null,
  };
}
function selectFor(kind: Category) {
  const extra =
    kind === "insider"
      ? `t.transaction_code as code,t.acquired_disposed,t.is_derivative,t.role,t.amount_usd::float8 as amount,t.shares::float8`
      : kind === "politician"
        ? `t.transaction_type,t.amount_usd::float8 as amount,t.amount_range,t.asset_name,t.description,t.chamber as role`
        : `t.activity,t.amount_usd::float8 as amount,t.shares::float8,t.instrument_type,t.data_quality_version`;
  return `t.id::text,t.filing_id::text,a.id::text as actor_id,a.slug as actor_slug,a.display_name as actor_name,i.ticker,i.name as company_name,t.transaction_at::text as reported_at,d.parsed_at::text as observed_at,d.filed_at::text,coalesce(d.pdf_url,d.index_url,d.url) as source_url,${extra}`;
}
export async function actorBySlug(slug: string) {
  return db.oneApi<any>(
    "SELECT id::text,slug,display_name as name,filer_type::text as category,detail,detail_secondary FROM filers WHERE slug=$1",
    [slug],
  );
}
export async function actorEvents(
  actorId: string,
  limit = 1200,
): Promise<TrackerEvent[]> {
  const all: TrackerEvent[] = [];
  // Sequential bounded reads leave the pool available to auth and billing.
  for (const kind of Object.keys(tables) as Category[]) {
    if (kind === "institution") {
      // A huge manager must not crowd every older quarter out of the bounded sample.
      const rows = await db.queryApi<any>(
        `WITH ranked AS (
    SELECT t.*,row_number() OVER(PARTITION BY date_trunc('quarter',t.transaction_at) ORDER BY t.amount_usd DESC NULLS LAST,t.id) as rn
    FROM institution_transactions t WHERE t.filer_id=$1::uuid AND t.data_quality_version>=1
   ) SELECT ${selectFor(kind)} FROM ranked t JOIN filers a ON a.id=t.filer_id JOIN issuers i ON i.id=t.issuer_id JOIN filings d ON d.id=t.filing_id
   WHERE t.rn<=100 AND d.show_on_ticker AND d.parsed_at<=now() ORDER BY t.transaction_at DESC,t.amount_usd DESC NULLS LAST LIMIT $2`,
        [actorId, limit + 1],
      );
      if (rows.length) {
        all.push(...rows.map((r) => mapEvent(r, kind)));
        continue;
      }
    }
    const rows = await db.queryApi<any>(
      `SELECT ${selectFor(kind)} FROM ${tables[kind]} t JOIN filers a ON a.id=t.filer_id JOIN issuers i ON i.id=t.issuer_id JOIN filings d ON d.id=t.filing_id WHERE t.filer_id=$1::uuid AND d.show_on_ticker AND d.parsed_at<=now() ORDER BY t.transaction_at DESC,t.id DESC LIMIT $2`,
      [actorId, limit + 1],
    );
    all.push(...rows.map((r) => mapEvent(r, kind)));
  }

  return all.sort(
    (a, b) =>
      (b.reportedAt ?? "").localeCompare(a.reportedAt ?? "") ||
      b.observedAt.localeCompare(a.observedAt) ||
      b.id.localeCompare(a.id),
  );
}
export async function activity(opts: {
  kind: Category | null;
  limit: number;
  before?: string | null;
  ticker?: string | null;
  actorIds?: string[];
  order?: string;
}) {
  if (opts.order !== "recorded") return reportedActivity(opts);
  const limit = Math.min(60, Math.max(1, opts.limit));
  const all: TrackerEvent[] = [];
  const cursor = opts.before?.split("|");
  if (
    cursor &&
    (cursor.length !== 3 ||
      !Number.isFinite(Date.parse(cursor[0]!)) ||
      !cursor.slice(1).every((v) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v)))
  )
    throw Error("invalid_cursor");
  for (const kind of (opts.kind
    ? [opts.kind]
    : Object.keys(tables)) as Category[]) {
    for (const source of kind === "insider"
      ? ["sec_form3", "sec_form4", "sec_form5"]
      : kind === "politician"
        ? ["house_ptr", "senate_ptr", "oge_278t"]
        : ["sec_13f"]) {
      const rows = await db.queryApi<any>(
        `WITH recent AS MATERIALIZED (
    SELECT * FROM filings WHERE source_type=$1 AND show_on_ticker AND parsed_at<=now()
    AND ($2::timestamptz IS NULL OR (parsed_at,id)<=($2::timestamptz,$5::uuid))
    AND ($4::text IS NULL OR issuer_id IN (SELECT id FROM issuers WHERE ticker=$4))
    ORDER BY parsed_at DESC,id DESC LIMIT 180
   ) SELECT ${selectFor(kind)} FROM recent d JOIN ${tables[kind]} t ON t.filing_id=d.id JOIN filers a ON a.id=t.filer_id JOIN issuers i ON i.id=t.issuer_id
   WHERE ($2::timestamptz IS NULL OR (d.parsed_at,d.id,t.id)<($2::timestamptz,$5::uuid,$6::uuid))
   ORDER BY d.parsed_at DESC,d.id DESC,t.id DESC LIMIT $3`,
        [
          source,
          cursor?.[0] ?? null,
          limit + 1,
          opts.ticker ?? null,
          cursor?.[1] ?? null,
          cursor?.[2] ?? null,
        ],
      );
      all.push(...rows.map((r) => mapEvent(r, kind)));
    }
  }
  all.sort(
    (a, b) =>
      b.observedAt.localeCompare(a.observedAt) ||
      b.filingId.localeCompare(a.filingId) ||
      b.id.localeCompare(a.id),
  );
  const chosen = all.slice(0, limit),
    last = chosen.at(-1);
  return {
    items: chosen,
    hasMore: all.length > limit,
    nextBefore: last ? `${last.observedAt}|${last.filingId}|${last.id}` : null,
    generatedAt: new Date().toISOString(),
  };
}
export async function people(opts: {
  q: string;
  kind: Category | null;
  offset: number;
}) {
  const q = opts.q.replace(/[\\%_]/g, "\\$&");
  return db.queryApi<any>(
    `SELECT a.id::text,a.slug,a.display_name as name,a.filer_type::text as category,a.detail FROM filers a
 WHERE ($1='' OR a.display_name ILIKE '%'||$1||'%' ESCAPE '\\') AND ($2::text IS NULL OR a.filer_type::text=$2)

 ORDER BY CASE WHEN lower(a.display_name)=lower($1) THEN 0 ELSE 1 END,CASE WHEN a.slug=ANY(ARRAY['hon-nancy-pelosi','huang-jen-hsun','cook-timothy-d','su-lisa-t','vanguard-portfolio-management','cik-2012383','renaissance-technologies','hon-josh-gottheimer','sheldon-whitehouse','hon-ro-khanna']) THEN 0 ELSE 1 END,lower(a.display_name),a.id LIMIT 31 OFFSET $3`,
    [q, opts.kind, opts.offset],
  );
}

async function reportedActivity(opts: {
  kind: Category | null;
  limit: number;
  before?: string | null;
  ticker?: string | null;
}) {
  const cursor = opts.before?.split("|");
  if (
    cursor &&
    (cursor.length !== 3 ||
      cursor[0] !== "r" ||
      !Number.isFinite(Date.parse(cursor[1]!)) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(cursor[2]!))
  )
    throw Error("invalid_cursor");
  const all: TrackerEvent[] = [];
  const limit = Math.max(1, Math.min(60, opts.limit));
  for (const kind of (opts.kind
    ? [opts.kind]
    : Object.keys(tables)) as Category[]) {
    const rows = await db.queryApi<any>(
      `WITH recent AS MATERIALIZED (
   SELECT * FROM ${tables[kind]} WHERE transaction_at<=now()
   ${kind === "institution" ? "AND data_quality_version>=1" : ""}
   AND ($1::timestamptz IS NULL OR (transaction_at,id)<($1::timestamptz,$2::uuid))
   AND ($3::text IS NULL OR issuer_id IN (SELECT id FROM issuers WHERE ticker=$3))
   ORDER BY transaction_at DESC,id DESC LIMIT 180
  ) SELECT ${selectFor(kind)} FROM recent t JOIN filers a ON a.id=t.filer_id JOIN issuers i ON i.id=t.issuer_id JOIN filings d ON d.id=t.filing_id
  WHERE d.show_on_ticker AND d.parsed_at<=now() ORDER BY t.transaction_at DESC,t.id DESC LIMIT $4`,
      [
        cursor?.[1] ?? null,
        cursor?.[2] ?? null,
        opts.ticker ?? null,
        limit + 1,
      ],
    );
    all.push(...rows.map((r) => mapEvent(r, kind)));
  }
  all.sort(
    (a, b) =>
      (b.reportedAt ?? "").localeCompare(a.reportedAt ?? "") ||
      b.id.localeCompare(a.id),
  );
  const items = all.slice(0, limit),
    last = items.at(-1);
  return {
    items,
    hasMore: all.length > limit,
    nextBefore: last ? `r|${last.reportedAt}|${last.id}` : null,
    generatedAt: new Date().toISOString(),
    order: "reported",
  };
}
