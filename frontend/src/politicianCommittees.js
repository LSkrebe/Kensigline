/**
 * Politician chamber / committee detail helpers.
 * Committee text comes from the backend (DB lookup stamped onto rows).
 */

/** Prefer API/DB `committee`; empty when unknown. */
export function politicianCommitteeFromRow(row) {
  return String(row?.committee ?? row?.whoCommittee ?? '').trim()
}

/**
 * Combined label for plain-text meta.
 * Prefer separate chamber + committee chips in the case header.
 */
export function politicianDetailLabel(name, chamberLabel, committee = '') {
  const chamber = String(chamberLabel ?? '').trim() || 'House'
  const c = String(committee ?? '').trim()
  if (!c) return chamber
  if (c.toLowerCase() === chamber.toLowerCase()) return chamber
  return `${chamber}, ${c}`
}
