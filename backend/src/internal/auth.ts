import type http from "node:http";

/** Private content/distribution API — Bearer token or X-Content-Api-Key header. */
export function contentApiAuthorized(req: http.IncomingMessage): boolean {
  const key = String(process.env.CONTENT_API_KEY ?? "").trim();
  if (!key) return false;

  const auth = String(req.headers.authorization ?? "").trim();
  if (auth === `Bearer ${key}`) return true;

  const header = String(req.headers["x-content-api-key"] ?? "").trim();
  return header === key;
}

export function contentApiConfigured(): boolean {
  return Boolean(String(process.env.CONTENT_API_KEY ?? "").trim());
}
