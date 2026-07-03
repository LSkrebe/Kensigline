import {
  renderCombinedContextAlertHtml,
  renderCombinedContextAlertText,
  sendBrevoEmail,
} from "./email-layout.js";
import type { ActorAlertItem } from "./actor-email.js";
import type { TickerAlertItem } from "./ticker-email.js";

export async function sendCombinedContextEmail(opts: {
  to: string;
  subject: string;
  tickers: TickerAlertItem[];
  actors: ActorAlertItem[];
}): Promise<boolean> {
  const total = opts.tickers.length + opts.actors.length;
  if (!total) return false;
  return sendBrevoEmail({
    to: opts.to,
    subject: opts.subject,
    htmlContent: renderCombinedContextAlertHtml(opts.tickers, opts.actors),
    textContent: renderCombinedContextAlertText(opts.tickers, opts.actors),
    logTag: "context",
  });
}
