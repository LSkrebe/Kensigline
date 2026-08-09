import { db } from "./db.js";

type EnqueueResult = {
  ticker: string;
  cik: string;
  found: number;
  enqueued: number;
  skipped_existing: number;
  queue_ids: string[];
};

type EnqueueLatestFilingsResult = {
  ticker: string;
  cik: string;
  forms: string[];
  found: number;
  enqueued: number;
  skipped_existing: number;
  queue_ids: string[];
};

type EnqueueGlobalResult = {
  days_back: number;
  found: number;
  enqueued: number;
  skipped_existing: number;
  queue_ids: string[];
};

type EnqueueCurrentFeedResult = {
  pages: number;
  found: number;
  enqueued: number;
  skipped_existing: number;
  queue_ids: string[];
};

function requireSecUserAgent() {
  const ua = String(process.env.SEC_USER_AGENT ?? "").trim();
  if (!ua) {
    throw new Error(
      "SEC_USER_AGENT is required (SEC requests require a descriptive User-Agent, e.g. 'Kensigline dev you@domain.com')",
    );
  }
  return ua;
}

let lastSecRequestAt = 0;
let secBlockedUntil = 0;
const secRecentReqAt: number[] = [];
async function secRateLimit() {
  // Be conservative by default to avoid SEC anti-bot blocks.
  // Configure via SEC_MIN_INTERVAL_MS if you need to tune.
  const minMs = Math.max(0, Number(process.env.SEC_MIN_INTERVAL_MS ?? 1500));
  const maxRps = Math.max(1, Math.min(10, Number(process.env.SEC_MAX_RPS ?? 10)));

  const now = Date.now();
  const blockedWait = secBlockedUntil ? secBlockedUntil - now : 0;
  const baseWait = lastSecRequestAt ? minMs - (now - lastSecRequestAt) : 0;

  // Hard cap: never exceed maxRps in any rolling 1s window.
  // Keep the last N request timestamps and wait until one falls out of the window.
  const windowMs = 1000;
  const cutoff = now - windowMs;
  while (secRecentReqAt.length && (secRecentReqAt[0] ?? 0) <= cutoff) secRecentReqAt.shift();
  const rpsWait =
    secRecentReqAt.length >= maxRps ? (secRecentReqAt[0] ?? now) + windowMs - now : 0;

  const wait = Math.max(0, blockedWait, baseWait, rpsWait);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));

  const at = Date.now();
  secRecentReqAt.push(at);
  lastSecRequestAt = at;
}

function looksLikeSecBotBlock(body: string) {
  const t = body.toLowerCase();
  return (
    t.includes("your request originates from an undeclared automated tool") ||
    t.includes("reference id") && t.includes("sec.gov")
  );
}

function normalizeTicker(t: string) {
  return t.replace(/[^A-Za-z]/g, "").toUpperCase();
}

async function secFetchJson(url: string) {
  const ua = requireSecUserAgent();
  await secRateLimit();
  const res = await fetch(url, {
    headers: {
      "user-agent": ua,
      accept: "application/json",
      "accept-encoding": "gzip, deflate, br",
      connection: "keep-alive",
    },
  });
  const ctype = String(res.headers.get("content-type") ?? "").toLowerCase();
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      secBlockedUntil = Math.max(secBlockedUntil, Date.now() + 60_000);
    }
    throw new Error(`sec_fetch_failed ${res.status} ${url} ${txt.slice(0, 200)}`);
  }
  if (!ctype.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    if (looksLikeSecBotBlock(txt)) {
      secBlockedUntil = Math.max(secBlockedUntil, Date.now() + 120_000);
      throw new Error("sec_blocked_undeclared_automated_tool");
    }
    // SEC sometimes mislabels JSON responses (e.g. `text/html`) even when the body is JSON.
    // Be tolerant: if the payload parses as JSON, treat it as JSON.
    const trimmed = txt.trimStart();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(txt);
      } catch {
        // fall through to error below
      }
    }
    if (ctype.includes("text/html")) {
      secBlockedUntil = Math.max(secBlockedUntil, Date.now() + 60_000);
    }
    throw new Error(`sec_expected_json_got_${ctype || "unknown"}`);
  }
  return await res.json();
}

