import { setTimeout as sleep } from "node:timers/promises";

const OGE_API_BASE = "https://extapps2.oge.gov/201/Presiden.nsf/API.xsp/v2/rest";
const OGE_UA = "kensigline/0.1 (+politicians-oge)";

export type Oge278tListing = {
  filing_id: string;
  pdf_url: string;
  name: string | null;
  agency: string | null;
  title: string | null;
  level: string | null;
  doc_date: string | null;
};

type OgeApiRow = {
  type?: string;
  name?: string;
  agency?: string;
  title?: string;
  level?: string;
  docDate?: string;
  amended?: string;
};

function is278tType(typeHtml: string): boolean {
  const t = String(typeHtml ?? "");
  // Prefer explicit "278 Transaction" link label; avoid New Entrant / Annual / Termination.
  if (/278\s*Transaction/i.test(t)) return true;
  if (/278[\s-]*T(?!\s*(?:ermin|ransition|erm))/i.test(t) && /href=/i.test(t)) return true;
  return false;
}

function isTargetLevel(row: OgeApiRow): boolean {
  const level = String(row.level ?? "").trim();
  if (level === "Level I" || level === "Level II") return true;
  // Presidents/VP often arrive as n/a — keep Trump-class coverage like Open Cabinet.
  const name = String(row.name ?? "");
  if (/\bTrump\b/i.test(name)) return true;
  return false;
}

function extractPdfUrl(typeHtml: string): string | null {
  const t = String(typeHtml ?? "");
  const m = t.match(/href=['"]([^'"]+\.pdf)['"]/i);
  if (!m?.[1]) return null;
  try {
    return decodeURI(m[1]);
  } catch {
    return m[1];
  }
}

