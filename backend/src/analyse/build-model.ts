import { loadTickerSecBundle } from "../core/sec.js";
import { getDocumentsWatermarkForTicker } from "../core/ticker-context-cache.js";
import { forwardRevenueGrowthFromDocuments } from "../research/market/guidance.js";
import { aggregateBusinessDriversFromDocuments } from "./drivers-from-documents.js";
import {
  advanceFiscalQuarter,
  epsStr,
  growthYoYStr,
  pctStr,
  quarterlyPnlFromCompanyFacts,
  revenueYoYGrowthSeries,
  toMillions,
  type QuarterlyPnlPoint,
} from "./quarterly-pnl.js";
import { quarterShortLabel } from "../core/xbrl-facts.js";
import type { AnalyseModel, AnalyseModelRow, AnalyseRevenueOverlay } from "./types.js";

const TOTAL_COLUMNS = 10;
const ESTIMATE_COLUMNS = 4;

type BuildArgs = {
  ticker: string;
  latestPrice: number | null;
  sharesOutstanding: number | null;
};

type CacheEntry = {
  watermark: string | null;
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

function projectRevenueSeries(
  actualMillions: (number | null)[],
  estimateCount: number,
  forwardAnnualGrowthPct: number | null,
): number[] {
  const out = actualMillions.map((v) => (v != null ? v : 0));
  const lastActual = [...out].reverse().find((v) => v > 0) ?? 0;
  const qGrowth =
    forwardAnnualGrowthPct != null && Number.isFinite(forwardAnnualGrowthPct)
      ? Math.pow(1 + forwardAnnualGrowthPct / 100, 0.25) - 1
      : 0.02;

  let cursor = lastActual > 0 ? lastActual : 1000;
  for (let i = 0; i < estimateCount; i++) {
    cursor = Math.round(cursor * (1 + qGrowth));
    out.push(cursor);
  }
  return out;
}

function ratiosFromPoint(p: QuarterlyPnlPoint | null) {
  const revM = toMillions(p?.revenueUsd ?? null) ?? 0;
  const gpM = toMillions(p?.grossProfitUsd ?? null) ?? 0;
  const oiM = toMillions(p?.operatingIncomeUsd ?? null) ?? 0;
  const niM = toMillions(p?.netIncomeUsd ?? null) ?? 0;
  return {
    grossMargin: revM > 0 ? gpM / revM : 0.5,
    opMargin: revM > 0 ? oiM / revM : 0.2,
    netMargin: revM > 0 ? niM / revM : 0.15,
    opexRatio: revM > 0 ? (toMillions(p?.operatingExpensesUsd ?? null) ?? 0) / revM : 0.3,
    fcfRatio:
      revM > 0 && p?.fcfUsd != null ? (toMillions(p.fcfUsd) ?? 0) / revM : revM > 0 ? niM / revM : 0.12,
    sharesM: p?.shares != null ? Math.round(p.shares / 1e6) : null,
    cashM: toMillions(p?.cashUsd ?? null),
    debtM: toMillions(p?.debtUsd ?? null),
  };
}

function buildHistoricalRows(
  points: QuarterlyPnlPoint[],
  revenueMillions: number[],
  estimateFrom: number,
): AnalyseModelRow[] {
  const allPoints = points;
  const anchor = allPoints[allPoints.length - 1] ?? null;
  const ratios = ratiosFromPoint(anchor);

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

    let gpM = toMillions(src?.grossProfitUsd ?? null);
    let opexM = toMillions(src?.operatingExpensesUsd ?? null);
    let oiM = toMillions(src?.operatingIncomeUsd ?? null);
    let niM = toMillions(src?.netIncomeUsd ?? null);
    let fcfM = toMillions(src?.fcfUsd ?? null);
    let cashM = toMillions(src?.cashUsd ?? null);
    let debtM = toMillions(src?.debtUsd ?? null);
    let shM = src?.shares != null ? Math.round(src.shares / 1e6) : ratios.sharesM;

    if (isEstimate || gpM == null) gpM = Math.round(revM * ratios.grossMargin);
    if (isEstimate || opexM == null) opexM = Math.round(revM * ratios.opexRatio);
    if (isEstimate || oiM == null) oiM = Math.round(revM * ratios.opMargin);
    if (isEstimate || niM == null) niM = Math.round(revM * ratios.netMargin);
    if (isEstimate || fcfM == null) fcfM = Math.round(revM * ratios.fcfRatio);
    if (isEstimate || cashM == null) cashM = cash[i - 1] ?? ratios.cashM ?? null;
    if (isEstimate || debtM == null) debtM = debt[i - 1] ?? ratios.debtM ?? null;
    if (isEstimate || shM == null) shM = shares[i - 1] ?? ratios.sharesM ?? null;

    grossProfit.push(gpM);
    grossMargin.push(pctStr(revM > 0 && gpM != null ? (gpM / revM) * 100 : null));
    opex.push(opexM);
    opIncome.push(oiM);
    opMargin.push(pctStr(revM > 0 && oiM != null ? (oiM / revM) * 100 : null));
    netIncome.push(niM);
    eps.push(
      epsStr(
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
  revenueMillions: number[];
  netIncomeMillions: (number | null)[];
  colIndex: number;
  price: number | null;
  sharesOutstanding: number | null;
  bridgeDriverLabels: string[];
}): AnalyseModel["valuationConfig"] {
  const ni = args.netIncomeMillions[args.colIndex];
  const sh = args.sharesOutstanding;
  const eps = ni != null && sh != null && sh > 0 ? (ni * 1e6) / sh : null;
  const pe =
    eps != null && eps > 0 && args.price != null ? args.price / eps : eps != null && eps > 0 ? 25 : 20;

  const mcapB =
    args.price != null && sh != null && sh > 0 ? (args.price * sh) / 1e9 : null;

  return {
    targetPe: Math.round(pe * 10) / 10,
    marketPrice: args.price != null ? Math.round(args.price * 100) / 100 : null,
    marketCapBillions: mcapB != null ? Math.round(mcapB * 10) / 10 : null,
    enterpriseValueBillions: mcapB != null ? Math.round(mcapB * 0.95 * 10) / 10 : null,
    bridgeDriverLabels: args.bridgeDriverLabels,
  };
}

function quarterLabelsFromPoints(
  points: QuarterlyPnlPoint[],
  estimateCount: number,
): { labels: string[]; estimateFrom: number } {
  const histLabels = points.map((p) => p.label);
  const last = points[points.length - 1]!;
  let fy = last.fy;
  let fp = last.fp;
  const estLabels: string[] = [];
  for (let i = 1; i <= estimateCount; i++) {
    const next = advanceFiscalQuarter(fy, fp, i);
    estLabels.push(
      quarterShortLabel(
        { val: 0, end: "", filed: "", fy: next.fy, fp: next.fp, form: "10-Q" },
        true,
      ),
    );
  }
  return { labels: [...histLabels, ...estLabels], estimateFrom: histLabels.length };
}

export async function buildAnalyseModel(args: BuildArgs): Promise<{
  model: AnalyseModel;
  revenueOverlay: AnalyseRevenueOverlay;
  partial: boolean;
}> {
  const ticker = String(args.ticker ?? "").trim().toUpperCase();
  const sec = await loadTickerSecBundle(ticker).catch(() => null);
  const quarterly = sec ? quarterlyPnlFromCompanyFacts(sec.facts, { quarters: 8 }) : [];
  const forwardGrowth = await forwardRevenueGrowthFromDocuments(ticker).catch(() => null);
  const docDrivers = await aggregateBusinessDriversFromDocuments(ticker).catch(() => []);

  const histCount = Math.max(2, Math.min(6, quarterly.length || 2));
  const estimateCount = TOTAL_COLUMNS - histCount;
  const estimateFrom = histCount;

  let partial = false;
  let histPoints = quarterly.slice(-histCount);

  if (histPoints.length < 2) {
    partial = true;
    const now = new Date();
    const y = now.getFullYear();
    histPoints = [
      {
        label: `Q1'${String((y - 1) % 100).padStart(2, "0")}`,
        end: `${y - 1}-03-31`,
        fy: y - 1,
        fp: "Q1",
        revenueUsd: null,
        grossProfitUsd: null,
        operatingExpensesUsd: null,
        operatingIncomeUsd: null,
        netIncomeUsd: null,
        shares: args.sharesOutstanding,
        cashUsd: null,
        debtUsd: null,
        fcfUsd: null,
      },
      {
        label: `Q2'${String((y - 1) % 100).padStart(2, "0")}`,
        end: `${y - 1}-06-30`,
        fy: y - 1,
        fp: "Q2",
        revenueUsd: null,
        grossProfitUsd: null,
        operatingExpensesUsd: null,
        operatingIncomeUsd: null,
        netIncomeUsd: null,
        shares: args.sharesOutstanding,
        cashUsd: null,
        debtUsd: null,
        fcfUsd: null,
      },
    ];
  }

  const actualRevM = histPoints.map((p) => toMillions(p.revenueUsd));
  const hasSec = quarterly.length >= 2 && actualRevM.some((v) => v != null && v > 0);
  const baseRevM = hasSec
    ? actualRevM.map((v) => v ?? 0)
    : [800, 900].slice(0, histCount).map((v, i) => v + i * 50);

  const revenueMillions = projectRevenueSeries(baseRevM, estimateCount, forwardGrowth);
  const { labels, estimateFrom: estFrom } = quarterLabelsFromPoints(histPoints, estimateCount);

  const historicalModel = buildHistoricalRows(histPoints, revenueMillions, estFrom);
  const { rows: businessDrivers, source: driverSource } = buildDriverRows(docDrivers, revenueMillions, estFrom);

  const netIncomeRow = historicalModel.find((r) => r.label === "Net income");
  const netIncomeMillions = (netIncomeRow?.values ?? []).map((v) =>
    typeof v === "number" ? v : null,
  );

  const bridgeLabels = businessDrivers
    .filter((r) => r.rollsUpToRevenue !== false)
    .map((r) => r.label)
    .slice(0, 4);

  const model: AnalyseModel = {
    currency: "USD",
    unitNote: "All financials in USD millions except per share data.",
    estimateFromIndex: estFrom,
    quarters: labels.length === TOTAL_COLUMNS ? labels : [...labels].slice(0, TOTAL_COLUMNS),
    driverSectionTitle: docDrivers.length ? "Business drivers" : "Business drivers (estimated)",
    driverUnitHint: "USD millions unless noted",
    historicalModel,
    businessDrivers,
    valuationConfig: buildValuationConfig({
      revenueMillions,
      netIncomeMillions,
      colIndex: revenueMillions.length - 1,
      price: args.latestPrice,
      sharesOutstanding: args.sharesOutstanding,
      bridgeDriverLabels: bridgeLabels.length ? bridgeLabels : ["Core revenue", "Other revenue"],
    }),
    sources: {
      historical: hasSec ? "sec_companyfacts" : null,
      drivers: driverSource,
      forward: forwardGrowth != null ? "documents" : null,
    },
  };

  const overlayValues = hasSec ? revenueYoYGrowthSeries(quarterly).slice(-8) : [];
  const revenueOverlay: AnalyseRevenueOverlay = {
    values: overlayValues.length ? overlayValues : revenueMillions.slice(-8).map((v, i, arr) => {
      const prior = i > 0 ? arr[i - 1]! : null;
      if (prior == null || prior === 0) return 0;
      return Math.round(((v - prior) / prior) * 1000) / 10;
    }),
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
  const cached = modelCache.get(ticker);
  if (cached && cached.watermark === watermark) return cached.payload;

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

  const payload = await buildAnalyseModel({ ticker, latestPrice, sharesOutstanding });
  modelCache.set(ticker, { watermark, payload });
  return payload;
}

export function invalidateAnalyseModelCache(tickerInput: string): void {
  const ticker = String(tickerInput ?? "").trim().toUpperCase();
  if (ticker) modelCache.delete(ticker);
}
