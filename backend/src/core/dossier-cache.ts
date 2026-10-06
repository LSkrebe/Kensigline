import { db } from "./db.js";

type CachePayload = Record<string, unknown>;

const companyRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const investorRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();
const companyInflight = new Map<string, Promise<void>>();
const investorInflight = new Map<string, Promise<void>>();

let tablesReady: Promise<void> | null = null;

function debounceMs(): number {
  return Math.max(2_000, Number(process.env.DOSSIER_CACHE_DEBOUNCE_MS ?? 8_000) || 8_000);
}

function normalizeTicker(ticker: string): string {
  return String(ticker ?? "")
    .trim()
    .toUpperCase();
}

export function slugifyInvestorName(name: string): string {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function ensureDossierCacheTables(): Promise<void> {
  if (!tablesReady) {
    tablesReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS company_dossier_cache (
          ticker text PRIMARY KEY,
          payload jsonb NOT NULL,
          computed_at timestamptz NOT NULL DEFAULT now()
        )
      `);
      await db.query(`
        CREATE TABLE IF NOT EXISTS investor_dossier_cache (
          slug text NOT NULL,
          mode text NOT NULL,
          payload jsonb NOT NULL,
          computed_at timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (slug, mode)
        )
      `);
    })().catch((err) => {
      tablesReady = null;
      throw err;
    });
  }
  await tablesReady;
}

export async function readCompanyDossierCache(ticker: string): Promise<CachePayload | null> {
  const t = normalizeTicker(ticker);
  if (!t) return null;
  await ensureDossierCacheTables();
  const row = await db.oneApi<{ payload: CachePayload; computed_at: string }>(
    `SELECT payload, computed_at::text FROM company_dossier_cache WHERE ticker = $1 LIMIT 1`,
    [t],
    4_000,
  ).catch(() => null);
  if (!row?.payload || typeof row.payload !== "object") return null;
  return row.payload;
}

export async function writeCompanyDossierCache(ticker: string, payload: CachePayload): Promise<void> {
  const t = normalizeTicker(ticker);
  if (!t || !payload) return;
  await ensureDossierCacheTables();
  await db.query(
    `
    INSERT INTO company_dossier_cache (ticker, payload, computed_at)
    VALUES ($1, $2::jsonb, now())
    ON CONFLICT (ticker) DO UPDATE SET
      payload = EXCLUDED.payload,
      computed_at = now()
    `,
    [t, JSON.stringify(payload)],
  );
}

export async function readInvestorDossierCache(
  slug: string,
  mode: string,
): Promise<CachePayload | null> {
  const s = slugifyInvestorName(slug);
  const m = String(mode ?? "any")
    .trim()
    .toLowerCase() || "any";
  if (!s) return null;
  await ensureDossierCacheTables();
  const row = await db.oneApi<{ payload: CachePayload }>(
    `SELECT payload FROM investor_dossier_cache WHERE slug = $1 AND mode = $2 LIMIT 1`,
    [s, m],
    4_000,
  ).catch(() => null);
  if (!row?.payload || typeof row.payload !== "object") return null;
  return row.payload;
}

/** Prefer the richest cached mode for a catalog slug (avoids thin `any` stubs). */
export async function readRichestInvestorDossierCache(
  slug: string,
  preferredMode?: string | null,
): Promise<CachePayload | null> {
  const s = slugifyInvestorName(slug);
  if (!s) return null;
  await ensureDossierCacheTables();
  const preferred = String(preferredMode ?? "")
    .trim()
    .toLowerCase();
  const modes = preferred
    ? [preferred, "institutions", "insider", "politicians", "any"]
    : ["institutions", "insider", "politicians", "any"];
  const uniqueModes = [...new Set(modes)];
  const rows = await db
    .queryApi<{ mode: string; payload: CachePayload }>(
      `
      SELECT mode, payload
      FROM investor_dossier_cache
      WHERE slug = $1 AND mode = ANY($2::text[])
      `,
      [s, uniqueModes],
      4_000,
    )
    .catch(() => [] as { mode: string; payload: CachePayload }[]);

  let best: CachePayload | null = null;
  let bestN = -1;
  for (const row of rows ?? []) {
    const payload = row?.payload;
    if (!payload || typeof payload !== "object" || (payload as { ok?: boolean }).ok === false) continue;
    if ((payload as { dossierSchemaVersion?: number }).dossierSchemaVersion !== 12) continue;
    const actor = (payload as { actor?: { transactions?: unknown[] } }).actor;
    const n = Array.isArray(actor?.transactions) ? actor.transactions.length : 0;
    if (n > bestN) {
      best = payload;
      bestN = n;
    }
  }
  return bestN > 0 ? best : null;
}

export async function writeInvestorDossierCache(
  slug: string,
  mode: string,
  payload: CachePayload,
): Promise<void> {
  const s = slugifyInvestorName(slug);
  const m = String(mode ?? "any")
    .trim()
    .toLowerCase() || "any";
  if (!s || !payload) return;
  await ensureDossierCacheTables();
  await db.query(
    `
    INSERT INTO investor_dossier_cache (slug, mode, payload, computed_at)
    VALUES ($1, $2, $3::jsonb, now())
    ON CONFLICT (slug, mode) DO UPDATE SET
      payload = EXCLUDED.payload,
      computed_at = now()
    `,
    [s, m, JSON.stringify(payload)],
  );
}

/** Background rebuild — never blocks the request path. */
export function scheduleCompanyDossierRefresh(
  ticker: string,
  rebuild: (ticker: string) => Promise<CachePayload | null>,
): void {
  const t = normalizeTicker(ticker);
  if (!t) return;
  const prev = companyRefreshTimers.get(t);
  if (prev) clearTimeout(prev);
  companyRefreshTimers.set(
    t,
    setTimeout(() => {
      companyRefreshTimers.delete(t);
      if (companyInflight.has(t)) return;
      const job = (async () => {
        try {
          const payload = await rebuild(t);
          if (payload) await writeCompanyDossierCache(t, payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[dossier-cache] company refresh failed", t, msg);
        } finally {
          companyInflight.delete(t);
        }
      })();
      companyInflight.set(t, job);
    }, debounceMs()),
  );
}

export function scheduleInvestorDossierRefresh(
  slug: string,
  mode: string,
  rebuild: (slug: string, mode: string) => Promise<CachePayload | null>,
): void {
  const s = slugifyInvestorName(slug);
  const m = String(mode ?? "any")
    .trim()
    .toLowerCase() || "any";
  if (!s) return;
  const key = `${m}:${s}`;
  const prev = investorRefreshTimers.get(key);
  if (prev) clearTimeout(prev);
  investorRefreshTimers.set(
    key,
    setTimeout(() => {
      investorRefreshTimers.delete(key);
      if (investorInflight.has(key)) return;
      const job = (async () => {
        try {
          const payload = await rebuild(s, m);
          if (payload) await writeInvestorDossierCache(s, m, payload);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.warn("[dossier-cache] investor refresh failed", key, msg);
        } finally {
          investorInflight.delete(key);
        }
      })();
      investorInflight.set(key, job);
    }, debounceMs()),
  );
}
