import type { ServerResponse } from "node:http";
import { sendJson } from "../core/http.js";
import { getAnalyseModelForTicker } from "./build-model.js";

export async function handleAnalyseModel(res: ServerResponse, tickerInput: string): Promise<void> {
  const ticker = String(tickerInput ?? "").trim().toUpperCase();
  if (!ticker) {
    sendJson(res, 400, { ok: false, error: "ticker_required" });
    return;
  }

  try {
    const { model, revenueOverlay, partial } = await getAnalyseModelForTicker(ticker);
    sendJson(res, 200, {
      ok: true,
      ticker,
      model,
      revenueOverlay,
      partial: partial || undefined,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ticker_required")) {
      sendJson(res, 400, { ok: false, error: "ticker_required" });
      return;
    }
    if (msg === "verified_financial_history_unavailable") {
      sendJson(res, 200, { ok: true, ticker, model: null, empty: true });
      return;
    }
    console.warn("[analyse/model] failed", ticker, msg);
    // ok:false so the client keeps loading / retries instead of flashing "No financial model".
    sendJson(res, 200, {
      ok: false,
      ticker,
      error: "analyse_model_unavailable",
    });
  }
}
