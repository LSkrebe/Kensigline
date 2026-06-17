import "./load-env.js";
import http from "node:http";
import { URL } from "node:url";
import { json, notFound, readRawBody, route, sendJson } from "./core/http.js";
import { db } from "./core/db.js";
import { getDailyCloseBars } from "./core/bars.js";
import { getCompanyPanelData, getCompanySnapshot } from "./core/company.js";
import { getMarketFundamentalsForTicker } from "./research/market/fundamentals.js";
import { getMarketOwnershipForTicker } from "./research/market/ownership.js";
import { getLatestOutcomes, recomputeResearchOutcomes, recomputeInsiderOutcomes, recomputePharmaOutcomes, recomputePoliticiansOutcomes } from "./core/outcomes.js";
import { getPharmaClinicalContext } from "./research/clinical/context.js";
import { bearerToken, supabaseAuthConfigured, verifySupabaseAccessToken } from "./core/supabase-auth.js";
import {
  handleBillingCheckout,
  handleBillingPortal,
  handleBillingRefresh,
  handleBillingStatus,
  handleBillingWebhook,
} from "./billing/api.js";
import { stripeConfigured, stripeMode } from "./billing/config.js";
import {
  researchLimitFromSearchParams,
  handleResearchEvents,
  handleResearchExplore,
  handleResearchFeed,
  handleResearchPaper,
  handleResearchRelationships,
} from "./research/api.js";
import { tryInvestigateRoutes } from "./investigate/api.js";
import { tryDiscoverRoutes } from "./discover/api.js";
import { clampInt } from "./shared/feed-helpers.js";
import { startAllWorkers, stopAllWorkers } from "./server/workers.js";
import { handleAlertsPreferencesGet, handleAlertsPreferencesPatch } from "./alerts/api.js";
import { handleAlertsWatchlistGet, handleAlertsWatchlistPatch } from "./alerts/watchlist-api.js";
import { scoreResearchDocument } from "./core/idea-score.js";

