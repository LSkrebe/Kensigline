import type { IdeaCandidate } from "./candidates.js";
import type { DigestSection } from "./digest-collect.js";
import type { TickerAlertItem } from "./ticker-email.js";
import type { ActorAlertItem } from "./actor-email.js";

export function frontendBase(): string {
  return String(process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/$/, "");
}

export function emailLogoUrl(): string {
  return `${frontendBase()}/mercerline_logo.png`;
}

export function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function parseFromAddress(raw: string): { name?: string; email: string } {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m?.[1] && m[2]) return { name: m[1].trim(), email: m[2].trim() };
  return { email: s };
}

const FEED_LABELS: Record<string, string> = {
  research: "Market",
  insider: "Insider",
  politicians: "Politicians",
  institutions: "Institutions",
};

export function feedLabel(feed: string): string {
  const f = String(feed ?? "").trim().toLowerCase();
  return FEED_LABELS[f] ?? (f ? f.charAt(0).toUpperCase() + f.slice(1) : "Research");
}

function scoreBadge(score: number, best: boolean): string {
  const bg = best ? "rgba(120,200,255,0.18)" : "rgba(255,255,255,0.08)";
  const color = best ? "#a8dcff" : "rgba(255,255,255,0.72)";
  const label = best ? "TOP" : String(score);
  return `<span style="display:inline-block;min-width:28px;padding:2px 7px;border-radius:999px;background:${bg};color:${color};font-size:10px;font-weight:700;letter-spacing:0.06em;text-align:center;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(label)}</span>`;
}

