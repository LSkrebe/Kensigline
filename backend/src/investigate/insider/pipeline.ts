import { db } from "../../core/db.js";
import { fetchForm4Text } from "../../core/sec.js";
import { syncInsiderTransactionsFromDocument } from "../../documents/store.js";
import { sha256NormalizedText } from "../../core/text-hash.js";
import { sanitizeEventAtForFeed } from "../../shared/document-activity-at.js";
import { syncFeedIndexForDocument } from "../../shared/feed-index.js";
import { buildParseMeta, logParseOutcome } from "../../shared/parse-meta.js";
import { failQueueWithBackoff, markQueueDead, markQueueParsed } from "../../shared/queue.js";
import {
  ownerSurname,
  type InsiderWorksheetRow,
} from "../worksheet.js";
import {
  extractAllFormTransactions,
  extractFormReportingOwner,
  extractFormReportingOwners,
  firstXmlTagText,
  type FormXmlOwner,
  type FormXmlTransaction,
} from "./xml-extract.js";
import {
  assessInsiderParseConfidence,
  buildInsiderNarrativeDeterministic,
  type InsiderClusterOut,
} from "./narrative.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_id: string; feed_label: string; ticker?: string | null };

function formatIso(ts: any): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function parseForm4TransactionDate(raw: string | null): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return formatIso(`${iso[1]}-${iso[2]}-${iso[3]}T12:00:00.000Z`);
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (us) {
    const mm = String(us[1]).padStart(2, "0");
    const dd = String(us[2]).padStart(2, "0");
    return formatIso(`${us[3]}-${mm}-${dd}T12:00:00.000Z`);
  }
  return formatIso(s);
}


function buildWorksheetRowsFromTransactions(txns: FormXmlTransaction[], owner: FormXmlOwner): InsiderWorksheetRow[] {
  const surname = ownerSurname(owner.name);
  return txns.map((t, i) => ({
    key: owner.name ? `${owner.role} ${owner.name}` : `Txn ${i + 1}`,
    insider_name: owner.name,
    surname,
    role: owner.role,
    transaction_code: t.transaction_code,
    acquired_disposed: t.acquired_disposed ?? (t.transaction_code === "S" ? "D" : "A"),
    amount_usd: t.amount_usd,
    shares: t.shares,
    is_derivative: t.is_derivative,
    ts: parseForm4TransactionDate(t.transaction_date),
  }));
}

