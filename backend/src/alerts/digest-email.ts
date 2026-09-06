import { frontendOrigin } from "./config.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

/** Solid hex palette — Gmail dark mode inverts rgba(); these hold better. */
const C = {
  bg: "#080809",
  bgCard: "#101114",
  text: "#ececec",
  textSoft: "#b8b8b8",
  textMuted: "#8a8a8a",
  textFaint: "#666666",
  accent: "#a8c4ff",
  border: "#2a2a2e",
  borderSoft: "#1e1e22",
  up: "#5cb88a",
  down: "#d4726a",
  btnBg: "#161618",
  btnBorder: "#333338",
};

const DARK_BG_STYLE = `background-color:${C.bg};background-image:linear-gradient(${C.bg},${C.bg});`;

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
  return moveUp ? C.up : C.down;
}

function renderHeroCard(slide: DigestSlide, index: number): string {
  const url = eventUrl(slide);
  const move = slide.moveLabel
    ? `<span class="ml-text" style="font-family:ui-monospace,Menlo,monospace;font-size:12px;font-weight:600;color:${moveColor(slide.moveUp)};letter-spacing:0.02em;">${escHtml(slide.moveLabel)}</span>`
    : "";
  const ticker = slide.ticker
    ? `<span class="ml-accent" style="display:inline-block;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.accent};border:1px solid #3d4f66;padding:3px 7px;margin-right:8px;">${escHtml(slide.ticker)}</span>`
    : "";

  return `
    <tr>
      <td bgcolor="${C.bg}" style="padding:${index === 0 ? "0" : "14px"} 0 0 0;${DARK_BG_STYLE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bgCard}" style="border:1px solid ${C.border};background-color:${C.bgCard};background-image:linear-gradient(${C.bgCard},${C.bgCard});">
          <tr>
            <td bgcolor="${C.bgCard}" style="padding:20px 22px 18px 22px;background-color:${C.bgCard};background-image:linear-gradient(${C.bgCard},${C.bgCard});">
              <p class="ml-muted" style="margin:0 0 10px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.14em;text-transform:uppercase;color:${C.textMuted};">${escHtml(slide.kicker)}</p>
              <h2 class="ml-text" style="margin:0 0 12px 0;font-family:Georgia,'Times New Roman',serif;font-size:22px;line-height:1.28;font-weight:400;color:${C.text};">
                <a href="${url}" class="ml-text" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </h2>
              <p class="ml-soft" style="margin:0 0 14px 0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.55;color:${C.textSoft};">${escHtml(slide.summary)}</p>
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
    ? `<span class="ml-text" style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${moveColor(slide.moveUp)};white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : `<span class="ml-faint" style="font-family:ui-monospace,Menlo,monospace;font-size:11px;color:${C.textFaint};">—</span>`;

  return `
    <tr>
      <td bgcolor="${C.bg}" style="padding:14px 0;border-bottom:1px solid ${C.borderSoft};${DARK_BG_STYLE}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}">
          <tr>
            <td bgcolor="${C.bg}" style="width:72px;vertical-align:top;padding-right:12px;background-color:${C.bg};">
              <span class="ml-accent" style="font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;color:${C.accent};">${escHtml(slide.ticker || "—")}</span>
            </td>
            <td bgcolor="${C.bg}" style="vertical-align:top;padding-right:12px;background-color:${C.bg};">
              <p class="ml-faint" style="margin:0 0 4px 0;font-family:ui-monospace,Menlo,monospace;font-size:9px;letter-spacing:0.12em;text-transform:uppercase;color:${C.textFaint};">${escHtml(slide.kicker)}</p>
              <p class="ml-text" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:15px;line-height:1.42;color:${C.text};">
                <a href="${url}" class="ml-text" style="color:${C.text};text-decoration:none;">${escHtml(slide.headline)}</a>
              </p>
            </td>
            <td bgcolor="${C.bg}" style="width:64px;vertical-align:top;text-align:right;background-color:${C.bg};">${move}</td>
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

function darkModeStyles(): string {
  return `
    :root { color-scheme: dark only; supported-color-schemes: dark; }
    .ml-body, .ml-wrap, .ml-card { ${DARK_BG_STYLE} }
    .ml-text { color: ${C.text} !important; }
    .ml-soft { color: ${C.textSoft} !important; }
    .ml-muted { color: ${C.textMuted} !important; }
    .ml-faint { color: ${C.textFaint} !important; }
    .ml-accent { color: ${C.accent} !important; }
    @media (prefers-color-scheme: dark) {
      .ml-body, .ml-wrap, .ml-card, .ml-cell { background-color: ${C.bg} !important; background-image: linear-gradient(${C.bg},${C.bg}) !important; }
      .ml-text { color: ${C.text} !important; }
      .ml-soft { color: ${C.textSoft} !important; }
      .ml-muted { color: ${C.textMuted} !important; }
      .ml-faint { color: ${C.textFaint} !important; }
      .ml-accent { color: ${C.accent} !important; }
    }
    @media (prefers-color-scheme: light) {
      .ml-body, .ml-wrap, .ml-card, .ml-cell { background-color: ${C.bg} !important; background-image: linear-gradient(${C.bg},${C.bg}) !important; }
      .ml-text { color: ${C.text} !important; }
      .ml-soft { color: ${C.textSoft} !important; }
      .ml-muted { color: ${C.textMuted} !important; }
      .ml-faint { color: ${C.textFaint} !important; }
      .ml-accent { color: ${C.accent} !important; }
    }
    u + .body .ml-gmail-blend-screen { background: ${C.bg}; mix-blend-mode: screen; }
    u + .body .ml-gmail-blend-difference { background: ${C.bg}; mix-blend-mode: difference; }
    [data-ogsc] .ml-body, [data-ogsc] .ml-wrap, [data-ogsc] .ml-cell { background-color: ${C.bg} !important; }
  `;
}

export function buildDigestHtml(content: DigestContent): string {
  const origin = frontendOrigin();
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const heroHtml = content.heroSlides.map((s, i) => renderHeroCard(s, i)).join("");
  const headlinesHtml = content.headlineSlides.map(renderHeadlineRow).join("");
  const quietNote = content.isFallback
    ? `<p class="ml-muted" style="margin:0 0 18px 0;font-family:ui-monospace,Menlo,monospace;font-size:11px;line-height:1.5;color:${C.textMuted};">Quiet session — showing the strongest signals from recent filings.</p>`
    : "";

  const headlinesSection = content.headlineSlides.length
    ? `
      <tr>
        <td bgcolor="${C.bg}" class="ml-cell" style="padding:28px 0 10px 0;${DARK_BG_STYLE}">
          <p class="ml-faint" style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;font-weight:600;letter-spacing:0.16em;text-transform:uppercase;color:${C.textFaint};">Also on the tape</p>
        </td>
      </tr>
      ${headlinesHtml}`
    : "";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark only">
  <meta name="supported-color-schemes" content="dark only">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escHtml(buildDigestSubject(content))}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
  <style type="text/css">${darkModeStyles()}</style>
</head>
<body class="ml-body body" bgcolor="${C.bg}" style="margin:0;padding:0;${DARK_BG_STYLE}color:${C.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <div class="ml-gmail-blend-screen" style="display:block;">
    <div class="ml-gmail-blend-difference" style="display:block;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" class="ml-wrap" style="${DARK_BG_STYLE}">
        <tr>
          <td align="center" bgcolor="${C.bg}" class="ml-cell" style="padding:28px 16px 40px 16px;${DARK_BG_STYLE}">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" class="ml-card" style="max-width:620px;${DARK_BG_STYLE}">
              <tr>
                <td bgcolor="${C.bg}" class="ml-cell" style="padding:0 0 22px 0;border-bottom:1px solid ${C.borderSoft};${DARK_BG_STYLE}">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}">
                    <tr>
                      <td bgcolor="${C.bg}" style="vertical-align:middle;background-color:${C.bg};">
                        <img src="${origin}/mercerline_mark.png" width="28" height="28" alt="Mercerline" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
                        <span class="ml-text" style="display:inline-block;vertical-align:middle;margin-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:20px;letter-spacing:0.02em;color:${C.text};">Mercerline</span>
                      </td>
                      <td bgcolor="${C.bg}" class="ml-faint" style="vertical-align:middle;text-align:right;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.12em;text-transform:uppercase;color:${C.textFaint};background-color:${C.bg};">Daily Brief</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td bgcolor="${C.bg}" class="ml-cell" style="padding:24px 0 6px 0;${DARK_BG_STYLE}">
                  <p class="ml-accent" style="margin:0 0 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;letter-spacing:0.14em;text-transform:uppercase;color:${C.accent};">Market intelligence</p>
                  <h1 class="ml-text" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.22;font-weight:400;color:${C.text};">${escHtml(dateLabel)}</h1>
                </td>
              </tr>
              <tr>
                <td bgcolor="${C.bg}" class="ml-cell" style="padding:8px 0 18px 0;${DARK_BG_STYLE}">
                  <p class="ml-soft" style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.55;color:${C.textSoft};">The stories that moved filings, flow, and price — ranked from today's Explore recap.</p>
                  ${quietNote}
                </td>
              </tr>
              ${heroHtml}
              ${headlinesSection}
              <tr>
                <td bgcolor="${C.bg}" class="ml-cell" style="padding:32px 0 0 0;${DARK_BG_STYLE}">
                  <table role="presentation" cellpadding="0" cellspacing="0" bgcolor="${C.btnBg}">
                    <tr>
                      <td bgcolor="${C.btnBg}" style="background-color:${C.btnBg};background-image:linear-gradient(${C.btnBg},${C.btnBg});border:1px solid ${C.btnBorder};">
                        <a href="${origin}/explore" class="ml-text" style="display:inline-block;padding:12px 18px;font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${C.text};text-decoration:none;">Open Explore</a>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td bgcolor="${C.bg}" class="ml-cell" style="padding:34px 0 0 0;border-top:1px solid ${C.borderSoft};${DARK_BG_STYLE}">
                  <p class="ml-faint" style="margin:0 0 8px 0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:${C.textFaint};">
                    Sent by Mercerline · <a href="mailto:research@mercerline.com" class="ml-accent" style="color:${C.accent};text-decoration:none;">research@mercerline.com</a>
                  </p>
                  <p class="ml-faint" style="margin:0;font-family:ui-monospace,Menlo,monospace;font-size:10px;line-height:1.6;color:${C.textFaint};">
                    <a href="${origin}/settings" class="ml-muted" style="color:${C.textMuted};text-decoration:underline;">Manage email preferences</a>
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </div>
  </div>
</body>
</html>`;
}
