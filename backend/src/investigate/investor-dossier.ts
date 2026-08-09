import type http from "node:http";
import { db } from "../core/db.js";
import { sendJson } from "../core/http.js";
import { formatPoliticianDisplayName } from "../politicians/committees.js";
import { formatUsdCompact } from "../shared/money.js";

type InvestorMode = "insider" | "politicians" | "institutions";

type SheetRow = Record<string, unknown>;

type ActorTxn = {
  sheetRow: SheetRow;
  ticker: string;
  company: string;
  companyRow: null;
  showMoney: true;
  ts: string | null;
  source: InvestorMode;
};

type ActorRow = {
  id: string;
  actorKey: string;
  actorName: string;
  actorDetail: string;
  actorDetailSecondary: string;
  matchNames: string[];
  source: InvestorMode;
  sources: InvestorMode[];
  transactions: ActorTxn[];
  at: string | null;
  count: number | null;
};

const dossierMemoryCache = new Map<string, { at: number; payload: Record<string, unknown> }>();
const DOSSIER_CACHE_TTL_MS = 90_000;

function slugifyName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function stripHonorific(name: string): string {
  return String(name ?? "")
    .trim()
    .replace(/^(the\s+honorable|hon\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i, "")
    .trim();
}

function nameMatchesSlug(name: string, slug: string): boolean {
  const target = String(slug ?? "")
    .trim()
    .toLowerCase();
  if (!target || !name) return false;
  const cleaned = stripHonorific(name);
  const candidates = [name, cleaned];
  if (cleaned.includes(",")) {
    const [last, rest] = cleaned.split(",").map((p) => p.trim());
    if (last && rest) {
      candidates.push(`${rest} ${last}`);
      candidates.push(`${last} ${rest}`);
    }
  }
  for (const raw of candidates) {
    const ns = slugifyName(raw);
    if (!ns) continue;
    if (ns === target) return true;
    if (ns.endsWith(`-${target}`) || ns.includes(`-${target}-`) || ns.startsWith(`${target}-`)) return true;
    if (ns.includes(target) && target.length >= 8) return true;
  }
  const parts = target.split("-").filter(Boolean);
  if (parts.length >= 2) {
    const rev = [...parts].reverse().join("-");
    for (const raw of candidates) {
      const ns = slugifyName(raw);
      if (ns === rev || ns.includes(rev)) return true;
    }
  }
  return false;
}

function displayNameFromSlug(slug: string): string {
  return String(slug ?? "")
    .trim()
    .replace(/-+/g, " ")
    .replace(/\b\w/g, (ch) => ch.toUpperCase());
}

function likePatternFromSlug(slug: string): string {
  const parts = String(slug ?? "")
    .trim()
    .toLowerCase()
    .split("-")
    .filter((p) => p.length > 1);
  if (!parts.length) return `%${slug}%`;
  // Prefer last token (surname) for ILIKE prefilter; JS does exact match.
  const last = parts[parts.length - 1]!;
  return `%${last}%`;
}

function txnSideCode(raw: string | null | undefined, mode: InvestorMode): string {
  const s = String(raw ?? "")
    .trim()
    .toUpperCase();
  if (mode === "institutions") {
    if (/RED|DECREASE|SOLD|S\b/.test(s)) return "RED";
    return "INC";
  }
  if (/^S|SALE|SELL|DISPOS/.test(s)) return "S";
  return "P";
}

function pushTxn(out: ActorTxn[], txn: ActorTxn) {
  const usd = Number(txn.sheetRow.amountUsd);
  const range = String(txn.sheetRow.amountRange ?? "").trim();
  const shares = Number(txn.sheetRow.shares);
  if (!(Number.isFinite(usd) && usd > 1) && !range && !(shares > 0)) return;
  out.push(txn);
}

async function loadFromStructuredTables(slug: string, mode: InvestorMode, limit: number): Promise<ActorTxn[]> {
  const like = likePatternFromSlug(slug);
  const out: ActorTxn[] = [];

  if (mode === "insider") {
    const rows = await db.queryApi<{
      insider_name: string;
      insider_role: string | null;
      transaction_code: string | null;
      amount_usd: string | null;
      transaction_at: string;
      ticker: string;
      company_name: string | null;
    }>(
      `
      SELECT
        it.insider_name,
        it.insider_role,
        it.transaction_code,
        it.amount_usd::text,
        it.transaction_at::text,
        it.ticker,
        c.name AS company_name
      FROM insider_transactions it
      LEFT JOIN companies c ON upper(trim(c.ticker)) = it.ticker
      WHERE it.insider_name ILIKE $1
      ORDER BY it.transaction_at DESC
      LIMIT $2
      `,
      [like, limit],
      10_000,
    );
    for (const r of rows) {
      if (!nameMatchesSlug(r.insider_name, slug)) continue;
      const tick = String(r.ticker ?? "")
        .trim()
        .toUpperCase();
      if (!tick) continue;
      const amountUsd = r.amount_usd != null ? Number(r.amount_usd) : NaN;
      const code = txnSideCode(r.transaction_code, "insider");
      const ts = r.transaction_at ? String(r.transaction_at) : null;
      pushTxn(out, {
        sheetRow: {
          person: r.insider_name,
          insider_name: r.insider_name,
          role: r.insider_role ?? "INS",
          transactionCode: code,
          acquiredDisposed: code === "S" ? "D" : "A",
          amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
          ts,
        },
        ticker: tick,
        company: String(r.company_name ?? "").trim() || tick,
        companyRow: null,
        showMoney: true,
        ts,
        source: "insider",
      });
    }
    return out;
  }

  if (mode === "politicians") {
    const rows = await db.queryApi<{
      politician_name: string;
      chamber: string | null;
      committee: string | null;
      transaction_type: string | null;
      amount_usd_mid: string | null;
      transaction_at: string;
      ticker: string;
      company_name: string | null;
    }>(
      `
      SELECT
        pt.politician_name,
        pt.chamber,
        pt.committee,
        pt.transaction_type,
        pt.amount_usd_mid::text,
        pt.transaction_at::text,
        pt.ticker,
        c.name AS company_name
      FROM politician_transactions pt
      LEFT JOIN companies c ON upper(trim(c.ticker)) = pt.ticker
      WHERE pt.politician_name ILIKE $1
      ORDER BY pt.transaction_at DESC
      LIMIT $2
      `,
      [like, limit],
      10_000,
    );
    for (const r of rows) {
      const name = formatPoliticianDisplayName(r.politician_name);
      if (!nameMatchesSlug(name, slug) && !nameMatchesSlug(r.politician_name, slug)) continue;
      const tick = String(r.ticker ?? "")
        .trim()
        .toUpperCase();
      if (!tick) continue;
      const amountUsd = r.amount_usd_mid != null ? Number(r.amount_usd_mid) : NaN;
      const code = txnSideCode(r.transaction_type, "politicians");
      const ts = r.transaction_at ? String(r.transaction_at) : null;
      pushTxn(out, {
        sheetRow: {
          politician_name: name,
          person: name,
          chamber: r.chamber ?? "house",
          committee: r.committee,
          transactionType: r.transaction_type,
          transactionCode: code,
          amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
          ts,
        },
        ticker: tick,
        company: String(r.company_name ?? "").trim() || tick,
        companyRow: null,
        showMoney: true,
        ts,
        source: "politicians",
      });
    }
    return out;
  }

  const rows = await db.queryApi<{
    filer: string;
    activity: string | null;
    amount_usd: string | null;
    filed_at: string;
    ticker: string;
    company_name: string | null;
  }>(
    `
    SELECT
      f.filer,
      f.activity,
      f.amount_usd::text,
      f.filed_at::text,
      f.ticker,
      c.name AS company_name
    FROM institution_filings_13f f
    LEFT JOIN companies c ON upper(trim(c.ticker)) = f.ticker
    WHERE f.filer ILIKE $1
    ORDER BY f.filed_at DESC
    LIMIT $2
    `,
    [like, limit],
    10_000,
  );
  for (const r of rows) {
    if (!nameMatchesSlug(r.filer, slug)) continue;
    const tick = String(r.ticker ?? "")
      .trim()
      .toUpperCase();
    if (!tick) continue;
    const amountUsd = r.amount_usd != null ? Number(r.amount_usd) : NaN;
    const code = txnSideCode(r.activity, "institutions");
    const ts = r.filed_at ? String(r.filed_at) : null;
    pushTxn(out, {
      sheetRow: {
        institution_name: r.filer,
        key: r.filer,
        activity: code === "RED" ? "Reduced stake" : "Increased stake",
        amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
        ts,
      },
      ticker: tick,
      company: String(r.company_name ?? "").trim() || tick,
      companyRow: null,
      showMoney: true,
      ts,
      source: "institutions",
    });
  }
  return out;
}

/** Prefer structured tables first; feed index only if thin (and never summary::text ILIKE). */
async function loadFromFeedIndex(slug: string, mode: InvestorMode, limit: number): Promise<{
  txns: ActorTxn[];
  displayName: string | null;
}> {
  const like = likePatternFromSlug(slug);
  const rows = await db.queryApi<{
    ticker_norm: string;
    company_name: string | null;
    feed_at: string | null;
    ws: unknown;
  }>(
    `
    SELECT
      f.ticker_norm,
      f.company_name,
      f.feed_at::text,
      f.summary->'worksheet_rows' AS ws
    FROM feed_ticker_latest f
    WHERE f.feed_kind = $1
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(f.summary->'worksheet_rows', '[]'::jsonb)) AS elem
        WHERE lower(
          COALESCE(
            elem->>'key',
            elem->>'insider_name',
            elem->>'institution_name',
            elem->>'politician_name',
            elem->>'person',
            elem->>'filer',
            ''
          )
        ) LIKE $2
      )
    ORDER BY f.feed_at DESC NULLS LAST
    LIMIT $3
    `,
    [mode, like.toLowerCase(), Math.min(40, Math.max(12, limit))],
    8_000,
  );

  const txns: ActorTxn[] = [];
  let displayName: string | null = null;

  for (const row of rows) {
    const tick = String(row.ticker_norm ?? "")
      .trim()
      .toUpperCase();
    if (!tick) continue;
    const company = String(row.company_name ?? "").trim() || tick;
    const ws = Array.isArray(row.ws) ? row.ws : [];
    for (const raw of ws) {
      const r = raw as Record<string, unknown>;
      const keyName =
        mode === "politicians"
          ? String(r.key ?? r.politician_name ?? "").trim()
          : mode === "institutions"
            ? String(r.institution_name ?? r.key ?? r.filer ?? "").trim()
            : String(r.insider_name ?? r.person ?? r.key ?? "").trim();
      if (!keyName || !nameMatchesSlug(keyName, slug)) continue;
      const pretty =
        mode === "politicians" ? formatPoliticianDisplayName(keyName) : keyName;
      if (!displayName) displayName = pretty;
      const ts = r.ts != null ? String(r.ts) : row.feed_at ? String(row.feed_at) : null;
      const amountUsd =
        r.amount_usd_mid != null
          ? Number(r.amount_usd_mid)
          : r.amount_usd != null
            ? Number(r.amount_usd)
            : NaN;
      const amountRange = r.amount_range != null ? String(r.amount_range).trim() : "";

      if (mode === "politicians") {
        const code = txnSideCode(String(r.transaction_type ?? ""), "politicians");
        pushTxn(txns, {
          sheetRow: {
            politician_name: pretty,
            person: pretty,
            chamber: r.chamber ?? "house",
            committee: r.committee ?? null,
            transactionType: r.transaction_type ?? null,
            transactionCode: code,
            amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
            amountRange: amountRange || null,
            ts,
            assetName: r.asset_name ?? null,
            assetTicker: r.ticker != null ? String(r.ticker).toUpperCase() : tick,
          },
          ticker: r.ticker != null ? String(r.ticker).trim().toUpperCase() || tick : tick,
          company,
          companyRow: null,
          showMoney: true,
          ts,
          source: "politicians",
        });
      } else if (mode === "institutions") {
        const code = txnSideCode(String(r.activity ?? ""), "institutions");
        pushTxn(txns, {
          sheetRow: {
            institution_name: pretty,
            key: pretty,
            activity: code === "RED" ? "Reduced stake" : String(r.activity ?? "Changed stake"),
            amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
            ts,
          },
          ticker: tick,
          company,
          companyRow: null,
          showMoney: true,
          ts,
          source: "institutions",
        });
      } else {
        const code = txnSideCode(String(r.transaction_code ?? r.code ?? ""), "insider");
        pushTxn(txns, {
          sheetRow: {
            person: pretty,
            insider_name: pretty,
            role: r.role ?? "INS",
            surname: r.surname ?? null,
            transactionCode: code,
            acquiredDisposed: r.acquired_disposed ?? (code === "S" ? "D" : "A"),
            amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
            shares: r.shares != null ? Number(r.shares) : null,
            ts,
          },
          ticker: tick,
          company,
          companyRow: null,
          showMoney: true,
          ts,
          source: "insider",
        });
      }
      if (txns.length >= limit) break;
    }
    if (txns.length >= limit) break;
  }

  return { txns, displayName };
}

function dedupeTxns(txns: ActorTxn[]): ActorTxn[] {
  const seen = new Set<string>();
  const out: ActorTxn[] = [];
  for (const t of txns) {
    const key = `${t.ticker}|${t.ts}|${t.sheetRow.transactionCode ?? t.sheetRow.activity ?? ""}|${t.sheetRow.amountUsd ?? ""}|${t.sheetRow.amountRange ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  out.sort((a, b) => String(b.ts ?? "").localeCompare(String(a.ts ?? "")));
  return out;
}

function buildActorRow(slug: string, mode: InvestorMode, txns: ActorTxn[], displayName: string | null): ActorRow {
  const name = displayName || displayNameFromSlug(slug);
  const detail =
    mode === "politicians" ? "Politician" : mode === "institutions" ? "Institution" : "Insider";
  const bestAt = txns[0]?.ts ?? null;
  return {
    id: `${mode}:${slug}`,
    actorKey: slug,
    actorName: name,
    actorDetail: detail,
    actorDetailSecondary: "",
    matchNames: [name],
    source: mode,
    sources: [mode],
    transactions: txns,
    at: bestAt,
    count: null,
  };
}

function parseMode(raw: string | null | undefined): InvestorMode | null {
  const m = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (m === "politicians" || m === "politician" || m === "ptr") return "politicians";
  if (m === "institutions" || m === "institution" || m === "13f") return "institutions";
  if (m === "insider" || m === "insiders" || m === "form4") return "insider";
  return null;
}

async function loadMode(slug: string, mode: InvestorMode, limit: number) {
  // Structured tables first (indexed name columns). Feed index only if thin —
  // never scan summary::text (that was timing out dossiers under pool pressure).
  const fromTables = await loadFromStructuredTables(slug, mode, limit);
  let txns = fromTables;
  let displayName: string | null =
    fromTables[0]?.sheetRow?.person != null
      ? String(fromTables[0].sheetRow.person)
      : fromTables[0]?.sheetRow?.politician_name != null
        ? String(fromTables[0].sheetRow.politician_name)
        : fromTables[0]?.sheetRow?.institution_name != null
          ? String(fromTables[0].sheetRow.institution_name)
          : null;

  if (txns.length < 6) {
    const fromIndex = await loadFromFeedIndex(slug, mode, limit);
    txns = dedupeTxns([...txns, ...fromIndex.txns]);
    displayName = displayName || fromIndex.displayName;
  } else {
    txns = dedupeTxns(txns);
  }
  return {
    mode,
    txns: txns.slice(0, limit),
    displayName,
  };
}

/**
 * Investor dossier in ONE response — replaces FE feed-hunt + N cluster calls.
 * GET /api/dossier/investor?slug=sheldon-whitehouse&mode=politicians
 */
export async function handleInvestorDossier(
  res: http.ServerResponse,
  opts: { slug?: string | null; name?: string | null; mode?: string | null },
) {
  const slug = slugifyName(opts.slug || opts.name || "");
  if (!slug) {
    sendJson(res, 400, { ok: false, error: "slug_required" });
    return;
  }

  const preferred = parseMode(opts.mode);
  const cacheKey = `${preferred ?? "any"}:${slug}`;
  const cached = dossierMemoryCache.get(cacheKey);
  if (cached && Date.now() - cached.at < DOSSIER_CACHE_TTL_MS) {
    sendJson(res, 200, cached.payload);
    return;
  }

  const order: InvestorMode[] = preferred
    ? [preferred, ...(["insider", "politicians", "institutions"] as InvestorMode[]).filter((m) => m !== preferred)]
    : ["politicians", "insider", "institutions"];

  let best: { mode: InvestorMode; txns: ActorTxn[]; displayName: string | null } | null = null;

  try {
    for (const mode of order) {
      const hit = await loadMode(slug, mode, 80);
      if (!hit.txns.length) continue;
      if (!best || hit.txns.length > best.txns.length) best = hit;
      // Prefer preferred mode as soon as it has real trades.
      if (preferred && mode === preferred && hit.txns.length >= 2) break;
      if (hit.txns.length >= 12) break;
    }

    if (!best) {
      const empty = {
        ok: true as const,
        slug,
        mode: preferred ?? "insider",
        actor: buildActorRow(slug, preferred ?? "insider", [], null),
        empty: true,
      };
      sendJson(res, 200, empty);
      return;
    }

    const actor = buildActorRow(slug, best.mode, best.txns, best.displayName);
    const payload = {
      ok: true as const,
      slug,
      mode: best.mode,
      actor,
      empty: false,
      amount_hint: best.txns[0]
        ? formatUsdCompact(Number(best.txns[0].sheetRow.amountUsd) || 0)
        : null,
    };
    if (best.txns.length >= 2) {
      dossierMemoryCache.set(cacheKey, { at: Date.now(), payload });
    }
    sendJson(res, 200, payload);
  } catch (err) {
    console.error("investor_dossier_failed", slug, err);
    sendJson(res, 200, {
      ok: false,
      error: "investor_dossier_failed",
      slug,
      mode: preferred ?? "insider",
      actor: buildActorRow(slug, preferred ?? "insider", [], null),
      empty: true,
    });
  }
}
