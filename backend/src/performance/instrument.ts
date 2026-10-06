/** Ordinary equity — including dual-class "Class A/B Common Stock". */
export function instrumentFromSecurityTitle(
  securityTitle: unknown,
  isDerivative?: boolean,
): "shares" | "derivative" | "unclassified" {
  if (isDerivative) return "derivative";
  const title = String(securityTitle ?? "");
  if (/\bcommon\s+stock\b|\bordinary\s+shares?\b/i.test(title)) return "shares";
  if (/preferred|convertible|warrant|\bunits?\b|debenture|\bnotes?\b/i.test(title)) return "unclassified";
  return "shares";
}