function emailShell(opts: { preheader: string; title: string; lead: string; body: string }): string {
  const logo = escapeHtml(emailLogoUrl());
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(opts.title)}</title>
</head>
<body style="margin:0;padding:0;background:#050505;color:#e8e8e8;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#050505;">
    <tr>
      <td align="center" style="padding:28px 14px 36px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border:1px solid rgba(255,255,255,0.09);border-radius:14px;background:linear-gradient(180deg,#101010 0%,#0a0a0a 100%);overflow:hidden;">
          <tr>
            <td style="padding:22px 24px 18px;border-bottom:1px solid rgba(255,255,255,0.07);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logo}" width="28" height="28" alt="Mercerline" style="display:inline-block;vertical-align:middle;border:0;" />
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:ui-monospace,Menlo,monospace;font-size:13px;font-weight:600;letter-spacing:0.18em;color:#ffffff;">MERCERLINE</span>
                  </td>
                </tr>
              </table>
              <h1 style="margin:16px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:20px;font-weight:600;line-height:1.25;color:#ffffff;">${escapeHtml(opts.title)}</h1>
              <p style="margin:8px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.5;color:rgba(255,255,255,0.48);">${escapeHtml(opts.lead)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 24px 24px;">${opts.body}</td>
          </tr>
          <tr>
            <td style="padding:0 24px 22px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;line-height:1.45;color:rgba(255,255,255,0.32);">
              You are receiving this because alerts are enabled on your Mercerline account.
              <a href="${escapeHtml(frontendBase())}" style="color:rgba(170,220,255,0.85);text-decoration:none;">Open terminal</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function ideaCardHtml(it: IdeaCandidate): string {
  const url = escapeHtml(it.url ?? frontendBase());
  const title = escapeHtml(it.title || `${it.ticker} signal`);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 10px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
    <tr>
      <td style="padding:14px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="vertical-align:top;">
              <a href="${url}" style="font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;">${escapeHtml(it.ticker)}</a>
              <div style="margin-top:4px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:12px;color:rgba(255,255,255,0.42);">${escapeHtml(title)}</div>
            </td>
            <td style="vertical-align:top;text-align:right;white-space:nowrap;padding-left:12px;">
              ${scoreBadge(it.idea_score, it.idea_best)}
            </td>
          </tr>
        </table>
        <p style="margin:10px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.55;color:rgba(255,255,255,0.78);">${escapeHtml(it.summary)}</p>
        <p style="margin:10px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;">
          <a href="${url}" style="color:rgba(170,220,255,0.9);text-decoration:none;">View in terminal →</a>
        </p>
      </td>
    </tr>
  </table>`;
}

function sectionHeading(title: string, subtitle: string | undefined, first: boolean): string {
  return `
  <div style="margin:${first ? "0" : "18px"} 0 10px;">
    <div style="font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.55);">${escapeHtml(title)}</div>
    ${subtitle ? `<div style="margin-top:3px;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;color:rgba(255,255,255,0.35);">${escapeHtml(subtitle)}</div>` : ""}
  </div>`;
}

export function renderDigestHtml(sections: DigestSection[], slotLabel?: string): string {
  const total = sections.reduce((n, s) => n + s.items.length, 0);
  const body = sections
    .map((sec, i) => `${sectionHeading(sec.title, sec.subtitle, i === 0)}${sec.items.map(ideaCardHtml).join("")}`)
    .join("");
  return emailShell({
    preheader: `${total} idea${total === 1 ? "" : "s"} across market and standout flows`,
    title: slotLabel ? `Idea digest · ${slotLabel}` : "Idea digest",
    lead: "Top market signals plus exceptional flow activity when it stands out.",
    body,
  });
}

export function renderDigestText(sections: DigestSection[]): string {
  const lines: string[] = ["Mercerline idea digest", ""];
  for (const sec of sections) {
    lines.push(sec.title.toUpperCase());
    if (sec.subtitle) lines.push(sec.subtitle);
    for (const it of sec.items) {
      lines.push(`${it.ticker} (${feedLabel(it.feed)}, ${it.idea_score}) - ${it.summary}`);
      if (it.url) lines.push(it.url);
      lines.push("");
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

export function renderTickerAlertHtml(items: TickerAlertItem[]): string {
  const blocks = items
    .map((it) => {
      const url = escapeHtml(it.url ?? frontendBase());
      const link = `<a href="${url}" style="font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;">${escapeHtml(it.ticker)}</a>`;
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(170,220,255,0.72);margin-bottom:6px;">${escapeHtml(feedLabel(it.feed))}</div>
            <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">${link} · ${escapeHtml(it.title)}</div>
            <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${escapeHtml(it.context)}</p>
            <p style="margin:12px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;">
              <a href="${url}" style="color:rgba(170,220,255,0.9);text-decoration:none;">Open document →</a>
            </p>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const preheader =
    items.length === 1 && items[0]
      ? `New context for ${items[0].ticker}`
      : `${items.length} new ticker alert${items.length === 1 ? "" : "s"}`;

  return emailShell({
    preheader,
    title: items.length === 1 && items[0] ? `${items[0].ticker} alert` : "Ticker alerts",
    lead: "Document analysis from a company on your watchlist.",
    body: blocks,
  });
}

export function renderTickerAlertText(items: TickerAlertItem[]): string {
  const blocks = items.map(
    (it) =>
      `${it.ticker} (${feedLabel(it.feed)})\n${it.title}\n\n${it.context}\n${it.url ?? ""}`.trim(),
  );
  return `Mercerline ticker alert\n\n${blocks.join("\n\n---\n\n")}`;
}

function actorModeLabel(mode: string): string {
  if (mode === "politicians") return "Politician";
  if (mode === "institutions") return "Institution";
  return "Insider";
}

export function renderActorAlertHtml(items: ActorAlertItem[]): string {
  const blocks = items
    .map((it) => {
      const url = it.url ? escapeHtml(it.url) : escapeHtml(frontendBase());
      const actor = escapeHtml(it.actor_name);
      const ticker = escapeHtml(it.ticker);
      return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(170,220,255,0.72);margin-bottom:6px;">${escapeHtml(actorModeLabel(it.mode))}</div>
            <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">${actor} · ${ticker} · ${escapeHtml(it.title)}</div>
            <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${escapeHtml(it.context)}</p>
            <p style="margin:12px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;">
              <a href="${url}" style="color:rgba(170,220,255,0.9);text-decoration:none;">Open in Mercerline →</a>
            </p>
          </td>
        </tr>
      </table>`;
    })
    .join("");

  const preheader =
    items.length === 1 && items[0]
      ? `New activity for ${items[0].actor_name}`
      : `${items.length} new investor alert${items.length === 1 ? "" : "s"}`;

  return emailShell({
    preheader,
    title: items.length === 1 && items[0] ? `${items[0].actor_name} alert` : "Investor alerts",
    lead: "New transaction activity for someone on your investor watchlist.",
    body: blocks,
  });
}

export function renderActorAlertText(items: ActorAlertItem[]): string {
  const blocks = items.map(
    (it) =>
      `${it.actor_name} (${actorModeLabel(it.mode)}) · ${it.ticker}\n${it.title}\n\n${it.context}\n${it.url ?? ""}`.trim(),
  );
  return `Mercerline investor alert\n\n${blocks.join("\n\n---\n\n")}`;
}

