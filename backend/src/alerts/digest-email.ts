import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";
import { SPARKLINE_DISPLAY_H, SPARKLINE_DISPLAY_W } from "./digest-sparkline.js";

/** Off-black palette — Gmail iOS inverts near #000/#fff; images are safer for bg. */
const C = {
  bg: "#0d0d10",
  bgCard: "#0d0d10",
  text: "#ececec",
  textSoft: "#b8b8b8",
  textMuted: "#8a8a8a",
  textFaint: "#666666",
  accent: "#a8c4ff",
  border: "#2a2a2e",
  borderSoft: "#1e1e22",
  up: "#50aa84",
  down: "#d86259",
  btnBg: "#161618",
  btnBorder: "#333338",
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
  const base = frontendOrigin();
  return `${base}/explore/events/${encodeURIComponent(slide.id)}`;
}

function moveColor(slide: DigestSlide): string {
  return slide.moveUp ? C.up : C.down;
}

function darkCell(bg: string, extra = ""): string {
  return `background-color:${bg};background-image:linear-gradient(${bg},${bg});${extra}`;
}

function renderHeaderRow(origin: string): string {
  return `
              <tr>
                <td bgcolor="${C.bg}" style="padding:18px 0 20px 0;border-bottom:1px solid ${C.borderSoft};${darkCell(C.bg)}">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td valign="middle" style="vertical-align:middle;">
                        <img src="${origin}/mercerline_mark.png" width="28" height="28" alt="Mercerline" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
                        <span class="ml-text" style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.02em;color:${C.text};">Mercerline</span>
                      </td>
                      <td valign="middle" class="ml-text-faint" style="vertical-align:middle;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.textFaint};">Daily Brief</td>
                    </tr>
                  </table>
                </td>
              </tr>`;
}

