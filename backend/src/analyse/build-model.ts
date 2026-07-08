import { loadTickerSecBundle } from "../core/sec.js";
import { getDocumentsWatermarkForTicker } from "../core/ticker-context-cache.js";
import { forwardRevenueGrowthFromDocuments } from "../research/market/guidance.js";
import { aggregateBusinessDriversFromDocuments } from "./drivers-from-documents.js";
import {
  buildBaseCaseQuarterlyProjection,
  revenueMillionsFromProjection,
} from "./base-case-projection.js";
import { fetchConsensusEstimates } from "./consensus-estimates.js";
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
  revenueMillions: number[],
  estimateFrom: number,
  projection: ProjectedQuarterPnl[],
): AnalyseModelRow[] {
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
    const revM = revenueMillions[i]!;
    const isEstimate = i >= estimateFrom;
    const src = isEstimate ? null : allPoints[i] ?? null;
    const proj = isEstimate ? projection[i - estimateFrom] : null;

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

    if (!isEstimate && gpM == null && revM > 0) gpM = Math.round(revM * 0.5);
    if (!isEstimate && opexM == null && revM > 0) opexM = Math.round(revM * 0.3);
    if (!isEstimate && oiM == null && gpM != null && opexM != null) oiM = gpM - opexM;
    if (!isEstimate && niM == null && oiM != null) niM = Math.round(oiM * 0.77);
    if (!isEstimate && fcfM == null && revM > 0) fcfM = Math.round(revM * 0.12);
    if (cashM == null) cashM = cash[i - 1] ?? toMillions(anchor?.cashUsd ?? null);
    if (debtM == null) debtM = debt[i - 1] ?? toMillions(anchor?.debtUsd ?? null);
    if (shM == null) shM = shares[i - 1] ?? (anchor?.shares != null ? Math.round(anchor.shares / 1e6) : null);

    grossProfit.push(gpM);
    grossMargin.push(
      proj != null ? pctStr(proj.grossMarginPct) : pctStr(revM > 0 && gpM != null ? (gpM / revM) * 100 : null),
    );
    opex.push(opexM);
    opIncome.push(oiM);
    opMargin.push(
      proj != null ? pctStr(proj.opMarginPct) : pctStr(revM > 0 && oiM != null ? (oiM / revM) * 100 : null),
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

    const priorRev = i >= 4 ? revenueMillions[i - 4]! : null;
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
    numRow("Revenue", revenueMillions),
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

function defaultRevenueDrivers(revenueMillions: number[]): AnalyseModelRow[] {
  return [
    {
      label: "Core revenue",
      driverKind: "revenue",
      rollsUpToRevenue: true,
      values: revenueMillions.map((v) => Math.round(v * 0.72)),
    },
    {
      label: "Other revenue",
      driverKind: "revenue",
      rollsUpToRevenue: true,
      values: revenueMillions.map((v) => Math.round(v * 0.28)),
    },
  ];
}

function buildDriverRows(
  drivers: Awaited<ReturnType<typeof aggregateBusinessDriversFromDocuments>>,
  revenueMillions: number[],
  estimateFrom: number,
): { rows: AnalyseModelRow[]; source: "documents" | "derived" } {
  if (!drivers.length) {
    return { rows: defaultRevenueDrivers(revenueMillions), source: "derived" };
  }

  const revenueDrivers = drivers.filter((d) => d.rollsUpToRevenue);
  const nonRevenue = drivers.filter((d) => !d.rollsUpToRevenue);

  const knownSum = revenueDrivers.reduce((s, d) => s + (d.latestValue ?? 0), 0);
  const anchorRev = revenueMillions[estimateFrom - 1] ?? revenueMillions[estimateFrom] ?? 0;

  const rows: AnalyseModelRow[] = [];

  for (const d of revenueDrivers) {
    const values = revenueMillions.map((rev, idx) => {
      if (idx < estimateFrom) {
        if (knownSum > 0 && d.latestValue != null && anchorRev > 0 && idx === estimateFrom - 1) {
          return Math.round((d.latestValue / knownSum) * rev);
        }
        const share = knownSum > 0 && d.latestValue != null ? d.latestValue / knownSum : 1 / revenueDrivers.length;
        return Math.round(rev * share);
      }
      if (d.latestValue != null && anchorRev > 0) {
        const share = d.latestValue / anchorRev;
        return Math.round(rev * Math.min(1, share));
      }
      return Math.round(rev / Math.max(1, revenueDrivers.length));
    });

    rows.push({
      label: d.label,
      driverKind: d.driverKind,
      rollsUpToRevenue: true,
      readOnly: d.readOnly,
      values,
    });
  }

  for (const d of nonRevenue) {
    const anchor = d.latestValue ?? 0;
    const values = revenueMillions.map((_, idx) => {
      if (idx < estimateFrom) return idx === estimateFrom - 1 ? anchor : "—";
      return Math.round(anchor * Math.pow(1.02, idx - estimateFrom + 1));
    });
    rows.push({
      label: d.label,
      driverKind: d.driverKind,
      rollsUpToRevenue: false,
      readOnly: d.readOnly,
      values,
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
  const forwardGrowth = await forwardRevenueGrowthFromDocuments(ticker).catch(() => null);
  const consensus = await fetchConsensusEstimates(ticker).catch(() => null);
  const docDrivers = await aggregateBusinessDriversFromDocuments(ticker).catch(() => []);

  let partial = false;
  let histPoints = histPointsForWindow(quarterWindow, byCalendar, args.sharesOutstanding);

  const filledHist = histPoints.filter((p) => (toMillions(p.revenueUsd) ?? 0) > 0);
  if (filledHist.length < 2) {
    partial = true;
    histPoints = histPoints.map((p, i) => ({
      ...p,
      revenueUsd: p.revenueUsd ?? (800 + i * 50) * 1e6,
      grossProfitUsd: p.grossProfitUsd ?? (800 + i * 50) * 1e6 * 0.52,
      operatingExpensesUsd: p.operatingExpensesUsd ?? (800 + i * 50) * 1e6 * 0.25,
      operatingIncomeUsd: p.operatingIncomeUsd ?? (800 + i * 50) * 1e6 * 0.27,
      netIncomeUsd: p.netIncomeUsd ?? (800 + i * 50) * 1e6 * 0.21,
      fcfUsd: p.fcfUsd ?? (800 + i * 50) * 1e6 * 0.12,
    }));
  }

  const actualRevM = histPoints.map((p) => toMillions(p.revenueUsd));
  const hasSec = filledHist.length >= 2;
  const baseRevM = hasSec
    ? actualRevM.map((v) => v ?? 0)
    : histPoints.map((_, i) => 800 + i * 50);

  const projection = buildBaseCaseQuarterlyProjection({
    historicalPoints: histPoints,
    longHistoryPoints: quarterlyLong.length ? quarterlyLong : histPoints,
    estimateCount,
    consensus,
    documentRevenueGrowthPct: forwardGrowth,
  });

  const revenueMillions =
    projection.length > 0
      ? revenueMillionsFromProjection(baseRevM, projection)
      : [
          ...baseRevM,
          ...Array.from({ length: estimateCount }, (_, i) =>
            Math.round((baseRevM.at(-1) ?? 1000) * Math.pow(1.02, i + 1)),
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
    driverUnitHint: "USD millions unless noted",
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
      forward: consensus
        ? "consensus"
        : forwardGrowth != null
          ? "documents"
          : "derived",
    },
    projectionNote:
      "Base case — annual P&L, consensus FY1–FY2 when available, fiscal seasonality, NTM valuation.",
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

  const overlayFromModel = revenueMillions.slice(0, estFrom).map((v, i, arr) => {
    const prior = i >= 4 ? revenueMillions[i - 4] : null;
    if (prior == null || prior === 0) return 0;
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
