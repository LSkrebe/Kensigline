import { loadTickerSecBundle } from "../core/sec.js";
import { getDocumentsWatermarkForTicker } from "../core/ticker-context-cache.js";
import { aggregateBusinessDriversFromDocuments } from "./drivers-from-documents.js";
import {
  buildBaseCaseQuarterlyProjection,
  revenueMillionsFromProjection,
} from "./base-case-projection.js";
import {
  epsStr,
  growthYoYStr,
  pctStr,
  quarterlyPnlFromCompanyFacts,
  toMillions,
  type QuarterlyPnlPoint,
} from "./quarterly-pnl.js";
import type { ProjectedQuarterPnl } from "./base-case-projection.js";
import type { AnalyseModel, AnalyseModelRow, AnalyseRevenueOverlay } from "./types.js";
import { assessModelQuality, buildValuationMetrics } from "./model-quality.js";
import {
  buildAnalyseQuarterWindow,
  ESTIMATE_QUARTERS,
  HISTORICAL_QUARTERS,
  indexQuarterlyPointsByCalendar,
  histPointsForWindow,
  TOTAL_COLUMNS,
} from "./quarter-window.js";

type BuildArgs = {
  ticker: string;
  latestPrice: number | null;
  sharesOutstanding: number | null;
  industry: string | null;
};

type CacheEntry = {
  watermark: string | null;
  windowKey: string;
  payload: { model: AnalyseModel; revenueOverlay: AnalyseRevenueOverlay; partial: boolean };
};

const modelCache = new Map<string, CacheEntry>();

function numRow(label: string, values: (number | null)[], extra: Partial<AnalyseModelRow> = {}): AnalyseModelRow {
  return {
    label,
    values: values.map((v) => (v == null ? "—" : v)),
    ...extra,
  };
}

function buildHistoricalRows(
  points: QuarterlyPnlPoint[],
  revenueMillions: (number | null)[],
  estimateFrom: number,
  projection: ProjectedQuarterPnl[],
): AnalyseModelRow[] {
  const MIN_REV_M = 5;
  const allPoints = points;
  const anchor = allPoints[allPoints.length - 1] ?? null;

  const grossProfit: (number | null)[] = [];
  const grossMargin: string[] = [];
  const opex: (number | null)[] = [];
  const opIncome: (number | null)[] = [];
  const opMargin: string[] = [];
  const netIncome: (number | null)[] = [];
  const eps: string[] = [];
  const shares: (number | null)[] = [];
  const cash: (number | null)[] = [];
  const debt: (number | null)[] = [];
  const fcf: (number | null)[] = [];
  const revGrowth: string[] = [];
  const epsGrowth: string[] = [];

  for (let i = 0; i < revenueMillions.length; i++) {
    const revM = revenueMillions[i] ?? null;
    const isEstimate = i >= estimateFrom;
    const src = isEstimate ? null : allPoints[i] ?? null;
    const proj = isEstimate ? projection[i - estimateFrom] : null;
    const canInfer = !isEstimate && revM != null && revM >= MIN_REV_M;

    let gpM = proj?.grossProfitM ?? toMillions(src?.grossProfitUsd ?? null);
    let opexM = proj?.opexM ?? toMillions(src?.operatingExpensesUsd ?? null);
    let oiM = proj?.opIncomeM ?? toMillions(src?.operatingIncomeUsd ?? null);
    let niM = proj?.netIncomeM ?? toMillions(src?.netIncomeUsd ?? null);
    let fcfM = proj?.fcfM ?? toMillions(src?.fcfUsd ?? null);
    let cashM = proj?.cashM ?? toMillions(src?.cashUsd ?? null);
    let debtM = proj?.debtM ?? toMillions(src?.debtUsd ?? null);
    let shM =
      proj?.sharesM ??
      (src?.shares != null ? Math.round(src.shares / 1e6) : anchor?.shares != null ? Math.round(anchor.shares / 1e6) : null);

    if (canInfer && gpM == null) gpM = Math.round(revM * 0.5);
    if (canInfer && opexM == null) opexM = Math.round(revM * 0.3);
    if (canInfer && oiM == null && gpM != null && opexM != null) oiM = gpM - opexM;
    if (canInfer && niM == null && oiM != null) niM = Math.round(oiM * 0.77);
    if (canInfer && fcfM == null) fcfM = Math.round(revM * 0.12);
    if (cashM == null) cashM = cash[i - 1] ?? toMillions(anchor?.cashUsd ?? null);
    if (debtM == null) debtM = debt[i - 1] ?? toMillions(anchor?.debtUsd ?? null);
    if (shM == null) shM = shares[i - 1] ?? (anchor?.shares != null ? Math.round(anchor.shares / 1e6) : null);

    grossProfit.push(gpM);
    grossMargin.push(
      proj != null ? pctStr(proj.grossMarginPct) : pctStr(revM != null && revM > 0 && gpM != null ? (gpM / revM) * 100 : null),
    );
    opex.push(opexM);
    opIncome.push(oiM);
    opMargin.push(
      proj != null ? pctStr(proj.opMarginPct) : pctStr(revM != null && revM > 0 && oiM != null ? (oiM / revM) * 100 : null),
    );
    netIncome.push(niM);
    eps.push(
      proj != null
        ? proj.eps.toFixed(2)
        : epsStr(
            niM != null ? niM * 1e6 : null,
            shM != null ? shM * 1e6 : null,
          ),
    );
    shares.push(shM);
    cash.push(cashM);
    debt.push(debtM);
    fcf.push(fcfM);

    const priorRev = i >= 4 ? revenueMillions[i - 4] ?? null : null;
    revGrowth.push(growthYoYStr(revM, priorRev));

    const priorEps = i >= 4 ? parseFloat(String(eps[i - 4] ?? "")) : NaN;
    const currEps = parseFloat(String(eps[i] ?? ""));
    if (Number.isFinite(priorEps) && priorEps !== 0 && Number.isFinite(currEps)) {
      epsGrowth.push(growthYoYStr(currEps, priorEps));
    } else {
      epsGrowth.push("—");
    }
  }

  return [
    numRow(
      "Revenue",
      revenueMillions.map((v) => (v == null || v === 0 ? null : v)),
    ),
    numRow("Gross profit", grossProfit),
    { label: "Gross margin", values: grossMargin, kind: "pct" },
    numRow("Operating expenses", opex),
    numRow("Operating income", opIncome),
    { label: "Operating margin", values: opMargin, kind: "pct" },
    numRow("Net income", netIncome),
    { label: "EPS ($)", values: eps, kind: "eps" },
    numRow("Shares outstanding (M)", shares),
    numRow("Cash & equivalents", cash),
    numRow("Total debt", debt),
    numRow("Free cash flow", fcf),
    { label: "Revenue growth (YoY)", values: revGrowth, kind: "growth" },
    { label: "EPS growth (YoY)", values: epsGrowth, kind: "growth" },
  ];
}

