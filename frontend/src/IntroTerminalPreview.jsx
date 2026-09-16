const screenshots = {
  hero: ['explore', 'Explore: disclosed performance, recent activity, and headlines'],
  deepInvestor: ['investor', 'Nancy Pelosi investor dossier with key metrics and daily performance'],
  watchlist: ['watchlist', 'Watchlist with investor profiles and company disclosures'],
  history: ['history', 'Daily percentage performance and trade history in the investor dossier'],
}

/** Real captures of the current product, September 16, 2026. */
export function IntroTerminalPreview({shot='hero',staticResearch=false,eager=false}) {
  if (!staticResearch) return null
  const [name,alt] = screenshots[shot] || screenshots.hero
  return <figure className="mktHeroShot">
    <img className="mktHeroShotImg" src={`/intro/current-${name}.webp`} alt={alt}
      width={name==='history'?930:970} height={name==='history'?420:701} loading={eager?'eager':'lazy'}
      fetchPriority={eager?'high':'auto'} decoding="async" />
  </figure>
}
