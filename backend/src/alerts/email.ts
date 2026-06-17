import type { DigestSection } from "./digest-collect.js";
import {
  renderDigestHtml,
  renderDigestText,
  sendBrevoEmail,
} from "./email-layout.js";

/** Send mode-aware digest via Brevo transactional API. */
export async function sendIdeaDigestEmail(opts: {
  to: string;
  subject: string;
  sections: DigestSection[];
  slotLabel?: string;
}): Promise<boolean> {
  if (!opts.sections.length) return false;
  return sendBrevoEmail({
    to: opts.to,
    subject: opts.subject,
    htmlContent: renderDigestHtml(opts.sections, opts.slotLabel),
    textContent: renderDigestText(opts.sections),
    logTag: "digest",
  });
}