async function secFetchText(url: string) {
  const ua = requireSecUserAgent();
  await secRateLimit();
  const res = await fetch(url, {
    headers: {
      "user-agent": ua,
      accept: "*/*",
      "accept-encoding": "gzip, deflate, br",
      connection: "keep-alive",
    },
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    if (res.status === 403 || res.status === 429 || res.status >= 500) {
      secBlockedUntil = Math.max(secBlockedUntil, Date.now() + 60_000);
    }
    throw new Error(`sec_fetch_failed ${res.status} ${url} ${txt.slice(0, 200)}`);
  }
  const txt = await res.text();
  if (looksLikeSecBotBlock(txt)) {
    secBlockedUntil = Math.max(secBlockedUntil, Date.now() + 120_000);
    throw new Error("sec_blocked_undeclared_automated_tool");
  }
  return txt;
}

// Expose the hardened SEC fetchers for other modules (company facts, etc.).
export async function fetchSecJson(url: string) {
  return await secFetchJson(url);
}

export type TickerSecBundle = {
  cik: string;
  facts: unknown;
  title?: string | null;
};

/** One SEC companyfacts fetch per ticker — shared by fundamentals, ownership, runway, mcap. */
export async function loadTickerSecBundle(tickerInput: string): Promise<TickerSecBundle | null> {
  const ticker = String(tickerInput ?? "").trim().toUpperCase();
  if (!ticker) return null;
  try {
    const { cik, title } = await resolveCikForTicker(ticker);
    const facts = await fetchSecJson(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`);
    return { cik, facts, title: title ?? null };
  } catch {
    return null;
  }
}

export async function fetchSecText(url: string) {
  return await secFetchText(url);
}

function absoluteSecUrl(href: string) {
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  if (href.startsWith("/")) return `https://www.sec.gov${href}`;
  return `https://www.sec.gov/${href}`;
}

function parseAtomEntries(atomXml: string) {
  const entries = atomXml.match(/<entry>[\s\S]*?<\/entry>/gi) ?? [];
  const out: Array<{ href: string; title?: string }> = [];
  for (const e of entries) {
    const href =
      e.match(/<link[^>]+href="([^"]+)"[^>]*rel="alternate"[^>]*\/>/i)?.[1] ??
      e.match(/<link[^>]+rel="alternate"[^>]+href="([^"]+)"[^>]*\/>/i)?.[1] ??
      e.match(/<link[^>]+href="([^"]+)"[^>]*\/>/i)?.[1] ??
      null;
    if (!href) continue;
    const titleRaw = e.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
    const title = titleRaw ? titleRaw.replace(/\s+/g, " ").trim() : null;
    out.push(title ? { href: absoluteSecUrl(href), title } : { href: absoluteSecUrl(href) });
  }
  return out;
}

function accessionKeyFromArchivesIndexUrl(u: string) {
  // Example:
  // https://www.sec.gov/Archives/edgar/data/65433/000151028126000158/0001510281-26-000158-index.htm
  const m = u.match(/\/Archives\/edgar\/data\/\d+\/(\d{10}\d{2}\d{6})\/(\d{10}-\d{2}-\d{6})-index\.html?$/i);
  if (!m) return null;
  return { accessionNoDash: m[1]!, accession: m[2]! };
}

