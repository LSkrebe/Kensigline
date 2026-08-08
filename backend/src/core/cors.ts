import type http from "node:http";
import { frontendOrigin } from "../billing/config.js";

type ResWithCors = http.ServerResponse & { __corsOrigin?: string | null };

function allowedCorsOrigins(): Set<string> {
  const primary = frontendOrigin();
  const set = new Set<string>([primary, "http://localhost:5173", "http://127.0.0.1:5173"]);
  try {
    const u = new URL(primary);
    if (u.hostname === "mercerline.com") set.add("https://www.mercerline.com");
    if (u.hostname === "www.mercerline.com") set.add("https://mercerline.com");
  } catch {
    // ignore invalid FRONTEND_URL
  }
  for (const part of String(process.env.CORS_EXTRA_ORIGINS ?? "").split(",")) {
    const origin = part.trim().replace(/\/$/, "");
    if (origin) set.add(origin);
  }
  return set;
}

/** Reflect Origin only when it matches the app allowlist. No Origin → no ACAO (curl/bots/webhooks). */
export function resolveCorsOrigin(requestOrigin: string | string[] | undefined): string | null {
  const raw = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin;
  if (!raw) return null;
  const origin = raw.trim().replace(/\/$/, "");
  if (!origin) return null;
  return allowedCorsOrigins().has(origin) ? origin : null;
}

export function bindCorsOrigin(req: http.IncomingMessage, res: http.ServerResponse) {
  (res as ResWithCors).__corsOrigin = resolveCorsOrigin(req.headers.origin);
}

export function corsResponseHeaders(res: http.ServerResponse): Record<string, string> {
  const origin = (res as ResWithCors).__corsOrigin;
  const headers: Record<string, string> = {
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type,authorization",
  };
  if (origin) {
    headers["access-control-allow-origin"] = origin;
    headers["vary"] = "Origin";
  }
  return headers;
}
