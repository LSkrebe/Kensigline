import type http from "node:http";
import { json, sendJson } from "../core/http.js";
import { sendBrevoEmail } from "../alerts/email-layout.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;

function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return null;
  return email;
}

function notifyTo(): string | null {
  const explicit = String(process.env.WAITLIST_NOTIFY_TO ?? "").trim().toLowerCase();
  if (explicit && EMAIL_RE.test(explicit)) return explicit;
  // Fallback: contact address embedded in SEC_USER_AGENT (often "Product you@domain.com").
  const ua = String(process.env.SEC_USER_AGENT ?? "");
  const m = ua.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m?.[0]?.toLowerCase() ?? null;
}

/** Public: POST /api/waitlist { email } — emails you the signup (no DB write). */
export async function handleWaitlistJoin(req: http.IncomingMessage, res: http.ServerResponse) {
  let body: Record<string, unknown>;
  try {
    body = ((await json(req)) as Record<string, unknown>) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const email = normalizeEmail(body.email);
  if (!email) {
    sendJson(res, 400, { ok: false, error: "invalid_email" });
    return;
  }

  // Respond immediately — Brevo notify must not block UX or touch ingest workers.
  sendJson(res, 200, { ok: true });

  const to = notifyTo();
  if (!to) {
    console.warn("[waitlist] WAITLIST_NOTIFY_TO unset; signup not emailed", { email });
    return;
  }

  void sendBrevoEmail({
    to,
    subject: `Waitlist: ${email}`,
    textContent: `New Mercerline waitlist signup\n\n${email}\n`,
    htmlContent: `<p>New Mercerline waitlist signup</p><p><strong>${email.replace(/</g, "&lt;")}</strong></p>`,
    logTag: "waitlist_notify",
    replyTo: { email },
  }).catch((err) => console.error("[waitlist] notify_failed", err));
}