function indexJsonFromArchivesIndexUrl(u: string) {
  // https://www.sec.gov/Archives/edgar/data/<cik>/<accNoDash>/<acc>-index.htm
  // -> https://www.sec.gov/Archives/edgar/data/<cik>/<accNoDash>/index.json
  const m = String(u ?? "").match(
    /^(?:https?:\/\/www\.sec\.gov)?\/Archives\/edgar\/data\/(\d+)\/(\d{10}\d{2}\d{6})\/\d{10}-\d{2}-\d{6}-index\.html?$/i,
  );
  if (!m) return null;
  const cik = m[1]!;
  const accNoDash = m[2]!;
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accNoDash}/index.json`;
}

/**
 * Enqueue Form 4 filings from SEC "current filings" Atom feed.
 * This is much less bursty than crawling index.json at scale.
 *
 * Feed example:
 * https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=only&count=100&output=atom&start=0
 */
export async function enqueueCurrentForm4Feed(opts: { pages: number; pageSize?: number }): Promise<EnqueueCurrentFeedResult> {
  const pageSize = Number.isFinite(opts.pageSize) ? Math.max(20, Math.min(100, opts.pageSize!)) : 100;
  const pages = Math.max(1, Math.min(20, opts.pages));

  const queue_ids: string[] = [];
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;

  for (let p = 0; p < pages; p++) {
    const start = p * pageSize;
    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=4&owner=only&count=${pageSize}&output=atom&start=${start}`;
    const atom = await secFetchText(url);
    const entries = parseAtomEntries(atom);
    for (const it of entries) {
      found += 1;
      const filingUrl = indexJsonFromArchivesIndexUrl(it.href) ?? it.href;

      // Hard dedupe: the SEC sometimes presents the same accession under different /data/<cik>/ paths.
      // We dedupe by accession folder + accession number when possible.
      const acc = accessionKeyFromArchivesIndexUrl(filingUrl);
      const existing = acc
        ? await db.one<{ id: string }>(
            `
            SELECT id FROM document_queue
            WHERE (url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%'
               OR url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%' || '%')
              AND source_type = 'sec_form4'
            UNION ALL
            SELECT id FROM documents
            WHERE url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%'
               OR url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%' || '%'
            LIMIT 1
            `,
            [acc.accessionNoDash, acc.accession],
          )
        : await db.one<{ id: string }>(
            `
            SELECT id FROM document_queue WHERE url = $1 AND source_type = 'sec_form4'
            UNION ALL
            SELECT id FROM documents WHERE url = $1
            LIMIT 1
            `,
            [filingUrl],
          );
      if (existing) {
        skipped_existing += 1;
        continue;
      }

      const r = await db.one<{ id: string }>(
        `
        INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
        VALUES ($1, $2, 'ready_to_parse', 10, 0, now())
        RETURNING id
        `,
        [filingUrl, "sec_form4"],
      );
      if (r?.id) {
        queue_ids.push(r.id);
        enqueued += 1;
      }
    }
  }

  return { pages, found, enqueued, skipped_existing, queue_ids };
}

/**
 * Enqueue filings from SEC "current filings" Atom feed for a given form type.
 * Example types: "8-K", "10-Q", "10-K", "4"
 */
