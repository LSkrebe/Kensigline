import logos from './exploreLogos.json'

const TICKER = /^[A-Z][A-Z0-9.-]{0,9}$/
/** Neutral mark when no issuer logo is available — never leave a broken <img>. */
export const DEFAULT_COMPANY_LOGO = '/intro/company-logos/_default.svg'

export function companyLogoSrc(ticker) {
  const symbol = String(ticker ?? '').trim().toUpperCase()
  if (!TICKER.test(symbol)) return null
  return logos[symbol] || `/intro/company-logos/${symbol}.png`
}

/** Remote mark used only when the saved file fails to load. */
export function companyLogoFallback(ticker) {
  const symbol = String(ticker ?? '').trim().toUpperCase()
  if (!TICKER.test(symbol)) return null
  return `https://financialmodelingprep.com/image-stock/${encodeURIComponent(symbol)}.png`
}

export function companyLogoDefault() {
  return DEFAULT_COMPANY_LOGO
}
