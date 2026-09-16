export function ownershipIndexUrl(raw: string): string | null {
  const m=raw.match(/^https:\/\/www\.sec\.gov\/Archives\/edgar\/data\/(\d+)\/(\d{18})\//i);
  if(!m) return null;
  const a=m[2]!;
  return `https://www.sec.gov/Archives/edgar/data/${m[1]}/${a}/${a.slice(0,10)}-${a.slice(10,12)}-${a.slice(12)}-index.htm`;
}
export function parseSecFilingDate(html: string): string | null {
  const match=html.match(/Filing Date\s*<\/div>\s*<div[^>]*>\s*(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}
