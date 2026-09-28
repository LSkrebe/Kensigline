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
            : kicker === "Coatue"
              ? "coatue"
              : null);
  const origin = process.env.FRONTEND_URL?.replace(/\/$/, "") || "https://mercerline.com";
  const ticker = String(partial.ticker ?? "NVDA").trim().toUpperCase();
  const source = partial.source ?? "ptr";
  const investorType =
    partial.investorType ??
    (source === "ptr"
      ? "Politician"
      : source === "form4"
        ? "Insider"
        : source === "13f"
          ? "Institution"
          : null);
  const companyName =
    partial.companyName ??
    (ticker === "NVDA"
      ? "NVIDIA"
      : ticker === "AAPL"
        ? "Apple"
        : ticker === "TSM"
          ? "TSMC"
          : ticker === "META"
            ? "Meta"
            : ticker === "AMZN"
              ? "Amazon"
              : ticker);
  return {
    typeId: "trade",
    kicker,
    summary: "",
    source,
    ticker,
    companyName,
    investorType,
    actionLabel: null,
    moveLabel: null,
    moveUp: true,
    weightChangeLabel: null,
    perfLabel: null,
    perfTone: null,
    sparklineUrl: null,
    actorSlug,
    portraitUrl: actorSlug ? `${origin}/investors/${actorSlug}.webp` : null,
    companyLogoUrl: ticker ? `${origin}/intro/company-logos/${ticker}.png` : null,
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
        typeId: "politician_purchase",
        source: "ptr",
        ticker: "NVDA",
        actionLabel: "Buy",
        weightChangeLabel: "0% → 2.4%",
        perfLabel: "+18.6%",
        perfTone: "up",
        moveUp: true,
      }),
      mockSlide({
        id: "mock-buffett-aapl",
        kicker: "Berkshire Hathaway",
        headline: "Trimmed Apple stake",
        typeId: "13f_trim",
        source: "13f",
        ticker: "AAPL",
        actionLabel: "Decrease",
        weightChangeLabel: "6.8% → 4.1%",
        perfLabel: "+9.2%",
        perfTone: "up",
        moveUp: false,
      }),
      mockSlide({
        id: "mock-huang-tsm",
        kicker: "Jensen Huang",
        headline: "Purchased TSM",
        typeId: "insider_purchase",
        source: "form4",
        ticker: "TSM",
        actionLabel: "Buy",
        weightChangeLabel: "0% → 1.1%",
        perfLabel: "+24.3%",
        perfTone: "up",
        moveUp: true,
      }),
    ],
    headlineSlides: [
      mockSlide({
        id: "mock-druckenmiller-meta",
        kicker: "Stanley Druckenmiller",
        headline: "Added META",
        typeId: "13f_add",
        source: "13f",
        ticker: "META",
        actionLabel: "Increase",
        weightChangeLabel: "2.0% → 3.5%",
        perfLabel: "+11.4%",
        perfTone: "up",
        moveUp: true,
      }),
      mockSlide({
        id: "mock-coatue-amzn",
        kicker: "Coatue",
        headline: "Opened AMZN position",
        typeId: "13f_add",
        source: "13f",
        ticker: "AMZN",
        actionLabel: "New",
        weightChangeLabel: "0% → 1.8%",
        perfLabel: "−3.1%",
        perfTone: "down",
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
