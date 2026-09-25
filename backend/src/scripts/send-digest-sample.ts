/**
 * Send (or write) a filing-brief sample with mock data.
 *
 *   npx tsx src/scripts/send-digest-sample.ts
 *   npx tsx src/scripts/send-digest-sample.ts --to you@example.com
 *   npx tsx src/scripts/send-digest-sample.ts --write ./tmp/digest-sample.html
 */
import "../load-env.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { digestTestRecipient } from "../alerts/config.js";
import type { DigestContent, DigestSlide } from "../alerts/digest-content.js";
import {
  buildDigestEmail,
  buildDigestPlainText,
  buildDigestSubject,
} from "../alerts/digest-email.js";
import { sendResendEmail } from "../alerts/resend.js";

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1) return null;
  return String(process.argv[idx + 1] ?? "").trim() || null;
}

function mockSlide(partial: Partial<DigestSlide> & Pick<DigestSlide, "id" | "headline">): DigestSlide {
  const kicker = partial.kicker ?? "Nancy Pelosi";
  const actorSlug =
    partial.actorSlug ??
    (kicker === "Nancy Pelosi"
      ? "nancy-pelosi"
      : kicker === "Berkshire Hathaway"
        ? "berkshire-hathaway"
        : kicker === "Jensen Huang"
          ? "jensen-huang"
          : kicker === "Stanley Druckenmiller"
            ? "duquesne-family-office"
            : null);
  const origin = process.env.FRONTEND_ORIGIN?.replace(/\/$/, "") || "https://mercerline.com";
  return {
    typeId: "trade",
    kicker,
    summary: "",
    source: "ptr",
    ticker: "NVDA",
    moveLabel: null,
    moveUp: true,
    sparklineUrl: null,
    actorSlug,
    portraitUrl: actorSlug ? `${origin}/investors/${actorSlug}.webp` : null,
    ...partial,
  };
}

function mockDigestContent(): DigestContent {
  const dayKey = new Date().toISOString().slice(0, 10);
  return {
    dayKey,
    displayDayKey: dayKey,
    isFallback: false,
    generatedAt: new Date().toISOString(),
    heroSlides: [
      mockSlide({
        id: "mock-pelosi-nvda",
        kicker: "Nancy Pelosi",
        headline: "Bought NVDA call options",
        source: "ptr",
        ticker: "NVDA",
        moveLabel: "+4.2%",
        moveUp: true,
      }),
      mockSlide({
        id: "mock-buffett-aapl",
        kicker: "Berkshire Hathaway",
        headline: "Trimmed Apple stake",
        source: "13f",
        ticker: "AAPL",
        moveLabel: "−1.8%",
        moveUp: false,
      }),
      mockSlide({
        id: "mock-huang-tsm",
        kicker: "Jensen Huang",
        headline: "Purchased TSM",
        source: "form4",
        ticker: "TSM",
        moveLabel: "+2.1%",
        moveUp: true,
      }),
    ],
    headlineSlides: [
      mockSlide({
        id: "mock-druckenmiller-meta",
        kicker: "Stanley Druckenmiller",
        headline: "Added META",
        source: "13f",
        ticker: "META",
        moveLabel: "+0.9%",
        moveUp: true,
      }),
      mockSlide({
        id: "mock-coatue-amzn",
        kicker: "Coatue",
        headline: "Opened AMZN position",
        source: "13f",
        ticker: "AMZN",
        moveLabel: "−0.4%",
        moveUp: false,
      }),
    ],
  };
}

async function main() {
  const content = mockDigestContent();
  const bundle = buildDigestEmail(content);
  const subject = buildDigestSubject(content);
  const text = buildDigestPlainText(content);

  const writePath = readArg("--write");
  if (writePath) {
    const abs = resolve(writePath);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, bundle.html, "utf8");
    console.log("[digest-sample] wrote", abs);
  }

  const to =
    readArg("--to") ??
    (process.argv.includes("--no-send") ? null : digestTestRecipient());

  if (!to) {
    if (!writePath) {
      console.log("[digest-sample] no recipient; pass --to or set DIGEST_TEST_TO (or --write)");
      process.exitCode = 1;
    }
    return;
  }

  const result = await sendResendEmail({
    to,
    subject: `[Sample] ${subject}`,
    html: bundle.html,
    text,
    attachments: bundle.attachments,
  });

  if (!result.ok) {
    console.error("[digest-sample] send failed", result);
    process.exitCode = 1;
    return;
  }

  console.log("[digest-sample] sent", { to, messageId: result.id, subject: `[Sample] ${subject}` });
}

main().catch((err) => {
  console.error("[digest-sample] fatal", err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
