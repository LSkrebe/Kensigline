/** Price context for one disclosure. Never an estimate of the filer's portfolio P&L. */
export function calculateDisclosureReturn(bars, filedDay, asOfDay) {
  const validDay = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value)) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0,10) === value;
  if (!validDay(filedDay) || !validDay(asOfDay) || filedDay > asOfDay) return null;
  const byDay = new Map();
  for (const bar of bars ?? []) {
    if (!validDay(bar?.day) || bar.close == null || bar.close === '' || !Number.isFinite(Number(bar.close)) || Number(bar.close) <= 0) continue;
    if (bar.day <= filedDay || bar.day > asOfDay) continue;
    if (byDay.has(bar.day) && byDay.get(bar.day) !== Number(bar.close)) return null;
    byDay.set(bar.day, Number(bar.close));
  }
  const series = [...byDay].sort(([a],[b])=>a.localeCompare(b));
  if (series.length < 2) return null;
  const gap = (a,b)=>(Date.parse(b)-Date.parse(a))/86400000;
  // Never substitute a much later price for a missing entry, or bridge a suspended/delisted gap.
  if (gap(filedDay,series[0][0]) > 7 || gap(series.at(-1)[0],asOfDay) > 7) return null;
  if (series.some((row,i)=>i>0 && gap(series[i-1][0],row[0])>7)) return null;
  const baseline = series[0][1];
  return {
    baselineDay:series[0][0], baselineClose:baseline,
    latestDay:series.at(-1)[0], latestClose:series.at(-1)[1],
    returnFraction:series.at(-1)[1]/baseline-1,
    points:series.map(([day,close])=>({ts:`${day}T00:00:00Z`,cumulative:close/baseline-1,close})),
  };
}
