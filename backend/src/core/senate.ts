import { setTimeout as sleep } from "node:timers/promises";

const SENATE_HOME = "https://efdsearch.senate.gov/search/home/";
const SENATE_DATA = "https://efdsearch.senate.gov/search/report/data/";
const UA = "kensigline/0.1 (+politicians-ptr)";

export type SenatePtrListing = {
  ptr_id: string;
  view_url: string;
  name: string | null;
  submitted_at: string | null;
};

export type SenatePtrTransaction = {
  owner: string | null;
  asset_name: string | null;
  ticker: string | null;
  asset_type: string | null;
  transaction_type: string | null;
  transaction_date: string | null;
  notification_date: string | null;
  amount_range: string | null;
  description: string | null;
};

export type ParsedSenatePtr = {
  filer: { name: string | null; office: string | null; state_district: string | null };
  filing_id: string | null;
  filed_at: string | null;
  transactions: SenatePtrTransaction[];
  context_sentences: string[];
};

export type SenateSession = {
  token: string;
  cookies: string;
};

function mergeCookies(existing: string, res: Response): string {
  const jar = new Map<string, string>();
  for (const part of String(existing ?? "")
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean)) {
    const eq = part.indexOf("=");
    if (eq > 0) jar.set(part.slice(0, eq).trim(), part.slice(eq + 1));
  }
  for (const raw of res.headers.getSetCookie?.() ?? []) {
    const kv = raw.split(";")[0] ?? "";
    const eq = kv.indexOf("=");
    if (eq > 0) jar.set(kv.slice(0, eq).trim(), kv.slice(eq + 1));
  }
  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

