/** Supabase Auth Admin API (service role) — user provisioning + magic-link tokens. */

function adminConfig(): { url: string; key: string } | null {
  const url = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

export function supabaseAdminConfigured(): boolean {
  return adminConfig() !== null;
}

async function adminFetch(path: string, init?: RequestInit): Promise<Response> {
  const cfg = adminConfig();
  if (!cfg) throw new Error("supabase_admin_not_configured");
  return fetch(`${cfg.url}/auth/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.key}`,
      apikey: cfg.key,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

export async function findSupabaseUserIdByEmail(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const res = await adminFetch(`/admin/users?email=${encodeURIComponent(normalized)}`);
  if (!res.ok) return null;
  const data = (await res.json()) as { users?: { id?: string }[] };
  const id = data?.users?.[0]?.id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

export async function createSupabaseUser(email: string): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const res = await adminFetch("/admin/users", {
    method: "POST",
    body: JSON.stringify({ email: normalized, email_confirm: true }),
  });
  if (res.ok) {
    const data = (await res.json()) as { id?: string };
    return typeof data?.id === "string" ? data.id : null;
  }
  if (res.status === 422) {
    return findSupabaseUserIdByEmail(normalized);
  }
  console.warn("[supabase-admin] create user failed", res.status, await res.text());
  return findSupabaseUserIdByEmail(normalized);
}

export async function ensureSupabaseUserForEmail(email: string): Promise<string | null> {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const existing = await findSupabaseUserIdByEmail(normalized);
  if (existing) return existing;
  return createSupabaseUser(normalized);
}

export type MagicLinkTokens = {
  token_hash: string;
  email: string;
};

export async function generateMagicLinkToken(email: string): Promise<MagicLinkTokens | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;
  const res = await adminFetch("/admin/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email: normalized }),
  });
  if (!res.ok) {
    console.warn("[supabase-admin] generate_link failed", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as {
    hashed_token?: string;
    properties?: { hashed_token?: string };
  };
  const token_hash = data?.hashed_token ?? data?.properties?.hashed_token;
  if (typeof token_hash !== "string" || !token_hash.trim()) return null;
  return { token_hash: token_hash.trim(), email: normalized };
}
