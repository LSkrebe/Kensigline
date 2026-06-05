/**
 * Minimal RSS/Atom link extraction and HTML→plain text (no extra deps).
 */

let lastHttpAt = 0;
export async function rateLimitHttp(minMs = 800) {
  const now = Date.now();
  const wait = lastHttpAt + minMs - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastHttpAt = Date.now();
}

export function stripHtmlToText(html: string, maxLen = 500_000): string {
  let s = String(html ?? "");
  s = s.replace(/<script[\s\S]*?<\/script>/gi, " ");
  s = s.replace(/<style[\s\S]*?<\/style>/gi, " ");
  s = s.replace(/<[^>]+>/g, " ");
  s = s.replace(/&nbsp;/gi, " ");
  s = s.replace(/&amp;/gi, "&");
  s = s.replace(/&lt;/gi, "<");
  s = s.replace(/&gt;/gi, ">");
  s = s.replace(/&quot;/gi, '"');
  s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  s = s.replace(/\s+/g, " ").trim();
  return s.slice(0, maxLen);
}

export function resolveFeedUrl(href: string, feedPageUrl: string): string {
  const h = String(href ?? "").trim();
  if (!h) return "";
  try {
    return new URL(h, feedPageUrl).href;
  } catch {
    return h;
  }
}

/** Pull candidate article URLs from RSS 2.0 or Atom XML. */
export function extractLinksFromFeedXml(xml: string, feedPageUrl: string): { url: string; title: string | null }[] {
  const out: { url: string; title: string | null }[] = [];
  const seen = new Set<string>();

  // Atom: <entry> ... <link href="..." /> or <link>...</link>
  const entryBlocks = xml.split(/<entry[\s>]/i).slice(1);
  for (const block of entryBlocks) {
    const chunk = block.split(/<\/entry>/i)[0] ?? block;
    let link: string | null = null;
    const hrefM = chunk.match(/<link[^>]+href\s*=\s*["']([^"']+)["'][^>]*>/i);
    if (hrefM?.[1]) link = hrefM[1]!.trim();
    if (!link) {
      const lm = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
      if (lm?.[1]) link = lm[1]!.replace(/<[^>]+>/g, "").trim();
    }
    const tm = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = tm?.[1] ? stripHtmlToText(tm[1], 500) : null;
    if (link) {
      const u = resolveFeedUrl(link, feedPageUrl);
      if (u.startsWith("http") && !seen.has(u)) {
        seen.add(u);
        out.push({ url: u, title });
      }
    }
  }

  // RSS 2.0: <item> ... <link>...</link>
  const itemBlocks = xml.split(/<item[\s>]/i).slice(1);
  for (const block of itemBlocks) {
    const chunk = block.split(/<\/item>/i)[0] ?? block;
    const lm = chunk.match(/<link[^>]*>([\s\S]*?)<\/link>/i);
    let link = lm?.[1] ? lm[1]!.replace(/<[^>]+>/g, "").trim() : null;
    if (!link) {
      const guid = chunk.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
      if (guid?.[1]) link = guid[1]!.replace(/<[^>]+>/g, "").trim();
    }
    const tm = chunk.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = tm?.[1] ? stripHtmlToText(tm[1], 500) : null;
    if (link) {
      const u = resolveFeedUrl(link, feedPageUrl);
      if (u.startsWith("http") && !seen.has(u)) {
        seen.add(u);
        out.push({ url: u, title });
      }
    }
  }

  return out;
}

export async function fetchFeedXml(feedUrl: string): Promise<string> {
  await rateLimitHttp();
  const ua = String(process.env.RESEARCH_HTTP_USER_AGENT ?? process.env.BOSHA_HTTP_USER_AGENT ?? "Kensigline-Research/1.0 (+research)").trim();
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(feedUrl, {
      signal: ctrl.signal,
      headers: {
        "user-agent": ua,
        accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) throw new Error(`feed_http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(kill);
  }
}

export async function fetchArticleHtml(url: string): Promise<string> {
  await rateLimitHttp();
  const ua = String(process.env.RESEARCH_HTTP_USER_AGENT ?? process.env.BOSHA_HTTP_USER_AGENT ?? "Kensigline-Research/1.0 (+research)").trim();
  const ctrl = new AbortController();
  const kill = setTimeout(() => ctrl.abort(), 35_000);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: ctrl.signal,
      headers: {
        "user-agent": ua,
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!res.ok) throw new Error(`article_http_${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(kill);
  }
}

/** Guess ticker from headline/snippet (best-effort). */
export function guessTickerFromText(title: string | null, bodySample: string): string | null {
  const t = `${title ?? ""} ${bodySample}`.toUpperCase();
  const m = t.match(/\b(NASDAQ|NYSE|AMEX)\s*:\s*([A-Z]{1,5})\b/);
  if (m?.[2]) return m[2]!;
  const m2 = t.match(/\(([A-Z]{1,5})\)/);
  if (m2?.[1] && m2[1].length >= 2 && m2[1].length <= 5) return m2[1]!;
  return null;
}

/** Yahoo Finance headline RSS for a symbol (used for dynamic per-ticker feeds). */
export function yahooHeadlineFeedUrl(ticker: string): string {
  const s = encodeURIComponent(ticker.trim().toUpperCase());
  return `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${s}&region=US&lang=en-US`;
}

/** Google News RSS search aimed at earnings-call / transcript coverage for a symbol. */
export function googleNewsTranscriptFeedUrl(ticker: string): string {
  const t = ticker.trim().toUpperCase();
  const q = `${t} stock earnings call OR transcript OR quarterly results`;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
}