const port = Number(process.env.PORT ?? "3001");
const workers = startAllWorkers();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // CORS / preflight
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "GET,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
        "cache-control": "no-store",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (route(req, url, "POST", "/api/billing/webhook")) {
      const raw = await readRawBody(req);
      await handleBillingWebhook(req, res, raw);
      return;
    }

    if (route(req, url, "GET", "/api/billing/status")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleBillingStatus(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/billing/checkout")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleBillingCheckout(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/billing/portal")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleBillingPortal(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/billing/refresh")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleBillingRefresh(req, res);
      return;
    }

    if (route(req, url, "GET", "/api/auth/me")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      const tok = bearerToken(req);
      if (!tok) {
        sendJson(res, 401, { ok: false, error: "missing_bearer" });
        return;
      }
      const user = await verifySupabaseAccessToken(tok);
      if (!user) {
        sendJson(res, 401, { ok: false, error: "invalid_token" });
        return;
      }
      sendJson(res, 200, { ok: true, user });
      return;
    }

    if (route(req, url, "GET", "/api/alerts/preferences")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsPreferencesGet(req, res);
      return;
    }

    if (route(req, url, "PATCH", "/api/alerts/preferences")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsPreferencesPatch(req, res);
      return;
    }

    if (route(req, url, "GET", "/api/alerts/watchlist")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsWatchlistGet(req, res);
      return;
    }

    if (route(req, url, "PATCH", "/api/alerts/watchlist")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsWatchlistPatch(req, res);
      return;
    }

    // ---- Backend stats (top bar) ----
    if (route(req, url, "GET", "/api/stats")) {
      const uptime_s = Math.round(process.uptime());

      const queueRows = await db.query<{ status: string; count: string }>(
        `
        SELECT status::text AS status, COUNT(*)::text AS count
        FROM document_queue
        GROUP BY status
        `,
      );
      const queue: Record<string, number> = {};
      for (const r of queueRows) queue[String(r.status)] = Number(r.count) || 0;

      const parsedRows = await db.query<{ feed_kind: string | null; count: string; last_parsed_at: string | null }>(
        `
        SELECT feed_kind, COUNT(*)::text AS count, MAX(parsed_at)::timestamptz AS last_parsed_at
        FROM documents
        GROUP BY feed_kind
        `,
      );
      const parsed: Record<string, { count: number; last_parsed_at: string | null }> = {};
      for (const r of parsedRows) {
        const k = String(r.feed_kind ?? "unknown");
        parsed[k] = { count: Number(r.count) || 0, last_parsed_at: r.last_parsed_at ? String(r.last_parsed_at) : null };
      }

      sendJson(res, 200, { ok: true, uptime_s, queue, parsed });
      return;
    }

    // ---- Bars (daily close only) ----
    if (route(req, url, "GET", "/api/bars")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim().toUpperCase();
      const days = clampInt(url.searchParams.get("days"), 5, 3650, 365);
      if (!ticker) {
        sendJson(res, 400, { ok: false, error: "ticker_required" });
        return;
      }
      const now = new Date();
      const toDay = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(
        2,
        "0",
      )}`;
      const from = new Date(now);
      from.setUTCDate(from.getUTCDate() - days);
      const fromDay = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, "0")}-${String(from.getUTCDate()).padStart(
        2,
        "0",
      )}`;
      const out = await getDailyCloseBars({ ticker, fromDay, toDay });
      sendJson(res, 200, out);
      return;
    }

    // ---- Company (Company panel) ----
    if (route(req, url, "GET", "/api/company")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim().toUpperCase();
      if (!ticker) {
        sendJson(res, 400, { ok: false, error: "ticker_required" });
        return;
      }
      const snapshot = ["1", "true", "yes"].includes(
        String(url.searchParams.get("snapshot") ?? url.searchParams.get("lite") ?? "").toLowerCase(),
      );
      const out = snapshot ? await getCompanySnapshot({ ticker }) : await getCompanyPanelData({ ticker });
      if (snapshot) {
        sendJson(res, 200, out);
        return;
      }
      let fundamentals = null;
      let ownership = null;
      try {
        fundamentals = await getMarketFundamentalsForTicker({ ticker });
      } catch {
        fundamentals = null;
      }
      try {
        ownership = await getMarketOwnershipForTicker({ ticker });
      } catch {
        ownership = null;
      }
      sendJson(res, 200, { ...out, fundamentals, ownership });
      return;
    }

    // ---- Outcomes (Historical outcomes) ----
    if (route(req, url, "GET", "/api/outcomes")) {
      const mode = String(url.searchParams.get("mode") ?? "insider").trim().toLowerCase();
      try {
        const row = await getLatestOutcomes(mode);
        if (!row) {
          sendJson(res, 200, { ok: true, mode, empty: true });
          return;
        }
        sendJson(res, 200, { ok: true, mode, ...row });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("mode_not_supported")) {
          sendJson(res, 200, { ok: true, mode, empty: true });
          return;
        }
        throw err;
      }
      return;
    }

    // Manual recompute trigger (useful for dev)
    if (route(req, url, "POST", "/api/outcomes/recompute")) {
      const body = await json(req);
      const mode = String(body?.mode ?? "insider").trim().toLowerCase();
      if (mode !== "insider" && mode !== "pharma" && mode !== "politicians" && mode !== "research" && mode !== "bosha") {
        sendJson(res, 400, { ok: false, error: "mode_not_supported_yet" });
        return;
      }
      const out =
        mode === "pharma"
          ? await recomputePharmaOutcomes()
          : mode === "politicians"
            ? await recomputePoliticiansOutcomes()
            : mode === "research" || mode === "bosha"
              ? await recomputeResearchOutcomes()
              : await recomputeInsiderOutcomes();
      sendJson(res, 200, out);
      return;
    }

    if (await tryDiscoverRoutes(req, res, url)) return;

    if (await tryInvestigateRoutes(req, res, url)) return;
    // ---- Pharma: feed ----
    if (route(req, url, "GET", "/api/pharma/feed")) {
      const limit = clampInt(url.searchParams.get("limit"), 1, 200, 60);
      const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
      const rows = await db.query<{
        id: string;
        event_at: string | null;
        feed_label: string | null;
        ticker: string | null;
        analysis: string | null;
        source_key: string | null;
        program_phase: string | null;
        data: any;
      }>(
        `
        SELECT id, event_at, feed_label, ticker, analysis, source_key, program_phase, data
        FROM documents
        WHERE feed_kind = 'pharma'
          AND event_at IS NOT NULL
          AND (feed_label IS NULL OR feed_label <> 'Pipeline update')
          AND event_at >= now() - ($2 || ' days')::interval
        ORDER BY event_at DESC NULLS LAST, parsed_at DESC
        LIMIT $1
        `,
        [limit, String(days)],
      );
      sendJson(res, 200, {
        items: rows.map((r) => {
          const idea = scoreResearchDocument({
            analysis: r.analysis ?? r.feed_label,
            source_key: r.source_key,
            feed_kind: "pharma",
            program_phase: r.program_phase,
            event_at: r.event_at,
            data: r.data,
          });
          return {
            id: r.id,
            feed_at: r.event_at,
            feed_label: r.feed_label,
            ticker: r.ticker,
            idea_score: idea.idea_score,
            idea_best: idea.idea_best,
            idea_reasons: idea.idea_reasons,
          };
        }),
        days,
      });
      return;
    }

    // ---- Pharma: event ----
    if (req.method === "GET" && url.pathname.startsWith("/api/pharma/event/")) {
      const id = url.pathname.split("/").at(-1) ?? "";
      const row = await db.one<{ id: string; data: unknown; schema_type: string; schema_version: string }>(
        `
        SELECT id, data, doc_kind AS schema_type, schema_version
        FROM documents
        WHERE id = $1 AND feed_kind='pharma'
        LIMIT 1
        `,
        [id],
      );
      if (!row) {
        notFound(res);
        return;
      }
      sendJson(res, 200, row);
      return;
    }

    // ---- Pharma: programs timeline ----
    if (route(req, url, "GET", "/api/pharma/programs")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim().toUpperCase();
      const limit = clampInt(url.searchParams.get("limit"), 1, 5000, 2000);
      const days = clampInt(url.searchParams.get("days"), 1, 3650, 365);
      if (!ticker) {
        sendJson(res, 400, { ok: false, error: "ticker_required" });
        return;
      }
      const rows = await db.query<{
        id: string;
        event_at: string | null;
        feed_label: string | null;
        program_drug: string | null;
        program_indication: string | null;
        program_phase: string | null;
      }>(
        `
        SELECT id, event_at, feed_label, program_drug, program_indication, program_phase
        FROM documents
        WHERE feed_kind='pharma'
          AND ticker = $1
          AND event_at IS NOT NULL
          AND event_at >= now() - ($3 || ' days')::interval
        ORDER BY program_drug ASC NULLS LAST, event_at ASC
        LIMIT $2
        `,
        [ticker, limit, String(days)],
      );
      // Group by drug for the Programs rail.
      const items = rows.map((r) => ({
        id: r.id,
        at: r.event_at,
        label: r.feed_label,
        drug: r.program_drug,
        indication: r.program_indication,
        phase: r.program_phase,
      }));
      sendJson(res, 200, { ticker, items });
      return;
    }

    // ---- Pharma: ClinicalTrials.gov programs + catalyst clock (earnings merged) ----
    if (route(req, url, "GET", "/api/pharma/clinical-context")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim().toUpperCase();
      const catalystLimit = clampInt(url.searchParams.get("catalyst_limit"), 1, 20, 6);
      if (!ticker) {
        sendJson(res, 400, { ok: false, error: "ticker_required" });
        return;
      }
      try {
        const ctx = await getPharmaClinicalContext({ ticker, catalystLimit });
        sendJson(res, 200, ctx);
      } catch (e) {
        console.error("pharma_clinical_context_failed", ticker, e);
        sendJson(res, 502, { ok: false, error: "clinical_context_failed" });
      }
      return;
    }

    // ---- Research: structured company intel ----
    if (route(req, url, "GET", "/api/research/events")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim();
      const limit = researchLimitFromSearchParams(url.searchParams);
      await handleResearchEvents(res, ticker, limit);
      return;
    }
    if (route(req, url, "GET", "/api/research/relationships")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim();
      await handleResearchRelationships(res, ticker);
      return;
    }
    if (route(req, url, "GET", "/api/research/paper")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim();
      await handleResearchPaper(res, ticker);
      return;
    }
    if (route(req, url, "GET", "/api/research/explore")) {
      const ticker = String(url.searchParams.get("ticker") ?? "").trim();
      await handleResearchExplore(res, ticker);
      return;
    }
    if (route(req, url, "GET", "/api/research/feed")) {
      const limit = clampInt(url.searchParams.get("limit"), 1, 120, 60);
      const mode = url.searchParams.get("mode");
      await handleResearchFeed(res, limit, mode);
      return;
    }

    // ---- Main: trend series (for Main bottom-row charts) ----
    if (route(req, url, "GET", "/api/main/trends")) {
      const days = clampInt(url.searchParams.get("days"), 30, 3650, 365);
      const metricRaw = String(url.searchParams.get("metric") ?? "21").trim();
      const metricKey = metricRaw === "63" ? "63" : metricRaw === "252" ? "252" : "21";
      const metricField = metricKey === "63" ? "avgReturn63" : metricKey === "252" ? "avgReturn252" : "avgReturn21";
      const global = await db.one<{ id: string }>(`SELECT id FROM companies WHERE name = '__GLOBAL__' LIMIT 1`);
      if (!global?.id) {
        sendJson(res, 200, {
          ok: true,
          days,
          metricKey,
          metricField,
          empty: true,
          insiders: [],
          politicians: [],
          research: [],
        });
        return;
      }

      async function series(mode: string) {
        const rows = await db.query<{ day: string; data: any }>(
          `
          SELECT as_of_date::text AS day, data
          FROM outcomes
          WHERE company_id = $1
            AND mode = $2
            AND as_of_date >= (now() - ($3 || ' days')::interval)::date
          ORDER BY as_of_date ASC
          `,
          [global?.id ?? "", mode, String(days)],
        );
        return rows.map((r) => {
          const raw = r.data?.[metricField];
          const v = raw === null || raw === undefined || raw === "" ? null : Number(raw);
          return { day: r.day, v: Number.isFinite(v as number) ? (v as number) : null };
        });
      }

      const [insiders, politicians, research] = await Promise.all([series("insider"), series("politicians"), series("research")]);
      sendJson(res, 200, {
        ok: true,
        days,
        metricKey,
        metricField,
        description: "Rolling cohort: mean forward total return after feed/research signal days (trading days)",
        insiders,
        politicians,
        research,
      });
      return;
    }

    notFound(res);
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { ok: false, error: "internal_error" });
  }
});

server.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`);
  if (stripeConfigured()) {
    console.log(`[billing] Stripe mode: ${stripeMode()}`);
  }
});

function shutdown() {
  stopAllWorkers(workers);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
