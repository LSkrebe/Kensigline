import { db } from "../core/db.js";
import {
  normalizeReferralKey,
  ORGANIC_REFERRAL_KEY,
  parseReferralSourcesFromEnv,
  referralShareUrl,
  SYSTEM_REFERRAL_SOURCES,
} from "./config.js";

export type ReferralSourceRow = {
  source_key: string;
  label: string;
  visits: number;
  signups: number;
  subscriptions: number;
  enabled: boolean;
  updated_at: string;
};

let tableReady: Promise<void> | null = null;

export async function ensureReferralTables() {
  if (!tableReady) {
    tableReady = db
      .query(
        `
        CREATE TABLE IF NOT EXISTS referral_sources (
          source_key text PRIMARY KEY,
          label text NOT NULL,
          visits int NOT NULL DEFAULT 0,
          signups int NOT NULL DEFAULT 0,
          subscriptions int NOT NULL DEFAULT 0,
          enabled boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS user_attribution (
          user_id text PRIMARY KEY,
          source_key text NOT NULL REFERENCES referral_sources(source_key),
          subscription_counted boolean NOT NULL DEFAULT false,
          attributed_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS user_attribution_source_idx ON user_attribution (source_key);
        `,
      )
      .then(async () => {
        await db.query(`
          ALTER TABLE user_attribution
          ADD COLUMN IF NOT EXISTS subscription_counted boolean NOT NULL DEFAULT false
        `);
      })
      .then(() => undefined);
  }
  await tableReady;
}

async function upsertSourceRow(key: string, label: string, enabled: boolean): Promise<void> {
  await db.query(
    `
    INSERT INTO referral_sources (source_key, label, enabled, updated_at)
    VALUES ($1, $2, $3, now())
    ON CONFLICT (source_key) DO UPDATE SET
      label = EXCLUDED.label,
      enabled = EXCLUDED.enabled,
      updated_at = now()
    `,
    [key, label, enabled],
  );
}

/** Sync labels/enabled flags from REFERRAL_SOURCES env. Historical stats are kept. */
export async function syncReferralSourcesFromEnv(): Promise<void> {
  await ensureReferralTables();
  const configured = parseReferralSourcesFromEnv();
  const configuredKeys = new Set<string>();

  for (const src of SYSTEM_REFERRAL_SOURCES) {
    configuredKeys.add(src.key);
    await upsertSourceRow(src.key, src.label, true);
  }

  for (const src of configured) {
    configuredKeys.add(src.key);
    await upsertSourceRow(src.key, src.label, true);
  }

  if (!configuredKeys.size) return;

  const existing = await db.query<{ source_key: string }>(`SELECT source_key FROM referral_sources`);
  for (const row of existing) {
    if (!configuredKeys.has(row.source_key)) {
      await db.query(
        `UPDATE referral_sources SET enabled = false, updated_at = now() WHERE source_key = $1`,
        [row.source_key],
      );
    }
  }
}

async function ensureSourceExists(key: string): Promise<void> {
  const system = SYSTEM_REFERRAL_SOURCES.find((s) => s.key === key);
  if (system) {
    await upsertSourceRow(system.key, system.label, true);
    return;
  }

  const configured = parseReferralSourcesFromEnv();
  const match = configured.find((s) => s.key === key);
  const label = match?.label ?? key;
  const enabled = Boolean(match) || !configured.length;
  await upsertSourceRow(key, label, enabled);
}

export async function recordReferralVisit(sourceKey: string): Promise<void> {
  await ensureReferralTables();
  await ensureSourceExists(sourceKey);
  await db.query(
    `
    UPDATE referral_sources
    SET visits = visits + 1, updated_at = now()
    WHERE source_key = $1
    `,
    [sourceKey],
  );
}

export async function attachUserReferral(userId: string, sourceKey: string): Promise<boolean> {
  await ensureReferralTables();
  await ensureSourceExists(sourceKey);

  const inserted = await db.one<{ user_id: string }>(
    `
    INSERT INTO user_attribution (user_id, source_key)
    VALUES ($1, $2)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING user_id
    `,
    [userId, sourceKey],
  );
  if (!inserted) return false;

  await db.query(
    `
    UPDATE referral_sources
    SET signups = signups + 1, updated_at = now()
    WHERE source_key = $1
    `,
    [sourceKey],
  );
  return true;
}

export async function getUserAttribution(userId: string): Promise<string | null> {
  await ensureReferralTables();
  const row = await db.one<{ source_key: string }>(
    `SELECT source_key FROM user_attribution WHERE user_id = $1`,
    [userId],
  );
  return row?.source_key ?? null;
}

export async function recordReferralSubscriptionOnce(userId: string): Promise<boolean> {
  await ensureReferralTables();
  const row = await db.one<{ source_key: string }>(
    `
    UPDATE user_attribution
    SET subscription_counted = true
    WHERE user_id = $1
      AND subscription_counted = false
    RETURNING source_key
    `,
    [userId],
  );
  if (!row) return false;

  await db.query(
    `
    UPDATE referral_sources
    SET subscriptions = subscriptions + 1, updated_at = now()
    WHERE source_key = $1
    `,
    [row.source_key],
  );
  return true;
}

export async function listReferralStats(): Promise<
  (ReferralSourceRow & {
    share_url: string | null;
    system: boolean;
    conversion_signup_pct: number | null;
    conversion_sub_pct: number | null;
  })[]
> {
  await ensureReferralTables();
  await syncReferralSourcesFromEnv();

  const rows = await db.query<ReferralSourceRow>(
    `
    SELECT source_key, label, visits, signups, subscriptions, enabled, updated_at::text AS updated_at
    FROM referral_sources
    ORDER BY enabled DESC, visits DESC, source_key ASC
    `,
  );

  return rows.map((row) => {
    const visits = Number(row.visits) || 0;
    const signups = Number(row.signups) || 0;
    const subscriptions = Number(row.subscriptions) || 0;
    const system = row.source_key === ORGANIC_REFERRAL_KEY;
    return {
      ...row,
      visits,
      signups,
      subscriptions,
      system,
      share_url: referralShareUrl(row.source_key),
      conversion_signup_pct: visits > 0 ? Math.round((signups / visits) * 1000) / 10 : null,
      conversion_sub_pct: signups > 0 ? Math.round((subscriptions / signups) * 1000) / 10 : null,
    };
  });
}

export function resolveReferralKeyFromQuery(ref: string | null, utmSource: string | null, utmMedium: string | null): string | null {
  const direct = normalizeReferralKey(ref ?? "");
  if (direct) return direct;

  const source = normalizeReferralKey(utmSource ?? "");
  if (!source) return null;
  const medium = normalizeReferralKey(utmMedium ?? "");
  if (medium && medium !== source) return `${source}_${medium}`;
  return source;
}
