import { parseExploreTrailUsd } from './exploreDirectoryMock.js'

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
  if (!trail || trail === '—') return 'isFlat'
  if (/^[+\-−]?\$0(\.0+)?([KMB])?$/i.test(trail)) return 'isFlat'
  const usd = parseExploreTrailUsd(trail)
  if (usd === 0) return 'isFlat'
  return row.up ? 'isUp' : 'isDown'
}

export function exploreDirectoryNetFlowTone(row) {
  const net = row.netFlowUsd ?? 0
  const label = formatExploreDirectoryTrailLabel(row.netFlowLabel)
  if (net === 0 || label === '$0' || label === '—') return 'isFlat'
  return net > 0 ? 'isUp' : 'isDown'
}
