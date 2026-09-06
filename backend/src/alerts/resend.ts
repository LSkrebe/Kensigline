import { resendApiKey, resendFromAddress } from "./config.js";

export type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; status: number; error: string };

export async function sendResendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = resendApiKey();
  if (!apiKey) {
    return { ok: false, status: 503, error: "resend_not_configured" };
  }

  const to = Array.isArray(input.to) ? input.to : [input.to];
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFromAddress(),
      to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      reply_to: input.replyTo ?? resendFromAddress(),
    }),
  });

  const data = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: String(data?.message ?? `resend_http_${res.status}`),
    };
  }

  return { ok: true, id: String(data?.id ?? "") };
}
