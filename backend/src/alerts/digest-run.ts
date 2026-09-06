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
  localHour,
  logDigestSent,
  type AlertPreferencesRow,
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

function recipientsDueNow(rows: AlertPreferencesRow[], now = new Date()) {
  return rows.filter((row) => {
    const tz = row.timezone || "UTC";
    const hour = localHour(tz, now);
    return hour === row.morning_hour;
  });
}

export async function runDailyDigest(opts?: {
  testEmail?: string;
  force?: boolean;
  now?: Date;
}): Promise<DigestRunResult> {
  if (!digestEnabled()) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, reason: "digest_disabled" };
  }
  if (!resendConfigured()) {
    return { ok: false, sent: 0, skipped: 0, failed: 0, reason: "resend_not_configured" };
  }

  const content = await buildDigestContent();
  if (!digestHasContent(content)) {
    return { ok: true, sent: 0, skipped: 0, failed: 0, reason: "empty_day" };
  }

  const testEmail = String(opts?.testEmail ?? "").trim();
  if (testEmail) {
    const messageId = await sendDigestToEmail(testEmail, content);
    return { ok: true, sent: 1, skipped: 0, failed: 0, test: true, messageId };
  }

  const now = opts?.now ?? new Date();
  const enabled = await listEnabledAlertPreferences();
  const due = opts?.force ? enabled : recipientsDueNow(enabled, now);

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of due) {
    const tz = row.timezone || "UTC";
    const slotKey = `daily:${localDateKey(tz, now)}`;
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
