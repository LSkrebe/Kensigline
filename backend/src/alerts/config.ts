export function resendApiKey(): string | null {
  const key = String(process.env.RESEND_API_KEY ?? "").trim();
  return key || null;
}

export function resendFromAddress(): string {
  return String(process.env.RESEND_FROM ?? "research@mercerline.com").trim() || "research@mercerline.com";
}

export function resendConfigured(): boolean {
  return Boolean(resendApiKey());
}

export function frontendOrigin(): string {
  const u = String(process.env.FRONTEND_URL ?? process.env.APP_URL ?? "https://mercerline.com").trim();
  return u.replace(/\/$/, "");
}

export function digestTestRecipient(): string | null {
  const v = String(process.env.DIGEST_TEST_TO ?? "").trim();
  return v || null;
}

export function digestEnabled(): boolean {
  return String(process.env.DIGEST_ENABLED ?? "1").trim() !== "0";
}
