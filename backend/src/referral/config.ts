/** Parse REFERRAL_SOURCES env: `ref_key:Label,other_key:Other Label` */
export function parseReferralSourcesFromEnv(): { key: string; label: string }[] {
  const raw = String(process.env.REFERRAL_SOURCES ?? "").trim();
  if (!raw) return [];

  const out: { key: string; label: string }[] = [];
  for (const part of raw.split(",")) {
    const chunk = part.trim();
    if (!chunk) continue;
    const colon = chunk.indexOf(":");
    const key = normalizeReferralKey(colon >= 0 ? chunk.slice(0, colon) : chunk);
    const label = (colon >= 0 ? chunk.slice(colon + 1) : chunk).trim();
    if (!key) continue;
    out.push({ key, label: label || key });
  }
  return out;
}

export function normalizeReferralKey(raw: string): string | null {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 64);
  return key || null;
}

export function referralAttributionDays(): number {
  const n = Number(process.env.REFERRAL_ATTRIBUTION_DAYS ?? 90);
  if (!Number.isFinite(n)) return 90;
  return Math.max(1, Math.min(365, Math.round(n)));
}

export function referralAdminToken(): string | null {
  const tok = String(process.env.REFERRAL_ADMIN_TOKEN ?? "").trim();
  return tok || null;
}

export function referralShareUrl(sourceKey: string): string {
  const base = String(process.env.FRONTEND_URL ?? "https://mercerline.com").replace(/\/$/, "");
  return `${base}/?ref=${encodeURIComponent(sourceKey)}`;
}
