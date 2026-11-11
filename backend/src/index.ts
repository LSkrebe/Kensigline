import "./load-env.js";
import http from "node:http";
import { bindCorsOrigin, corsResponseHeaders } from "./core/cors.js";
import { notFound, readRawBody, route, sendJson } from "./core/http.js";
import { workerDbLoad } from "./core/db.js";
import {
  bearerToken,
  supabaseAuthConfigured,
  verifySupabaseAccessToken,
} from "./core/supabase-auth.js";
import {
  handleBillingActivate,
  handleBillingCheckout,
  handleBillingPortal,
  handleBillingPricing,
  handleBillingRefresh,
  handleBillingStatus,
  handleBillingWebhook,
} from "./billing/api.js";
import { billingGateBlocksRequest } from "./billing/gate.js";
import {
  isWaitlistModeEnabled,
  whopConfigured,
} from "./billing/config.js";
import { startAllWorkers, stopAllWorkers } from "./server/workers.js";
import { handleWaitlistJoin } from "./waitlist/api.js";
import {
  handleAlertsPreferencesGet,
  handleAlertsPreferencesPut,
} from "./alerts/api.js";
import { handleDigestSparklinePng } from "./alerts/sparkline-route.js";
import {
  handleAttributionSignup,
  handleAttributionSummary,
  handleAttributionVisit,
} from "./attribution/api.js";
import { getSecTickerTitleMap } from "./core/sec.js";
import {
  getIngestQueueSnapshot,
  startIngestHealthCacheWarmer,
} from "./shared/ingest-status.js";
import { ingestMode, ingestModeSummary } from "./shared/ingest-mode.js";
import { handleInternalContent } from "./internal/content.js";
import { contentApiConfigured } from "./internal/auth.js";
import { handleTracker } from "./tracker/api.js";
import { handleDisclosurePrices } from "./core/disclosure-prices.js";

import { tryDiscoverRoutes } from "./discover/api.js";
import { handleProductReads } from "./product-reads.js";

// Mercerline core requests never invoke an AI runtime.
process.env.AI_RUNTIME_ENABLED = "0";
const port = Number(process.env.PORT ?? "3001");
void getSecTickerTitleMap().catch(() => {});
/** Set WORKERS_ENABLED=0 for API-only process (pair with workers-main). */
const workersEnabled =
  String(process.env.WORKERS_ENABLED ?? "1").trim() !== "0";
const workers = workersEnabled ? await startAllWorkers() : [];
if (!workersEnabled) console.log("[workers] disabled (WORKERS_ENABLED=0)");
startIngestHealthCacheWarmer();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(
      req.url ?? "/",
      `http://${req.headers.host ?? "localhost"}`,
    );

    bindCorsOrigin(req, res);

    // CORS / preflight — only reflect allowlisted app origins (never *).
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...corsResponseHeaders(res),
        "cache-control": "no-store",
      });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, {
        ok: true,
        product: "mercerline",
        version: 3,
        uptimeSeconds: Math.floor(process.uptime()),
        aiRuntime: false,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health/ingest") {
      const source = String(url.searchParams.get("source") ?? "sec_13f");
      const bypassCache = url.searchParams.get("fresh") === "1";
      try {
        const snap = await getIngestQueueSnapshot(source, { bypassCache });
        const ok = !snap.stale && !("degraded" in snap && snap.degraded);
        sendJson(res, 200, { ok, ...snap });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn("[health/ingest]", msg);
        sendJson(res, 200, {
          ok: false,
          degraded: true,
          source_type: source,
          mode: ingestMode(),
          mode_summary: ingestModeSummary(),
          worker_db: workerDbLoad(),
          error: msg,
          at: new Date().toISOString(),
        });
      }
      return;
    }

    // Blank 200 so Search Console doesn't flag api host as 404 — no service advertising.
    if (req.method === "GET" && (url.pathname === "/" || url.pathname === "")) {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      res.end("");
      return;
    }
    if (req.method === "GET" && url.pathname === "/robots.txt") {
      res.writeHead(200, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=3600",
      });
      res.end("User-agent: *\nDisallow: /\n");
      return;
    }

    if (route(req, url, "POST", "/api/billing/webhook")) {
      const raw = await readRawBody(req);
      await handleBillingWebhook(req, res, raw);
      return;
    }

    if (route(req, url, "GET", "/api/billing/pricing")) {
      handleBillingPricing(req, res);
      return;
    }

    if (
      req.method === "GET" &&
      url.pathname.startsWith("/api/internal/content")
    ) {
      if (!contentApiConfigured()) {
        sendJson(res, 503, { ok: false, error: "content_api_not_configured" });
        return;
      }
      const handled = await handleInternalContent(req, res, url.pathname, url);
      if (handled) return;
      sendJson(res, 404, { ok: false, error: "not_found" });
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

    if (route(req, url, "POST", "/api/waitlist")) {
      await handleWaitlistJoin(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/attribution/visit")) {
      await handleAttributionVisit(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/attribution/signup")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAttributionSignup(req, res);
      return;
    }

    if (route(req, url, "GET", "/api/attribution/summary")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAttributionSummary(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/billing/checkout")) {
      if (isWaitlistModeEnabled()) {
        sendJson(res, 503, { ok: false, error: "waitlist_mode" });
        return;
      }
      await handleBillingCheckout(req, res);
      return;
    }

    if (route(req, url, "POST", "/api/billing/activate")) {
      if (isWaitlistModeEnabled()) {
        sendJson(res, 503, { ok: false, error: "waitlist_mode" });
        return;
      }
      await handleBillingActivate(req, res);
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

    if (route(req, url, "GET", "/api/alerts/preferences")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsPreferencesGet(req, res);
      return;
    }

    if (route(req, url, "PUT", "/api/alerts/preferences")) {
      if (!supabaseAuthConfigured()) {
        sendJson(res, 503, { ok: false, error: "auth_not_configured" });
        return;
      }
      await handleAlertsPreferencesPut(req, res);
      return;
    }

    if (route(req, url, "GET", "/api/alerts/sparkline.png")) {
      await handleDigestSparklinePng(req, res, url);
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

    if (route(req, url, "GET", "/api/public/tracker")) {
      await handleTracker(req, res, url, true);
      return;
    }
    if (await billingGateBlocksRequest(req, res, url)) return;
    if (url.pathname.startsWith("/api/tracker/")) {
      await handleTracker(req, res, url);
      return;
    }

    if (route(req, url, "GET", "/api/disclosure-prices")) {
      await handleDisclosurePrices(res, url.searchParams.get("ticker"));
      return;
    }

    if (await tryDiscoverRoutes(req, res, url)) return;
    if (await handleProductReads(req, res, url)) return;
    notFound(res);
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "";
    const status =
      message === "body_too_large"
        ? 413
        : ["invalid_cursor", "invalid_json_body"].includes(message)
          ? 400
          : 500;
    sendJson(res, status, {
      ok: false,
      error: status === 500 ? "internal_error" : message,
    });
  }
});

server.listen(port, process.env.HOST || "0.0.0.0", () => {
  console.log(`Backend listening on http://localhost:${port}`);
  console.log(
    `[marketing] Waitlist mode: ${isWaitlistModeEnabled() ? "on" : "off"}`,
  );
  if (whopConfigured()) {
    console.log("[billing] Whop configured (PPP tiers via CF-IPCountry)");
  }
});

function shutdown() {
  stopAllWorkers(workers);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
