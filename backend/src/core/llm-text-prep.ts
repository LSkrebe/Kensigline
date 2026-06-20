import { stripBoilerplateForLlm } from "./boilerplate-strip.js";

export type LlmTextPrepResult = {
  text: string;
  rawChars: number;
  strippedChars: number;
  compactChars: number;
  savedChars: number;
  savedPct: number;
};

function readLogPrep(): boolean {
  return String(process.env.LLM_LOG_TEXT_PREP ?? "1").trim() !== "0";
}

/** Log chars before/after preprocessing for cost estimation. */
export function logLlmTextPrep(context: string, result: LlmTextPrepResult): void {
  if (!readLogPrep()) return;
  console.info(
    "[llm-prep]",
    JSON.stringify({
      context,
      raw_chars: result.rawChars,
      stripped_chars: result.strippedChars,
      compact_chars: result.compactChars,
      saved_chars: result.savedChars,
      saved_pct: result.savedPct,
    }),
  );
}

export function prepareLlmText(args: {
  text: string;
  context: string;
  maxChars: number;
  compact: (text: string, maxChars: number) => string;
  stripBoilerplate?: boolean;
}): LlmTextPrepResult {
  const raw = String(args.text ?? "");
  const stripped =
    args.stripBoilerplate === false ? raw : stripBoilerplateForLlm(raw);
  const compacted = args.compact(stripped, args.maxChars);
  const baseline = raw.slice(0, args.maxChars);
  const savedChars = Math.max(0, baseline.length - compacted.length);
  const savedPct =
    baseline.length > 0 ? Math.round((savedChars / baseline.length) * 1000) / 10 : 0;

  const result: LlmTextPrepResult = {
    text: compacted,
    rawChars: raw.length,
    strippedChars: stripped.length,
    compactChars: compacted.length,
    savedChars,
    savedPct,
  };
  logLlmTextPrep(args.context, result);
  return result;
}