function tickerAlertBlockHtml(it: TickerAlertItem): string {
  const url = escapeHtml(it.url ?? frontendBase());
  const link = `<a href="${url}" style="font-family:ui-monospace,Menlo,monospace;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;letter-spacing:0.06em;">${escapeHtml(it.ticker)}</a>`;
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(170,220,255,0.72);margin-bottom:6px;">${escapeHtml(feedLabel(it.feed))}</div>
            <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">${link} · ${escapeHtml(it.title)}</div>
            <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${escapeHtml(it.context)}</p>
            <p style="margin:12px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;">
              <a href="${url}" style="color:rgba(170,220,255,0.9);text-decoration:none;">Open document →</a>
            </p>
          </td>
        </tr>
      </table>`;
}

function actorAlertBlockHtml(it: ActorAlertItem): string {
  const url = it.url ? escapeHtml(it.url) : escapeHtml(frontendBase());
  const actor = escapeHtml(it.actor_name);
  const ticker = escapeHtml(it.ticker);
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;border:1px solid rgba(255,255,255,0.08);border-radius:10px;background:rgba(255,255,255,0.02);">
        <tr>
          <td style="padding:14px 16px;">
            <div style="font-family:ui-monospace,Menlo,monospace;font-size:9px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(170,220,255,0.72);margin-bottom:6px;">${escapeHtml(actorModeLabel(it.mode))}</div>
            <div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:14px;font-weight:600;color:#ffffff;margin-bottom:10px;">${actor} · ${ticker} · ${escapeHtml(it.title)}</div>
            <p style="margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:13px;line-height:1.6;color:rgba(255,255,255,0.78);">${escapeHtml(it.context)}</p>
            <p style="margin:12px 0 0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:11px;">
              <a href="${url}" style="color:rgba(170,220,255,0.9);text-decoration:none;">Open in Mercerline →</a>
            </p>
          </td>
        </tr>
      </table>`;
}

export function renderCombinedContextAlertHtml(tickers: TickerAlertItem[], actors: ActorAlertItem[]): string {
  const parts: string[] = [];
  let first = true;
  if (tickers.length) {
    parts.push(sectionHeading("Companies", `${tickers.length} new`, first));
    parts.push(...tickers.map(tickerAlertBlockHtml));
    first = false;
  }
  if (actors.length) {
    parts.push(sectionHeading("Investors", `${actors.length} new`, first));
    parts.push(...actors.map(actorAlertBlockHtml));
  }

  const total = tickers.length + actors.length;
  const preheader =
    total === 1 && tickers[0]
      ? `New context for ${tickers[0].ticker}`
      : total === 1 && actors[0]
        ? `New activity for ${actors[0].actor_name}`
        : `${total} new watchlist alert${total === 1 ? "" : "s"}`;

  return emailShell({
    preheader,
    title: total === 1 ? "Watchlist alert" : "Watchlist alerts",
    lead: "New document context for companies and investors on your watchlist.",
    body: parts.join(""),
  });
}

export function renderCombinedContextAlertText(tickers: TickerAlertItem[], actors: ActorAlertItem[]): string {
  const lines: string[] = ["Mercerline watchlist alerts", ""];
  if (tickers.length) {
    lines.push("COMPANIES");
    lines.push(renderTickerAlertText(tickers).replace(/^Mercerline ticker alert\n\n/, ""));
    lines.push("");
  }
  if (actors.length) {
    lines.push("INVESTORS");
    lines.push(renderActorAlertText(actors).replace(/^Mercerline investor alert\n\n/, ""));
  }
  return lines.join("\n").trim();
}

export async function sendBrevoEmail(opts: {
  to: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  logTag: string;
  replyTo?: { email: string; name?: string } | null;
}): Promise<boolean> {
  const apiKey = String(process.env.BREVO_API_KEY ?? "").trim();
  const fromRaw = String(process.env.ALERT_EMAIL_FROM ?? "Mercerline <alerts@mercerline.com>").trim();
  if (!apiKey) {
    console.warn(`[alerts] BREVO_API_KEY not set; ${opts.logTag} skipped`, { to: opts.to });
    return false;
  }

  const sender = parseFromAddress(fromRaw);
  const payload: Record<string, unknown> = {
    sender,
    to: [{ email: opts.to }],
    subject: opts.subject,
    htmlContent: opts.htmlContent,
    textContent: opts.textContent,
  };
  if (opts.replyTo?.email) {
    payload.replyTo = {
      email: opts.replyTo.email,
      ...(opts.replyTo.name ? { name: opts.replyTo.name } : {}),
    };
  }

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error(`[alerts] brevo_${opts.logTag}_failed`, r.status, body.slice(0, 500));
    return false;
  }
  return true;
}
