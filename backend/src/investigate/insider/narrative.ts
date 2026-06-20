import type { InsiderWorksheetRow } from "../worksheet.js";
import type { FormXmlOwner, FormXmlTransaction } from "./xml-extract.js";

export type InsiderClusterOut = {
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

function formatUsdCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${Math.round(n / 1_000_000)}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000).toLocaleString("en-US")}K`;
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

function codeLabel(code: string): string {
  const c = code.toUpperCase();
  if (c === "P") return "open-market purchase";
  if (c === "S") return "open-market sale";
  if (c === "A") return "grant/award";
  if (c === "M") return "option exercise";
  if (c === "G") return "gift";
  if (c === "H") return "inheritance/holding";
  return `Code ${c}`;
}

export function assessInsiderParseConfidence(args: {
  issuerTicker: string | null;
  owners: FormXmlOwner[];
  transactions: FormXmlTransaction[];
  formSourceKey: string;
  requirePOnly: boolean;
}): { confident: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const ticker = String(args.issuerTicker ?? "").trim();
  if (!ticker || ticker.length > 8) reasons.push("missing_ticker");
  else reasons.push("has_ticker");

  const namedOwner = args.owners.some((o) => String(o.name ?? "").trim().length >= 2);
  if (!namedOwner) reasons.push("missing_owner_name");
  else reasons.push("has_owner");

  const txns = args.transactions;
  if (!txns.length && args.formSourceKey !== "Form 3") reasons.push("no_transactions");
  else if (txns.length) reasons.push("has_transactions");

  const coded = txns.filter((t) => String(t.transaction_code ?? "").trim().length === 1);
  if (txns.length && coded.length < txns.length * 0.8) reasons.push("ambiguous_codes");

  if (args.requirePOnly) {
    const pRows = txns.filter((t) => t.transaction_code === "P");
    if (!pRows.length) reasons.push("no_P_rows");
    else {
      const withSize = pRows.filter((t) => (t.amount_usd ?? 0) > 0 || (t.shares ?? 0) > 0);
      if (!withSize.length) reasons.push("P_rows_without_size");
      else reasons.push("P_rows_with_size");
    }
  }

  const confident =
    !reasons.includes("missing_ticker") &&
    !reasons.includes("missing_owner_name") &&
    !reasons.includes("no_transactions") &&
    !reasons.includes("ambiguous_codes") &&
    !reasons.includes("no_P_rows") &&
    !reasons.includes("P_rows_without_size");

  return { confident, reasons };
}

export function buildInsiderDefaultFeedLabel(args: {
  formSourceKey: string;
  requirePOnly: boolean;
  transactions: FormXmlTransaction[];
}): string {
  const pSum = args.transactions
    .filter((t) => t.transaction_code === "P")
    .reduce((a, t) => a + (t.amount_usd ?? 0), 0);
  if (args.requirePOnly && pSum > 0) {
    return `Net buying ~${formatUsdCompact(pSum)} (P purchases)`;
  }
  const codes = [...new Set(args.transactions.map((t) => t.transaction_code).filter(Boolean))];
  if (codes.length === 1) return `${args.formSourceKey} · ${codeLabel(codes[0]!)}`;
  if (codes.length > 1) return `${args.formSourceKey} · ${codes.length} transaction types`;
  return `${args.formSourceKey} filing`;
}

export function buildInsiderContextSentences(args: {
  formSourceKey: string;
  issuerName: string | null;
  issuerTicker: string | null;
  owner: FormXmlOwner;
  transactions: FormXmlTransaction[];
  requirePOnly: boolean;
}): string[] {
  const who = args.owner.name
    ? `${args.owner.role} ${args.owner.name}`.trim()
    : "A reporting insider";
  const company = args.issuerName ?? args.issuerTicker ?? "the issuer";
  const txns = args.requirePOnly
    ? args.transactions.filter((t) => t.transaction_code === "P")
    : args.transactions;

  const sentences: string[] = [];
  if (!txns.length) {
    sentences.push(`${who} filed ${args.formSourceKey} ownership for ${company}.`);
    return sentences.slice(0, 4);
  }

  const byCode = new Map<string, FormXmlTransaction[]>();
  for (const t of txns) {
    const c = t.transaction_code || "?";
    const arr = byCode.get(c) ?? [];
    arr.push(t);
    byCode.set(c, arr);
  }

  for (const [code, rows] of byCode.entries()) {
    const usd = rows.reduce((a, r) => a + (r.amount_usd ?? 0), 0);
    const shares = rows.reduce((a, r) => a + (r.shares ?? 0), 0);
    const parts: string[] = [];
    if (usd > 0) parts.push(formatUsdCompact(usd));
    if (shares > 0) parts.push(`${Math.round(shares).toLocaleString("en-US")} shares`);
    const size = parts.length ? ` (${parts.join(", ")})` : "";
    sentences.push(`${who} reported ${codeLabel(code)}${size} in ${company}.`);
  }

  const dates = txns
    .map((t) => t.transaction_date)
    .filter(Boolean)
    .sort();
  if (dates.length) {
    const span =
      dates[0] === dates.at(-1)
        ? `on ${String(dates[0]).slice(0, 10)}`
        : `between ${String(dates[0]).slice(0, 10)} and ${String(dates.at(-1)).slice(0, 10)}`;
    sentences.push(`Transaction dates span ${span}.`);
  }

  return sentences.filter(Boolean).slice(0, 4);
}

export function buildInsiderNarrativeDeterministic(args: {
  formSourceKey: string;
  issuerName: string | null;
  issuerTicker: string | null;
  issuerCik: string | null;
  accessionNo: string | null;
  filedAt: string | null;
  owner: FormXmlOwner;
  transactions: FormXmlTransaction[];
  worksheetRows: InsiderWorksheetRow[];
  requirePOnly: boolean;
}): InsiderClusterOut {
  const bounds = worksheetBounds(args.worksheetRows);
  return {
    schema_type: "insider_cluster",
    schema_version: "v1",
    issuer: {
      name: args.issuerName,
      ticker: args.issuerTicker,
      cik: args.issuerCik,
    },
    filing: {
      form_type: args.formSourceKey,
      accession_no: args.accessionNo,
      filed_at: args.filedAt,
    },
    cluster: {
      cluster_start_at: bounds.start,
      cluster_end_at: bounds.end,
      feed_label: buildInsiderDefaultFeedLabel({
        formSourceKey: args.formSourceKey,
        requirePOnly: args.requirePOnly,
        transactions: args.transactions,
      }),
      context_sentences: buildInsiderContextSentences({
        formSourceKey: args.formSourceKey,
        issuerName: args.issuerName,
        issuerTicker: args.issuerTicker,
        owner: args.owner,
        transactions: args.transactions,
        requirePOnly: args.requirePOnly,
      }),
      worksheet_rows: args.worksheetRows,
    },
  };
}

function worksheetBounds(rows: InsiderWorksheetRow[]): { start: string | null; end: string | null } {
  const times = rows
    .map((r) => r.ts)
    .filter(Boolean)
    .map((t) => new Date(String(t)).getTime())
    .filter((n) => Number.isFinite(n));
  if (!times.length) return { start: null, end: null };
  return {
    start: new Date(Math.min(...times)).toISOString(),
    end: new Date(Math.max(...times)).toISOString(),
  };
}