export async function parseNextInsiderQueueItem(): Promise<ParseNextResult> {
  const next = await db.one<{ id: string; url: string; source_type: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type IN ('sec_form4', 'sec_form3', 'sec_form5')
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, source_type
    `,
    [],
  );

  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const url = next.url;
  const queueSourceType = next.source_type;
  const formSourceKey =
    queueSourceType === "sec_form3" ? "Form 3" : queueSourceType === "sec_form5" ? "Form 5" : "Form 4";
  const requirePOnly = queueSourceType === "sec_form4";

  try {
    const xml = await fetchForm4Text(url);
    const contentSha256 = sha256NormalizedText(xml);

    const issuerName = firstXmlTagText(xml, "issuerName");
    const issuerTicker = firstXmlTagText(xml, "issuerTradingSymbol");
    const issuerCik = firstXmlTagText(xml, "issuerCik");
    const accessionNo = firstXmlTagText(xml, "accessionNumber");
    const filedAt = firstXmlTagText(xml, "periodOfReport") ?? firstXmlTagText(xml, "dateOfOriginalSubmission");

    const allTxns = extractAllFormTransactions(xml);
    const owners = extractFormReportingOwners(xml);
    const primaryOwner = owners[0] ?? extractFormReportingOwner(xml);

    let worksheetRows = buildWorksheetRowsFromTransactions(allTxns, primaryOwner);

    if (!worksheetRows.length) {
      const filed = formatIso(filedAt) ?? new Date().toISOString();
      worksheetRows = [
        {
          key: primaryOwner.name ? `${primaryOwner.role} ${primaryOwner.name}` : "Reporting owner",
          insider_name: primaryOwner.name,
          surname: ownerSurname(primaryOwner.name),
          role: primaryOwner.role,
          transaction_code: formSourceKey === "Form 3" ? "A" : "H",
          acquired_disposed: "A",
          amount_usd: null,
          shares: null,
          ts: filed,
        },
      ];
    }

    const parseConfidence = assessInsiderParseConfidence({
      issuerTicker: issuerTicker,
      owners,
      transactions: allTxns,
      formSourceKey,
      requirePOnly,
    });

    let out: InsiderClusterOut;
    if (parseConfidence.confident || worksheetRows.length) {
      if (parseConfidence.confident) {
        console.info(
          "[llm-skip]",
          JSON.stringify({ context: "insider/narrative", path: "deterministic", reasons: parseConfidence.reasons }),
        );
      }
      out = buildInsiderNarrativeDeterministic({
        formSourceKey,
        issuerName,
        issuerTicker,
        issuerCik,
        accessionNo,
        filedAt: formatIso(filedAt),
        owner: primaryOwner,
        transactions: allTxns,
        worksheetRows,
        requirePOnly,
      });
    } else {
      await markQueueDead(queueId, "skipped_low_confidence_xml");
      logParseOutcome({
        source_type: next.source_type,
        queue_id: queueId,
        outcome: "skipped",
        path: "deterministic/insider",
        skip_reason: "low_confidence",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "low_confidence" };
    }

    if (!out.cluster.worksheet_rows.length) {
      await markQueueDead(queueId, "skipped_no_worksheet_rows");
      logParseOutcome({
        source_type: next.source_type,
        queue_id: queueId,
        outcome: "skipped",
        path: "deterministic/insider",
        skip_reason: "no_worksheet_rows",
        llm_used: false,
      });
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_worksheet_rows" };
    }

    const ticker = out.issuer.ticker ?? issuerTicker ?? null;
    const feedLabel = out.cluster.feed_label;
    const filingAt = out.filing.filed_at ?? formatIso(filedAt) ?? new Date().toISOString();
    const activityAt = sanitizeEventAtForFeed({
      candidate: out.cluster.cluster_end_at ?? filingAt,
      filedAt: filingAt,
    });

    const data = {
      ...out,
      parse_meta: buildParseMeta({
        path: "deterministic/insider",
        llm_used: false,
        source_type: next.source_type,
      }),
    };

    const inserted = await db.one<{ id: string }>(
      `
      INSERT INTO documents (
        queue_id, doc_kind, schema_version, ticker, feed_kind, source_key, event_at,
        feed_label, url, published_at, content_sha256, data
      )
      VALUES ($1, $2, $3, $4, 'insider', $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (content_sha256) WHERE content_sha256 IS NOT NULL
      DO UPDATE SET parsed_at = now()
      RETURNING id
      `,
      [
        queueId,
        "insider_cluster",
        "v1",
        ticker,
        formSourceKey,
        activityAt,
        feedLabel,
        url,
        filingAt,
        contentSha256,
        data,
      ],
    );

    await markQueueParsed(queueId);

    if (issuerName) {
      await db.query(
        `
        INSERT INTO companies (name, ticker, updated_at)
        VALUES ($1, $2, now())
        ON CONFLICT (name) DO UPDATE SET ticker = COALESCE(EXCLUDED.ticker, companies.ticker), updated_at = now()
        `,
        [String(issuerName), ticker ? String(ticker) : null],
      );
    }

    if (inserted?.id && ticker) {
      await syncInsiderTransactionsFromDocument(inserted.id, String(ticker), data);
      void syncFeedIndexForDocument(inserted.id).catch(() => {});
    }

    logParseOutcome({
      source_type: next.source_type,
      queue_id: queueId,
      outcome: "parsed",
      path: "deterministic/insider",
      llm_used: false,
      ticker,
    });
    return { processed: true, queue_id: queueId, parsed_id: inserted?.id ?? "", feed_label: feedLabel, ticker };
  } catch (err: any) {
    await failQueueWithBackoff(queueId, err);
    logParseOutcome({
      source_type: next.source_type,
      queue_id: queueId,
      outcome: "failed",
      error: String(err?.message ?? err).slice(0, 200),
      llm_used: false,
    });
    return { processed: false, reason: "busy", queue_id: queueId };
  }
}
