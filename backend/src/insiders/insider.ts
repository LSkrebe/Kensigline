import { db } from "../core/db.js";
import { fetchForm4Text } from "../core/sec.js";
import { llmChat } from "../core/llm.js";
import { createHash } from "node:crypto";

type ParseNextResult =
  | { processed: false; reason: "no_work" }
  | { processed: false; reason: "busy"; queue_id: string }
  | { processed: false; reason: "skipped"; queue_id: string; skip_reason: string }
  | { processed: true; queue_id: string; parsed_id: string; feed_label: string; ticker?: string | null };

function extractJsonObject(text: string): any {
  let raw = String(text ?? "").trim();
  if (!raw) throw new Error("empty_llm_response");

  // Strip common markdown fences if the model includes them anyway.
  raw = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // Common case: model outputs JSON directly.
  try {
    return JSON.parse(raw);
  } catch {
    // Try to salvage: find first { ... last }
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const slice = raw.slice(start, end + 1);
      return JSON.parse(slice);
    }
    throw new Error("llm_output_not_json");
  }
}

function formatIso(ts: any): string | null {
  const d = new Date(String(ts ?? ""));
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type Form4PTransaction = {
  transaction_code: "P";
  transaction_date: string | null;
  shares: number | null;
  price: number | null;
  amount_usd: number | null;
  security_title: string | null;
};

function firstXmlTagText(xml: string, tag: string): string | null {
  // Handle optional namespace prefixes and attributes:
  // <transactionCode> P </transactionCode>
  // <ns1:transactionCode xmlns:ns1="...">P</ns1:transactionCode>
  // <transactionCode someAttr="x">P</transactionCode>
  const re = new RegExp(`<((?:[A-Za-z_][\\w.-]*:)?)${tag}\\b[^>]*>([\\s\\S]*?)<\\/\\1${tag}>`, "i");
  const m = xml.match(re);
  if (!m) return null;
  const inner = String(m[2] ?? "");
  // Many Form 4 fields are wrapped as <tag><value>...</value></tag>.
  const mv = inner.match(/<((?:[A-Za-z_][\w.-]*:)?)value\b[^>]*>([\s\S]*?)<\/\1value>/i);
  const picked = mv ? String(mv[2] ?? "") : inner;
  // Strip any remaining tags (defensive; we only need plain text/numbers).
  const text = picked.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function parseNumberLoose(s: string | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[, ]+/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

function extractForm4PTransactions(xml: string): Form4PTransaction[] {
  const out: Form4PTransaction[] = [];
  // Handle optional namespace prefixes and attributes.
  const blocks =
    xml.match(
      /<(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction\b[^>]*>[\s\S]*?<\/(?:(?:[A-Za-z_][\w.-]*):)?nonDerivativeTransaction>/gi,
    ) ?? [];
  for (const b of blocks) {
    const code = firstXmlTagText(b, "transactionCode");
    if (String(code ?? "").replace(/\s+/g, "").trim().toUpperCase() !== "P") continue;

    const dt = firstXmlTagText(b, "transactionDate");
    const shares = parseNumberLoose(firstXmlTagText(b, "transactionShares"));
    const price = parseNumberLoose(firstXmlTagText(b, "transactionPricePerShare"));
    const title = firstXmlTagText(b, "securityTitle");
    const amount_usd = shares != null && price != null ? Math.round(shares * price * 100) / 100 : null;

    out.push({
      transaction_code: "P",
      transaction_date: dt,
      shares,
      price,
      amount_usd,
      security_title: title,
    });
  }
  return out;
}

function isDesiredInsiderSchema(out: any): out is {
  issuer: { name: string | null; ticker: string | null; cik: string | null };
  filing: { form_type: "Form 4"; accession_no: string | null; filed_at: string | null };
  cluster: {
    cluster_start_at: string | null;
    cluster_end_at: string | null;
    feed_label: string;
    context_sentences: string[];
    worksheet_rows: Array<{ key: string; ts: string | null; amount_usd: number | null }>;
  };
} {
  return (
    out &&
    typeof out === "object" &&
    out.issuer &&
    out.filing &&
    out.cluster &&
    typeof out.cluster.feed_label === "string" &&
    Array.isArray(out.cluster.context_sentences) &&
    Array.isArray(out.cluster.worksheet_rows)
  );
}

function buildInsiderNormalizePrompt(anyJson: unknown) {
  return [
    {
      role: "system" as const,
      content: [
        "Convert arbitrary Form 4 extraction JSON into a single normalized JSON object for the app.",
        "Return ONLY valid JSON. No markdown. No extra keys beyond the schema.",
        "If a field is unknown, use null / empty arrays. Do not invent.",
        "Keep `context_sentences` short, plain English, and at most 4 sentences.",
      ].join("\n"),
    },
    {
      role: "user" as const,
      content: [
        "TARGET SCHEMA (return exactly this shape):",
        "{",
        '  "schema_type": "insider_cluster",',
        '  "schema_version": "v1",',
        '  "issuer": { "name": string|null, "ticker": string|null, "cik": string|null },',
        '  "filing": { "form_type": "Form 4", "accession_no": string|null, "filed_at": string|null },',
        '  "cluster": {',
        '    "cluster_start_at": string|null,',
        '    "cluster_end_at": string|null,',
        '    "feed_label": string,',
        '    "context_sentences": string[],',
        '    "worksheet_rows": Array<{ "key": string, "ts": string|null, "amount_usd": number|null }>',
        "  }",
        "}",
        "",
        "INPUT JSON (convert this):",
        JSON.stringify(anyJson).slice(0, 180_000),
      ].join("\n"),
    },
  ];
}

function buildInsiderExtractionPrompt(args: {
  form4Xml: string;
  issuerName: string | null;
  issuerTicker: string | null;
  issuerCik: string | null;
  pTransactions: Form4PTransaction[];
}) {
  const { form4Xml, issuerName, issuerTicker, issuerCik, pTransactions } = args;
  return [
    {
      role: "system" as const,
      content:
        [
          "You extract SEC Form 4 filings into a single JSON object.",
          "Return ONLY valid JSON. No markdown. No extra keys beyond the schema.",
          "If a field is unknown, use null / empty arrays. Do not invent facts.",
          "Keep sentences short and plain English.",
          "IMPORTANT: Only include Transaction Code P purchases (open-market buys).",
        ].join("\n"),
    },
    {
      role: "user" as const,
      content:
        [
          "SCHEMA (return exactly this shape):",
          "{",
          '  "schema_type": "insider_cluster",',
          '  "schema_version": "v1",',
          '  "issuer": { "name": string|null, "ticker": string|null, "cik": string|null },',
          '  "filing": { "form_type": "Form 4", "accession_no": string|null, "filed_at": string|null },',
          '  "cluster": {',
          '    "cluster_start_at": string|null,',
          '    "cluster_end_at": string|null,',
          '    "feed_label": string,',
          '    "context_sentences": string[],',
          '    "worksheet_rows": Array<{ "key": string, "ts": string|null, "amount_usd": number|null }>',
          "  }",
          "}",
          "",
          "ISSUER (from filing):",
          JSON.stringify({ name: issuerName, ticker: issuerTicker, cik: issuerCik }),
          "",
          "PURCHASE TRANSACTIONS (only code=P) extracted for you:",
          JSON.stringify(pTransactions),
          "",
          "GUIDANCE:",
          "- Only summarize the P purchases above. Ignore any sales, RSUs, awards, gifts, or other codes.",
          "- `feed_label`: short, like 'Net buying ~$2.1M (P purchases)'.",
          "- `context_sentences`: EXACTLY 4 medium-length sentences. Make them plain and readable with normal punctuation.",
          "  - Do NOT prefix with 'Company overview:' and do NOT use semicolons.",
          "  - Sentence 1: one-line description of what the company does (best-effort; if unsure, say 'The company is publicly listed, but its business is not clear from this filing.').",
          "  - Sentence 2: what happened (who bought / how many purchases / over what window) and explicitly say Code P open-market purchases.",
          "  - Sentence 3: size + concentration (net buying ~$X if possible; who dominates if visible; how many distinct buy dates if you can infer it).",
          "  - Sentence 4: recency + why it matters (last buy within X days) and add one simple caveat if relevant (e.g. small dollar size).",
          "  - IMPORTANT: Do NOT say 'no selling' or similar. This dataset only includes Code P purchases, so that would be misleading.",
          "  - Avoid empty adjectives like 'clustered' unless you immediately quantify them (e.g. 'spread over 2 dates' or 'all on one day').",
          "- `worksheet_rows`: one row per P transaction (include all of them).",
          "",
          "FORM 4 XML (for context if needed):",
          form4Xml.slice(0, 80_000),
        ].join("\n"),
    },
  ];
}

export async function parseNextInsiderQueueItem(): Promise<ParseNextResult> {
  // Pick one item ready to parse; mark it parsing to avoid double work.
  const next = await db.one<{ id: string; url: string }>(
    `
    UPDATE document_queue
    SET status = 'parsing', updated_at = now()
    WHERE id = (
      SELECT id
      FROM document_queue
      WHERE status IN ('ready_to_parse', 'queued', 'failed')
        AND source_type = 'sec_form4'
        AND (next_attempt_at IS NULL OR next_attempt_at <= now())
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url
    `,
    [],
  );

  if (!next) return { processed: false, reason: "no_work" };

  const queueId = next.id;
  const url = next.url;

  try {
    const xml = await fetchForm4Text(url);
    const contentSha256 = createHash("sha256").update(xml, "utf8").digest("hex");

    const issuerName = firstXmlTagText(xml, "issuerName");
    const issuerTicker = firstXmlTagText(xml, "issuerTradingSymbol");
    const issuerCik = firstXmlTagText(xml, "issuerCik");
    const pTxns = extractForm4PTransactions(xml);

    // Skip filings that contain no Code P purchases.
    if (pTxns.length === 0) {
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

    const messages = buildInsiderExtractionPrompt({
      form4Xml: xml,
      issuerName,
      issuerTicker,
      issuerCik,
      pTransactions: pTxns,
    });
    const { content, model } = await llmChat(messages, { temperature: 0, max_tokens: 1500 });
    let out = extractJsonObject(content);
    if (!isDesiredInsiderSchema(out)) {
      const norm = await llmChat(buildInsiderNormalizePrompt(out), { temperature: 0, max_tokens: 1500 });
      out = extractJsonObject(norm.content);
    }
    if (!isDesiredInsiderSchema(out)) {
      throw new Error("llm_output_schema_mismatch");
    }

    const ticker = out?.issuer?.ticker ?? null;
    const feedLabel = String(out?.cluster?.feed_label ?? "Insider activity").trim() || "Insider activity";

    // Enforce: only insert parsed doc if we have at least one P worksheet row.
    if (!out.cluster.worksheet_rows?.length) {
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

    const clusterStart = formatIso(out?.cluster?.cluster_start_at);
    const clusterEnd = formatIso(out?.cluster?.cluster_end_at);
    const feedAt = clusterEnd ?? formatIso(out?.filing?.filed_at) ?? null;

    // Insert parsed doc row.
    const inserted = await db.one<{ id: string }>(
      `
      INSERT INTO document_parsed (
        queue_id,
        schema_type,
        schema_version,
        ticker,
        feed_kind,
        feed_at,
        feed_label,
        url,
        published_at,
        model,
        prompt_version,
        content_sha256,
        data
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'insider',
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12
      )
      ON CONFLICT (content_sha256) WHERE content_sha256 IS NOT NULL
      DO UPDATE SET parsed_at = now()
      RETURNING id
      `,
      [
        queueId,
        "insider_cluster",
        "v1",
        ticker,
        feedAt,
        feedLabel,
        url,
        feedAt,
        model,
        "insider_form4_v1",
        contentSha256,
        out,
      ],
    );

    // Mark queue item parsed.
    await db.query(
      `
      UPDATE document_queue
      SET status = 'parsed', updated_at = now(), last_error = NULL
      WHERE id = $1
      `,
      [queueId],
    );

    // Opportunistic upsert into companies (simple: keyed by name).
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

