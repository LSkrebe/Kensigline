import type http from "node:http";
import { sparklineMonthSeries, sparklinePngBuffer } from "./digest-sparkline.js";

export async function handleDigestSparklinePng(
  _req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
): Promise<void> {
  const raw = String(url.searchParams.get("d") ?? "").trim();
  if (!raw) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("missing d");
    return;
  }

  const series = sparklineMonthSeries(
    raw
      .split(",")
      .map((v) => Number(v.trim()))
      .filter((v) => Number.isFinite(v)),
  );

  if (series.length < 2) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("invalid series");
    return;
  }

  const png = await sparklinePngBuffer(series);
  if (!png) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("unable to render");
    return;
  }

  res.writeHead(200, {
    "Content-Type": "image/png",
    "Cache-Control": "public, max-age=86400, immutable",
  });
  res.end(png);
}
