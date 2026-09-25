import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

/**
 * Filing-brief email — dossier date-row density, solid near-white type.
 * Avoid translucent whites; mail clients crush them into unreadable gray.
 */
const C = {
  bg: "#080809",
  text: "#ffffff",
  textSoft: "#f5f5f7",
  textMuted: "#ececee",
  textFaint: "#d0d0d4",
  border: "#2a2a2e",
  borderSoft: "#1e1e22",
  up: "#5cb88a",
  down: "#d4726a",
  meter: "#5cb88a",
  btnBorder: "#3a3a40",
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

function sourceLabel(source: string): string {
  const s = String(source ?? "").trim().toLowerCase();
  if (s === "ptr" || s.includes("politic")) return "PTR";
  if (s === "form4" || s === "form_4" || s.includes("insider") || s.includes("form 4")) return "Form 4";
  if (s === "13f" || s.includes("institut")) return "13F";
  if (!s) return "";
  return s.toUpperCase().slice(0, 8);
}

function portraitImg(slide: DigestSlide): string {
  const src = slide.portraitUrl;
  if (!src) {
    const letter = escHtml(String(slide.kicker || "?").trim().slice(0, 1).toUpperCase() || "?");
    return `<div style="width:48px;height:56px;border-radius:4px;background:#1a1a1e;color:${C.text};font-family:ui-sans-serif,system-ui,sans-serif;font-size:15px;font-weight:700;line-height:56px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="48" height="56" alt="" style="display:block;width:48px;height:56px;border-radius:4px;object-fit:cover;object-position:center 18%;border:0;outline:none;">`;
}

function renderHeader(origin: string): string {
  return `
    <tr>
      <td style="padding:16px 0 14px 0;border-bottom:1px solid ${C.borderSoft};${darkCell()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;">
              <img src="${origin}/mercerline_mark.png" width="24" height="24" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
              <span style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:17px;letter-spacing:0.02em;color:${C.text} !important;">Mercerline</span>
            </td>
            <td valign="middle" align="right" style="vertical-align:middle;text-align:right;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:11px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${C.textMuted} !important;">Filing brief</td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderFilingHero(dateLabel: string, count: number): string {
  const title = count === 1 ? "1 new disclosure" : `${count} new disclosures`;
  return `
    <tr>
      <td align="center" style="padding:28px 0 6px 0;text-align:center;${darkCell()}">
        <p style="margin:0 0 12px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:500;letter-spacing:-0.01em;color:${C.textMuted} !important;">${escHtml(dateLabel)}</p>
        <h1 style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:-0.03em;color:${C.text} !important;">${escHtml(title)}</h1>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0 0 0;">
          <tr>
            <td align="center" style="padding:0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:240px;margin:0 auto;">
                <tr>
                  <td height="2" style="height:2px;line-height:2px;font-size:0;background:${C.meter};border-radius:999px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

/**
 * Dossier date-page pattern: profile row, then event row.
 * No middle dots, no prose.
 */
function renderTradeRow(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const name = slide.kicker || "Investor";
  const action = slide.headline || "Disclosure";
  const source = sourceLabel(slide.source);
  const ticker = String(slide.ticker || "").trim().toUpperCase();
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;font-weight:700;letter-spacing:-0.02em;color:${moveColor(slide)} !important;white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : "";

  const eventMetaLeft = ticker
    ? `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.04em;color:${C.textSoft} !important;">${escHtml(ticker)}</span>`
    : "";
  const eventMetaRight = source
    ? `<span style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;letter-spacing:0.06em;color:${C.textSoft} !important;">${escHtml(source)}</span>`
    : "";

  return `
    <tr>
      <td style="padding:18px 0;border-bottom:1px solid ${C.border};${darkCell()}">
        <a href="${url}" style="text-decoration:none;color:inherit;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="60" valign="middle" style="vertical-align:middle;padding-right:12px;">
                ${portraitImg(slide)}
              </td>
              <td valign="middle" style="vertical-align:middle;">
                <p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.2;font-weight:650;letter-spacing:-0.02em;color:${C.text} !important;">${escHtml(name)}</p>
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:14px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="top" style="vertical-align:top;padding-right:12px;">
                      <p style="margin:0 0 6px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.3;font-weight:600;letter-spacing:-0.01em;color:${C.text} !important;">${escHtml(action)}</p>
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          ${eventMetaLeft ? `<td style="padding-right:12px;">${eventMetaLeft}</td>` : ""}
                          ${eventMetaRight ? `<td>${eventMetaRight}</td>` : ""}
                        </tr>
                      </table>
                    </td>
                    <td width="64" valign="top" align="right" style="vertical-align:top;text-align:right;white-space:nowrap;padding-top:2px;">${move}</td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`;
}

export function buildDigestSubject(content: DigestContent): string {
  const n = content.heroSlides.length + content.headlineSlides.length;
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  if (n <= 0) return `Mercerline - ${label}`;
  return `Mercerline - ${n} new disclosure${n === 1 ? "" : "s"} - ${label}`;
}

export function buildDigestPreheader(content: DigestContent): string {
  const first = content.heroSlides[0] ?? content.headlineSlides[0];
  if (!first) return "New filings from your tracked investors.";
  const text = [first.kicker, first.headline, first.ticker].filter(Boolean).join(" ");
  return text.length > 120 ? `${text.slice(0, 117)}…` : text;
}

export function buildDigestPlainText(content: DigestContent): string {
  const lines: string[] = [];
  const label = formatDigestDate(content.displayDayKey || content.dayKey);
  const n = content.heroSlides.length + content.headlineSlides.length;
  lines.push(`Mercerline - ${n} new disclosure${n === 1 ? "" : "s"}`);
  lines.push(label);
  lines.push("");

  const all = [...content.heroSlides, ...content.headlineSlides];
  for (const slide of all) {
    lines.push(slide.kicker || "Investor");
    lines.push(slide.headline || "Disclosure");
    const bits = [slide.ticker, sourceLabel(slide.source), slide.moveLabel].filter(Boolean);
    if (bits.length) lines.push(bits.join("  "));
    lines.push(eventUrl(slide));
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
    body, .ml-body, .ml-shell, .ml-card {
      background-color:${C.bg} !important;
      background-image:linear-gradient(${C.bg},${C.bg}) !important;
      color:${C.text} !important;
    }
    a { color:inherit !important; text-decoration:none; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; }
    .ml-text { color:${C.text} !important; }
    .ml-muted { color:${C.textMuted} !important; }
    .ml-faint { color:${C.textFaint} !important; }
    @media(max-width:480px) {
      .ml-pad { padding-left:18px !important; padding-right:18px !important; }
      h1 { font-size:22px !important; }
    }
  `;
}

export function buildDigestEmail(content: DigestContent): DigestEmailBundle {
  const origin = frontendOrigin();
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const slides = [...content.heroSlides, ...content.headlineSlides];
  const count = slides.length;
  const rowsHtml = slides.map((s) => renderTradeRow(s)).join("");

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
  <!--[if mso]>
  <style type="text/css">
    body, table, td { background-color:${C.bg} !important; }
  </style>
  <![endif]-->
</head>
<body class="ml-body" bgcolor="${C.bg}" style="margin:0;padding:0;${darkCell()}color:${C.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" class="ml-shell" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="${darkCell()}">
    <tr>
      <td align="center" class="ml-pad" bgcolor="${C.bg}" style="padding:20px 20px 36px 20px;${darkCell()}">
        <table role="presentation" class="ml-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="max-width:560px;${darkCell()}">
          ${renderHeader(origin)}
          ${renderFilingHero(dateLabel, count)}
          <tr>
            <td style="padding:22px 0 0 0;${darkCell()}"></td>
          </tr>
          ${
            rowsHtml ||
            `<tr><td style="padding:20px 0;font-family:ui-sans-serif,system-ui,sans-serif;font-size:14px;color:${C.textMuted} !important;${darkCell()}">No new disclosures in this brief.</td></tr>`
          }
          <tr>
            <td style="padding:28px 0 0 0;${darkCell()}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.btnBorder};border-radius:14px;${darkCell()}">
                <tr>
                  <td align="center" style="border-radius:14px;${darkCell()}">
                    <a href="${origin}/explore" style="display:block;width:100%;padding:14px 18px;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:13px;font-weight:650;letter-spacing:-0.01em;color:${C.text} !important;text-decoration:none;text-align:center;box-sizing:border-box;">Open Explore</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:24px 0 0 0;text-align:center;${darkCell()}">
              <p style="margin:0 0 8px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.5;color:${C.textFaint} !important;">Sent when tracked investors file.</p>
              <p style="margin:0 0 10px 0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:12px;">
                <a href="mailto:research@mercerline.com" style="color:${C.textMuted} !important;text-decoration:none;">research@mercerline.com</a>
              </p>
              <p style="margin:0;font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;font-size:12px;">
                <a href="${origin}/settings" style="color:${C.textMuted} !important;text-decoration:underline;">Manage email preferences</a>
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