function buildDriverRows(
  drivers: Awaited<ReturnType<typeof aggregateBusinessDriversFromDocuments>>,
  revenueMillions: (number | null)[],
  estimateFrom: number,
): { rows: AnalyseModelRow[]; source: "documents" | "derived" } {
  const colCount = revenueMillions.length;
  const revNum = (v: number | null | undefined) => (v != null && Number.isFinite(v) ? v : 0);
  const dashForward = (histValues: (number | string)[]): (number | string)[] => [
    ...histValues,
    ...Array(Math.max(0, colCount - estimateFrom)).fill("—"),
  ];

  if (!drivers.length) {
    const histRev = revenueMillions.slice(0, estimateFrom).map(revNum);
    return {
      rows: [
        {
          label: "Core revenue",
          driverKind: "revenue",
          rollsUpToRevenue: true,
          values: dashForward(histRev.map((v) => Math.round(v * 0.72))),
        },
        {
          label: "Other revenue",
          driverKind: "revenue",
          rollsUpToRevenue: true,
          values: dashForward(histRev.map((v) => Math.round(v * 0.28))),
        },
      ],
      source: "derived",
    };
  }

  const revenueDrivers = drivers.filter((d) => d.rollsUpToRevenue);
  const nonRevenue = drivers.filter((d) => !d.rollsUpToRevenue);

  const knownSum = revenueDrivers.reduce((s, d) => s + (d.latestValue ?? 0), 0);
  const anchorRev = revNum(revenueMillions[estimateFrom - 1]) || revNum(revenueMillions[estimateFrom]);

  const rows: AnalyseModelRow[] = [];

  for (const d of revenueDrivers) {
    const histValues: (number | string)[] = [];
    for (let idx = 0; idx < estimateFrom; idx++) {
      const rev = revNum(revenueMillions[idx]);
      if (knownSum > 0 && d.latestValue != null && anchorRev > 0 && idx === estimateFrom - 1) {
        histValues.push(Math.round((d.latestValue / knownSum) * rev));
      } else {
        const share =
          knownSum > 0 && d.latestValue != null ? d.latestValue / knownSum : 1 / revenueDrivers.length;
        histValues.push(Math.round(rev * share));
      }
    }

    rows.push({
      label: d.label,
      driverKind: d.driverKind,
      rollsUpToRevenue: true,
      readOnly: true,
      values: dashForward(histValues),
    });
  }

  for (const d of nonRevenue) {
    const anchor = d.latestValue ?? 0;
    const histValues: (number | string)[] = [];
    for (let idx = 0; idx < estimateFrom; idx++) {
      histValues.push(idx === estimateFrom - 1 ? anchor : "—");
    }

    rows.push({
      label: d.label,
      driverKind: d.driverKind,
      rollsUpToRevenue: false,
      readOnly: true,
      values: dashForward(histValues),
    });
  }

  return { rows, source: "documents" };
}

