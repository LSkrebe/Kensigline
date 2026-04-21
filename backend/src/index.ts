import "dotenv/config";
import http from "node:http";
import { URL } from "node:url";
import { json, notFound, route, sendJson } from "./lib/http.js";
import { db } from "./lib/db.js";
import { enqueueLatestForm4ForTicker } from "./lib/sec.js";
import { parseNextInsiderQueueItem } from "./lib/insider.js";
import { startInsiderWorker } from "./lib/worker.js";

const port = Number(process.env.PORT ?? "3001");
const worker = startInsiderWorker();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
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
      const limit = url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : 60;
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
        [Number.isFinite(limit) ? Math.max(1, Math.min(200, limit)) : 60],
      );
      sendJson(res, 200, { items: rows });
      return;
    }

    if (req.method === "GET" && url.pathname.startsWith("/api/insider/cluster/")) {
      const id = url.pathname.split("/").at(-1) ?? "";
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
  server.close(() => process.exit(0));
});
process.on("SIGTERM", () => {
  worker.stop();
  server.close(() => process.exit(0));
});
