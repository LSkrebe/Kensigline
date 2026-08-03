import type http from "node:http";
import { json, sendJson } from "../core/http.js";
import { bearerToken, verifySupabaseAccessToken } from "../core/supabase-auth.js";
import { escapeHtml, parseFromAddress, sendBrevoEmail } from "../alerts/email-layout.js";
import { getBillingByUserId } from "../billing/store.js";

const MAX_MESSAGE = 4000;
const MAX_PER_DAY = 5;

/** In-memory soft rate limit (per process). */
const sentByUser = new Map<string, number[]>();

function foundersInbox(): string | null {
  const override = String(process.env.SUPPORT_INBOX ?? "").trim();
  if (override) return override;
  const fromRaw = String(process.env.ALERT_EMAIL_FROM ?? "").trim();
  if (!fromRaw) return null;
  const parsed = parseFromAddress(fromRaw);
  return parsed.email || null;
}

function pruneAndCount(userId: string): number {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const prev = sentByUser.get(userId) ?? [];
  const next = prev.filter((t) => now - t < dayMs);
  sentByUser.set(userId, next);
  return next.length;
}

function recordSend(userId: string) {
  const arr = sentByUser.get(userId) ?? [];
  arr.push(Date.now());
  sentByUser.set(userId, arr);
}

export async function handleSupportContact(req: http.IncomingMessage, res: http.ServerResponse) {
  const tok = bearerToken(req);
  if (!tok) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const user = await verifySupabaseAccessToken(tok);
  if (!user?.sub) {
    sendJson(res, 401, { ok: false, error: "unauthorized" });
    return;
  }
  const userEmail = user.email ? String(user.email).trim() : "";
  if (!userEmail) {
    sendJson(res, 400, { ok: false, error: "email_required" });
    return;
  }

  const inbox = foundersInbox();
  if (!inbox) {
    sendJson(res, 503, { ok: false, error: "support_not_configured" });
    return;
  }

  if (pruneAndCount(user.sub) >= MAX_PER_DAY) {
    sendJson(res, 429, { ok: false, error: "rate_limited" });
    return;
  }

  let body: Record<string, unknown>;
  try {
    body = ((await json(req)) as Record<string, unknown>) ?? {};
  } catch {
    sendJson(res, 400, { ok: false, error: "invalid_json" });
    return;
  }

  const message = String(body.message ?? "").trim();
  if (!message) {
    sendJson(res, 400, { ok: false, error: "message_required" });
    return;
  }
  if (message.length > MAX_MESSAGE) {
    sendJson(res, 400, { ok: false, error: "message_too_long" });
    return;
  }

  let billingStatus = "none";
  let billingPlan: string | null = null;
  try {
    const acct = await getBillingByUserId(user.sub);
    if (acct) {
      billingStatus = String(acct.status ?? "none");
      billingPlan = acct.plan ? String(acct.plan) : null;
    }
  } catch {
    /* ignore */
  }

  const billingShort = billingPlan ? `${billingStatus}/${billingPlan}` : billingStatus;
  // Fixed inbox-friendly subject — user text is body only.
  const mailSubject = `[Mercerline] Support · ${userEmail} · ${billingShort}`;
  const billingLine = `Billing: ${billingShort}`;

  const textContent = [
    "New Mercerline support message",
    "",
    `From: ${userEmail}`,
    `User id: ${user.sub}`,
    billingLine,
    "",
    message,
    "",
    "Reply directly to this email to reach the user.",
  ].join("\n");

  const htmlContent = `
    <div style="font-family:ui-sans-serif,system-ui,sans-serif;line-height:1.5;color:#111">
      <p style="margin:0 0 12px"><strong>New Mercerline support message</strong></p>
      <p style="margin:0 0 4px"><strong>From:</strong> ${escapeHtml(userEmail)}</p>
      <p style="margin:0 0 4px"><strong>User id:</strong> <code>${escapeHtml(user.sub)}</code></p>
      <p style="margin:0 0 12px"><strong>${escapeHtml(billingLine)}</strong></p>
      <div style="white-space:pre-wrap;border-top:1px solid #ddd;padding-top:12px">${escapeHtml(message)}</div>
      <p style="margin:16px 0 0;color:#666;font-size:13px">Reply directly to this email to reach the user.</p>
    </div>
  `.trim();

  const ok = await sendBrevoEmail({
    to: inbox,
    subject: mailSubject,
    htmlContent,
    textContent,
    logTag: "support_contact",
    replyTo: { email: userEmail },
  });

  if (!ok) {
    sendJson(res, 502, { ok: false, error: "send_failed" });
    return;
  }

  recordSend(user.sub);
  sendJson(res, 200, { ok: true });
}