function buildValuationConfig(args: {
  model: AnalyseModel;
  price: number | null;
  sharesOutstanding: number | null;
  bridgeDriverLabels: string[];
  valuationAvailable: boolean;
}): AnalyseModel["valuationConfig"] {
  const metrics = buildValuationMetrics({
    model: args.model,
    price: args.price,
    sharesOutstanding: args.sharesOutstanding,
  });

  const mcapB =
    args.price != null && args.sharesOutstanding != null && args.sharesOutstanding > 0
      ? (args.price * args.sharesOutstanding) / 1e9
      : null;

  return {
    targetPe: metrics.targetPe,
    marketPrice: args.price != null ? Math.round(args.price * 100) / 100 : null,
    marketCapBillions: mcapB != null ? Math.round(mcapB * 10) / 10 : null,
    enterpriseValueBillions: mcapB != null ? Math.round(mcapB * 0.95 * 10) / 10 : null,
    bridgeDriverLabels: args.bridgeDriverLabels,
    ntmEps: metrics.ntmEps,
    ltmEps: metrics.ltmEps,
    priceTarget: args.valuationAvailable ? metrics.priceTarget : null,
    valuationBasis: "ntm",
    defaultColumnIndex: metrics.defaultColumnIndex,
    valuationPeriodLabel: metrics.ntmRange.label,
    valuationAvailable: args.valuationAvailable,
  };
}

export async function buildAnalyseModel(args: BuildArgs): Promise<{
  model: AnalyseModel;
  revenueOverlay: AnalyseRevenueOverlay;
  partial: boolean;
}> {
  const ticker = String(args.ticker ?? "").trim().toUpperCase();
  const sec = await loadTickerSecBundle(ticker).catch(() => null);
  const quarterWindow = buildAnalyseQuarterWindow();
  const estFrom = HISTORICAL_QUARTERS;
  const estimateCount = ESTIMATE_QUARTERS;
  const labels = quarterWindow.map((s) => s.label);

  const quarterlyLong = sec ? quarterlyPnlFromCompanyFacts(sec.facts, { quarters: 40 }) : [];
  const byCalendar = indexQuarterlyPointsByCalendar(quarterlyLong);
  const docDrivers = await aggregateBusinessDriversFromDocuments(ticker).catch(() => []);

  let partial = false;
  let histPoints = histPointsForWindow(quarterWindow, byCalendar, args.sharesOutstanding);

  const filledHist = histPoints.filter((p) => (toMillions(p.revenueUsd) ?? 0) > 0);
  if (filledHist.length < 2) throw new Error("verified_financial_history_unavailable");

  const actualRevM = histPoints.map((p) => toMillions(p.revenueUsd));
  const hasSec = true;
  const baseRevM: (number | null)[] = actualRevM;

  const projection = buildBaseCaseQuarterlyProjection({
    historicalPoints: histPoints,
    estimateCount,
  });

  const lastHistRev =
    [...baseRevM].reverse().find((v) => v != null && v > 0) ?? 1000;
  const revenueMillions: (number | null)[] =
    projection.length > 0
      ? revenueMillionsFromProjection(baseRevM, projection)
      : [
          ...baseRevM,
          ...Array.from({ length: estimateCount }, (_, i) =>
            Math.round(lastHistRev * Math.pow(1.02, i + 1)),
          ),
        ];

  const historicalModel = buildHistoricalRows(histPoints, revenueMillions, estFrom, projection);
  const { rows: businessDrivers, source: driverSource } = buildDriverRows(docDrivers, revenueMillions, estFrom);

  const bridgeLabels = businessDrivers
    .filter((r) => r.rollsUpToRevenue !== false)
    .map((r) => r.label)
    .slice(0, 4);

  const modelDraft: AnalyseModel = {
    currency: "USD",
    unitNote: "All financials in USD millions except per share data.",
    estimateFromIndex: estFrom,
    quarters: labels.length === TOTAL_COLUMNS ? labels : [...labels].slice(0, TOTAL_COLUMNS),
    driverSectionTitle: docDrivers.length ? "Business drivers" : "Business drivers (estimated)",
    driverUnitHint: "From filings — historical quarters only",
    historicalModel,
    businessDrivers,
    valuationConfig: {
      targetPe: 20,
      marketPrice: args.latestPrice != null ? Math.round(args.latestPrice * 100) / 100 : null,
      marketCapBillions: null,
      enterpriseValueBillions: null,
      bridgeDriverLabels: bridgeLabels.length ? bridgeLabels : ["Core revenue", "Other revenue"],
      ntmEps: null,
      ltmEps: null,
      priceTarget: null,
      valuationBasis: "ntm",
      defaultColumnIndex: estFrom,
      valuationPeriodLabel: "NTM",
      valuationAvailable: false,
    },
    sources: {
      historical: hasSec ? "sec_companyfacts" : null,
      drivers: driverSource,
      forward: hasSec ? "historical" : "derived",
    },
    projectionNote:
      "Reported SEC history; forward revenue and gross margin are editable — other lines derived with flat opex.",
  };

  const modelQuality = assessModelQuality({
    model: modelDraft,
    partial: partial || !hasSec,
    hasSec,
    industry: args.industry,
    price: args.latestPrice,
    sharesOutstanding: args.sharesOutstanding,
  });

  const model: AnalyseModel = {
    ...modelDraft,
    modelQuality,
    valuationConfig: buildValuationConfig({
      model: modelDraft,
      price: args.latestPrice,
      sharesOutstanding: args.sharesOutstanding,
      bridgeDriverLabels: bridgeLabels.length ? bridgeLabels : ["Core revenue", "Other revenue"],
      valuationAvailable: modelQuality.valuationAvailable,
    }),
  };

  const overlayFromModel = revenueMillions.slice(0, estFrom).map((v, i) => {
    const prior = i >= 4 ? revenueMillions[i - 4] : null;
    if (v == null || prior == null || prior === 0) return 0;
    return Math.round(((v - prior) / prior) * 1000) / 10;
  });
  const revenueOverlay: AnalyseRevenueOverlay = {
    values: overlayFromModel.length ? overlayFromModel.slice(-8) : [],
  };

  return { model, revenueOverlay, partial: partial || !hasSec };
}