function stripHtml(s: string) {
  return String(s ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseUsDateToIso(s: string | null): string | null {
  const raw = String(s ?? "").trim();
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const mm = m[1]!.padStart(2, "0");
  const dd = m[2]!.padStart(2, "0");
  const yyyy = m[3]!;
  const iso = `${yyyy}-${mm}-${dd}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function parseFiledAtFromHtml(html: string): string | null {
  const m = html.match(/Filed\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  return m ? parseUsDateToIso(m[1]!) : null;
}

function parseFilerNameFromHtml(html: string): string | null {
  const h2 = html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
  if (h2) {
    const name = stripHtml(h2).replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (name) return name;
  }
  const paren = html.match(/\(([^)]+,\s*[^)]+)\)/)?.[1];
  if (paren) return stripHtml(paren);
  return null;
}

function mapSenateTxnType(label: string | null): string | null {
  const t = String(label ?? "").trim().toLowerCase();
  if (!t) return null;
  if (t.includes("purchase")) return "P";
  if (t.includes("sale")) return "S";
  if (t.includes("exchange")) return "E";
  return null;
}

function parseTickerFromCell(cell: string): string | null {
  const yahoo = cell.match(/finance\.yahoo\.com\/quote\/([A-Za-z0-9.\-^]+)/i)?.[1];
  if (yahoo) return String(yahoo).trim().toUpperCase();
  const plain = stripHtml(cell);
  if (/^[A-Z]{1,6}$/.test(plain)) return plain;
  return null;
}

/** Parse Senate eFD PTR HTML view pages into normalized transactions. */
export function parseSenatePtrHtml(html: string, viewUrl: string): ParsedSenatePtr {
  const filing_id = viewUrl.match(/\/ptr\/([0-9a-f-]{36})\/?/i)?.[1] ?? null;
  const filerName = parseFilerNameFromHtml(html);
  const filed_at = parseFiledAtFromHtml(html);
  const transactions: SenatePtrTransaction[] = [];

  for (const rowMatch of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const row = rowMatch[1] ?? "";
    if (!/<td/i.test(row)) continue;
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] ?? "");
    if (cells.length < 8) continue;

    const transaction_date = parseUsDateToIso(stripHtml(cells[1] ?? ""));
    const owner = stripHtml(cells[2] ?? "") || null;
    const ticker = parseTickerFromCell(cells[3] ?? "");
    const asset_name = stripHtml(cells[4] ?? "") || null;
    const asset_type = stripHtml(cells[5] ?? "") || null;
    const txnLabel = stripHtml(cells[6] ?? "") || null;
    const amount_range = stripHtml(cells[7] ?? "") || null;
    const transaction_type = mapSenateTxnType(txnLabel);

    if (!transaction_type && !ticker && !asset_name) continue;

    transactions.push({
      owner,
      asset_name,
      ticker,
      asset_type,
      transaction_type,
      transaction_date,
      notification_date: filed_at,
      amount_range,
      description: txnLabel,
    });
  }

  const purchases = transactions.filter((t) => t.transaction_type === "P" && t.ticker);
  const tickers = [...new Set(purchases.map((t) => t.ticker).filter(Boolean))];
  const context_sentences =
    purchases.length && filerName
      ? [
          `${filerName} filed a Senate periodic transaction report with ${purchases.length} stock purchase row${purchases.length === 1 ? "" : "s"}.`,
          tickers.length
            ? `Disclosed tickers include ${tickers.slice(0, 6).join(", ")}${tickers.length > 6 ? ", and others" : ""}.`
            : "The filing lists purchase activity in reportable securities.",
          filed_at
            ? `The report was filed on ${filed_at} via the Senate eFD system.`
            : "The report was filed via the Senate electronic financial disclosure system.",
        ]
      : [];

  return {
    filer: {
      name: filerName,
      office: "Senator",
      state_district: null,
    },
    filing_id,
    filed_at,
    transactions,
    context_sentences,
  };
}

export async function openSenateSession(): Promise<SenateSession> {
  const r1 = await fetch(SENATE_HOME, {
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml" },
  });
  const html = await r1.text();
  const token =
    html.match(/name="csrfmiddlewaretoken"[^>]*value="([^"]+)"/i)?.[1] ??
    html.match(/csrfmiddlewaretoken['"]\s*value=['"]([^'"]+)/i)?.[1] ??
    "";
  if (!token) throw new Error("senate_ptr_missing_csrf_token");

  let cookies = mergeCookies("", r1);
  const r2 = await fetch(SENATE_HOME, {
    method: "POST",
    headers: {
      "user-agent": UA,
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookies,
      referer: SENATE_HOME,
      origin: "https://efdsearch.senate.gov",
    },
    body: new URLSearchParams({
      csrfmiddlewaretoken: token,
      prohibition_agreement: "1",
    }).toString(),
    redirect: "manual",
  });
  cookies = mergeCookies(cookies, r2);
  if (!cookies.includes("sessionid=")) throw new Error("senate_ptr_missing_sessionid");
  return { token, cookies };
}

function senateSearchBody(opts: { start: number; length: number; startDate: Date; endDate: Date }) {
  const fmt = (d: Date, end = false) => {
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const yyyy = d.getFullYear();
    return `${mm}/${dd}/${yyyy} ${end ? "23:59:59" : "00:00:00"}`;
  };
  const body = new URLSearchParams({
    draw: "1",
    start: String(opts.start),
    length: String(opts.length),
    "search[value]": "",
    "search[regex]": "false",
    report_types: "[11]",
    filer_types: "[1]",
    submitted_start_date: fmt(opts.startDate, false),
    submitted_end_date: fmt(opts.endDate, true),
    candidate_state: "",
    senator_state: "",
    office_id: "",
    first_name: "",
    last_name: "",
  });
  for (let i = 0; i < 5; i++) {
    body.set(`columns[${i}][data]`, String(i));
    body.set(`columns[${i}][name]`, "");
    body.set(`columns[${i}][searchable]`, "true");
    body.set(`columns[${i}][orderable]`, "true");
    body.set(`columns[${i}][search][value]`, "");
    body.set(`columns[${i}][search][regex]`, "false");
  }
  body.set("order[0][column]", "4");
  body.set("order[0][dir]", "desc");
  return body;
}

export async function listSenatePtrReports(opts: {
  max?: number;
  lookbackDays?: number;
  endDate?: Date;
  session?: SenateSession;
}): Promise<SenatePtrListing[]> {
  const max = Math.max(1, Math.min(2000, Number(opts.max ?? 400)));
  const lookbackDays = Math.max(30, Math.min(730, Number(opts.lookbackDays ?? 365)));
  const session = opts.session ?? (await openSenateSession());

  const endDate = opts.endDate ? new Date(opts.endDate) : new Date();
  endDate.setUTCHours(23, 59, 59, 999);
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - lookbackDays);
  startDate.setUTCHours(0, 0, 0, 0);

  const out: SenatePtrListing[] = [];
  const seen = new Set<string>();
  let start = 0;
  const pageSize = 100;

  while (out.length < max) {
    const body = senateSearchBody({ start, length: pageSize, startDate, endDate });
    const r = await fetch(SENATE_DATA, {
      method: "POST",
      headers: {
        "user-agent": UA,
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        cookie: session.cookies,
        referer: SENATE_HOME,
        "x-requested-with": "XMLHttpRequest",
        "x-csrftoken": session.token,
      },
      body: body.toString(),
    });
    if (!r.ok) throw new Error(`senate_ptr_search_failed_${r.status}`);
    const json = (await r.json()) as { data?: unknown[] };
    const rows = Array.isArray(json.data) ? json.data : [];
    if (!rows.length) break;

    for (const raw of rows) {
      if (!Array.isArray(raw)) continue;
      const href = String(raw[3] ?? "").match(/href="([^"]+)"/i)?.[1];
      if (!href) continue;
      const view_url = href.startsWith("http") ? href : `https://efdsearch.senate.gov${href}`;
      const ptr_id = view_url.match(/\/ptr\/([0-9a-f-]{36})\/?/i)?.[1] ?? view_url;
      if (seen.has(ptr_id)) continue;
      seen.add(ptr_id);
      out.push({
        ptr_id,
        view_url,
        name: stripHtml(String(raw[2] ?? "")) || null,
        submitted_at: parseUsDateToIso(stripHtml(String(raw[4] ?? ""))),
      });
      if (out.length >= max) break;
    }

    if (rows.length < pageSize) break;
    start += pageSize;
  }

  return out;
}

export async function listSenatePtrReportsWithRetry(opts: {
  max?: number;
  lookbackDays?: number;
  endDate?: Date;
  session?: SenateSession;
}): Promise<SenatePtrListing[]> {
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      return await listSenatePtrReports(opts);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(750 * (i + 1));
    }
  }
  return [];
}

export async function fetchSenatePtrHtml(viewUrl: string, session: SenateSession): Promise<string> {
  const r = await fetch(viewUrl, {
    headers: {
      "user-agent": UA,
      cookie: session.cookies,
      referer: SENATE_HOME,
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!r.ok) throw new Error(`senate_ptr_view_failed_${r.status}`);
  const html = await r.text();
  if (html.includes("prohibition_agreement")) throw new Error("senate_ptr_agreement_required");
  return html;
}
