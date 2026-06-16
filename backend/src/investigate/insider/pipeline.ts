import { db } from "../../core/db.js";
import { fetchForm4Text } from "../../core/sec.js";
import { llmChat } from "../../core/llm.js";
import { syncInsiderTransactionsFromDocument } from "../../documents/store.js";
import { sha256NormalizedText } from "../../core/text-hash.js";
import {
  isBogusInsiderWorksheetKey,
  ownerSurname,
  type InsiderWorksheetRow,
} from "../worksheet.js";
import {
  extractAllFormTransactions,
  extractFormReportingOwner,
  extractFormReportingOwners,
  extractFormXmlTransactionFragments,
  firstXmlTagText,
  type FormXmlOwner,
  type FormXmlTransaction,
} from "./xml-extract.js";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_id: string; feed_label: string; ticker?: string | null };

function extractJsonObject(text: string): any {
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error("llm_output_not_json");
  }
}

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

function clusterBoundsFromRows(rows: InsiderWorksheetRow[]) {
  const times = rows
    .map((r) => parseForm4TransactionDate(r.ts ?? null))
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  if (!times.length) return { start: null as string | null, end: null as string | null };
  const min = Math.min(...times);
  const max = Math.max(...times);
  return { start: new Date(min).toISOString(), end: new Date(max).toISOString() };
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

function enrichInsiderWorksheetRows(
  llmRows: unknown[],
  txns: FormXmlTransaction[],
  owner: FormXmlOwner,
): InsiderWorksheetRow[] {
  const codeRows = txns.length ? buildWorksheetRowsFromTransactions(txns, owner) : [];
  const rows = Array.isArray(llmRows) ? llmRows : [];
  const llmLooksBogus = !rows.length || rows.every((r) => isBogusInsiderWorksheetKey(String((r as any)?.key ?? "")));

  if (codeRows.length && (llmLooksBogus || codeRows.length >= rows.length)) {
    return codeRows;
  }

  const surname = ownerSurname(owner.name);
  return rows.map((raw, i) => {
    const r = raw as Record<string, unknown>;
    const t = txns[i] ?? txns[txns.length - 1];
    const key = String(r?.key ?? "").trim();
    const bogus = isBogusInsiderWorksheetKey(key);
    const insider_name = r?.insider_name != null ? String(r.insider_name).trim() : owner.name;
    const resolvedRole = r?.role != null ? String(r.role).trim() : owner.role;
    const resolvedSurname =
      r?.surname != null ? String(r.surname).trim() : ownerSurname(String(insider_name ?? "")) ?? surname;
    return {
      key: bogus && insider_name ? `${resolvedRole} ${insider_name}` : key || "Insider",
      insider_name,
      surname: resolvedSurname,
      role: resolvedRole,
      transaction_code:
        r?.transaction_code != null
          ? String(r.transaction_code)
          : r?.code != null
            ? String(r.code)
            : t?.transaction_code ?? "P",
      acquired_disposed:
        r?.acquired_disposed != null ? String(r.acquired_disposed) : t?.acquired_disposed ?? "A",
      amount_usd:
        r?.amount_usd != null ? Number(r.amount_usd) : t?.amount_usd != null ? t.amount_usd : null,
      shares: r?.shares != null ? Number(r.shares) : t?.shares != null ? t.shares : null,
      is_derivative: Boolean(r?.is_derivative ?? r?.derivative ?? t?.is_derivative),
      ts: r?.ts != null ? String(r.ts) : parseForm4TransactionDate(t?.transaction_date ?? null),
    };
  });
}

type InsiderClusterOut = {
  schema_type: "insider_cluster";
  schema_version: "v1";
  issuer: { name: string | null; ticker: string | null; cik: string | null };
  filing: { form_type: string; accession_no: string | null; filed_at: string | null };
  cluster: {
    cluster_start_at: string | null;
    cluster_end_at: string | null;
    feed_label: string;
    context_sentences: string[];
    worksheet_rows: InsiderWorksheetRow[];
  };
};

function buildInsiderNarrativePrompt(args: {
  formType: string;
  issuerName: string | null;
  issuerTicker: string | null;
  issuerCik: string | null;
  owners: FormXmlOwner[];
  transactions: FormXmlTransaction[];
  xmlFragments: string;
  focusPOnly: boolean;
}) {
  const { formType, issuerName, issuerTicker, issuerCik, owners, transactions, xmlFragments, focusPOnly } = args;
  const guidance = focusPOnly
    ? [
        "This is a Form 4 cluster filtered for Code P open-market purchases in the feed, but ALL transaction rows below are stored.",
        "In context_sentences, emphasize Code P purchases; mention other codes only if they appear in TRANSACTIONS.",
        "Do NOT say 'no selling' — other codes may be present.",
      ]
    : [
        `This is a ${formType} filing. Summarize all transaction codes present.`,
        "Include every material transaction type visible in TRANSACTIONS.",
      ];

  return [
    {
      role: "system" as const,
      content: [
        "You write narrative fields for an SEC insider filing card.",
        "Return ONLY valid JSON. No markdown.",
        "Do not invent facts. Use null when unknown.",
        "worksheet_rows must be an empty array — rows are filled in code.",
        `Schema: ${JSON.stringify({
          schema_type: "insider_cluster",
          schema_version: "v1",
          issuer: { name: "string|null", ticker: "string|null", cik: "string|null" },
          filing: { form_type: formType, accession_no: "string|null", filed_at: "ISO8601|null" },
          cluster: {
            cluster_start_at: "ISO8601|null",
            cluster_end_at: "ISO8601|null",
            feed_label: "string",
            context_sentences: ["string"],
            worksheet_rows: [],
          },
        })}`,
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "ISSUER:",
        JSON.stringify({ name: issuerName, ticker: issuerTicker, cik: issuerCik }),
        "",
        "REPORTING OWNERS:",
        JSON.stringify(owners),
        "",
        "TRANSACTIONS (all codes — preserve every row in your narrative):",
        JSON.stringify(transactions),
        "",
        ...guidance,
        "- feed_label: short headline with amounts/counts when visible.",
        "- context_sentences: up to 4 plain English sentences.",
        ...(transactions.length === 0 && xmlFragments
          ? ["", "XML_FRAGMENTS (fallback context):", xmlFragments]
          : []),
      ].join("\n"),
    },
  ];
}

function mergeInsiderNarrative(
  llmOut: any,
  base: {
    issuer: InsiderClusterOut["issuer"];
    filing: InsiderClusterOut["filing"];
    worksheet_rows: InsiderWorksheetRow[];
    defaultFeedLabel: string;
  },
): InsiderClusterOut {
  const bounds = clusterBoundsFromRows(base.worksheet_rows);
  const ctx = Array.isArray(llmOut?.cluster?.context_sentences)
    ? llmOut.cluster.context_sentences.map((s: unknown) => String(s)).filter(Boolean).slice(0, 4)
    : [];

  return {
    schema_type: "insider_cluster",
    schema_version: "v1",
    issuer: {
      name: llmOut?.issuer?.name ?? base.issuer.name,
      ticker: llmOut?.issuer?.ticker ?? base.issuer.ticker,
      cik: llmOut?.issuer?.cik ?? base.issuer.cik,
    },
    filing: {
      form_type: String(llmOut?.filing?.form_type ?? base.filing.form_type),
      accession_no: llmOut?.filing?.accession_no ?? base.filing.accession_no,
      filed_at: formatIso(llmOut?.filing?.filed_at) ?? base.filing.filed_at,
    },
    cluster: {
      cluster_start_at: formatIso(llmOut?.cluster?.cluster_start_at) ?? bounds.start,
      cluster_end_at: formatIso(llmOut?.cluster?.cluster_end_at) ?? bounds.end,
      feed_label: String(llmOut?.cluster?.feed_label ?? base.defaultFeedLabel).trim() || base.defaultFeedLabel,
      context_sentences: ctx,
      worksheet_rows: base.worksheet_rows,
    },
  };
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

    if (requirePOnly && !allTxns.some((t) => t.transaction_code === "P")) {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'dead',
            last_error = 'skipped_no_P_transactions',
            next_attempt_at = NULL,
            updated_at = now()
        WHERE id = $1
        `,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "no_P_transactions" };
    }

    const xmlFragments = extractFormXmlTransactionFragments(xml);
    const messages = buildInsiderNarrativePrompt({
      formType: formSourceKey,
      issuerName,
      issuerTicker,
      issuerCik,
      owners,
      transactions: allTxns,
      xmlFragments,
      focusPOnly: requirePOnly,
    });

  const { content, model } = await llmChat(messages, {
    temperature: 0,
    max_tokens: 1200,
    log_context: "insider/narrative",
  });
    const llmOut = extractJsonObject(content);

    let worksheetRows = enrichInsiderWorksheetRows(
      llmOut?.cluster?.worksheet_rows ?? [],
      allTxns,
      primaryOwner,
    );

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

    const pSum = allTxns
      .filter((t) => t.transaction_code === "P")
      .reduce((a, t) => a + (t.amount_usd ?? 0), 0);
    const defaultFeedLabel =
      requirePOnly && pSum > 0
        ? `Net buying ~$${Math.round(pSum).toLocaleString("en-US")} (P purchases)`
        : `${formSourceKey} filing`;

    const out = mergeInsiderNarrative(llmOut, {
      issuer: { name: issuerName, ticker: issuerTicker, cik: issuerCik },
      filing: {
        form_type: formSourceKey,
        accession_no: accessionNo,
        filed_at: formatIso(filedAt),
      },
      worksheet_rows: worksheetRows,
      defaultFeedLabel,
    });

    if (requirePOnly && !out.cluster.worksheet_rows.length) {
      await db.query(
        `
        UPDATE document_queue
        SET status = 'dead',
            last_error = 'skipped_empty_P_rows',
            next_attempt_at = NULL,
            updated_at = now()
        WHERE id = $1
        `,
        [queueId],
      );
      return { processed: false, reason: "skipped", queue_id: queueId, skip_reason: "empty_P_rows" };
    }

    const ticker = out.issuer.ticker ?? issuerTicker ?? null;
    const feedLabel = out.cluster.feed_label;

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
        out.cluster.cluster_end_at ?? out.filing.filed_at,
        feedLabel,
        url,
        out.cluster.cluster_end_at ?? out.filing.filed_at,
        contentSha256,
        out,
      ],
    );

    await db.query(
      `UPDATE document_queue SET status = 'parsed', updated_at = now(), last_error = NULL WHERE id = $1`,
      [queueId],
    );

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
      await syncInsiderTransactionsFromDocument(inserted.id, String(ticker), out);
    }

    return { processed: true, queue_id: queueId, parsed_id: inserted?.id ?? "", feed_label: feedLabel, ticker };
  } catch (err: any) {
    const msg = String(err?.message ?? err);
    const attempts = await db.one<{ attempts: number }>(
      `UPDATE document_queue SET attempts = attempts + 1 WHERE id = $1 RETURNING attempts`,
      [queueId],
    );
    const n = attempts?.attempts ?? 1;
    const backoffMinutes = Math.min(60, 2 ** Math.min(5, n));
    const status = n >= 6 ? "dead" : "failed";
    await db.query(
      `
      UPDATE document_queue
      SET status = $2,
          last_error = $3,
          next_attempt_at = now() + ($4 || ' minutes')::interval,
          updated_at = now()
      WHERE id = $1
      `,
      [queueId, status, msg.slice(0, 2000), String(backoffMinutes)],
    );
    return { processed: false, reason: "busy", queue_id: queueId };
  }
}
