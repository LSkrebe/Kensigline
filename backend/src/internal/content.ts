import type http from "node:http";
import { sendJson } from "../core/http.js";
import { buildExploreRecapDayPayload } from "../explore/recap-day.js";
import { evaluateRecapForHome } from "../explore/recap-evaluate-home.js";
import { buildPublicResearchEvent, buildPublicResearchIndex } from "../public/research.js";
import { contentApiAuthorized } from "./auth.js";

function filingSourceUrl(f: Record<string, unknown>): string | null {
  const url = String(f.sourceUrl ?? f.edgarUrl ?? f.url ?? "").trim();
  return url || null;
}

function mapSlideForContent(slide: Record<string, unknown>) {
  return {
    id: String(slide.id ?? ""),
    typeId: String(slide.typeId ?? ""),
    kicker: String(slide.kicker ?? ""),
    headline: String(slide.headline ?? ""),
    summary: String(slide.summary ?? ""),
    source: String(slide.source ?? ""),
    ticker: String(slide.ticker ?? "").toUpperCase(),
    moveLabel: slide.moveLabel != null ? String(slide.moveLabel) : null,
    moveUp: slide.moveUp === true,
    score: Number(slide.score) || 0,
    memberIds: Array.isArray(slide.memberIds) ? slide.memberIds.map(String) : [],
  };
}

function mapFilingForContent(f: Record<string, unknown>) {
  return {
    id: String(f.id ?? ""),
    doc: String(f.doc ?? ""),
    side: f.side != null ? String(f.side) : null,
    ticker: String(f.ticker ?? "").toUpperCase(),
    companyName: String(f.companyName ?? ""),
    actorName: f.actorName != null ? String(f.actorName) : null,
    actorMode: f.actorMode != null ? String(f.actorMode) : null,
    actorRole: f.actorRole != null ? String(f.actorRole) : null,
    filingDate: String(f.filingDate ?? ""),
    amountUsd: f.amountUsd != null ? Number(f.amountUsd) : null,
    code: f.code != null ? String(f.code) : null,
    headline: f.headline != null ? String(f.headline) : null,
    dayMovePct: f.dayMovePct != null ? Number(f.dayMovePct) : null,
    sourceUrl: filingSourceUrl(f),
  };
}

export async function buildContentTodayPayload(opts?: { lookbackDays?: number }) {
  const lookbackDays = opts?.lookbackDays ?? 14;
  const [recap, research] = await Promise.all([
    buildExploreRecapDayPayload({ lookbackDays }),
    buildPublicResearchIndex({ lookbackDays }),
  ]);

  const recapEvaluated = await evaluateRecapForHome(recap as Record<string, unknown>);
  const filings = (recap.filings ?? []) as Record<string, unknown>[];
  const slides = (recapEvaluated?.slides ?? []) as Record<string, unknown>[];

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    dayKey: recapEvaluated?.displayDayKey ?? recap.dayKey,
    requestedDayKey: recapEvaluated?.requestedDayKey ?? recap.dayKey,
    isFallback: recapEvaluated?.isFallback === true,
    slides: slides.map(mapSlideForContent),
    research: {
      today: research.today,
      featured: research.featured,
      archive: research.archive,
    },
    filings: filings.slice(0, 80).map(mapFilingForContent),
  };
}

export async function buildContentEventsPayload(opts?: { lookbackDays?: number; limit?: number }) {
  const payload = await buildContentTodayPayload({ lookbackDays: opts?.lookbackDays ?? 14 });
  const limit = Math.max(1, Math.min(50, opts?.limit ?? 20));
  return {
    ok: true,
    generatedAt: payload.generatedAt,
    dayKey: payload.dayKey,
    events: payload.slides.slice(0, limit),
    filings: payload.filings.slice(0, limit * 3),
  };
}

export async function buildContentEventPayload(eventId: string, opts?: { lookbackDays?: number }) {
  const id = String(eventId ?? "").trim();
  if (!id) return { ok: false as const, error: "event_id_required" };

  const payload = await buildContentTodayPayload({ lookbackDays: opts?.lookbackDays ?? 14 });
  const slide = payload.slides.find((s) => s.id === id);
  if (slide) {
    const memberIds = new Set(slide.memberIds ?? []);
    const relatedFilings = payload.filings.filter((f) => memberIds.has(f.id) || f.ticker === slide.ticker);
    return {
      ok: true,
      event: slide,
      filings: relatedFilings,
      research: payload.research,
    };
  }

  const filing = payload.filings.find((f) => f.id === id);
  if (filing) {
    return {
      ok: true,
      event: {
        id: filing.id,
        typeId: "filing",
        kicker: filing.doc,
        headline: `${filing.doc}: ${filing.actorName ?? "Filer"} — ${filing.companyName} (${filing.ticker})`,
        summary: filing.headline,
        ticker: filing.ticker,
        source: filing.doc,
      },
      filings: [filing],
      research: payload.research,
    };
  }

  const dayMatch = id.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (dayMatch) {
    const researchEvent = await buildPublicResearchEvent(dayMatch[1]!);
    if (researchEvent.ok) {
      return {
        ok: true,
        event: {
          id: researchEvent.event.slug,
          typeId: "research_day",
          kicker: researchEvent.event.doc,
          headline: researchEvent.event.headline,
          summary: researchEvent.event.summary,
          context: researchEvent.event.context,
          ticker: researchEvent.event.ticker,
          source: researchEvent.event.doc,
        },
        filings: payload.filings.filter((f) => f.filingDate === researchEvent.event.filingDate),
        research: payload.research,
      };
    }
  }

  return { ok: false as const, error: "not_found" };
}

function unauthorized(res: http.ServerResponse) {
  sendJson(res, 401, { ok: false, error: "unauthorized" });
}

function notConfigured(res: http.ServerResponse) {
  sendJson(res, 503, { ok: false, error: "content_api_not_configured" });
}

export async function handleInternalContent(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  url: URL,
) {
  if (!contentApiAuthorized(req, url)) {
    unauthorized(res);
    return true;
  }

  try {
    if (pathname === "/api/internal/content/today") {
      const out = await buildContentTodayPayload();
      sendJson(res, 200, out);
      return true;
    }

    if (pathname === "/api/internal/content/events") {
      const url = new URL(req.url ?? "/", "http://local");
      const limit = Number(url.searchParams.get("limit") ?? "20");
      const out = await buildContentEventsPayload({ limit });
      sendJson(res, 200, out);
      return true;
    }

    const eventMatch = pathname.match(/^\/api\/internal\/content\/event\/([^/]+)$/);
    if (eventMatch) {
      const out = await buildContentEventPayload(decodeURIComponent(eventMatch[1] ?? ""));
      if (!out.ok) {
        sendJson(res, 404, out);
        return true;
      }
      sendJson(res, 200, out);
      return true;
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[internal/content]", msg);
    sendJson(res, 500, { ok: false, error: "content_api_failed", message: msg });
    return true;
  }

  return false;
}
