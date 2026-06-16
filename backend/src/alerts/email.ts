import type { IdeaCandidate } from "./candidates.js";

function escapeHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderDigestHtml(items: IdeaCandidate[]): string {
  const rows = items
    .map(
      (it) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;font-weight:600;">${escapeHtml(it.idea_grade)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;"><a href="${escapeHtml(it.url ?? "#")}">${escapeHtml(it.ticker)}</a></td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;">${escapeHtml(it.feed)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;">${escapeHtml(it.summary)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e8e8e8;text-align:right;">${it.idea_score}</td>
      </tr>`,
    )
    .join("");
  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#111;">
    <h2 style="margin:0 0 12px;">Kensigline idea digest</h2>
    <p style="color:#555;margin:0 0 16px;">Top scored signals from your enabled feeds.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px;">
      <thead><tr style="background:#f4f4f4;text-align:left;">
        <th style="padding:8px 12px;">Grade</th><th style="padding:8px 12px;">Ticker</th><th style="padding:8px 12px;">Feed</th><th style="padding:8px 12px;">Summary</th><th style="padding:8px 12px;text-align:right;">Score</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`;
}

function renderDigestText(items: IdeaCandidate[]): string {
  const lines = items.map(
    (it) => `[${it.idea_grade}] ${it.ticker} (${it.feed}, ${it.idea_score}) — ${it.summary}\n${it.url ?? ""}`,
  );
  return `Kensigline idea digest\n\n${lines.join("\n\n")}`;
}

function parseFromAddress(raw: string): { name?: string; email: string } {
  const s = String(raw ?? "").trim();
  const m = s.match(/^(.+?)\s*<([^>]+)>$/);
  if (m?.[1] && m[2]) return { name: m[1].trim(), email: m[2].trim() };
  return { email: s };
}

/** Send digest via Brevo transactional API (300 emails/day on free tier). */
export async function sendIdeaDigestEmail(opts: { to: string; subject: string; items: IdeaCandidate[] }): Promise<boolean> {
  const apiKey = String(process.env.BREVO_API_KEY ?? "").trim();
  const fromRaw = String(process.env.ALERT_EMAIL_FROM ?? "Kensigline <alerts@kensigline.com>").trim();
  if (!apiKey) {
    console.warn("[alerts] BREVO_API_KEY not set; digest skipped", { to: opts.to, items: opts.items.length });
    return false;
  }

  const sender = parseFromAddress(fromRaw);
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: opts.to }],
      subject: opts.subject,
      htmlContent: renderDigestHtml(opts.items),
      textContent: renderDigestText(opts.items),
    }),
  });

  if (!r.ok) {
    const body = await r.text().catch(() => "");
    console.error("[alerts] brevo_send_failed", r.status, body.slice(0, 500));
    return false;
  }
  return true;
}