export async function enqueueCurrentFilingFeed(opts: {
  formType: string;
  pages: number;
  pageSize?: number;
  sourceType: string;
  priority?: number;
}): Promise<EnqueueCurrentFeedResult> {
  const pageSize = Number.isFinite(opts.pageSize) ? Math.max(20, Math.min(100, opts.pageSize!)) : 100;
  const pages = Math.max(1, Math.min(20, opts.pages));
  const formType = String(opts.formType ?? "").trim();
  const sourceType = String(opts.sourceType ?? "").trim() || "sec_filing";
  const priority = Number.isFinite(opts.priority) ? Math.max(0, Math.min(100, Number(opts.priority))) : 5;

  if (!formType) throw new Error("form_type_required");

  const queue_ids: string[] = [];
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;

  for (let p = 0; p < pages; p++) {
    const start = p * pageSize;
    const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=${encodeURIComponent(
      formType,
    )}&count=${pageSize}&output=atom&start=${start}`;
    const atom = await secFetchText(url);
    const entries = parseAtomEntries(atom);
    for (const it of entries) {
      found += 1;
      const filingUrl = indexJsonFromArchivesIndexUrl(it.href) ?? it.href;

      const acc = accessionKeyFromArchivesIndexUrl(filingUrl);
      const existing = acc
        ? await db.one<{ id: string }>(
            `
            SELECT id FROM document_queue
            WHERE (url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%'
               OR url LIKE '%' || '/' || $1 || '/' || $2 || '-index.%' || '%')
              AND source_type = $3
            LIMIT 1
            `,
            [acc.accessionNoDash, acc.accession, sourceType],
          )
        : await db.one<{ id: string }>(
            `
            SELECT id FROM document_queue WHERE url = $1 AND source_type = $2
            LIMIT 1
            `,
            [filingUrl, sourceType],
          );
      if (existing) {
        skipped_existing += 1;
        continue;
      }

      const r = await db.one<{ id: string }>(
        `
        INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
        VALUES ($1, $2, 'ready_to_parse', $3, 0, now())
        RETURNING id
        `,
        [filingUrl, sourceType, priority],
      );
      if (r?.id) {
        queue_ids.push(r.id);
        enqueued += 1;
      }
    }
  }

  return { pages, found, enqueued, skipped_existing, queue_ids };
}

let secTickerTitleMapCache: { at: number; map: Map<string, string> } | null = null;
const SEC_TICKER_TITLE_MAP_TTL_MS = 24 * 60 * 60 * 1000;

/** Cached ticker → SEC company title (company_tickers.json). */
export async function getSecTickerTitleMap(): Promise<Map<string, string>> {
  const now = Date.now();
  if (secTickerTitleMapCache && now - secTickerTitleMapCache.at < SEC_TICKER_TITLE_MAP_TTL_MS) {
    return secTickerTitleMapCache.map;
  }

  try {
    const data = await secFetchJson("https://www.sec.gov/files/company_tickers.json");
    const map = new Map<string, string>();
    for (const k of Object.keys(data)) {
      const row = (data as any)[k];
      const t = String(row?.ticker ?? "").trim().toUpperCase();
      const title = String(row?.title ?? "").trim();
      if (t && title) map.set(t, title);
    }
    secTickerTitleMapCache = { at: now, map };
    return map;
  } catch {
    if (secTickerTitleMapCache) return secTickerTitleMapCache.map;
    return new Map();
  }
}

/**
 * Resolve a ticker → CIK using SEC's published mapping.
 * Data source: https://www.sec.gov/files/company_tickers.json
 */
export async function resolveCikForTicker(tickerInput: string): Promise<{ cik: string; title?: string }> {
  const ticker = normalizeTicker(tickerInput);
  const data = await secFetchJson("https://www.sec.gov/files/company_tickers.json");
  for (const k of Object.keys(data)) {
    const row = (data as any)[k];
    const t = String(row?.ticker ?? "").toUpperCase();
    if (t === ticker) {
      const cikNum = Number(row?.cik_str);
      const cik = String(cikNum).padStart(10, "0");
      return { cik, title: row?.title };
    }
  }
  throw new Error(`ticker_not_found ${ticker}`);
}

type Submissions = {
  cik: string;
  name?: string;
  filings?: {
    recent?: {
      accessionNumber?: string[];
      filingDate?: string[];
      reportDate?: string[];
      acceptanceDateTime?: string[];
      form?: string[];
      primaryDocument?: string[];
    };
  };
};

function accessionToArchivePath(cik10: string, accession: string) {
  const nodash = accession.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${String(Number(cik10))}/${nodash}`;
}

function accessionToIndexJsonUrl(cik10: string, accession: string) {
  const base = accessionToArchivePath(cik10, accession);
  return `${base}/index.json`;
}

function quarterForMonth(m0: number) {
  // m0 is 0-based month.
  if (m0 <= 2) return 1;
  if (m0 <= 5) return 2;
  if (m0 <= 8) return 3;
  return 4;
}

function yyyymmdd(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${dd}`;
}

async function fetchMasterIdxForDate(dayUtc: Date): Promise<string> {
  const year = dayUtc.getUTCFullYear();
  const q = quarterForMonth(dayUtc.getUTCMonth());
  const stamp = yyyymmdd(dayUtc);
  const url = `https://www.sec.gov/Archives/edgar/daily-index/${year}/QTR${q}/master.${stamp}.idx`;
  return await secFetchText(url);
}

function parseMasterIdxForForms(masterIdx: string, formsWanted: Set<string>) {
  const lines = masterIdx.split(/\r?\n/);
  const out: Array<{ cik: string; company: string; form: string; accession: string; filed_date: string; filename: string }> = [];
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const cik = parts[0]?.trim() ?? "";
    const company = parts[1]?.trim() ?? "";
    const form = parts[2]?.trim() ?? "";
    const filed_date = parts[3]?.trim() ?? "";
    const filename = parts[4]?.trim() ?? "";
    if (!formsWanted.has(form)) continue;
    const m = filename.match(/\/(\d{10}-\d{2}-\d{6})\.txt$/);
    const accession = m?.[1] ?? null;
    if (!accession) continue;
    out.push({ cik, company, form, accession, filed_date, filename });
  }
  return out;
}

function parseMasterIdxForForm4(masterIdx: string) {
  return parseMasterIdxForForms(masterIdx, new Set(["4"])).map(({ cik, company, accession, filed_date, filename }) => ({
    cik,
    company,
    accession,
    filed_date,
    filename,
  }));
}

