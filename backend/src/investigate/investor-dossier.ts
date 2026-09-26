import type http from "node:http";
import { db } from "../core/db.js";
import { getSecTickerTitleMap } from "../core/sec.js";
import { sendJson } from "../core/http.js";
import { formatPoliticianDisplayName } from "../politicians/committees.js";
import {
  issuerNameFromFlowAsset,
  resolveResearchFeedCompanyName,
} from "../research/feed-display.js";
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

const POLITICIAN_NICKNAMES: Record<string, string> = {
  tommy: "thomas",
  tom: "thomas",
  bill: "william",
  jim: "james",
  bob: "robert",
  mike: "michael",
};

function expandSlugToken(token: string): string[] {
  const t = String(token ?? "").trim().toLowerCase();
  if (!t) return [];
  const alias = POLITICIAN_NICKNAMES[t];
  return alias && alias !== t ? [t, alias] : [t];
}

function slugTokensEquivalent(a: string, b: string): boolean {
  const ta = String(a ?? "").trim().toLowerCase();
  const tb = String(b ?? "").trim().toLowerCase();
  if (!ta || !tb) return false;
  if (ta === tb) return true;
  const aVariants = expandSlugToken(ta);
  const bVariants = expandSlugToken(tb);
  return aVariants.some((av) => bVariants.includes(av));
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
    const targetLast = parts[parts.length - 1]!;
    for (const raw of candidates) {
      const ns = slugifyName(raw);
      const nsParts = ns.split("-").filter(Boolean);
      const nsLast = nsParts[nsParts.length - 1];
      if (nsLast && nsLast === targetLast && nsLast.length >= 4) {
        const targetFirst = parts[0]!;
        const nsFirst = nsParts[0];
        if (!targetFirst || !nsFirst || slugTokensEquivalent(targetFirst, nsFirst)) return true;
      }
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

function resolveTxnCompanyLabel(
  ticker: string,
  secTitles: Map<string, string>,
  dbName: string | null | undefined,
  assetName?: string | null,
): string {
  const tick = String(ticker ?? "")
    .trim()
    .toUpperCase();
  return resolveResearchFeedCompanyName(
    tick,
    secTitles.get(tick) ?? null,
    dbName,
    assetName ? issuerNameFromFlowAsset(assetName, tick) : null,
  );
}

async function loadFromStructuredTables(
  slug: string,
  mode: InvestorMode,
  limit: number,
  secTitles: Map<string, string>,
): Promise<ActorTxn[]> {
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
        f.display_name AS insider_name,
        t.role AS insider_role,
        t.transaction_code,
        t.amount_usd::text,
        t.transaction_at::text,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(c.name), ''), upper(trim(i.ticker))) AS company_name
      FROM insider_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(i.ticker))
      WHERE f.display_name ILIKE $1
      ORDER BY t.transaction_at DESC
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
        company: resolveTxnCompanyLabel(tick, secTitles, r.company_name),
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
        f.display_name AS politician_name,
        t.chamber,
        t.committee,
        t.transaction_type,
        coalesce(t.amount_usd, t.amount_usd_mid)::text AS amount_usd_mid,
        t.transaction_at::text,
        upper(trim(i.ticker)) AS ticker,
        coalesce(nullif(trim(c.name), ''), upper(trim(i.ticker))) AS company_name
      FROM politician_transactions t
      JOIN filers f ON f.id = t.filer_id
      JOIN issuers i ON i.id = t.issuer_id
      LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(i.ticker))
      WHERE f.display_name ILIKE $1
      ORDER BY t.transaction_at DESC
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
        company: resolveTxnCompanyLabel(tick, secTitles, r.company_name),
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
    shares: string | null;
    filed_at: string;
    ticker: string;
    company_name: string | null;
  }>(
    `
    SELECT
      f.display_name AS filer,
      t.activity,
      t.amount_usd::text,
      t.shares::text,
      t.transaction_at::text AS filed_at,
      upper(trim(i.ticker)) AS ticker,
      coalesce(nullif(trim(c.name), ''), nullif(trim(i.name), ''), upper(trim(i.ticker))) AS company_name
    FROM institution_transactions t
    JOIN filers f ON f.id = t.filer_id
    JOIN issuers i ON i.id = t.issuer_id
    LEFT JOIN companies c ON upper(trim(c.ticker)) = upper(trim(i.ticker))
    WHERE f.display_name ILIKE $1
      AND coalesce(t.activity, '') <> 'Held'
    ORDER BY t.transaction_at DESC
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
    const ts = r.filed_at ? String(r.filed_at) : null;
    const shares = r.shares != null ? Number(r.shares) : NaN;
    pushTxn(out, {
      sheetRow: {
        institution_name: r.filer,
        key: r.filer,
        activity: String(r.activity ?? "").trim() || "Increased stake",
        amountUsd: Number.isFinite(amountUsd) && amountUsd > 1 ? amountUsd : null,
        shares: Number.isFinite(shares) && shares > 0 ? shares : null,
        ts,
      },
      ticker: tick,
      company: resolveTxnCompanyLabel(tick, secTitles, r.company_name),
      companyRow: null,
      showMoney: true,
      ts,
      source: "institutions",
    });
  }
  return out;
}

/** Prefer structured tables first; feed index only if thin (and never summary::text ILIKE). */
async function loadFromFeedIndex(
  slug: string,
  mode: InvestorMode,
  limit: number,
  secTitles: Map<string, string>,
): Promise<{
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
        const rowTicker =
          r.ticker != null ? String(r.ticker).trim().toUpperCase() || tick : tick;
        const assetRaw = r.asset_name != null ? String(r.asset_name) : null;
        const company = resolveTxnCompanyLabel(rowTicker, secTitles, row.company_name, assetRaw);
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
            assetTicker: rowTicker,
          },
          ticker: rowTicker,
          company,
          companyRow: null,
          showMoney: true,
          ts,
          source: "politicians",
        });
      } else if (mode === "institutions") {
        const activity = String(r.activity ?? "").trim();
        if (activity === "Held") continue;
        const company = resolveTxnCompanyLabel(tick, secTitles, row.company_name);
        const code = txnSideCode(activity, "institutions");
        pushTxn(txns, {
          sheetRow: {
            institution_name: pretty,
            key: pretty,
            activity: code === "RED" ? "Reduced stake" : activity || "Changed stake",
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
        const company = resolveTxnCompanyLabel(tick, secTitles, row.company_name);
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
  const secTitles = await getSecTickerTitleMap().catch(() => new Map<string, string>());
  // Structured tables first (indexed name columns). Feed index only if thin —
  // never scan summary::text (that was timing out dossiers under pool pressure).
  const fromTables = await loadFromStructuredTables(slug, mode, limit, secTitles);
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
    const fromIndex = await loadFromFeedIndex(slug, mode, limit, secTitles);
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
 * Live-build investor dossier payload (also used to populate Postgres cache).
 */
export async function buildInvestorDossierPayload(
  slug: string,
  preferred: InvestorMode | null,
): Promise<Record<string, unknown>> {
  const { buildFilerDossierPayload } = await import("../v2/reads.js");
  const order: InvestorMode[] = preferred
    ? [preferred, "insider", "politicians", "institutions"].filter(
        (m, i, arr) => arr.indexOf(m) === i,
      ) as InvestorMode[]
    : ["insider", "politicians", "institutions"];

  let last: Record<string, unknown> | null = null;
  for (const mode of order) {
    const payload = await buildFilerDossierPayload(slug, mode);
    last = payload;
    const actor = payload.actor as { transactions?: unknown[] } | null | undefined;
    if (payload.ok && actor?.transactions?.length) return payload;
  }
  return last ?? { ok: true, slug, mode: preferred ?? "insider", empty: true, actor: null };
}

/**
 * Investor dossier in ONE response — prefer Postgres materialization, else live build.
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
  const modeKey = preferred ?? "any";
  const memKey = `${modeKey}:${slug}`;

  const mem = dossierMemoryCache.get(memKey);
  const memActor = mem?.payload?.actor as { transactions?: unknown[] } | undefined;
  const memHasTxns = Array.isArray(memActor?.transactions) && memActor.transactions.length > 0;
  if (mem && memHasTxns && Date.now() - mem.at < DOSSIER_CACHE_TTL_MS) {
    sendJson(res, 200, mem.payload);
    return;
  }

  const {
    readInvestorDossierCache,
    scheduleInvestorDossierRefresh,
    writeInvestorDossierCache,
  } = await import("../core/dossier-cache.js");

  const pgCached = await readInvestorDossierCache(slug, modeKey);
  const cachedActor = pgCached?.actor as { transactions?: unknown[] } | null | undefined;
  const cachedHasTxns = Array.isArray(cachedActor?.transactions) && cachedActor.transactions.length > 0;
  if (pgCached?.ok && cachedHasTxns && pgCached.dossierSchemaVersion === 10) {
    dossierMemoryCache.set(memKey, { at: Date.now(), payload: pgCached });
    sendJson(res, 200, pgCached);
    scheduleInvestorDossierRefresh(slug, modeKey, (s, m) =>
      buildInvestorDossierPayload(s, m === "any" || !m ? null : (m as "insider" | "politicians" | "institutions")),
    );
    return;
  }

  try {
    const payload = await buildInvestorDossierPayload(slug, preferred);
    const actor = payload.actor as { transactions?: unknown[] } | null | undefined;
    const hasTxns = Array.isArray(actor?.transactions) && actor.transactions.length > 0;
    if (payload.ok && hasTxns && !(payload as { empty?: boolean }).empty) {
      dossierMemoryCache.set(memKey, { at: Date.now(), payload });
      void writeInvestorDossierCache(slug, modeKey, payload).catch(() => {});
      if (preferred && payload.mode && payload.mode !== preferred) {
        void writeInvestorDossierCache(slug, String(payload.mode), payload).catch(() => {});
      }
      // Also cache under catalog slug + resolved mode for Explore deep links.
      if (payload.slug && payload.slug !== slug) {
        void writeInvestorDossierCache(String(payload.slug), modeKey, payload).catch(() => {});
        if (payload.mode) void writeInvestorDossierCache(String(payload.slug), String(payload.mode), payload).catch(() => {});
      }
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
