import type { MiroSharkV1 } from "./miroshark.js";
import { db } from "../core/db.js";

async function ensureEntity(ticker: string | null, name: string | null): Promise<string> {
  const n = String(name ?? "").trim() || "Unknown";
  if (ticker) {
    const t = String(ticker).trim().toUpperCase();
    const hit = await db.one<{ id: string }>(`SELECT id FROM bosha_entities WHERE ticker = $1 LIMIT 1`, [t]);
    if (hit?.id) return hit.id;
    const ins = await db.one<{ id: string }>(
      `INSERT INTO bosha_entities (ticker, name) VALUES ($1, $2) RETURNING id`,
      [t, n],
    );
    return ins!.id;
  }
  const hit = await db.one<{ id: string }>(
    `SELECT id FROM bosha_entities WHERE ticker IS NULL AND lower(name) = lower($1) LIMIT 1`,
    [n],
  );
  if (hit?.id) return hit.id;
  const ins = await db.one<{ id: string }>(
    `INSERT INTO bosha_entities (ticker, name) VALUES (NULL, $1) RETURNING id`,
    [n],
  );
  return ins!.id;
}

export async function insertBoshaDocument(args: {
  queueId: string | null;
  contentSha256: string;
  sourceType: string;
  url: string | null;
  title: string | null;
  publishedAt: string | null;
  primaryTicker: string | null;
  model: string;
}): Promise<string | null> {
  const dup = await db.one<{ id: string }>(`SELECT id FROM bosha_documents WHERE content_sha256 = $1 LIMIT 1`, [
    args.contentSha256,
  ]);
  if (dup?.id) return null;

  const row = await db.one<{ id: string }>(
    `
    INSERT INTO bosha_documents (
      queue_id, content_sha256, source_type, url, title, published_at, primary_ticker, model
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      args.queueId,
      args.contentSha256,
      args.sourceType,
      args.url,
      args.title,
      args.publishedAt,
      args.primaryTicker,
      args.model,
    ],
  );
  return row?.id ?? null;
}

export function resolveSubjectTicker(out: MiroSharkV1): string | null {
  if (out.primary_ticker) return out.primary_ticker;
  const withT = out.companies.find((c) => c.ticker);
  return withT?.ticker ?? null;
}

export async function persistMiroSharkExtraction(args: {
  documentId: string;
  out: MiroSharkV1;
  publishedAt: string | null;
}): Promise<{ tickersTouched: string[] }> {
  const { documentId, out, publishedAt } = args;
  const subject = resolveSubjectTicker(out);
  const tickers = new Set<string>();
  if (subject) tickers.add(subject);

  for (const c of out.companies) {
    if (c.ticker) tickers.add(c.ticker);
    await ensureEntity(c.ticker, c.name);
  }

  const eventAt = publishedAt;

  for (const e of out.events) {
    if (!subject) break;
    tickers.add(subject);
    await db.query(
      `
      INSERT INTO bosha_events (document_id, ticker, kind, summary, event_at, magnitude, novelty, sentiment, data)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      `,
      [
        documentId,
        subject,
        e.kind,
        e.label,
        e.event_at ?? eventAt,
        e.magnitude,
        e.novelty,
        e.sentiment,
        JSON.stringify({ label: e.label, kind: e.kind }),
      ],
    );
  }

  for (const r of out.relationships) {
    const fromId = await ensureEntity(r.from_ticker, r.from_name ?? "Company");
    const toId = await ensureEntity(r.to_ticker, r.to_name ?? "Company");
    if (fromId === toId) continue;
    await db.query(
      `
      INSERT INTO bosha_relationships (from_entity_id, to_entity_id, rel_type, confidence, document_id)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [fromId, toId, r.type, r.confidence, documentId],
    );
    if (r.from_ticker) tickers.add(r.from_ticker);
    if (r.to_ticker) tickers.add(r.to_ticker);
  }

  return { tickersTouched: Array.from(tickers).filter(Boolean) };
}
