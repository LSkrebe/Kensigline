export function investigateActorLooksLikeInstitution(name) {
  const raw = String(name ?? '').trim()
  if (!raw) return false
  return /\b(llc|l\.?\s*p\.?|\blp\b|inc|corp|corporation|capital|advisors|advisers|advisory|management|group|bank|bancorp|trust|partners|fund|holdings|investments|asset)\b/i.test(
    raw,
  )
}

/** Cross-source person key; institutions keep a separate org key. */
export function investigateActorCanonicalKey(fullName, mode) {
  const raw = String(fullName ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
  if (!raw) return ''
  if (mode === 'institutions' || investigateActorLooksLikeInstitution(raw)) {
    return `org:${raw}`
  }
  const parts = raw.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `person:${parts[0]}:${parts.at(-1)}`
  return `person:${raw}`
}

export function actorModeLabel(mode) {
  if (mode === 'politicians') return 'Politician'
  if (mode === 'institutions') return 'Institution'
  return 'Insider'
}
