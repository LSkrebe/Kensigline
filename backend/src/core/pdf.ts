import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

function hasEnoughText(t: string) {
  const s = String(t ?? "").trim();
  // Short electronic PTRs exist; don't demand 700 chars before accepting text-layer/pdftotext.
  if (s.length < 180) return false;
  // Accept 2-digit and 4-digit US dates (scanned OCR often uses MM/DD/YY).
  const dates = (s.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g) ?? []).length;
  const hasHdr =
    /\bTRANSACTIONS\b|\bTransaction Type\b|\bPeriodic Transaction Report\b|\bP\s*erioDic\s*t\s*ranSaction\b|\bFiling ID\b|\bDigitally Signed\b/i.test(
      s,
    );
  return dates >= 1 && hasHdr;
}

async function pdfParseText(buf: Buffer): Promise<string> {
  // Fast text-layer extraction via pdf.js (works when the PDF contains selectable text).
  const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const u8 = new Uint8Array(buf);
  const loadingTask: any = getDocument({ data: u8 });
  const pdf: any = await loadingTask.promise;
  const pages = Number(pdf?.numPages ?? 0) || 0;
  if (pages > 500) { await pdf.destroy(); throw new Error("pdf_page_limit_exceeded"); }
  let text = "";
  for (let i = 1; i <= pages; i++) {
    const page: any = await pdf.getPage(i);
    const tc: any = await page.getTextContent();
    const items: any[] = Array.isArray(tc?.items) ? tc.items : [];
    for (const it of items) {
      const s = String(it?.str ?? "");
      if (s) text += `${s} `;
    }
    text += "\n";
  }
  await pdf.destroy();
  return text.trim();
}

async function tryCmd(cmd: string, args: string[], input?: Buffer): Promise<{ ok: boolean; stdout: Buffer; stderr: Buffer }> {
  return await new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: {...process.env, OMP_THREAD_LIMIT:"1"} });
    const deadline=setTimeout(()=>p.kill("SIGKILL"),180000);
    p.once("close",()=>clearTimeout(deadline));
    p.once("error",()=>clearTimeout(deadline));
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    p.stdout.on("data", (d) => out.push(Buffer.from(d)));
    p.stderr.on("data", (d) => err.push(Buffer.from(d)));
    p.on("error", (e) => {
      err.push(Buffer.from(String((e as any)?.message ?? e)));
      resolve({ ok: false, stdout: Buffer.concat(out), stderr: Buffer.concat(err) });
    });
    p.on("close", (code) =>
      resolve({ ok: code === 0, stdout: Buffer.concat(out), stderr: Buffer.concat(err) }),
    );
    if (input) p.stdin.write(input);
    p.stdin.end();
  });
}

async function pdftotextFallback(buf: Buffer): Promise<string | null> {
  // Uses poppler's pdftotext if present. This is not OCR, but can salvage text extraction.
  const dir = await mkdtemp(join(tmpdir(), "kensigline-ptr-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    const txtPath = join(dir, "out.txt");
    await writeFile(pdfPath, buf);
    const r = await tryCmd("pdftotext", ["-layout", pdfPath, txtPath]);
    if (!r.ok) return null;
    const txt = await readFile(txtPath, "utf8").catch(() => "");
    return txt || null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function ocrFallback(buf: Buffer): Promise<string | null> {
  // Optional OCR path (only if dependencies exist on the host):
  // - pdftoppm: render pages to PNG
  // - tesseract: OCR the PNG
  //
  // This is designed to be best-effort and always clean up temp files.
  const dir = await mkdtemp(join(tmpdir(), "kensigline-ocr-"));
  try {
    const pdfPath = join(dir, "in.pdf");
    await writeFile(pdfPath, buf);

    const info=await tryCmd('pdfinfo',[pdfPath]);
    const pages=Number(info.stdout.toString().match(/^Pages:\s+(\d+)/m)?.[1]);
    if(!info.ok||!pages||pages>500)return null;
    let text='';
    for(let page=1;page<=pages;page++){
      const base=join(dir,'page');
      const render=await tryCmd('pdftoppm',['-r','300','-f',String(page),'-l',String(page),'-singlefile','-png',pdfPath,base]);
      if(!render.ok)throw Error('pdf_page_render_failed');
      const ocr=await tryCmd('tesseract',[base+'.png',base,'-l','eng','--psm','3']);
      if(!ocr.ok)throw Error('pdf_page_ocr_failed');
      text+='\f'+await readFile(base+'.txt','utf8');
      await rm(base+'.png',{force:true});
    }
    return text.trim() || null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function jsOcrFallback(buf: Buffer): Promise<string | null> {
  // In-process OCR fallback (no system binaries).
  // This is slower, but it's only used when the PDF has no text layer.
  try {
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const { createCanvas } = await import("@napi-rs/canvas");
    const { createWorker } = await import("tesseract.js");

    const u8 = new Uint8Array(buf);
    const loadingTask: any = getDocument({ data: u8 });
    const pdf: any = await loadingTask.promise;
    const pages = Number(pdf?.numPages ?? 0) || 0;
    if(pages>500){await pdf.destroy();return null;}
    if (!pages) return null;

    const worker: any = await createWorker("eng");
    let text = "";
    try {
      for (let i = 1; i <= pages; i++) {
        try {
          const page: any = await pdf.getPage(i);
          const viewport: any = page.getViewport({ scale: 1.5 });
          const canvas: any = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
          const ctx: any = canvas.getContext("2d");
          await page.render({ canvasContext: ctx, viewport }).promise;
          const png: Buffer = canvas.toBuffer("image/png");
          const r: any = await worker.recognize(png);
          const t = String(r?.data?.text ?? "").trim();
          if (t) text += `\n${t}`;
        } catch {
          throw Error("pdf_page_render_failed");
        }
      }
    } finally {
      await worker.terminate().catch(() => {});
      await pdf.destroy();
    }
    return text.trim() || null;
  } catch {
    return null;
  }
}

export async function extractPdfTextWithFallback(
  buf: Buffer,
): Promise<{ text: string; method: "pdf-parse" | "pdftotext" | "ocr" }> {
  const t0 = await pdfParseText(buf).catch(() => "");
  if (hasEnoughText(t0)) return { text: t0, method: "pdf-parse" };

  const t1 = await pdftotextFallback(buf).catch(() => null);
  if (t1 && hasEnoughText(t1)) return { text: t1, method: "pdftotext" };

  // Prefer full-document system OCR; never accept an arbitrary two-page prefix.
  const t2 = await ocrFallback(buf).catch(() => null);
  if (t2 && hasEnoughText(t2)) return { text: t2, method: "ocr" };

  const t3 = await jsOcrFallback(buf).catch(() => null);
  if (t3 && hasEnoughText(t3)) return { text: t3, method: "ocr" };

  // Preserve the richest extraction for deterministic parsers; never invoke an LLM.
  const best = [t1, t0, t2, t3].sort((a,b)=>String(b??"").length-String(a??"").length)[0] ?? "";
  return { text: best, method: t1 ? "pdftotext" : t2 || t3 ? "ocr" : "pdf-parse" };
}