function filingIdFromPdfUrl(pdfUrl: string): string {
  const m = String(pdfUrl).match(/PAS\+Index\/([A-F0-9]+)\//i);
  if (m?.[1]) return m[1];
  const hash = String(pdfUrl)
    .replace(/^https?:\/\//i, "")
    .slice(-48)
    .replace(/[^a-zA-Z0-9]+/g, "");
  return hash || "oge";
}

function parseDocDate(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m?.[1] ?? null;
}

function daysAgoUtc(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - Math.max(0, days));
  return d;
}

function parseListing(row: OgeApiRow): Oge278tListing | null {
  const typeHtml = String(row.type ?? "");
  if (!is278tType(typeHtml)) return null;
  if (!isTargetLevel(row)) return null;
  const pdf_url = extractPdfUrl(typeHtml);
  if (!pdf_url) return null;
  return {
    filing_id: filingIdFromPdfUrl(pdf_url),
    pdf_url,
    name: row.name ? String(row.name).trim() : null,
    agency: row.agency ? String(row.agency).trim() : null,
    title: row.title ? String(row.title).trim() : null,
    level: row.level ? String(row.level).trim() : null,
    doc_date: parseDocDate(row.docDate),
  };
}

async function fetchOgePage(start: number, length: number): Promise<{ rows: OgeApiRow[]; total: number }> {
  const url = `${OGE_API_BASE}?start=${Math.max(0, start)}&length=${Math.max(1, Math.min(1000, length))}`;
  const r = await fetch(url, {
    headers: {
      "user-agent": OGE_UA,
      accept: "application/json",
    },
  });
  if (!r.ok) throw new Error(`oge_api_failed_${r.status}`);
  const json: any = await r.json();
  const rows = Array.isArray(json?.data) ? (json.data as OgeApiRow[]) : [];
  const total = Number(json?.recordsTotal ?? rows.length) || rows.length;
  return { rows, total };
}

/**
 * Live discover: walk newest OGE PAS index pages until doc dates fall outside lookback,
 * keeping downloadable Level I/II (and Trump) 278-T PDFs only.
 */
export async function listOge278tPdfs(opts: {
  max?: number;
  lookbackDays?: number;
  pageSize?: number;
  maxPages?: number;
}): Promise<Oge278tListing[]> {
  const max = Math.max(1, Math.min(2000, Number(opts.max ?? 400)));
  const lookbackDays = Math.max(1, Math.min(3650, Number(opts.lookbackDays ?? 90)));
  const pageSize = Math.max(50, Math.min(1000, Number(opts.pageSize ?? 500)));
  const maxPages = Math.max(1, Math.min(40, Number(opts.maxPages ?? 12)));
  const minDate = daysAgoUtc(lookbackDays);
  const out: Oge278tListing[] = [];
  const seen = new Set<string>();

  for (let page = 0; page < maxPages && out.length < max; page++) {
    const start = page * pageSize;
    const { rows, total } = await fetchOgePage(start, pageSize);
    if (!rows.length) break;

    let oldestOnPage: Date | null = null;
    for (const row of rows) {
      const doc = parseDocDate(row.docDate);
      if (doc) {
        const d = new Date(`${doc}T00:00:00.000Z`);
        if (!Number.isNaN(d.getTime()) && (!oldestOnPage || d.getTime() < oldestOnPage.getTime())) {
          oldestOnPage = d;
        }
      }
      const listing = parseListing(row);
      if (!listing) continue;
      if (listing.doc_date) {
        const d = new Date(`${listing.doc_date}T00:00:00.000Z`);
        if (!Number.isNaN(d.getTime()) && d.getTime() < minDate.getTime()) continue;
      }
      if (seen.has(listing.pdf_url)) continue;
      seen.add(listing.pdf_url);
      out.push(listing);
      if (out.length >= max) break;
    }

    if (start + rows.length >= total) break;
    if (oldestOnPage && oldestOnPage.getTime() < minDate.getTime()) break;
  }

  return out.slice(0, max);
}

/** Backfill page walk from an API start offset (newest → older). */
export async function listOge278tPdfsFromOffset(opts: {
  start: number;
  max?: number;
  pageSize?: number;
  minDocDate?: Date | null;
}): Promise<{ listings: Oge278tListing[]; nextStart: number; done: boolean }> {
  const max = Math.max(1, Math.min(500, Number(opts.max ?? 120)));
  const pageSize = Math.max(50, Math.min(1000, Number(opts.pageSize ?? 500)));
  const start = Math.max(0, Number(opts.start ?? 0) || 0);
  const minDocDate = opts.minDocDate ?? null;

  const { rows, total } = await fetchOgePage(start, pageSize);
  const listings: Oge278tListing[] = [];
  const seen = new Set<string>();
  let hitFloor = false;

  for (const row of rows) {
    const listing = parseListing(row);
    if (!listing) continue;
    if (listing.doc_date && minDocDate) {
      const d = new Date(`${listing.doc_date}T00:00:00.000Z`);
      if (!Number.isNaN(d.getTime()) && d.getTime() < minDocDate.getTime()) {
        hitFloor = true;
        continue;
      }
    }
    if (seen.has(listing.pdf_url)) continue;
    seen.add(listing.pdf_url);
    listings.push(listing);
    if (listings.length >= max) break;
  }

  const nextStart = start + rows.length;
  const done = !rows.length || nextStart >= total || hitFloor;
  return { listings, nextStart, done };
}

export async function listOge278tPdfsWithRetry(opts: {
  max?: number;
  lookbackDays?: number;
}): Promise<Oge278tListing[]> {
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      return await listOge278tPdfs(opts);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
  return [];
}

export async function listOge278tPdfsFromOffsetWithRetry(opts: {
  start: number;
  max?: number;
  minDocDate?: Date | null;
}): Promise<{ listings: Oge278tListing[]; nextStart: number; done: boolean }> {
  const tries = 3;
  for (let i = 0; i < tries; i++) {
    try {
      return await listOge278tPdfsFromOffset(opts);
    } catch (e) {
      if (i === tries - 1) throw e;
      await sleep(500 * (i + 1));
    }
  }
  return { listings: [], nextStart: opts.start, done: true };
}
