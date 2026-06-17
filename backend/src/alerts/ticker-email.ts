import {
  renderTickerAlertHtml,
  renderTickerAlertText,
  sendBrevoEmail,
} from "./email-layout.js";

export type TickerAlertItem = {
  id: string;
  ticker: string;
  title: string;
  feed: string;
  context: string;
  url: string | null;
  event_at: string;
};

export function documentAiContext(doc: { analysis?: string | null; title?: string | null; data?: unknown }): string {
  const analysis = String(doc.analysis ?? "").trim();
  if (analysis) return analysis;
  const data = doc.data as { cluster?: { context_sentences?: unknown[] } } | null | undefined;
  const sentences = Array.isArray(data?.cluster?.context_sentences) ? data.cluster.context_sentences : [];
  const joined = sentences.map((s) => String(s ?? "").trim()).filter(Boolean).join(" ");
  if (joined) return joined;
  const title = String(doc.title ?? "").trim();
  return title || "New document processed.";
}

export async function sendTickerContextEmail(opts: {
  to: string;
  subject: string;
  items: TickerAlertItem[];
}): Promise<boolean> {
  if (!opts.items.length) return false;
  return sendBrevoEmail({
    to: opts.to,
    subject: opts.subject,
    htmlContent: renderTickerAlertHtml(opts.items),
    textContent: renderTickerAlertText(opts.items),
    logTag: "ticker",
  });
}
