/**
 * Prebuild investor_dossier_cache for the curated Explore catalog so dossier
 * opens are cache hits (sub-second) instead of live enrich.
 *
 *   node dist/scripts/warm-investor-dossiers.js
 *   node dist/scripts/warm-investor-dossiers.js --only donald-trump,lone-pine
 */
import { EXPLORE_WATCHLIST_CATALOG } from "../explore/watchlist-catalog.js";
import { buildInvestorDossierPayload } from "../investigate/investor-dossier.js";
import { writeInvestorDossierCache } from "../core/dossier-cache.js";

function parseOnly(argv: string[]): Set<string> | null {
  const raw = argv.find((a) => a.startsWith("--only="))?.slice(7) ?? null;
  if (!raw) return null;
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

async function main() {
  const only = parseOnly(process.argv.slice(2));
  const targets = EXPLORE_WATCHLIST_CATALOG.filter((e) => !only || only.has(e.id));
  console.log(`[warm-dossiers] targets=${targets.length}`);
  let ok = 0;
  let empty = 0;
  let fail = 0;
  for (const entry of targets) {
    const mode =
      entry.mode === "politicians" || entry.mode === "institutions" || entry.mode === "insiders"
        ? entry.mode === "insiders"
          ? "insider"
          : entry.mode
        : null;
    const t0 = Date.now();
    try {
      const payload = await buildInvestorDossierPayload(entry.id, mode);
      const actor = payload.actor as { transactions?: unknown[] } | null | undefined;
      const txns = Array.isArray(actor?.transactions) ? actor.transactions.length : 0;
      if (!payload.ok || !txns) {
        empty++;
        console.warn(`[warm-dossiers] empty ${entry.id} mode=${mode} ms=${Date.now() - t0}`);
        continue;
      }
      const resolvedMode = String(payload.mode ?? mode ?? "any");
      await writeInvestorDossierCache(entry.id, resolvedMode, payload);
      await writeInvestorDossierCache(entry.id, "any", payload);
      if (mode && mode !== resolvedMode) await writeInvestorDossierCache(entry.id, mode, payload);
      ok++;
      console.log(`[warm-dossiers] ok ${entry.id} txns=${txns} ms=${Date.now() - t0}`);
    } catch (err) {
      fail++;
      console.error(`[warm-dossiers] fail ${entry.id}`, err instanceof Error ? err.message : err);
    }
  }
  console.log(JSON.stringify({ ok, empty, fail, targets: targets.length }));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
