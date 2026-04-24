import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { json, notFound, route, sendJson } from "./lib/http.js";
import { db } from "./lib/db.js";
import { enqueueLatestForm4ForTicker } from "./lib/sec.js";
import { parseNextInsiderQueueItem } from "./lib/insider.js";
import { startInsiderWorker } from "./lib/worker.js";
import { getDailyCloseBars } from "./lib/bars.js";
import { getCompanyPanelData } from "./lib/company.js";
import { getLatestOutcomes, recomputeInsiderOutcomes, recomputePharmaOutcomes } from "./lib/outcomes.js";
import { startOutcomesWorker } from "./lib/outcomes-worker.js";
import { startPharmaWorker } from "./lib/pharma-worker.js";

const port = Number(process.env.PORT ?? "3001");
const worker = startInsiderWorker();
const outcomesWorker = startOutcomesWorker();
const pharmaWorker = startPharmaWorker();

function clampInt(n: unknown, min: number, max: number, fallback: number) {
  const x = Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(x)));
}

function formatUsdCompact(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return `${sign}$${Math.round(abs)}`;
}

function isCompanyClusterId(id: string) {
  return id.startsWith("company:");
}

function tickerFromCompanyClusterId(id: string) {
  return id.slice("company:".length).trim().toUpperCase();
}

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
        FROM document_parsed
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
      const out = await getCompanyPanelData({ ticker });
      sendJson(res, 200, out);
      return;
    }

    // ---- Outcomes (Historical outcomes) ----
    if (route(req, url, "GET", "/api/outcomes")) {
      const mode = String(url.searchParams.get("mode") ?? "insider").trim().toLowerCase();
      const row = await getLatestOutcomes(mode);
      if (!row) {
        sendJson(res, 200, { ok: true, mode, empty: true });
        return;
      }
      sendJson(res, 200, { ok: true, mode, ...row });
      return;
    }

    // Manual recompute trigger (useful for dev)
    if (route(req, url, "POST", "/api/outcomes/recompute")) {
      const body = await json(req);
      const mode = String(body?.mode ?? "insider").trim().toLowerCase();
      if (mode !== "insider" && mode !== "pharma") {
        sendJson(res, 400, { ok: false, error: "mode_not_supported_yet" });
        return;
      }
      const out = mode === "pharma" ? await recomputePharmaOutcomes() : await recomputeInsiderOutcomes();
      sendJson(res, 200, out);
      return;
    }

    // ---- Insider: ingest ----
    if (route(req, url, "POST", "/api/insider/form4/enqueue")) {
      const body = await json(req);
      const ticker = String(body?.ticker ?? "").trim();
      const limit = body?.limit != null ? Number(body.limit) : 25;
      if (!ticker) {
        sendJson(res, 400, { ok: false, error: "ticker_required" });
        return;
      }
      const out = await enqueueLatestForm4ForTicker({ ticker, limit });
      sendJson(res, 200, { ok: true, ...out });
      return;
    }

    // ---- Insider: worker ----
    // Runs one parse step (fetch + Qwen extraction + insert parsed row).
    if (route(req, url, "POST", "/api/insider/parse-next")) {
      sendJson(res, 410, {
        ok: false,
        error: "parse_next_disabled",
        message: "Background worker is enabled; parsing runs automatically.",
      });
      return;
    }

    // ---- Insider: feed ----
    if (route(req, url, "GET", "/api/insider/feed")) {
      // Default: one row per company (ticker), clustered over the last N days.
      const mode = String(url.searchParams.get("mode") ?? "company").trim().toLowerCase();
      const limit = clampInt(url.searchParams.get("limit"), 1, 200, 60);
      const days = clampInt(url.searchParams.get("days"), 1, 90, 30);

      if (mode !== "company") {
        const rows = await db.query<{
          id: string;
          feed_at: string | null;
          feed_label: string | null;
          ticker: string | null;
          company_id: string | null;
        }>(
          `
          SELECT id, feed_at, feed_label, ticker, company_id
          FROM document_parsed
          WHERE feed_kind = 'insider'
          ORDER BY feed_at DESC NULLS LAST, parsed_at DESC
          LIMIT $1
          `,
          [limit],
        );
        sendJson(res, 200, { items: rows });
        return;
      }

      const docs = await db.query<{
        id: string;
        feed_at: string | null;
        feed_label: string | null;
        ticker: string | null;
        company_id: string | null;
        data: any;
      }>(
        `
        SELECT id, feed_at, feed_label, ticker, company_id, data
        FROM document_parsed
        WHERE feed_kind = 'insider'
          AND ticker IS NOT NULL
          AND feed_at IS NOT NULL
          AND feed_at >= now() - ($1 || ' days')::interval
        ORDER BY feed_at DESC, parsed_at DESC
        LIMIT 5000
        `,
        [String(days)],
      );

      const byTicker = new Map<
        string,
        {
          ticker: string;
          company_id: string | null;
          latestFeedAt: string;
          latestDoc: typeof docs[number];
          totalUsd: number;
          totalCount: number;
        }
      >();

      for (const d of docs) {
        const t = String(d.ticker ?? "").trim().toUpperCase();
        const feedAt = String(d.feed_at ?? "");
        if (!t || !feedAt) continue;

        const rows = (d.data as any)?.cluster?.worksheet_rows;
        let sum = 0;
        let cnt = 0;
        if (Array.isArray(rows)) {
          for (const r of rows) {
            const v = Number(r?.amount_usd ?? 0);
            if (Number.isFinite(v) && v > 0) sum += v;
            cnt += 1;
          }
        }

        const cur = byTicker.get(t);
        if (!cur) {
          byTicker.set(t, {
            ticker: t,
            company_id: d.company_id ?? null,
            latestFeedAt: feedAt,
            latestDoc: d,
            totalUsd: sum,
            totalCount: cnt,
          });
          continue;
        }

        // docs already ordered newest->oldest, but keep it explicit
        if (feedAt > cur.latestFeedAt) {
          cur.latestFeedAt = feedAt;
          cur.latestDoc = d;
        }
        cur.totalUsd += sum;
        cur.totalCount += cnt;
      }

      const items = Array.from(byTicker.values())
        .sort((a, b) => (a.latestFeedAt < b.latestFeedAt ? 1 : a.latestFeedAt > b.latestFeedAt ? -1 : 0))
        .slice(0, limit)
        .map((c) => {
          const usd = c.totalUsd > 0 ? formatUsdCompact(c.totalUsd) : "—";
          const label =
            c.totalCount > 0 ? `${usd} (${c.totalCount})` : (c.latestDoc.feed_label ?? "Insider activity");
          return {
            id: `company:${c.ticker}`,
            feed_at: c.latestFeedAt,
            feed_label: label,
            ticker: c.ticker,
            company_id: c.company_id,
          };
        });

      sendJson(res, 200, { items, days, mode: "company" });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/insider/cluster/")) {
      const id = url.pathname.split("/").at(-1) ?? "";

      // Synthetic "company cluster" id (aggregated across last N days).
      if (isCompanyClusterId(id)) {
        const ticker = tickerFromCompanyClusterId(id);
        const days = clampInt(url.searchParams.get("days"), 1, 90, 30);
        if (!ticker) {
          notFound(res);
          return;
        }

        const docs = await db.query<{
          id: string;
          feed_at: string | null;
          ticker: string | null;
          data: any;
        }>(
          `
          SELECT id, feed_at, ticker, data
          FROM document_parsed
          WHERE feed_kind='insider'
            AND ticker = $1
            AND feed_at IS NOT NULL
            AND feed_at >= now() - ($2 || ' days')::interval
          ORDER BY feed_at DESC, parsed_at DESC
          LIMIT 5000
          `,
          [ticker, String(days)],
        );

        if (!docs.length) {
          notFound(res);
          return;
        }

        let minAt: string | null = null;
        let maxAt: string | null = null;
        const worksheet_rows: Array<{ key: string; ts: string | null; amount_usd: number | null }> = [];
        let totalUsd = 0;
        let latest: any = null;

        for (const d of docs) {
          const at = d.feed_at ? String(d.feed_at) : null;
          if (at) {
            if (!minAt || at < minAt) minAt = at;
            if (!maxAt || at > maxAt) maxAt = at;
          }
          if (!latest) latest = d.data;
          const rows = (d.data as any)?.cluster?.worksheet_rows;
          if (Array.isArray(rows)) {
            for (const r of rows) {
              worksheet_rows.push({
                key: String(r?.key ?? "").trim() || "Insider",
                ts: r?.ts != null ? String(r.ts) : null,
                amount_usd: r?.amount_usd != null ? Number(r.amount_usd) : null,
              });
              const v = Number(r?.amount_usd ?? 0);
              if (Number.isFinite(v) && v > 0) totalUsd += v;
            }
          }
        }

        worksheet_rows.sort((a, b) => {
          const ta = a.ts ?? "";
          const tb = b.ts ?? "";
          return ta < tb ? 1 : ta > tb ? -1 : 0;
        });

        const context_sentences: string[] = Array.isArray(latest?.cluster?.context_sentences)
          ? latest.cluster.context_sentences.map((s: any) => String(s)).filter(Boolean).slice(0, 3)
          : [];
        while (context_sentences.length < 3) context_sentences.push("");

        const feed_label =
          totalUsd > 0
            ? `Net buying ~${formatUsdCompact(totalUsd)} (P purchases, ${worksheet_rows.length})`
            : `Insider P purchases (${worksheet_rows.length})`;

        const out = {
          schema_type: "insider_cluster",
          schema_version: "v1",
          issuer: {
            name: latest?.issuer?.name ?? null,
            ticker,
            cik: latest?.issuer?.cik ?? null,
          },
          filing: {
            form_type: "Form 4",
            accession_no: null,
            filed_at: maxAt,
          },
          cluster: {
            cluster_start_at: minAt,
            cluster_end_at: maxAt,
            feed_label,
            context_sentences,
            worksheet_rows,
          },
        };

        sendJson(res, 200, { id, schema_type: "insider_cluster", schema_version: "v1", data: out });
        return;
      }

      const rows = await db.query<{ id: string; data: unknown; schema_type: string; schema_version: string }>(
        `
        SELECT id, data, schema_type, schema_version
        FROM document_parsed
        WHERE id = $1
        LIMIT 1
        `,
        [id],
      );
      if (!rows.length) {
        notFound(res);
        return;
      }
      sendJson(res, 200, rows[0]);
      return;
    }

    // ---- Pharma: feed ----
    if (route(req, url, "GET", "/api/pharma/feed")) {
      const limit = clampInt(url.searchParams.get("limit"), 1, 200, 60);
      const days = clampInt(url.searchParams.get("days"), 1, 365, 30);
      const rows = await db.query<{
        id: string;
        feed_at: string | null;
        feed_label: string | null;
        ticker: string | null;
      }>(
        `
        SELECT id, feed_at, feed_label, ticker
        FROM document_parsed
        WHERE feed_kind = 'pharma'
          AND feed_at IS NOT NULL
          AND (feed_label IS NULL OR feed_label <> 'Pipeline update')
          AND feed_at >= now() - ($2 || ' days')::interval
        ORDER BY feed_at DESC NULLS LAST, parsed_at DESC
        LIMIT $1
        `,
        [limit, String(days)],
      );
      sendJson(res, 200, { items: rows, days });
      return;
    }

    // ---- Pharma: event ----
    if (req.method === "GET" && url.pathname.startsWith("/api/pharma/event/")) {
      const id = url.pathname.split("/").at(-1) ?? "";
      const row = await db.one<{ id: string; data: unknown; schema_type: string; schema_version: string }>(
        `
        SELECT id, data, schema_type, schema_version
        FROM document_parsed
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
        feed_at: string | null;
        feed_label: string | null;
        program_drug: string | null;
        program_indication: string | null;
        program_phase: string | null;
      }>(
        `
        SELECT id, feed_at, feed_label, program_drug, program_indication, program_phase
        FROM document_parsed
        WHERE feed_kind='pharma'
          AND ticker = $1
          AND feed_at IS NOT NULL
          AND feed_at >= now() - ($3 || ' days')::interval
        ORDER BY program_drug ASC NULLS LAST, feed_at ASC
        LIMIT $2
        `,
        [ticker, limit, String(days)],
      );
      // Group by drug for the Programs rail.
      const items = rows.map((r) => ({
        id: r.id,
        at: r.feed_at,
        label: r.feed_label,
        drug: r.program_drug,
        indication: r.program_indication,
        phase: r.program_phase,
      }));
      sendJson(res, 200, { ticker, items });
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
});

process.on("SIGINT", () => {
  worker.stop();
  outcomesWorker.stop();
  pharmaWorker.stop();
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  worker.stop();
  outcomesWorker.stop();
  pharmaWorker.stop();
  server.close(() => process.exit(0));
});