function renderHeroCard(slide: DigestSlide, index: number): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:${moveColor(slide)};letter-spacing:0.02em;">${escHtml(slide.moveLabel)}</span>`
    : "";
  const ticker = slide.ticker
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};margin-right:10px;">${escHtml(slide.ticker)}</span>`
    : "";
  const sparkline = slide.sparklineUrl
    ? `<img src="${slide.sparklineUrl}" width="${SPARKLINE_DISPLAY_W}" height="${SPARKLINE_DISPLAY_H}" alt="" style="display:block;border:0;outline:none;margin-left:auto;width:${SPARKLINE_DISPLAY_W}px;height:${SPARKLINE_DISPLAY_H}px;">`
    : "";

  return `
    <tr>
      <td bgcolor="${C.bg}" style="padding:${index === 0 ? "0" : "14px"} 0 0 0;${darkCell(C.bg)}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bgCard}" style="border-bottom:1px solid ${C.border};${darkCell(C.bgCard)}">
          <tr>
            <td bgcolor="${C.bgCard}" style="padding:24px 0 24px 0;${darkCell(C.bgCard)}">
              <p style="margin:0 0 10px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.textMuted};">${escHtml(slide.kicker)}</p>
              <h2 style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.28;font-weight:400;color:${C.text};">
                <a href="${url}" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </h2>
              <p style="margin:0 0 16px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:${C.textSoft};">${escHtml(slide.summary)}</p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bgCard}" style="${darkCell(C.bgCard)}">
                <tr>
                  <td bgcolor="${C.bgCard}" valign="bottom" style="vertical-align:bottom;${darkCell(C.bgCard)}">${ticker}${move}</td>
                  <td bgcolor="${C.bgCard}" width="96" valign="bottom" align="right" style="vertical-align:bottom;text-align:right;${darkCell(C.bgCard)}">${sparkline}</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderHeadlineRow(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;color:${moveColor(slide)};white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : `<span style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${C.textFaint};">—</span>`;

  return `
    <tr>
      <td bgcolor="${C.bg}" style="padding:14px 0;border-bottom:1px solid ${C.borderSoft};${darkCell(C.bg)}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="${darkCell(C.bg)}">
          <tr>
            <td bgcolor="${C.bg}" width="72" valign="middle" style="vertical-align:middle;padding-right:12px;${darkCell(C.bg)}">
              <span style="font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.accent};">${escHtml(slide.ticker || "—")}</span>
            </td>
            <td bgcolor="${C.bg}" valign="middle" style="vertical-align:middle;padding-right:12px;${darkCell(C.bg)}">
              <p style="margin:0 0 4px 0;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:${C.textFaint};">${escHtml(slide.kicker)}</p>
              <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.42;color:${C.text};">
                <a href="${url}" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </p>
            </td>
            <td bgcolor="${C.bg}" width="72" valign="middle" align="right" style="vertical-align:middle;text-align:right;${darkCell(C.bg)}">${move}</td>
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
  const text = bits.join(". ");
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
    lines.push("More headlines");
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
  lines.push("Sent by Mercerline");
  lines.push("research@mercerline.com");
  return lines.join("\n");
}

function darkModeStyles(bgImageUrl: string): string {
  const bgStack = `linear-gradient(${C.bg},${C.bg})`;
  return `
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, .ml-body, .ml-wrap, .ml-card, .ml-cell {
      background-color: ${C.bg} !important;
      background-image: ${bgStack} !important;
      background-repeat: repeat !important;
      color: ${C.text} !important;
    }
    .ml-text { color: ${C.text} !important; }
    .ml-text-soft { color: ${C.textSoft} !important; }
    .ml-text-muted { color: ${C.textMuted} !important; }
    .ml-text-faint { color: ${C.textFaint} !important; }
    .ml-accent { color: ${C.accent} !important; }
    .ml-up { color: ${C.up} !important; }
    .ml-down { color: ${C.down} !important; }
    table { border-collapse:collapse; }
    a { color:inherit; }
    @media(max-width:480px) { .ml-cell { padding:12px 20px 28px !important; } h1 { font-size:25px !important; } }
  `;
}

export function buildDigestEmail(content: DigestContent): DigestEmailBundle {
  const origin = frontendOrigin();
  const bgImageUrl = `${origin}/email-digest-bg.png`;
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const heroHtml = content.heroSlides.map((s, i) => renderHeroCard(s, i)).join("");
  const headlinesHtml = content.headlineSlides.map((s) => renderHeadlineRow(s)).join("");
  const quietNote = content.isFallback
    ? `<p style="margin:12px 0 0 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.5;color:${C.textMuted};">Quiet session. Showing the strongest signals from recent filings.</p>`
    : "";

  const headlinesSection = content.headlineSlides.length
    ? `
      <tr>
        <td bgcolor="${C.bg}" style="padding:36px 0 0 0;border-top:1px solid ${C.borderSoft};${darkCell(C.bg)}">
          <p style="margin:0 0 6px 0;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.3;font-weight:400;color:${C.textSoft};">More to watch</p>
          <p style="margin:0 0 16px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.textFaint};">Recent disclosures</p>
        </td>
      </tr>
      ${headlinesHtml}`
    : "";

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" style="color-scheme:light only;">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escHtml(buildDigestSubject(content))}</title>
  <style type="text/css">${darkModeStyles(bgImageUrl)}</style>
</head>
<body class="ml-body body" bgcolor="${C.bg}" style="margin:0;padding:0;${darkCell(C.bg)}color:${C.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" class="ml-wrap" background="${bgImageUrl}" style="${darkCell(C.bg)}">
        <tr>
          <td align="center" bgcolor="${C.bg}" class="ml-cell" background="${bgImageUrl}" style="padding:28px 16px 40px 16px;${darkCell(C.bg)}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" class="ml-card" background="${bgImageUrl}" style="max-width:620px;${darkCell(C.bg)}">
              ${renderHeaderRow(origin)}
              <tr>
                <td bgcolor="${C.bg}" style="padding:24px 0 18px 0;border-bottom:1px solid ${C.borderSoft};${darkCell(C.bg)}">
                  <p class="ml-accent" style="margin:0 0 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent};">Your daily brief</p>
                  <h1 class="ml-text" style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.22;font-weight:400;color:${C.text};">${escHtml(dateLabel)}</h1>
                  <p class="ml-text-soft" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:${C.textSoft};">Who disclosed a trade, and what happened next.</p>
                  ${quietNote}
                </td>
              </tr>
              ${heroHtml}
              ${headlinesSection}
              <tr>
                <td bgcolor="${C.bg}" style="padding:32px 0 0 0;${darkCell(C.bg)}">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.btnBg}" style="width:100%;${darkCell(C.btnBg)}">
                    <tr>
                      <td bgcolor="${C.btnBg}" align="center" style="border:1px solid ${C.btnBorder};${darkCell(C.btnBg)}">
                        <a href="${origin}/explore" style="display:block;width:100%;padding:14px 18px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.text};text-decoration:none;text-align:center;box-sizing:border-box;">Open Explore</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td bgcolor="${C.bg}" align="center" style="padding:34px 0 0 0;text-align:center;${darkCell(C.bg)}">
                  <p style="margin:0 0 6px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:${C.textFaint};">Sent by Mercerline</p>
                  <p style="margin:0 0 14px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;">
                    <a href="mailto:research@mercerline.com" style="color:${C.accent};text-decoration:none;">research@mercerline.com</a>
                  </p>
                  <p style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:${C.textFaint};">
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
