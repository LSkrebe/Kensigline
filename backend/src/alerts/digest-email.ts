import { frontendOrigin } from "./config.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDigestDate(dayKey: string): string {
  const d = new Date(`${dayKey}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return dayKey;
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function eventUrl(slide: DigestSlide): string {
  const base = frontendOrigin();
  const id = encodeURIComponent(slide.id);
  return `${base}/explore/events/${id}`;
}

function moveColor(moveUp: boolean): string {
  return moveUp ? "#5cb88a" : "#d4726a";
}

function renderHeroCard(slide: DigestSlide, index: number): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:${moveColor(slide.moveUp)};letter-spacing:0.02em;">${escHtml(slide.moveLabel)}</span>`
    : "";
  const ticker = slide.ticker
    ? `<span style="display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(168,196,255,0.92);border:1px solid rgba(168,196,255,0.28);padding:3px 7px;margin-right:8px;">${escHtml(slide.ticker)}</span>`
    : "";

  return `
    <tr>
      <td style="padding:${index === 0 ? "0" : "14px"} 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid rgba(255,255,255,0.10);background:linear-gradient(180deg,rgba(255,255,255,0.035) 0%,rgba(255,255,255,0.015) 100%);">
          <tr>
            <td style="padding:20px 22px 18px 22px;">
              <p style="margin:0 0 10px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.42);">${escHtml(slide.kicker)}</p>
              <h2 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.28;font-weight:400;color:rgba(255,255,255,0.94);">
                <a href="${url}" style="color:rgba(255,255,255,0.94);text-decoration:none;">${escHtml(slide.headline)}</a>
              </h2>
              <p style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:rgba(255,255,255,0.68);">${escHtml(slide.summary)}</p>
              <p style="margin:0;font-size:0;line-height:0;">${ticker}${move}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderHeadlineRow(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${moveColor(slide.moveUp)};white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:rgba(255,255,255,0.28);">—</span>`;

  return `
    <tr>
      <td style="padding:14px 0;border-bottom:1px solid rgba(255,255,255,0.07);">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td style="width:72px;vertical-align:top;padding-right:12px;">
              <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:rgba(168,196,255,0.78);">${escHtml(slide.ticker || "—")}</span>
            </td>
            <td style="vertical-align:top;padding-right:12px;">
              <p style="margin:0 0 4px 0;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.34);">${escHtml(slide.kicker)}</p>
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.42;color:rgba(255,255,255,0.86);">
                <a href="${url}" style="color:rgba(255,255,255,0.86);text-decoration:none;">${escHtml(slide.headline)}</a>
              </p>
            </td>
            <td style="width:64px;vertical-align:top;text-align:right;">${move}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildDigestSubject(content: DigestContent): string {
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  return `Mercerline · ${label}`;
}

export function buildDigestPreheader(content: DigestContent): string {
  const first = content.heroSlides[0] ?? content.headlineSlides[0];
  if (!first) return "Your daily market intelligence briefing.";
  const bits = [first.headline, first.summary].filter(Boolean);
  const text = bits.join(" — ");
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function buildDigestPlainText(content: DigestContent): string {
  const lines: string[] = [];
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  lines.push(`Mercerline Daily — ${label}`);
  lines.push("");
  lines.push("Today's top stories");
  lines.push("");

  for (const slide of content.heroSlides) {
    lines.push(slide.kicker.toUpperCase());
    lines.push(slide.headline);
    if (slide.summary) lines.push(slide.summary);
    if (slide.ticker) lines.push(`${slide.ticker}${slide.moveLabel ? ` · ${slide.moveLabel}` : ""}`);
    lines.push(eventUrl(slide));
    lines.push("");
  }

  if (content.headlineSlides.length) {
    lines.push("Also on the tape");
    lines.push("");
    for (const slide of content.headlineSlides) {
      lines.push(`${slide.ticker || "—"} · ${slide.headline}${slide.moveLabel ? ` (${slide.moveLabel})` : ""}`);
      lines.push(eventUrl(slide));
    }
    lines.push("");
  }

  lines.push(`Open Explore: ${frontendOrigin()}/explore`);
  lines.push(`Manage alerts: ${frontendOrigin()}/settings`);
  lines.push("");
  lines.push("Mercerline · research@mercerline.com");
  return lines.join("\n");
}

export function buildDigestHtml(content: DigestContent): string {
  const origin = frontendOrigin();
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const heroHtml = content.heroSlides.map((s, i) => renderHeroCard(s, i)).join("");
  const headlinesHtml = content.headlineSlides.map(renderHeadlineRow).join("");
  const quietNote = content.isFallback
    ? `<p style="margin:0 0 18px 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.5;color:rgba(255,255,255,0.42);">Quiet session — showing the strongest signals from recent filings.</p>`
    : "";

  const headlinesSection = content.headlineSlides.length
    ? `
      <tr>
        <td style="padding:28px 0 10px 0;">
          <p style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:rgba(255,255,255,0.38);">Also on the tape</p>
        </td>
      </tr>
      ${headlinesHtml}`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>${escHtml(buildDigestSubject(content))}</title>
</head>
<body style="margin:0;padding:0;background:#080809;color:rgba(255,255,255,0.88);">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#080809;">
    <tr>
      <td align="center" style="padding:28px 16px 40px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;">
          <tr>
            <td style="padding:0 0 22px 0;border-bottom:1px solid rgba(255,255,255,0.08);">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${origin}/mercerline_mark.png" width="28" height="28" alt="Mercerline" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
                    <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.02em;color:rgba(255,255,255,0.92);">Mercerline</span>
                  </td>
                  <td style="vertical-align:middle;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.34);">Daily Brief</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 0 6px 0;">
              <p style="margin:0 0 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(168,196,255,0.72);">Market intelligence</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.22;font-weight:400;color:rgba(255,255,255,0.96);">${escHtml(dateLabel)}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:8px 0 18px 0;">
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:rgba(255,255,255,0.62);">The stories that moved filings, flow, and price — ranked from today's Explore recap.</p>
              ${quietNote}
            </td>
          </tr>
          ${heroHtml}
          ${headlinesSection}
          <tr>
            <td style="padding:32px 0 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.14);">
                    <a href="${origin}/explore" style="display:inline-block;padding:12px 18px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.92);text-decoration:none;">Open Explore</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:34px 0 0 0;border-top:1px solid rgba(255,255,255,0.08);">
              <p style="margin:0 0 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:rgba(255,255,255,0.34);">
                Sent by Mercerline · <a href="mailto:research@mercerline.com" style="color:rgba(168,196,255,0.72);text-decoration:none;">research@mercerline.com</a>
              </p>
              <p style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:rgba(255,255,255,0.28);">
                <a href="${origin}/settings" style="color:rgba(255,255,255,0.42);text-decoration:underline;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