export type EnqueueDailyIndexDayResult = {
  day: string;
  form: string;
  sourceType: string;
  found: number;
  enqueued: number;
  skipped_existing: number;
  index_missing: boolean;
  /** True when a hard limit stopped early — caller must NOT advance the day cursor. */
  truncated: boolean;
};

/** Enqueue one form type from a single SEC daily master.idx (historical backfill). */
export async function enqueueFilingsFromDailyIndexDay(opts: {
  dayUtc: Date;
  form: string;
  sourceType: string;
  priority?: number;
  /** Max *new* enqueues for this form/day. 0 / omitted = no cap (full day, no holes). */
  limit?: number;
}): Promise<EnqueueDailyIndexDayResult> {
  const form = String(opts.form ?? "").trim();
  const sourceType = String(opts.sourceType ?? "").trim() || "sec_filing";
  const priority = Number.isFinite(opts.priority) ? Math.max(0, Math.min(100, Number(opts.priority))) : 1;
  const rawLimit = Number(opts.limit);
  // 0 = unlimited. Positive caps new inserts only — we still scan the full master.idx so skips don't create holes.
  const limit =
    Number.isFinite(rawLimit) && rawLimit > 0 ? Math.max(1, Math.min(50_000, Math.floor(rawLimit))) : 0;
  const day = yyyymmdd(opts.dayUtc);

  let master: string;
  try {
    master = await fetchMasterIdxForDate(opts.dayUtc);
  } catch {
    return {
      day,
      form,
      sourceType,
      found: 0,
      enqueued: 0,
      skipped_existing: 0,
      index_missing: true,
      truncated: false,
    };
  }

  const filings = parseMasterIdxForForms(master, new Set([form]));
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;
  let truncated = false;

  for (const f of filings) {
    found += 1;

    const cik10 = String(Number(f.cik)).padStart(10, "0");
    const indexUrl = accessionToIndexJsonUrl(cik10, f.accession);

    const existing = await db.one<{ id: string }>(
      `
      SELECT id FROM document_queue WHERE url = $1 AND source_type = $2
      UNION ALL
      SELECT id FROM documents WHERE url = $1
      LIMIT 1
      `,
      [indexUrl, sourceType],
    );
    if (existing) {
      skipped_existing += 1;
      continue;
    }

    if (limit > 0 && enqueued >= limit) {
      truncated = true;
      break;
    }

    const r = await db.one<{ id: string }>(
      `
      INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
      VALUES ($1, $2, 'ready_to_parse', $3, 0, now())
      RETURNING id
      `,
      [indexUrl, sourceType, priority],
    );
    if (r?.id) enqueued += 1;

    if (f.company) {
      await db.query(
        `
        INSERT INTO companies (name, updated_at)
        VALUES ($1, now())
        ON CONFLICT (name) DO UPDATE SET updated_at = now()
        `,
        [f.company],
      );
    }
  }

  return { day, form, sourceType, found, enqueued, skipped_existing, index_missing: false, truncated };
}

/**
 * Enqueue recent Form 4 filings for all issuers using SEC daily index (master.idx).
 * Each queue item is the filing directory `index.json` URL (so we can resolve form4.xml reliably).
 */
export async function enqueueRecentForm4Global(opts?: { daysBack?: number; limit?: number }): Promise<EnqueueGlobalResult> {
  const days_back = Number.isFinite(opts?.daysBack) ? Math.max(1, Math.min(14, opts!.daysBack!)) : 1;
  const limit = Number.isFinite(opts?.limit) ? Math.max(1, Math.min(2000, opts!.limit!)) : 500;

  const queue_ids: string[] = [];
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;

  for (let i = 0; i < days_back; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    let master: string;
    try {
      master = await fetchMasterIdxForDate(d);
    } catch (e) {
      // Missing index for weekends/holidays is expected.
      continue;
    }
    const filings = parseMasterIdxForForm4(master);
    for (const f of filings) {
      found += 1;
      if (found > limit) break;

      const cik10 = String(Number(f.cik)).padStart(10, "0");
      const indexUrl = accessionToIndexJsonUrl(cik10, f.accession);

      const existing = await db.one<{ id: string }>(
        `
        SELECT id FROM document_queue WHERE url = $1 AND source_type = 'sec_form4'
        UNION ALL
        SELECT id FROM documents WHERE url = $1
        LIMIT 1
        `,
        [indexUrl],
      );

      if (existing) {
        skipped_existing += 1;
        continue;
      }

      const r = await db.one<{ id: string }>(
        `
        INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
        VALUES ($1, $2, 'ready_to_parse', 10, 0, now())
        RETURNING id
        `,
        [indexUrl, "sec_form4"],
      );
      if (r?.id) {
        queue_ids.push(r.id);
        enqueued += 1;
      }

      // Lightweight company upsert (by name); ticker often unavailable from master.idx.
      if (f.company) {
        await db.query(
          `
          INSERT INTO companies (name, updated_at)
          VALUES ($1, now())
          ON CONFLICT (name) DO UPDATE SET updated_at = now()
          `,
          [f.company],
        );
      }
    }
    if (found > limit) break;
  }

  return { days_back, found, enqueued, skipped_existing, queue_ids };
}

