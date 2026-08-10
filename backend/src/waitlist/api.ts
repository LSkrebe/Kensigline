import type http from "node:http";
import { json, sendJson } from "../core/http.js";

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
  const ua = String(process.env.SEC_USER_AGENT ?? "");
  const m = ua.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  return m?.[0]?.toLowerCase() ?? null;
}

/**
 * Public: POST /api/waitlist { email }
 * No DB. Emails you the signup via FormSubmit (no Brevo login needed).
 */
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

  // Respond immediately — notify must not block UX or touch ingest workers.
  sendJson(res, 200, { ok: true });

  const to = notifyTo();
  if (!to) {
    console.warn("[waitlist] WAITLIST_NOTIFY_TO unset; signup not emailed", { email });
    return;
  }

  void notifyViaFormSubmit(to, email).catch((err) => console.error("[waitlist] notify_failed", err));
}

async function notifyViaFormSubmit(to: string, signupEmail: string) {
  // FormSubmit: free, no account. First hit emails `to` an activation link — click once.
  const url = `https://formsubmit.co/ajax/${encodeURIComponent(to)}`;
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      email: signupEmail,
      _subject: `Mercerline waitlist: ${signupEmail}`,
      _template: "table",
      message: `New waitlist signup: ${signupEmail}`,
      source: "mercerline.com/waitlist",
    }),
  });
  const text = await r.text().catch(() => "");
  if (!r.ok) {
    console.error("[waitlist] formsubmit_failed", r.status, text.slice(0, 400));
    return;
  }
  console.info("[waitlist] formsubmit_ok", { to, signupEmail, body: text.slice(0, 200) });
}
