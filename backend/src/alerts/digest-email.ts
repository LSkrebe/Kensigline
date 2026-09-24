import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";
import { SPARKLINE_DISPLAY_H, SPARKLINE_DISPLAY_W } from "./digest-sparkline.js";

/** Match Explore / filing date page — #080809, white type, hairline rules. */
const C = {
  bg: "#080809",
  text: "#ffffff",
  textSoft: "rgba(255,255,255,0.72)",
  textMuted: "rgba(255,255,255,0.42)",
  textFaint: "rgba(255,255,255,0.28)",
  border: "rgba(255,255,255,0.12)",
  borderSoft: "rgba(255,255,255,0.08)",
  up: "rgba(92,184,138,0.92)",
  down: "rgba(212,114,106,0.92)",
  meter: "rgba(92,184,138,0.95)",
  btnBorder: "rgba(255,255,255,0.22)",
};

export type DigestEmailBundle = {
  html: string;
  attachments: ResendAttachment[];
};

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
  return `${frontendOrigin()}/explore/events/${encodeURIComponent(slide.id)}`;
}

function moveColor(slide: DigestSlide): string {
  return slide.moveUp ? C.up : C.down;
}

function darkCell(extra = ""): string {
  return `background-color:${C.bg};background-image:linear-gradient(${C.bg},${C.bg});${extra}`;
}

