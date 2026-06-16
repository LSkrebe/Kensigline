import { db } from "../core/db.js";
import {
  gradeMeetsMinimum,
  scoreInsiderCluster,
  scoreInstitutionCluster,
  scorePoliticianCluster,
  scoreResearchDocument,
  type IdeaGrade,
  type IdeaScoreResult,
} from "../core/idea-score.js";

export type IdeaCandidate = {
  id: string;
  feed: string;
  ticker: string;
  title: string;
  summary: string;
  url: string | null;
  event_at: string;
} & IdeaScoreResult;

function frontendBase(): string {
  return String(process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

function attach(feed: string, id: string, ticker: string, title: string, summary: string, eventAt: string, url: string | null, score: IdeaScoreResult): IdeaCandidate {
  return {
    id,
    feed,
    ticker,
    title,
    summary,
    url,
    event_at: eventAt,
    ...score,
  };
}

export async function collectIdeaCandidates(opts: {
  sinceHours?: number;
  feeds?: string[];
  minGrade?: IdeaGrade;
  limit?: number;
}): Promise<IdeaCandidate[]> {
  const sinceHours = Math.max(6, Math.min(168, Number(opts.sinceHours ?? 36)));
  const minGrade = opts.minGrade ?? "B";
  const limit = Math.max(1, Math.min(50, Number(opts.limit ?? 20)));
  const feeds = new Set(opts.feeds ?? ["insider", "politicians", "institutions", "research", "pharma"]);
  const out: IdeaCandidate[] = [];

  if (feeds.has("insider")) {
    const rows = await db.query<{ id: string; ticker: string | null; event_at: string | null; data: any; url: string | null }>(
      `
      SELECT id::text, ticker, event_at::text, data, url
      FROM documents
      WHERE feed_kind = 'insider' AND ticker IS NOT NULL
        AND event_at >= now() - ($1 || ' hours')::interval
      ORDER BY event_at DESC
      LIMIT 400
      `,
      [String(sinceHours)],
    );
    const byTicker = new Map<string, { doc: (typeof rows)[number]; totalUsd: number; todayCount: number }>();
    for (const r of rows) {
      const t = String(r.ticker ?? "").toUpperCase();
      if (!t) continue;
      const ws = Array.isArray(r.data?.cluster?.worksheet_rows) ? r.data.cluster.worksheet_rows : [];
      let usd = 0;
      for (const row of ws) {
        const v = Number(row?.amount_usd ?? 0);
        if (Number.isFinite(v) && v > 0) usd += v;
      }
      const cur = byTicker.get(t);
      if (!cur || String(r.event_at ?? "") > String(cur.doc.event_at ?? "")) {
        byTicker.set(t, { doc: r, totalUsd: usd, todayCount: 0 });
      }
    }
    for (const [ticker, { doc, totalUsd }] of byTicker.entries()) {
      const score = scoreInsiderCluster({ data: doc.data, eventAt: doc.event_at, totalUsd });
      if (!gradeMeetsMinimum(score.idea_grade, minGrade)) continue;
      out.push(
        attach(
          "insider",
          doc.id,
          ticker,
          `${ticker} insider activity`,
          score.idea_reasons[0] ?? "Insider purchase cluster",
          String(doc.event_at ?? new Date().toISOString()),
          doc.url,
          score,
        ),
      );
    }
  }

  if (feeds.has("politicians")) {
    const rows = await db.query<{ id: string; ticker: string | null; event_at: string | null; data: any; url: string | null }>(
      `
      SELECT id::text, ticker, event_at::text, data, url
      FROM documents
      WHERE feed_kind = 'politicians' AND ticker IS NOT NULL
        AND event_at >= now() - ($1 || ' hours')::interval
      ORDER BY event_at DESC
      LIMIT 400
      `,
      [String(sinceHours)],
    );
    const byTicker = new Map<string, { doc: (typeof rows)[number]; totalUsd: number }>();
    for (const r of rows) {
      const t = String(r.ticker ?? "").toUpperCase();
      if (!t) continue;
      const ws = Array.isArray(r.data?.cluster?.worksheet_rows) ? r.data.cluster.worksheet_rows : [];
      let usd = 0;
      for (const row of ws) {
        const v = Number(row?.amount_usd_mid ?? 0);
        if (Number.isFinite(v) && v > 0) usd += v;
      }
      const cur = byTicker.get(t);
      if (!cur || String(r.event_at ?? "") > String(cur.doc.event_at ?? "")) {
        byTicker.set(t, { doc: r, totalUsd: usd });
      }
    }
    for (const [ticker, { doc, totalUsd }] of byTicker.entries()) {
      const score = scorePoliticianCluster({ data: doc.data, eventAt: doc.event_at, totalUsd });
      if (!gradeMeetsMinimum(score.idea_grade, minGrade)) continue;
      out.push(
        attach(
          "politicians",
          doc.id,
          ticker,
          `${ticker} politician PTR`,
          score.idea_reasons[0] ?? "Politician purchase disclosure",
          String(doc.event_at ?? new Date().toISOString()),
          doc.url,
          score,
        ),
      );
    }
  }

  if (feeds.has("institutions")) {
    const rows = await db.query<{ id: string; ticker: string | null; event_at: string | null; data: any; url: string | null }>(
      `
      SELECT id::text, ticker, event_at::text, data, url
      FROM documents
      WHERE feed_kind = 'institutions' AND ticker IS NOT NULL
        AND event_at >= now() - ($1 || ' hours')::interval
      ORDER BY event_at DESC
      LIMIT 400
      `,
      [String(sinceHours)],
    );
    const byTicker = new Map<string, { doc: (typeof rows)[number]; totalUsd: number }>();
    for (const r of rows) {
      const t = String(r.ticker ?? "").toUpperCase();
      if (!t) continue;
      const ws = Array.isArray(r.data?.cluster?.worksheet_rows) ? r.data.cluster.worksheet_rows : [];
      let usd = 0;
      for (const row of ws) {
        const v = Number(row?.amount_usd ?? 0);
        if (Number.isFinite(v) && v > 0) usd += v;
      }
      const cur = byTicker.get(t);
      if (!cur || String(r.event_at ?? "") > String(cur.doc.event_at ?? "")) {
        byTicker.set(t, { doc: r, totalUsd: usd });
      }
    }
    for (const [ticker, { doc, totalUsd }] of byTicker.entries()) {
      const score = scoreInstitutionCluster({ data: doc.data, eventAt: doc.event_at, totalUsd });
      if (!gradeMeetsMinimum(score.idea_grade, minGrade)) continue;
      out.push(
        attach(
          "institutions",
          doc.id,
          ticker,
          `${ticker} 13F activity`,
          score.idea_reasons[0] ?? "Institutional position change",
          String(doc.event_at ?? new Date().toISOString()),
          doc.url,
          score,
        ),
      );
    }
  }

  if (feeds.has("research") || feeds.has("pharma")) {
    const kinds = [
      ...(feeds.has("research") ? ["research"] : []),
      ...(feeds.has("pharma") ? ["pharma"] : []),
    ];
    const rows = await db.query<{
      id: string;
      ticker: string | null;
      event_at: string | null;
      analysis: string | null;
      source_key: string | null;
      feed_kind: string | null;
      program_phase: string | null;
      url: string | null;
      data: any;
    }>(
      `
      SELECT id::text, ticker, event_at::text, analysis, source_key, feed_kind, program_phase, url, data
      FROM documents
      WHERE feed_kind = ANY($2::text[])
        AND ticker IS NOT NULL
        AND analysis IS NOT NULL
        AND event_at >= now() - ($1 || ' hours')::interval
      ORDER BY event_at DESC
      LIMIT 300
      `,
      [String(sinceHours), kinds],
    );
    for (const r of rows) {
      const ticker = String(r.ticker ?? "").toUpperCase();
      const score = scoreResearchDocument({
        analysis: r.analysis,
        source_key: r.source_key,
        feed_kind: r.feed_kind,
        program_phase: r.program_phase,
        event_at: r.event_at,
        data: r.data,
      });
      if (!gradeMeetsMinimum(score.idea_grade, minGrade)) continue;
      out.push(
        attach(
          r.feed_kind === "pharma" ? "pharma" : "research",
          r.id,
          ticker,
          `${ticker} ${String(r.source_key ?? "filing")}`,
          String(r.analysis ?? "").slice(0, 160),
          String(r.event_at ?? new Date().toISOString()),
          r.url,
          score,
        ),
      );
    }
  }

  out.sort((a, b) => b.idea_score - a.idea_score || String(b.event_at).localeCompare(String(a.event_at)));
  return out.slice(0, limit).map((c) => ({
    ...c,
    url: c.url ?? `${frontendBase()}/?ticker=${encodeURIComponent(c.ticker)}`,
  }));
}

export function ideaScoreFields(result: IdeaScoreResult) {
  return {
    idea_score: result.idea_score,
    idea_grade: result.idea_grade,
    idea_reasons: result.idea_reasons,
  };
}
