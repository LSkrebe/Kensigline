export type ActorAlertMode = "insider" | "politicians" | "institutions";

function normalizeName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function actorLooksLikeInstitution(name: string): boolean {
  const raw = String(name ?? "").trim();
  if (!raw) return false;
  return /\b(llc|l\.?\s*p\.?|\blp\b|inc|corp|corporation|capital|advisors|advisers|advisory|management|group|bank|bancorp|trust|partners|fund|holdings|investments|asset)\b/i.test(
    raw,
  );
}

/** Cross-source person key; institutions keep a separate org key. Mirrors frontend investigateActorCanonicalKey. */
export function actorCanonicalKey(fullName: string, mode: string): string {
  const raw = normalizeName(fullName);
  if (!raw) return "";
  if (mode === "institutions" || actorLooksLikeInstitution(raw)) {
    return `org:${raw}`;
  }
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return `person:${parts[0]}:${parts.at(-1)!}`;
  return `person:${raw}`;
}

export function actorModeFromKey(actorKey: string, fallback: ActorAlertMode = "insider"): ActorAlertMode {
  if (String(actorKey ?? "").startsWith("org:")) return "institutions";
  return fallback;
}

export function actorModeLabel(mode: string): string {
  if (mode === "politicians") return "Politician";
  if (mode === "institutions") return "Institution";
  return "Insider";
}
