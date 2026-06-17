import type http from "node:http";
import * as jose from "jose";

export type SupabaseJwtUser = { sub: string; email: string | null; billingExempt: boolean };

function jwtIssuer(): string | null {
  const explicit = String(process.env.SUPABASE_JWT_ISSUER ?? "").trim();
  if (explicit) return explicit;
  const base = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return `${base}/auth/v1`;
}

/** JWKS URL per https://supabase.com/docs/guides/auth/jwts */
function jwksUrlFromEnv(): URL | null {
  const custom = String(process.env.SUPABASE_JWKS_URL ?? "").trim();
  if (custom) {
    try {
      return new URL(custom);
    } catch {
      return null;
    }
  }
  const base = String(process.env.SUPABASE_URL ?? "").trim().replace(/\/$/, "");
  if (!base) return null;
  return new URL(`${base}/auth/v1/.well-known/jwks.json`);
}

let jwksMemo: { href: string; jwks: ReturnType<typeof jose.createRemoteJWKSet> } | null = null;

function remoteJwks(): ReturnType<typeof jose.createRemoteJWKSet> | null {
  const u = jwksUrlFromEnv();
  if (!u) return null;
  const href = u.href;
  if (!jwksMemo || jwksMemo.href !== href) {
    jwksMemo = { href, jwks: jose.createRemoteJWKSet(u) };
  }
  return jwksMemo.jwks;
}

export function bearerToken(req: http.IncomingMessage): string | null {
  const raw = req.headers.authorization;
  if (!raw || typeof raw !== "string") return null;
  const m = raw.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return m?.[1] ?? null;
}

function billingExemptFromAppMetadata(meta: unknown): boolean {
  if (!meta || typeof meta !== "object") return false;
  const m = meta as Record<string, unknown>;
  if (m.billing_exempt === true) return true;
  if (String(m.role ?? "").trim().toLowerCase() === "owner") return true;
  return false;
}

function payloadToUser(payload: jose.JWTPayload): SupabaseJwtUser | null {
  const sub = String(payload.sub ?? "");
  if (!sub) return null;
  const email = payload.email != null ? String(payload.email) : null;
  const billingExempt = billingExemptFromAppMetadata(payload.app_metadata);
  return { sub, email, billingExempt };
}

const verifyOpts = (issuer: string) => ({
  issuer,
  audience: "authenticated" as const,
});

/**
 * Verifies a Supabase Auth access JWT.
 * - Asymmetric keys (ES256, etc.): JWKS at `{SUPABASE_URL}/auth/v1/.well-known/jwks.json` (see Supabase JWT docs).
 * - Legacy HS256: optional `SUPABASE_JWT_SECRET` fallback.
 */
export async function verifySupabaseAccessToken(token: string): Promise<SupabaseJwtUser | null> {
  if (!token) return null;
  const issuer = jwtIssuer();
  if (!issuer) return null;

  const jwks = remoteJwks();
  if (jwks) {
    try {
      const { payload } = await jose.jwtVerify(token, jwks, verifyOpts(issuer));
      return payloadToUser(payload);
    } catch {
      /* try legacy below */
    }
  }

  const secret = String(process.env.SUPABASE_JWT_SECRET ?? "").trim();
  if (!secret) return null;
  try {
    const { payload } = await jose.jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ["HS256"],
      ...verifyOpts(issuer),
    });
    return payloadToUser(payload);
  } catch {
    return null;
  }
}

export function supabaseAuthConfigured(): boolean {
  if (!jwtIssuer()) return false;
  if (jwksUrlFromEnv()) return true;
  return Boolean(String(process.env.SUPABASE_JWT_SECRET ?? "").trim());
}
