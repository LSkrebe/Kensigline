/** Read `{PREFIX}_{KEY}` from env with optional legacy alias prefix. */
export function envStr(prefix: string, key: string, fallback = "", legacyPrefix?: string): string {
  const primary = process.env[`${prefix}_${key}`];
  if (primary != null && String(primary).trim() !== "") return String(primary).trim();
  if (legacyPrefix) {
    const legacy = process.env[`${legacyPrefix}_${key}`];
    if (legacy != null && String(legacy).trim() !== "") return String(legacy).trim();
  }
  return fallback;
}

export function envNum(prefix: string, key: string, fallback: number, legacyPrefix?: string): number {
  const n = Number(envStr(prefix, key, String(fallback), legacyPrefix));
  return Number.isFinite(n) ? n : fallback;
}