function renderHeader(origin: string): string {
  return `
    <tr>
      <td style="padding:18px 0 16px 0;border-bottom:1px solid ${C.borderSoft};${darkCell()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;">
              <img src="${origin}/mercerline_mark.png" width="26" height="26" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
              <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:18px;letter-spacing:0.02em;color:${C.text};">Mercerline</span>
            </td>
            <td valign="middle" align="right" style="vertical-align:middle;text-align:right;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.04em;color:${C.textMuted};">Filing brief</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Centered date-page style hero (title + meter). */
function renderFilingHero(dateLabel: string, count: number): string {
  const title =
    count === 1 ? "1 new disclosure" : `${count} new disclosures`;
  return `
    <tr>
      <td align="center" style="padding:36px 0 8px 0;text-align:center;${darkCell()}">
        <p style="margin:0 0 18px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:500;letter-spacing:-0.01em;color:${C.textMuted};">${escHtml(dateLabel)}</p>
        <h1 style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:26px;line-height:1.2;font-weight:700;letter-spacing:-0.03em;color:${C.text};">${escHtml(title)}</h1>
        <!-- meter -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0 0;">
          <tr>
            <td align="center" style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:280px;margin:0 auto;">
                <tr>
                  <td height="2" style="height:2px;line-height:2px;font-size:0;background:linear-gradient(90deg,rgba(92,184,138,0.08),rgba(92,184,138,0.95),rgba(92,184,138,0.08));border-radius:999px;">&nbsp;</td>
                </tr>
              </table>
              <div style="width:12px;height:12px;margin:-7px auto 0 auto;border:2px solid rgba(180,230,204,0.95);border-radius:50%;background:${C.meter};box-shadow:0 0 0 3px ${C.bg};"></div>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/** Trade / filing list row — date-page section rhythm. */
function renderTradeRow(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;font-weight:650;color:${moveColor(slide)};white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : `<span style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;color:${C.textFaint};">—</span>`;
  const sparkline = slide.sparklineUrl
    ? `<img src="${slide.sparklineUrl}" width="${SPARKLINE_DISPLAY_W}" height="${SPARKLINE_DISPLAY_H}" alt="" style="display:block;border:0;outline:none;margin:10px 0 0 0;width:${SPARKLINE_DISPLAY_W}px;height:${SPARKLINE_DISPLAY_H}px;">`
    : "";
  const ticker = slide.ticker
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.06em;color:${C.textMuted};">${escHtml(slide.ticker)}</span>`
    : "";

  return `
    <tr>
      <td style="padding:22px 0;border-bottom:1px solid ${C.border};${darkCell()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="top" style="vertical-align:top;padding-right:16px;">
              <p style="margin:0 0 6px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.02em;color:${C.textMuted};">${escHtml(slide.kicker)}${ticker ? ` · ${ticker}` : ""}</p>
              <p style="margin:0 0 8px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:17px;line-height:1.35;font-weight:650;letter-spacing:-0.02em;">
                <a href="${url}" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </p>
              ${
                slide.summary
                  ? `<p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.45;color:${C.textSoft};">${escHtml(slide.summary)}</p>`
                  : ""
              }
              ${sparkline}
            </td>
            <td width="88" valign="top" align="right" style="vertical-align:top;text-align:right;white-space:nowrap;">${move}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderHeadlineRow(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:650;color:${moveColor(slide)};">${escHtml(slide.moveLabel)}</span>`
    : "";
  return `
    <tr>
      <td style="padding:16px 0;border-bottom:1px solid ${C.borderSoft};${darkCell()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;padding-right:12px;">
              <p style="margin:0 0 4px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:${C.textFaint};">${escHtml(slide.kicker)}${slide.ticker ? ` · ${escHtml(slide.ticker)}` : ""}</p>
              <p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.4;font-weight:600;letter-spacing:-0.02em;">
                <a href="${url}" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </p>
            </td>
            <td width="72" valign="middle" align="right" style="vertical-align:middle;text-align:right;">${move}</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildDigestSubject(content: DigestContent): string {
  const n = content.heroSlides.length + content.headlineSlides.length;
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  if (n <= 0) return `Mercerline · ${label}`;
  return `Mercerline · ${n} new disclosure${n === 1 ? "" : "s"} · ${label}`;
}

export function buildDigestPreheader(content: DigestContent): string {
  const first = content.heroSlides[0] ?? content.headlineSlides[0];
  if (!first) return "New filings from your tracked investors.";
  const text = [first.headline, first.summary].filter(Boolean).join(". ");
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function buildDigestPlainText(content: DigestContent): string {
  const lines: string[] = [];
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  const n = content.heroSlides.length + content.headlineSlides.length;
  lines.push(`Mercerline — ${n} new disclosure${n === 1 ? "" : "s"}`);
  lines.push(label);
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
    lines.push("Also filed");
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
  lines.push("Sent by Mercerline");
  lines.push("research@mercerline.com");
  return lines.join("\n");
}

function darkModeStyles(): string {
  return `
    :root { color-scheme: dark; supported-color-schemes: dark; }
    body, .ml-body { background-color:${C.bg} !important; color:${C.text} !important; }
    a { color:inherit; }
    table { border-collapse:collapse; }
    @media(max-width:480px) {
      .ml-pad { padding-left:20px !important; padding-right:20px !important; }
      h1 { font-size:22px !important; }
    }
  `;
}

export function buildDigestEmail(content: DigestContent): DigestEmailBundle {
  const origin = frontendOrigin();
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const count = content.heroSlides.length + content.headlineSlides.length;
  const rowsHtml = content.heroSlides.map((s) => renderTradeRow(s)).join("");
  const moreHtml = content.headlineSlides.map((s) => renderHeadlineRow(s)).join("");

  const moreSection = content.headlineSlides.length
    ? `
      <tr>
        <td style="padding:36px 0 8px 0;${darkCell()}">
          <p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:650;letter-spacing:-0.01em;color:${C.textMuted};">Also filed</p>
        </td>
      </tr>
      ${moreHtml}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escHtml(buildDigestSubject(content))}</title>
  <style type="text/css">${darkModeStyles()}</style>
</head>
<body class="ml-body" bgcolor="${C.bg}" style="margin:0;padding:0;${darkCell()}color:${C.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="${darkCell()}">
    <tr>
      <td align="center" class="ml-pad" bgcolor="${C.bg}" style="padding:24px 22px 40px 22px;${darkCell()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="max-width:560px;${darkCell()}">
          ${renderHeader(origin)}
          ${renderFilingHero(dateLabel, Math.max(count, content.heroSlides.length))}
          <tr>
            <td style="padding:28px 0 0 0;${darkCell()}">
              <p style="margin:0 0 4px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:650;letter-spacing:-0.01em;color:${C.textMuted};">Recent trades</p>
            </td>
          </tr>
          ${rowsHtml || `<tr><td style="padding:24px 0;color:${C.textMuted};font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;${darkCell()}">No new disclosures in this brief.</td></tr>`}
          ${moreSection}
          <tr>
            <td style="padding:32px 0 0 0;${darkCell()}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.btnBorder};border-radius:14px;${darkCell()}">
                <tr>
                  <td align="center" style="border-radius:14px;${darkCell()}">
                    <a href="${origin}/explore" style="display:block;width:100%;padding:14px 18px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:650;letter-spacing:-0.01em;color:${C.text};text-decoration:none;text-align:center;box-sizing:border-box;">Open Explore</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 0 0 0;text-align:center;${darkCell()}">
              <p style="margin:0 0 8px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;line-height:1.5;color:${C.textFaint};">Sent when tracked investors file — not on a fixed daily schedule.</p>
              <p style="margin:0 0 12px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;">
                <a href="mailto:research@mercerline.com" style="color:${C.textMuted};text-decoration:none;">research@mercerline.com</a>
              </p>
              <p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;">
                <a href="${origin}/settings" style="color:${C.textMuted};text-decoration:underline;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { html, attachments: [] };
}

/** @deprecated Use buildDigestEmail().html */
export function buildDigestHtml(content: DigestContent): string {
  return buildDigestEmail(content).html;
}
