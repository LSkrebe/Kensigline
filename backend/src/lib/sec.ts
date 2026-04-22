import { db } from "./db.js";

type EnqueueResult = {
  ticker: string;
  cik: string;
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
async function secRateLimit() {
  // Be conservative by default to avoid SEC anti-bot blocks.
  // Configure via SEC_MIN_INTERVAL_MS if you need to tune.
  const minMs = Math.max(250, Number(process.env.SEC_MIN_INTERVAL_MS ?? 1500));
  const now = Date.now();
  const baseWait = lastSecRequestAt ? minMs - (now - lastSecRequestAt) : 0;
  const jitter = Math.floor(Math.random() * Math.min(500, Math.max(50, Math.floor(minMs / 3))));
  const wait = Math.max(0, baseWait) + jitter;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastSecRequestAt = Date.now();
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
    throw new Error(`sec_fetch_failed ${res.status} ${url} ${txt.slice(0, 200)}`);
  }
  if (!ctype.includes("application/json")) {
    const txt = await res.text().catch(() => "");
    if (looksLikeSecBotBlock(txt)) throw new Error("sec_blocked_undeclared_automated_tool");
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
    throw new Error(`sec_fetch_failed ${res.status} ${url} ${txt.slice(0, 200)}`);
  }
  const txt = await res.text();
  if (looksLikeSecBotBlock(txt)) throw new Error("sec_blocked_undeclared_automated_tool");
  return txt;
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
      const filingUrl = it.href;

      const existing = await db.one<{ id: string }>(
        `
        SELECT id FROM document_queue WHERE url = $1
        UNION ALL
        SELECT id FROM document_parsed WHERE url = $1
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

function parseMasterIdxForForm4(masterIdx: string) {
  const lines = masterIdx.split(/\r?\n/);
  const out: Array<{ cik: string; company: string; accession: string; filed_date: string; filename: string }> = [];
  for (const line of lines) {
    // Data section is pipe-separated.
    if (!line.includes("|")) continue;
    const parts = line.split("|");
    if (parts.length < 5) continue;
    const cik = parts[0]?.trim() ?? "";
    const company = parts[1]?.trim() ?? "";
    const form = parts[2]?.trim() ?? "";
    const filed_date = parts[3]?.trim() ?? "";
    const filename = parts[4]?.trim() ?? "";
    if (form !== "4") continue;
    // filename example: edgar/data/320193/0001140361-26-015421.txt
    const m = filename.match(/\/(\d{10}-\d{2}-\d{6})\.txt$/);
    const accession = m?.[1] ?? null;
    if (!accession) continue;
    out.push({ cik, company, accession, filed_date, filename });
  }
  return out;
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
        SELECT id FROM document_queue WHERE url = $1
        UNION ALL
        SELECT id FROM document_parsed WHERE url = $1
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
      SELECT id FROM document_queue WHERE url = $1
      UNION ALL
      SELECT id FROM document_parsed WHERE url = $1
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

    const pick =
      xmlLinks.find((h) => /form4/i.test(h) && /\.xml(\?|$)/i.test(h)) ??
      xmlLinks.find((h) => /f345/i.test(h) && /\.xml(\?|$)/i.test(h)) ??
      xmlLinks[0] ??
      null;

    if (!pick) throw new Error("form4_xml_not_found_in_archives_index");
    return await secFetchText(pick);
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

