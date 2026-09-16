import type http from "node:http";
import { corsResponseHeaders } from "./cors.js";

export function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    ...corsResponseHeaders(res),
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
}

export function notFound(res: http.ServerResponse) {
  sendJson(res, 404, { ok: false, error: "not_found" });
}

export function route(req: http.IncomingMessage, url: URL, method: string, pathname: string) {
  return req.method === method && url.pathname === pathname;
}

export async function readRawBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let bytes=0;
  for await (const chunk of req) {
    const buffer=Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk);
    bytes+=buffer.length;
    if(bytes>1024*1024)throw new Error("body_too_large");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export async function json(req: http.IncomingMessage): Promise<any> {
  const raw = (await readRawBody(req)).toString("utf8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("invalid_json_body");
  }
}

