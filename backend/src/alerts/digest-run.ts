import { digestEnabled, resendConfigured } from "./config.js";
import {
  buildDigestContent,
  digestHasContent,
  digestItemCount,
  type DigestContent,
} from "./digest-content.js";
import {
  buildDigestEmail,
  buildDigestPlainText,
  buildDigestSubject,
} from "./digest-email.js";
import { sendResendEmail } from "./resend.js";
import {
  listEnabledAlertPreferences,
  localDateKey,
  logDigestSent,
  wasDigestSent,
} from "./store.js";

export type DigestRunResult = {
  ok: boolean;
  sent: number;
  skipped: number;
  failed: number;
  reason?: string;
  test?: boolean;
  messageId?: string;
};

async function sendDigestToEmail(email: string, content: DigestContent) {
  const bundle = buildDigestEmail(content);
  const result = await sendResendEmail({
    to: email,
    subject: buildDigestSubject(content),
    html: bundle.html,
    text: buildDigestPlainText(content),
    attachments: bundle.attachments,
  });
  if (!result.ok) {
    throw new Error(`${result.error} (${result.status})`);
  }
  return result.id;
}

/**
 * Activity-driven brief: when the hourly job finds real disclosures, email every
 * opted-in user once for that local calendar day. No morning-hour gate — if
 * nothing filed (or only quiet fallback), we skip entirely.
 */
export async function runDailyDigest(opts?: {
  testEmail?: string;
  force?: boolean;
  now?: Date;
  content?: DigestContent;
}): Promise<DigestRunResult> {
  if (!digestEnabled()) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, reason: "digest_disabled" };
  }
  if (!resendConfigured()) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, reason: "resend_not_configured" };
  }

  const content = opts?.content ?? (await buildDigestContent());
  if (!digestHasContent(content)) {
    return { ok: true, sent: 0, skipped: 0, failed: 0, reason: "empty_or_quiet" };
  }

  const testEmail = String(opts?.testEmail ?? "").trim();
  if (testEmail) {
    const messageId = await sendDigestToEmail(testEmail, content);
    return { ok: true, sent: 1, skipped: 0, failed: 0, test: true, messageId };
  }

  const now = opts?.now ?? new Date();
  const enabled = await listEnabledAlertPreferences();

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of enabled) {
    const tz = row.timezone || "UTC";
    // One brief per local day when activity exists — not a fixed morning slot.
    const slotKey = `activity:${localDateKey(tz, now)}`;
    if (!opts?.force && (await wasDigestSent(row.user_id, slotKey))) {
      skipped += 1;
      continue;
    }

    try {
      await sendDigestToEmail(row.email, content);
      await logDigestSent(row.user_id, slotKey, digestItemCount(content));
      sent += 1;
    } catch (err) {
      failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      console.warn("[digest] send_failed", { user_id: row.user_id, email: row.email, error: msg });
    }
  }

  return { ok: failed === 0, sent, skipped, failed };
}
