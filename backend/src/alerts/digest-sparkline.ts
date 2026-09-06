/** ~1 month of trading days for digest sparklines. */
export const SPARKLINE_MONTH_POINTS = 21;

/** Display size in email HTML (rendered at 3× for retina). */
export const SPARKLINE_DISPLAY_W = 92;
export const SPARKLINE_DISPLAY_H = 34;
const SCALE = 3;

export function sparklineMonthSeries(series: number[]): number[] {
  const values = (Array.isArray(series) ? series : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
  if (values.length <= SPARKLINE_MONTH_POINTS) return values;
  return values.slice(-SPARKLINE_MONTH_POINTS);
}

/** Compact series for sparkline URL query params. */
export function sparklineSeriesParam(series: number[]): string {
  return sparklineMonthSeries(series)
    .map((v) => {
      const r = Math.round(v * 100) / 100;
      return Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/\.?0+$/, "");
    })
    .join(",");
}

/** Tiny PNG sparkline for email. */
export async function sparklinePngBuffer(series: number[]): Promise<Buffer | null> {
  const values = sparklineMonthSeries(series);
  if (values.length < 2) return null;

  const { createCanvas } = await import("@napi-rs/canvas");
  const w = SPARKLINE_DISPLAY_W * SCALE;
  const h = SPARKLINE_DISPLAY_H * SCALE;
  const pad = 3 * SCALE;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  ctx.clearRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.strokeStyle = "#ececec";
  ctx.lineWidth = 1.75 * SCALE;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.beginPath();

  for (let i = 0; i < values.length; i++) {
    const x = pad + (i / (values.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (values[i]! - min) / span) * (h - pad * 2);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  return canvas.toBuffer("image/png");
}

export async function sparklinePngBase64(series: number[]): Promise<string | null> {
  const buf = await sparklinePngBuffer(series);
  return buf ? buf.toString("base64") : null;
}
