import { frontendOrigin } from "./config.js";
import type { ResendAttachment } from "./resend.js";
import type { DigestContent, DigestSlide } from "./digest-content.js";

/**
 * Filing brief for inboxes.
 * Force a stable light canvas — Gmail/Apple dark-mode inversion wrecks custom dark HTML.
 * Brand mark is a baked dark-tile PNG so it never washes out.
 */
const C = {
  page: "#e8e7e2",
  paper: "#ffffff",
  card: "#f7f6f2",
  ink: "#111111",
  muted: "#5f675f",
  rule: "#ddd9d0",
  cardBorder: "#cfcabe",
  up: "#0f7a45",
  down: "#c0352b",
  cta: "#111111",
  ctaText: "#ffffff",
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

function paper(extra = ""): string {
  return `background-color:${C.paper};${extra}`;
}

function cardBg(extra = ""): string {
  return `background-color:${C.card};${extra}`;
}

function portraitImg(slide: DigestSlide): string {
  const src = slide.portraitUrl;
  if (!src) {
    const letter = escHtml(String(slide.kicker || "?").trim().slice(0, 1).toUpperCase() || "?");
    return `<div style="width:48px;height:56px;border-radius:4px;background-color:#ebe8e1;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;line-height:56px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="48" height="56" alt="" style="display:block;width:48px;height:56px;border-radius:4px;object-fit:cover;object-position:center 18%;border:0;">`;
}

function companyLogoImg(slide: DigestSlide): string {
  const src = slide.companyLogoUrl;
  const letter = escHtml(
    String(slide.companyName || slide.ticker || "?").trim().slice(0, 1).toUpperCase() || "?",
  );
  if (!src) {
    return `<div style="width:40px;height:40px;border-radius:6px;background-color:#ebe8e1;color:${C.ink};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;line-height:40px;text-align:center;">${letter}</div>`;
  }
  return `<img src="${escHtml(src)}" width="40" height="40" alt="" style="display:block;width:40px;height:40px;border-radius:6px;object-fit:contain;background-color:#ffffff;border:1px solid ${C.rule};">`;
}

function renderHeader(origin: string): string {
  return `
    <tr>
      <td style="padding:0 0 28px 0;${paper()}">
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td valign="middle" style="vertical-align:middle;padding-right:12px;">
              <img src="${origin}/mercerline_mark_email.png" width="28" height="28" alt="Mercerline" style="display:block;width:28px;height:28px;border:0;border-radius:7px;">
            </td>
            <td valign="middle" style="vertical-align:middle;font-family:Georgia,'Times New Roman',serif;font-size:20px;line-height:1;letter-spacing:0.01em;color:${C.ink};">
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
      <td style="padding:0 0 8px 0;${paper()}">
        <p style="margin:0 0 8px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.3;font-weight:500;color:${C.muted};">
          ${escHtml(dateLabel)}
        </p>
        <h1 style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:28px;line-height:1.12;font-weight:700;letter-spacing:-0.035em;color:${C.ink};">
          ${escHtml(title)}
        </h1>
      </td>
    </tr>`;
}

/**
 * One disclosure = one bordered card: person, rule, company + move.
 */
function renderTradeCard(slide: DigestSlide): string {
  const url = eventUrl(slide);
  const name = slide.kicker || "Investor";
  const type = slide.investorType;
  const company = slide.companyName || slide.ticker || "Company";
  const move = slide.moveLabel
    ? `<span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:${moveColor(slide)};">${escHtml(slide.moveLabel)}</span>`
    : `<span style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;color:${C.muted};">View</span>`;

  return `
    <tr>
      <td style="padding:16px 0 0 0;${paper()}">
        <a href="${url}" style="text-decoration:none;color:${C.ink};display:block;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.card}" style="border:1px solid ${C.cardBorder};border-radius:12px;overflow:hidden;${cardBg()}">
            <tr>
              <td style="padding:16px 16px 14px 16px;${cardBg()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="60" valign="middle" style="vertical-align:middle;padding-right:14px;">
                      ${portraitImg(slide)}
                    </td>
                    <td valign="middle" style="vertical-align:middle;">
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:17px;line-height:1.2;font-weight:700;letter-spacing:-0.02em;color:${C.ink};">
                        ${escHtml(name)}
                      </p>
                      ${
                        type
                          ? `<p style="margin:5px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:13px;line-height:1.2;font-weight:500;color:${C.muted};">${escHtml(type)}</p>`
                          : ""
                      }
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 16px;${cardBg()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td height="1" style="height:1px;line-height:1px;font-size:0;background-color:${C.rule};">&nbsp;</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:14px 16px 16px 16px;${cardBg()}">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="54" valign="middle" style="vertical-align:middle;padding-right:14px;">
                      ${companyLogoImg(slide)}
                    </td>
                    <td valign="middle" style="vertical-align:middle;">
                      <p style="margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.2;font-weight:650;letter-spacing:-0.015em;color:${C.ink};">
                        ${escHtml(company)}
                      </p>
                    </td>
                    <td width="78" valign="middle" align="right" style="vertical-align:middle;text-align:right;white-space:nowrap;padding-left:8px;">
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

function renderCta(origin: string): string {
  return `
    <tr>
      <td style="padding:26px 0 0 0;${paper()}">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr>
            <td align="center" bgcolor="${C.cta}" style="background-color:${C.cta};border-radius:11px;">
              <a class="ml-cta" href="${origin}/explore" style="display:inline-block;width:100%;padding:15px 18px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.2;font-weight:700;letter-spacing:-0.01em;color:${C.ctaText} !important;text-decoration:none;text-align:center;box-sizing:border-box;">
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
    lines.push(
      `${slide.companyName || slide.ticker || "Company"}${slide.moveLabel ? `  ${slide.moveLabel}` : ""}`,
    );
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

function styles(): string {
  return `
    :root { color-scheme: light only; supported-color-schemes: light; }
    body, .ml-body, .ml-shell, .ml-card {
      background-color:${C.page} !important;
      color:${C.ink} !important;
    }
    a { text-decoration:none; }
    a.ml-cta { color:${C.ctaText} !important; }
    table { border-collapse:collapse; }
    img { border:0; outline:none; text-decoration:none; }
    @media (max-width:480px) {
      .ml-pad { padding-left:14px !important; padding-right:14px !important; }
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
  <style type="text/css">${styles()}</style>
  <!--[if mso]>
  <style type="text/css">
    body, table, td { background-color:${C.page} !important; }
  </style>
  <![endif]-->
</head>
<body class="ml-body" bgcolor="${C.page}" style="margin:0;padding:0;background-color:${C.page};color:${C.ink};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;mso-hide:all;">${preheader}</div>
  <table role="presentation" class="ml-shell" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.page}" style="background-color:${C.page};">
    <tr>
      <td align="center" class="ml-pad" bgcolor="${C.page}" style="padding:24px 16px 40px 16px;background-color:${C.page};">
        <table role="presentation" class="ml-card" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.paper}" style="max-width:540px;background-color:${C.paper};border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 24px 30px 24px;${paper()}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${renderHeader(origin)}
                ${renderHero(dateLabel, count)}
                ${
                  cardsHtml ||
                  `<tr><td style="padding:28px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;color:${C.muted};${paper()}">No new disclosures today.</td></tr>`
                }
                ${renderCta(origin)}
              </table>
            </td>
          </tr>
        </table>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;">
          <tr>
            <td align="center" style="padding:18px 10px 0 10px;text-align:center;background-color:${C.page};">
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
