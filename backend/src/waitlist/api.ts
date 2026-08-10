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

/**
 * Public: POST /api/waitlist { email }
 * Kept as a lightweight ack. Real notify is browser → FormSubmit (see WaitlistPage)
 * so we don't depend on Brevo login or datacenter IPs hitting CF-challenged endpoints.
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

  sendJson(res, 200, { ok: true });
}
