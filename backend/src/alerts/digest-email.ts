import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

/**
 * Adaptive brief — no forced paper/shell background.
 * Client theme owns the canvas. Fixed dark tiles keep the white mark + CTA readable.
 */
const C = {
  ink: "#111111",
  muted: "#5c5c5c",
  rule: "#d8d8d8",
  up: "#1a7f4b",
  down: "#b42318",
  tile: "#111111",
  tileText: "#ffffff",
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

function portraitImg(slide: DigestSlide): string {
  const src = slide.portraitUrl;
  if (!src) {
    const letter = escHtml(String(slide.kicker || "?").trim().slice(0, 1).toUpperCase() || "?");
    return `<div style="width:44px;height:52px;border-radius:3px;background-color:#e8e8e8;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:52px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="44" height="52" alt="" style="display:block;width:44px;height:52px;border-radius:3px;object-fit:cover;object-position:center 18%;border:0;outline:none;">`;
}

function companyLogoImg(slide: DigestSlide): string {
  const src = slide.companyLogoUrl;
  const letter = escHtml(
    String(slide.companyName || slide.ticker || "?").trim().slice(0, 1).toUpperCase() || "?",
  );
  if (!src) {
    return `<div style="width:36px;height:36px;border-radius:4px;background-color:#e8e8e8;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;line-height:36px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:4px;object-fit:contain;border:1px solid ${C.rule};outline:none;">`;
}

/** White mark sits on a fixed dark tile so it always shows. */
function renderHeader(origin: string): string {
  return `
    <tr>
      <td style="padding:0 0 22px 0;">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" bgcolor="${C.tile}" width="32" height="32" style="vertical-align:middle;width:32px;height:32px;background-color:${C.tile};border-radius:8px;text-align:center;">
              <img src="${origin}/mercerline_mark.png" width="18" height="18" alt="" style="display:inline-block;vertical-align:middle;border:0;outline:none;">
            </td>
            <td valign="middle" class="ml-ink" style="vertical-align:middle;padding-left:10px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1;letter-spacing:0.01em;color:${C.ink};">
              Mercerline
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

function renderHero(dateLabel: string, count: number): string {
  const title = count === 1 ? "1 new disclosure" : `${count} new disclosures`;
  return `
    <tr>
      <td style="padding:0 0 8px 0;">
        <p class="ml-muted" style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.3;font-weight:500;color:${C.muted};">
          ${escHtml(dateLabel)}
        </p>
        <h1 class="ml-ink" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.03em;color:${C.ink};">
          ${escHtml(title)}
        </h1>
      </td>
    </tr>`;
}

function renderTradeCard(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const name = slide.kicker || "Investor";
  const type = slide.investorType;
  const company = slide.companyName || slide.ticker || "Company";
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:15px;font-weight:700;letter-spacing:-0.02em;color:${moveColor(slide)};white-space:nowrap;">${escHtml(slide.moveLabel)}</span>`
    : "";

  return `
    <tr>
      <td style="padding:20px 0 0 0;">
        <a href="${url}" style="text-decoration:none;color:inherit;display:block;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td width="56" valign="middle" style="vertical-align:middle;padding-right:12px;">
                ${portraitImg(slide)}
              </td>
              <td valign="middle" style="vertical-align:middle;">
                <p class="ml-ink" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">
                  ${escHtml(name)}
                </p>
                ${
                  type
                    ? `<p class="ml-muted" style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:500;color:${C.muted};">${escHtml(type)}</p>`
                    : ""
                }
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding:12px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td class="ml-rule" height="1" style="height:1px;line-height:1px;font-size:0;background-color:${C.rule};">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td width="56" valign="middle" style="vertical-align:middle;padding-right:12px;">
                ${companyLogoImg(slide)}
              </td>
              <td valign="middle" style="vertical-align:middle;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td valign="middle" style="vertical-align:middle;">
                      <p class="ml-ink" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.2;font-weight:650;letter-spacing:-0.01em;color:${C.ink};">
                        ${escHtml(company)}
                      </p>
                    </td>
                    <td width="72" valign="middle" align="right" style="vertical-align:middle;text-align:right;white-space:nowrap;">
                      ${move}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </a>
      </td>
    </tr>`;
}

function renderExploreButton(origin: string): string {
  return `
    <tr>
      <td style="padding:28px 0 0 0;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" bgcolor="${C.tile}" style="background-color:${C.tile};border-radius:10px;border:1px solid ${C.tile};">
              <a href="${origin}/explore" style="display:block;width:100%;padding:14px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:650;letter-spacing:-0.01em;color:${C.tileText};text-decoration:none;text-align:center;box-sizing:border-box;">
                Open Explore
              </a>
            </td>
          </tr>
        </table>
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
  const text = [first.kicker, first.companyName || first.ticker, first.moveLabel]
    .filter(Boolean)
    .join(" ");
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
    if (slide.investorType) lines.push(slide.investorType);
    lines.push(`${slide.companyName || slide.ticker || "Company"}${slide.moveLabel ? `  ${slide.moveLabel}` : ""}`);
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

function adaptiveStyles(): string {
  return `
    :root { color-scheme: light dark; supported-color-schemes: light dark; }
    body, .ml-body { margin:0; padding:0; }
    a { color:inherit !important; text-decoration:none; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; }
    @media (prefers-color-scheme: dark) {
      .ml-ink { color:#f2f2f2 !important; }
      .ml-muted { color:#b0b0b0 !important; }
      .ml-rule { background-color:#3a3a3a !important; }
    }
    @media(max-width:480px) {
      .ml-pad { padding-left:18px !important; padding-right:18px !important; }
      h1 { font-size:24px !important; }
    }
  `;
}

export function buildDigestEmail(content: DigestContent): DigestEmailBundle {
  const origin = frontendOrigin();
  const dateLabel = formatDigestDate(content.displayDayKey || content.dayKey);
  const preheader = escHtml(buildDigestPreheader(content));
  const slides = [...content.heroSlides, ...content.headlineSlides];
  const count = slides.length;
  const cardsHtml = slides.map((s) => renderTradeCard(s)).join("");

  const html = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="supported-color-schemes" content="light dark">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escHtml(buildDigestSubject(content))}</title>
  <style type="text/css">${adaptiveStyles()}</style>
</head>
<body class="ml-body" style="margin:0;padding:0;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" class="ml-pad" style="padding:28px 20px 36px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          ${renderHeader(origin)}
          ${renderHero(dateLabel, count)}
          ${
            cardsHtml ||
            `<tr><td class="ml-muted" style="padding:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:${C.muted};">No new disclosures today.</td></tr>`
          }
          ${renderExploreButton(origin)}
          <tr>
            <td align="center" style="padding:22px 0 0 0;text-align:center;">
              <p class="ml-muted" style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">Sent when tracked investors file.</p>
              <p class="ml-muted" style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;">
                <a href="mailto:research@mercerline.com" style="color:${C.muted};text-decoration:none;">research@mercerline.com</a>
              </p>
              <p class="ml-muted" style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;">
                <a href="${origin}/settings" style="color:${C.muted};text-decoration:underline;">Manage email preferences</a>
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
