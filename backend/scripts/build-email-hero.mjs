/** Build email-digest-header.png — full header strip (art + logo), CID-embedded in sends. */
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const bgPath = join(root, "frontend/public/backgrounds/ml_bg_explore_home.png");
const markPath = join(root, "frontend/public/mercerline_mark.png");
const outPath = join(root, "frontend/public/email-digest-header.png");

/** 2× for 620×100 email header. */
const W = 1240;
const H = 200;
const aspect = W / H;

const [bg, mark] = await Promise.all([loadImage(bgPath), loadImage(markPath)]);
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");

/** Uniform crop — top-left glow, same aspect as banner (no stretch). */
const cropW = 960;
const cropH = Math.round(cropW / aspect);
ctx.drawImage(bg, 0, 0, cropW, cropH, 0, 0, W, H);

/** Dark scrim so logo text reads on any mail client. */
const grad = ctx.createLinearGradient(0, 0, 0, H);
grad.addColorStop(0, "rgba(13,13,16,0.15)");
grad.addColorStop(0.55, "rgba(13,13,16,0.55)");
grad.addColorStop(1, "rgba(13,13,16,0.92)");
ctx.fillStyle = grad;
ctx.fillRect(0, 0, W, H);

/** Logo mark */
const markSize = 56;
const padX = 44;
const midY = H / 2;
ctx.drawImage(mark, padX, midY - markSize / 2, markSize, markSize);

/** Wordmark */
ctx.fillStyle = "#ececec";
ctx.font = "400 40px Georgia, 'Times New Roman', serif";
ctx.textBaseline = "middle";
ctx.fillText("Mercerline", padX + markSize + 20, midY);

/** Daily Brief */
ctx.fillStyle = "#666666";
ctx.font = "600 20px Menlo, monospace";
ctx.textAlign = "right";
ctx.fillText("DAILY BRIEF", W - padX, midY);
ctx.textAlign = "left";

writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log(`Wrote ${outPath} (${W}×${H})`);
