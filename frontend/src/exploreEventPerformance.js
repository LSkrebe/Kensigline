/** Match canonical transaction IDs, never nearby dates or similarly named people. */
export function selectEventPerformance(row, transactions = []) {
  const ids = [...new Set((row.performanceEventIds ?? [row.events?.[0]?.id ?? row.id])
    .map(id => String(id ?? '').replace(/^(?:wl-[pai]-|a-)/, '')))]
  if (!ids.length || ids.some(id => !id)) return null
  const byId = new Map(transactions.map(t => [String(t.id), t]))
  const selected = ids.map(id => byId.get(id))
  if (selected.some(t => !t || t.reason || t.stale || !Number.isFinite(t.returnFraction))) return null
  // Do not average observations with different price endpoints.
  if (new Set(selected.map(t => t.latestDay)).size !== 1) return null
  return { fraction: selected.reduce((sum, t) => sum + t.returnFraction, 0) / selected.length,
    count: selected.length, asOf: selected[0].latestDay }
}
