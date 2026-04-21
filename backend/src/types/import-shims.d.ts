declare module "./lib/db.js" {
  export const pool: unknown;
  export const db: {
    query<T = any>(text: string, params?: any[]): Promise<T[]>;
    one<T = any>(text: string, params?: any[]): Promise<T | null>;
  };
}

declare module "./lib/sec.js" {
  export function enqueueLatestForm4ForTicker(opts: {
    ticker: string;
    limit?: number;
  }): Promise<{
    ticker: string;
    cik: string;
    found: number;
    enqueued: number;
    skipped_existing: number;
    queue_ids: string[];
  }>;
}

declare module "./lib/insider.js" {
  export function parseNextInsiderQueueItem(): Promise<any>;
}

declare module "./lib/http.js" {
  import type http from "node:http";
  export function sendJson(res: http.ServerResponse, status: number, body: unknown): void;
  export function notFound(res: http.ServerResponse): void;
  export function route(req: http.IncomingMessage, url: URL, method: string, pathname: string): boolean;
  export function json(req: http.IncomingMessage): Promise<any>;
}

