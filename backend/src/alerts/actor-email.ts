import {
  renderActorAlertHtml,
  renderActorAlertText,
  sendBrevoEmail,
} from "./email-layout.js";

export type ActorAlertItem = {
  id: string;
  actor_key: string;
  actor_name: string;
  mode: string;
  ticker: string;
  title: string;
  context: string;
  url: string | null;
  event_at: string;
};

export async function sendActorContextEmail(opts: {
  to: string;
  subject: string;
  items: ActorAlertItem[];
}): Promise<boolean> {
  if (!opts.items.length) return false;
  return sendBrevoEmail({
    to: opts.to,
    subject: opts.subject,
    htmlContent: renderActorAlertHtml(opts.items),
    textContent: renderActorAlertText(opts.items),
    logTag: "actor",
  });
}
