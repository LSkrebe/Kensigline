import type http from "node:http";
import { sendJson } from "../core/http.js";
import { buildExploreDirectoryEvents, buildExploreRecapDayPayload } from "./recap-day.js";

export async function handleExploreRecap(res: http.ServerResponse) {
  try {
    const payload = await buildExploreRecapDayPayload();
    sendJson(res, 200, payload);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/recap]", msg);
    sendJson(res, 500, { ok: false, error: "explore_recap_failed", message: msg });
  }
}

export async function handleExploreDirectory(res: http.ServerResponse) {
  try {
    const payload = await buildExploreDirectoryEvents();
    sendJson(res, 200, { ok: true, ...payload });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[explore/directory]", msg);
    sendJson(res, 500, { ok: false, error: "explore_directory_failed", message: msg });
  }
}
