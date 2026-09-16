import { parseExploreTrailUsd } from './exploreDirectoryMock.js'

/** Empty table placeholders (`—`, `-`, en/em/minus) stay muted, never up/down. */
export function isExplorePlaceholderLabel(value) {
  const s = String(value ?? '').trim()
  return !s || /^[-–—−]+$/.test(s)
}

/** Normalize position-count trails for display (holdings → pos). */
export function formatExploreDirectoryTrailLabel(trail) {
  const t = String(trail ?? '').trim()
  if (!t) return '—'
  const holdingsMatch = t.match(/^(\d+)\s+holdings?$/i)
  if (holdingsMatch) return `${holdingsMatch[1]} pos`
  const positionsMatch = t.match(/^(\d+)\s+positions?$/i)
  if (positionsMatch) return `${positionsMatch[1]} pos`
  return t
}

export function exploreDirectoryTrailTone(row) {
  if (row.trailMuted) return 'isFlat'
  const trail = formatExploreDirectoryTrailLabel(row.trail)
  if (isExplorePlaceholderLabel(trail)) return 'isFlat'
  if (/^[+\-−]?\$0(\.0+)?([KMB])?$/i.test(trail)) return 'isFlat'
  const usd = parseExploreTrailUsd(trail)
  if (usd === 0) return 'isFlat'
  return row.up ? 'isUp' : 'isDown'
}

export function exploreDirectoryNetFlowTone(row) {
  const net = row.netFlowUsd ?? 0
  const label = formatExploreDirectoryTrailLabel(row.netFlowLabel)
  if (net === 0 || label === '$0' || isExplorePlaceholderLabel(label)) return 'isFlat'
  return net > 0 ? 'isUp' : 'isDown'
}

/** Right-rail move labels on explore recap / headline rows. */
export function exploreMoveLabelTone(moveLabel, moveUp = true) {
  const label = formatExploreDirectoryTrailLabel(moveLabel)
  if (isExplorePlaceholderLabel(label)) return 'isFlat'
  if (/^[+\-−]?\$0(\.0+)?([KMB])?$/i.test(label)) return 'isFlat'
  const usd = parseExploreTrailUsd(label)
  if (usd === 0) return 'isFlat'
  return moveUp ? 'isUp' : 'isDown'
}

/** Expand compact dollar labels while retaining disclosed ranges and signs. */
export function expandExploreAmountLabel(trail) {
  const label = formatExploreDirectoryTrailLabel(trail)
  const match = label.match(/^([+−-]?)\$([\d,.]+)([KMB])?(?:[-–]([\d,.]+)([KMB])?)?$/i)
  if (!match) return label
  const [, sign, low, lowUnit, high, highUnit] = match
  const expand = (value, unit) => (Number(value.replaceAll(',', '')) * ({K:1e3,M:1e6,B:1e9}[unit?.toUpperCase()] ?? 1)).toLocaleString('en-US', {maximumFractionDigits:2})
  const commonUnit = highUnit || lowUnit
  return `${sign}$${expand(low, lowUnit || commonUnit)}${high ? `–${expand(high, highUnit || commonUnit)}` : ''}`
}
