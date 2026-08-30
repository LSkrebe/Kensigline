import type http from "node:http";

function configuredContentApiKey(): string {
  return String(process.env.CONTENT_API_KEY ?? "").trim();
}

function keyFromQuery(url: URL | null | undefined): string {
  if (!url) return "";
  return String(url.searchParams.get("key") ?? url.searchParams.get("content_api_key") ?? "").trim();
}

/** Private content/distribution API — Bearer, header, or query key (for Hermes preview). */
export function contentApiAuthorized(req: http.IncomingMessage, url?: URL | null): boolean {
  const key = configuredContentApiKey();
  if (!key) return false;

  const auth = String(req.headers.authorization ?? "").trim();
  if (auth === `Bearer ${key}`) return true;

  const header = String(req.headers["x-content-api-key"] ?? "").trim();
  if (header === key) return true;

  const queryKey = keyFromQuery(url);
  return queryKey === key;
}

export function contentApiConfigured(): boolean {
  return Boolean(configuredContentApiKey());
}
