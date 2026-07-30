/** Durable parse provenance stored on documents.data.parse_meta for overnight AI audits. */

export type DocumentParseMeta = {
  /** Stable path id for counting (template, research/structured, institutions/13f-*, …). */
  path: string;
  /** True when this parse invoked the LLM client. */
  llm_used: boolean;
  /** False when LLM was attempted but we fell back to template/deterministic. */
  llm_ok: boolean | null;
  /** Provider model id when llm_used, else null. */
  llm_model: string | null;
  /** ISO timestamp when parse_meta was attached. */
  at: string;
  /** Queue source_type when known. */
  source_type?: string | null;
};

export function buildParseMeta(args: {
  path: string;
  llm_used: boolean;
  llm_ok?: boolean | null;
  llm_model?: string | null;
  source_type?: string | null;
}): DocumentParseMeta {
  return {
    path: args.path,
    llm_used: Boolean(args.llm_used),
    llm_ok: args.llm_ok ?? (args.llm_used ? true : null),
    llm_model: args.llm_model ?? null,
    at: new Date().toISOString(),
    ...(args.source_type != null ? { source_type: args.source_type } : {}),
  };
}

export function withParseMeta<T extends Record<string, unknown>>(
  out: T,
  meta: DocumentParseMeta,
): T & { parse_meta: DocumentParseMeta } {
  return { ...out, parse_meta: meta };
}

/** Paths that mean an LLM call happened on this parse attempt. */
export const LLM_PARSE_PATHS = new Set([
  "research/structured",
  "template/fallback",
  "institutions/13f-enrich",
  "institutions/13f-full",
]);