/**
 * Enqueue latest Form 4 filings for a given ticker.
 *
 * Implementation: use `submissions/CIK##########.json` and queue each Form 4 primary document URL.
 * We keep it simple: each queued item is one filing document (usually XML).
 */
export async function enqueueLatestForm4ForTicker(opts: { ticker: string; limit?: number }): Promise<EnqueueResult> {
  const ticker = normalizeTicker(opts.ticker);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit!)) : 25;

  const { cik, title } = await resolveCikForTicker(ticker);
  const subs = (await secFetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`)) as Submissions;

  const recent = subs.filings?.recent;
  const forms = recent?.form ?? [];
  const accs = recent?.accessionNumber ?? [];
  const primaries = recent?.primaryDocument ?? [];
  const filingDates = recent?.filingDate ?? [];

  const queue_ids: string[] = [];
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;

  for (let i = 0; i < forms.length; i++) {
    if (forms[i] !== "4") continue;
    const accession = accs[i];
    const primary = primaries[i];
    if (!accession || !primary) continue;
    found += 1;
    if (found > limit) break;

    const docUrl = accessionToIndexJsonUrl(cik, accession);

    // If it already exists in queue or parsed, skip.
    const existing = await db.one<{ id: string }>(
      `
      SELECT id FROM document_queue WHERE url = $1 AND source_type = 'sec_form4'
      UNION ALL
      SELECT id FROM documents WHERE url = $1
      LIMIT 1
      `,
      [docUrl],
    );

    if (existing) {
      skipped_existing += 1;
      continue;
    }

    const r = await db.one<{ id: string }>(
      `
      INSERT INTO document_queue (url, source_type, status, priority, attempts, next_attempt_at)
      VALUES ($1, $2, 'ready_to_parse', 10, 0, now())
      RETURNING id
      `,
      [docUrl, "sec_form4"],
    );
    if (r?.id) {
      queue_ids.push(r.id);
      enqueued += 1;
    }
  }

  // Optional: upsert a company row for convenience (name, ticker).
  if (title) {
    await db.query(
      `
      INSERT INTO companies (name, ticker, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (name) DO UPDATE SET ticker = EXCLUDED.ticker, updated_at = now()
      `,
      [title, ticker],
    );
  }

  return { ticker, cik, found, enqueued, skipped_existing, queue_ids };
}

/**
 * Enqueue latest filings for a ticker (by form types) using submissions.
 * Queue items are filing directory `index.json` URLs (stable + lets us resolve the primary doc).
 */
export async function enqueueLatestFilingsForTicker(opts: {
  ticker: string;
  forms: string[];
  limit?: number;
  sourceType?: string;
}): Promise<EnqueueLatestFilingsResult> {
  const ticker = normalizeTicker(opts.ticker);
  const formsWanted = (opts.forms ?? []).map((s) => String(s).trim()).filter(Boolean);
  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(100, opts.limit!)) : 25;
  const sourceType = String(opts.sourceType ?? "sec_filing").trim() || "sec_filing";

  const { cik, title } = await resolveCikForTicker(ticker);
  let companyId: string | null = null;
  if (title) {
    const row = await db.one<{ id: string }>(
      `
      INSERT INTO companies (name, ticker, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (name) DO UPDATE SET ticker = EXCLUDED.ticker, updated_at = now()
      RETURNING id
      `,
      [title, ticker],
    );
    companyId = row?.id ?? null;
  }
  const subs = (await secFetchJson(`https://data.sec.gov/submissions/CIK${cik}.json`)) as Submissions;
  const recent = subs.filings?.recent;
  const forms = recent?.form ?? [];
  const accs = recent?.accessionNumber ?? [];

  const queue_ids: string[] = [];
  let found = 0;
  let enqueued = 0;
  let skipped_existing = 0;

  for (let i = 0; i < forms.length; i++) {
    const f = String(forms[i] ?? "");
    if (!formsWanted.includes(f)) continue;
    const accession = accs[i];
    if (!accession) continue;
    found += 1;
    if (found > limit) break;

    const indexUrl = accessionToIndexJsonUrl(cik, accession);
    const existing = await db.one<{ id: string }>(
      `
      SELECT id FROM document_queue WHERE url = $1 AND source_type = $2
      UNION ALL
      SELECT id FROM documents WHERE url = $1
      LIMIT 1
      `,
      [indexUrl, sourceType],
    );
    if (existing) {
      skipped_existing += 1;
      continue;
    }

    const r = await db.one<{ id: string }>(
      `
      INSERT INTO document_queue (url, source_type, company_id, status, priority, attempts, next_attempt_at)
      VALUES ($1, $2, $3, 'ready_to_parse', 5, 0, now())
      RETURNING id
      `,
      [indexUrl, sourceType, companyId],
    );
    if (r?.id) {
      queue_ids.push(r.id);
      enqueued += 1;
    }
  }

  return { ticker, cik, forms: formsWanted, found, enqueued, skipped_existing, queue_ids };
}

/** Primary cover doc plus information-table XML for 13F parsing (no LLM). */
export async function fetch13fFilingBundle(indexJsonUrl: string): Promise<{ url: string; text: string; bundle: string }> {
  const primary = await fetchFilingPrimaryText(indexJsonUrl);
  if (!indexJsonUrl.endsWith("/index.json")) {
    return { url: primary.url, text: primary.text, bundle: primary.text };
  }

  const idx = (await secFetchJson(indexJsonUrl)) as { directory?: { item?: Array<{ name?: string; size?: number }> } };
  const items = (idx?.directory?.item ?? [])
    .map((it) => ({ name: String(it?.name ?? ""), size: Number(it?.size ?? 0) }))
    .filter((it) => it.name);
  const base = indexJsonUrl.replace(/\/index\.json$/, "");

  const infoNames = items
    .filter(
      (it) =>
        /infotable/i.test(it.name) ||
        /informationtable/i.test(it.name) ||
        (/\.xml$/i.test(it.name) && /table|holdings|13f/i.test(it.name)),
    )
    .sort((a, b) => (b.size || 0) - (a.size || 0))
    .map((it) => it.name);

  const parts = [primary.text];
  for (const name of infoNames.slice(0, 4)) {
    try {
      const chunk = await secFetchText(`${base}/${name}`);
      if (chunk.includes("infoTable") || chunk.includes("nameOfIssuer")) parts.push(chunk);
    } catch {
      // optional supplemental table file
    }
  }

  return { url: primary.url, text: primary.text, bundle: parts.join("\n\n") };
}

export async function fetchFilingPrimaryText(indexJsonUrl: string): Promise<{ url: string; text: string }> {
  if (!indexJsonUrl.endsWith("/index.json")) {
    const txt = await secFetchText(indexJsonUrl);
    return { url: indexJsonUrl, text: txt };
  }

  const idx = (await secFetchJson(indexJsonUrl)) as any;
  const items: Array<{ name?: string; size?: number }> = idx?.directory?.item ?? [];
  const rows = items
    .map((it) => ({ name: String(it?.name ?? ""), size: Number(it?.size ?? 0) }))
    .filter((it) => it.name);

  // Prefer the main HTML/TXT filing doc; avoid the index page itself.
  const candidates = rows
    .filter((it) => !/-index\.html?$/i.test(it.name))
    .filter((it) => /\.(html?|txt)$/i.test(it.name))
    .sort((a, b) => (b.size || 0) - (a.size || 0));

  const pick = candidates[0]?.name ?? rows.find((it) => /\.txt$/i.test(it.name))?.name ?? null;
  if (!pick) throw new Error("filing_primary_doc_not_found_in_index");
  const base = indexJsonUrl.replace(/\/index\.json$/, "");
  const url = `${base}/${pick}`;
  const text = await secFetchText(url);
  return { url, text };
}

export async function fetchForm4Text(url: string): Promise<string> {
  // We queue `index.json` URLs so we can reliably find form4.xml in the filing folder.
  if (url.endsWith("/index.json")) {
    const idx = (await secFetchJson(url)) as any;
    const items: Array<{ name?: string }> = idx?.directory?.item ?? [];
    const names = items.map((it) => String(it?.name ?? "")).filter(Boolean);
    const pick =
      names.find((n) => /form4\.xml$/i.test(n)) ??
      names.find((n) => /form4.*\.xml$/i.test(n)) ??
      names.find((n) => /\.xml$/i.test(n)) ??
      null;
    if (!pick) throw new Error("form4_xml_not_found_in_index");
    const base = url.replace(/\/index\.json$/, "");
    return await secFetchText(`${base}/${pick}`);
  }

  // If we queued an Archives "filing documents" page, parse it and grab the XML.
  // Example:
  // https://www.sec.gov/Archives/edgar/data/<cik>/<accessionNoDash>/<accession>-index.htm
  if (/-index\.html?$/i.test(url) && url.includes("/Archives/edgar/data/")) {
    const html = await secFetchText(url);
    const hrefs = Array.from(html.matchAll(/href="([^"]+)"/gi))
      .map((m) => m?.[1])
      .filter((h): h is string => Boolean(h));

    const xmlLinks = hrefs
      .filter((h) => /\.xml(\?|$)/i.test(h))
      .map((h) => absoluteSecUrl(h));

    // Prefer the actual filing XML (not the XSL-rendered variant).
    // Many index pages include both:
    //   .../xslF345X06/primary_doc.xml  (rendering helper)
    //   .../primary_doc.xml            (raw filing)
    const nonXsl = xmlLinks.filter((h) => !/\/xsl/i.test(h));
    const pool = nonXsl.length ? nonXsl : xmlLinks;

    const ordered = [
      ...pool.filter((h) => /form4\.xml(\?|$)/i.test(h)),
      ...pool.filter((h) => /primary_doc\.xml(\?|$)/i.test(h)),
      ...pool.filter((h) => /ownership\.xml(\?|$)/i.test(h)),
      ...pool.filter((h) => /form4/i.test(h) && /\.xml(\?|$)/i.test(h)),
      ...pool.filter((h) => /f345/i.test(h) && /\.xml(\?|$)/i.test(h)),
      ...pool,
    ].filter((h, i, a) => a.indexOf(h) === i);

    if (!ordered.length) throw new Error("form4_xml_not_found_in_archives_index");

    // Fallback strategy: some filings include "rendering helper" XMLs that may be missing
    // transaction blocks. Try a few candidates and pick the first that looks like a real
    // ownership document with transaction tags.
    const looksLikeOwnershipDoc = (xml: string) =>
      /<\s*ownershipDocument\b/i.test(xml) &&
      (/<(?:[A-Za-z_][\w.-]*:)?transactionCode\b/i.test(xml) ||
        /<(?:[A-Za-z_][\w.-]*:)?nonDerivativeTransaction\b/i.test(xml) ||
        /<(?:[A-Za-z_][\w.-]*:)?derivativeTransaction\b/i.test(xml));

    const maxTries = Math.min(6, ordered.length);
    let firstXml: string | null = null;
    for (let i = 0; i < maxTries; i++) {
      const candidate = ordered[i]!;
      const xml = await secFetchText(candidate);
      if (!firstXml) firstXml = xml;
      if (looksLikeOwnershipDoc(xml)) return xml;
    }

    // If none "look right", return the first successfully fetched XML.
    // (Some filings legitimately omit transaction blocks.)
    return firstXml ?? (await secFetchText(ordered[0]!));
  }

  // If we queued a filing detail page (browse-edgar HTML), resolve form4.xml from it.
  if (url.includes("/cgi-bin/browse-edgar")) {
    const html = await secFetchText(url);
    const m =
      html.match(/href="(\/Archives\/edgar\/data\/[^"]+form4\.xml)"/i) ??
      html.match(/href="(\/Archives\/edgar\/data\/[^"]+\.xml)"/i);
    const href = m?.[1] ?? null;
    if (!href) throw new Error("form4_xml_not_found_in_filing_page");
    return await secFetchText(absoluteSecUrl(href));
  }

  return await secFetchText(url);
}

