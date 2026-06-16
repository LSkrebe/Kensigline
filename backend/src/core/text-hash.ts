import { createHash } from "node:crypto";

/** Collapse whitespace so near-identical filing text dedupes reliably. */
export function normalizeTextForHash(text: string): string {
  return String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sha256NormalizedText(text: string): string {
  return createHash("sha256").update(normalizeTextForHash(text), "utf8").digest("hex");
}
