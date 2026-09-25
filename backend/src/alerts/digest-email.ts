import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

/**
 * Activity brief — light paper email.
 * Dark themes get crushed by Apple Mail / Gmail into unreadable gray.
 * Solid ink on paper survives every major client.
 */
const C = {
  bg: "#f4f3ef",
  paper: "#ffffff",
  ink: "#111111",
  inkSoft: "#3a3a3a",
  muted: "#6b6b6b",
  rule: "#e2e0da",
  ruleStrong: "#d4d1c9",
  up: "#1a7f4b",
  down: "#b42318",
  btn: "#111111",
  btnText: "#ffffff",
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

function cell(extra = ""): string {
  return `background-color:${C.paper};${extra}`;
}

function portraitImg(slide: DigestSlide): string {
  const src = slide.portraitUrl;
  if (!src) {
    const letter = escHtml(String(slide.kicker || "?").trim().slice(0, 1).toUpperCase() || "?");
    return `<div style="width:44px;height:52px;border-radius:3px;background:#eceae4;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;font-weight:700;line-height:52px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="44" height="52" alt="" style="display:block;width:44px;height:52px;border-radius:3px;object-fit:cover;object-position:center 18%;border:0;outline:none;">`;
}

function companyLogoImg(slide: DigestSlide): string {
  const src = slide.companyLogoUrl;
  const letter = escHtml(
    String(slide.companyName || slide.ticker || "?").trim().slice(0, 1).toUpperCase() || "?",
  );
  if (!src) {
    return `<div style="width:36px;height:36px;border-radius:4px;background:#eceae4;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;font-weight:700;line-height:36px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="36" height="36" alt="" style="display:block;width:36px;height:36px;border-radius:4px;object-fit:contain;background:#ffffff;border:1px solid ${C.rule};outline:none;">`;
}

function renderHeader(origin: string): string {
  return `
    <tr>
      <td style="padding:0 0 20px 0;${cell()}">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;padding-right:10px;">
              <img src="${origin}/mercerline_mark.png" width="22" height="22" alt="" style="display:block;border:0;outline:none;">
            </td>
            <td valign="middle" style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1;letter-spacing:0.01em;color:${C.ink};">
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
      <td style="padding:0 0 24px 0;border-bottom:1px solid ${C.ruleStrong};${cell()}">
        <p style="margin:0 0 6px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.3;font-weight:500;color:${C.muted};">
          ${escHtml(dateLabel)}
        </p>
        <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:26px;line-height:1.15;font-weight:700;letter-spacing:-0.03em;color:${C.ink};">
          ${escHtml(title)}
        </h1>
      </td>
    </tr>`;
}

/**
 * One card = person + type, hairline, company + move.
 * Grouped so mail clients don't flatten them into a single list.
 */
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
      <td style="padding:16px 0 0 0;${cell()}">
        <a href="${url}" style="text-decoration:none;color:inherit;display:block;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.ruleStrong};border-radius:10px;overflow:hidden;${cell()}">
            <tr>
              <td style="padding:14px 14px 12px 14px;${cell()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="56" valign="middle" style="vertical-align:middle;padding-right:12px;">
                      ${portraitImg(slide)}
                    </td>
                    <td valign="middle" style="vertical-align:middle;">
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">
                        ${escHtml(name)}
                      </p>
                      ${
                        type
                          ? `<p style="margin:4px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:500;color:${C.muted};">${escHtml(type)}</p>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 14px;${cell()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${C.rule};">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:12px 14px 14px 14px;${cell()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="48" valign="middle" style="vertical-align:middle;padding-right:12px;">
                      ${companyLogoImg(slide)}
                    </td>
                    <td valign="middle" style="vertical-align:middle;">
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.2;font-weight:650;letter-spacing:-0.01em;color:${C.ink};">
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

function lightModeStyles(): string {
  return `
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, .ml-body, .ml-shell, .ml-card {
      background-color:${C.bg} !important;
      color:${C.ink} !important;
    }
    a { color:inherit !important; text-decoration:none; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; }
    @media(max-width:480px) {
      .ml-pad { padding-left:16px !important; padding-right:16px !important; }
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
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escHtml(buildDigestSubject(content))}</title>
  <style type="text/css">${lightModeStyles()}</style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { background-color:${C.bg} !important; }
  </style>
  <![endif]-->
</head>
<body class="ml-body" bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};color:${C.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" class="ml-shell" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr>
      <td align="center" class="ml-pad" bgcolor="${C.bg}" style="padding:28px 20px 40px 20px;background-color:${C.bg};">
        <table role="presentation" class="ml-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.paper}" style="max-width:520px;background-color:${C.paper};border-radius:14px;overflow:hidden;">
          <tr>
            <td style="padding:24px 22px 28px 22px;${cell()}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${renderHeader(origin)}
                ${renderHero(dateLabel, count)}
                ${
                  cardsHtml ||
                  `<tr><td style="padding:24px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:${C.muted};${cell()}">No new disclosures today.</td></tr>`
                }
                <tr>
                  <td style="padding:22px 0 0 0;${cell()}">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" bgcolor="${C.btn}" style="background-color:${C.btn};border-radius:10px;">
                          <a href="${origin}/explore" style="display:block;width:100%;padding:13px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:650;letter-spacing:-0.01em;color:${C.btnText};text-decoration:none;text-align:center;box-sizing:border-box;">Open Explore</a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">
          <tr>
            <td align="center" style="padding:20px 8px 0 8px;text-align:center;background-color:${C.bg};">
              <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${C.muted};">Sent when tracked investors file.</p>
              <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;">
                <a href="mailto:research@mercerline.com" style="color:${C.muted};text-decoration:none;">research@mercerline.com</a>
              </p>
              <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:12px;">
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
