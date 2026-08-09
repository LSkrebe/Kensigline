import type http from "node:http";
import { db } from "../core/db.js";
import { json, sendJson } from "../core/http.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL = 254;

let tableReady: Promise<void> | null = null;

async function ensureWaitlistTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS waitlist_emails (
          email text PRIMARY KEY,
          created_at timestamptz NOT NULL DEFAULT now(),
          source text
        )
      `);
    })().catch((err) => {
      tableReady = null;
      throw err;
    });
  }
  await tableReady;
}

function normalizeEmail(raw: unknown): string | null {
  const email = String(raw ?? "")
    .trim()
    .toLowerCase();
  if (!email || email.length > MAX_EMAIL || !EMAIL_RE.test(email)) return null;
  return email;
}

/** Public: POST /api/waitlist { email } */
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

  const source = String(body.source ?? "waitlist")
    .trim()
    .slice(0, 64) || "waitlist";

  try {
    await ensureWaitlistTable();
    await db.query(
      `
      INSERT INTO waitlist_emails (email, source)
      VALUES ($1, $2)
      ON CONFLICT (email) DO NOTHING
      `,
      [email, source],
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn("[waitlist] join failed", msg);
    sendJson(res, 503, { ok: false, error: "waitlist_unavailable" });
    return;
  }

  sendJson(res, 200, { ok: true });
}