export async function getAnalyseModelForTicker(tickerInput: string): Promise<{
  model: AnalyseModel;
  revenueOverlay: AnalyseRevenueOverlay;
  partial: boolean;
}> {
  const ticker = String(tickerInput ?? "").trim().toUpperCase();
  if (!ticker) throw new Error("ticker_required");

  const watermark = await getDocumentsWatermarkForTicker(ticker);
  const windowKey = buildAnalyseQuarterWindow()
    .map((s) => s.label)
    .join(",");
  const cached = modelCache.get(ticker);
  if (cached && cached.watermark === watermark && cached.windowKey === windowKey) return cached.payload;

  const sec = await loadTickerSecBundle(ticker).catch(() => null);
  let latestPrice: number | null = null;
  let sharesOutstanding: number | null = null;

  const { db } = await import("../core/db.js");
  const bar = await db.one<{ close: number }>(
    `SELECT close FROM bars WHERE ticker = $1 ORDER BY day DESC LIMIT 1`,
    [ticker],
  );
  if (bar && Number.isFinite(Number(bar.close))) latestPrice = Number(bar.close);

  if (sec?.facts) {
    const { pickFactSeries, pickLatestPeriodRow } = await import("../core/xbrl-facts.js");
    const sharesRows = pickFactSeries(sec.facts, [
      "WeightedAverageNumberOfSharesOutstandingBasic",
      "EntityCommonStockSharesOutstanding",
    ]);
    const latest = pickLatestPeriodRow(sharesRows);
    if (latest?.val) sharesOutstanding = latest.val;
  }

  let industry: string | null = null;
  try {
    const co = await db.one<{ industry: string | null }>(
      `SELECT industry FROM companies WHERE upper(trim(ticker)) = $1 LIMIT 1`,
      [ticker],
    );
    industry = co?.industry ?? null;
  } catch {
    industry = null;
  }

  const payload = await buildAnalyseModel({ ticker, latestPrice, sharesOutstanding, industry });
  modelCache.set(ticker, { watermark, windowKey, payload });
  return payload;
}

export function invalidateAnalyseModelCache(tickerInput: string): void {
  const ticker = String(tickerInput ?? "").trim().toUpperCase();
  if (ticker) modelCache.delete(ticker);
}
