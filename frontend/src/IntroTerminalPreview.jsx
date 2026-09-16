import portraits from './explorePortraits.json'
import logos from './exploreLogos.json'

/** Focused, dated product excerpts rather than full-page screenshots. */
export function IntroTerminalPreview({shot='hero',staticResearch=false}) {
  if(!staticResearch)return null
  const investor=shot==='deepInvestor'
  const rows=investor
    ? [['Microsoft','MSFT','Sale disclosed','Sep 1, 2026','−$16,500,000',logos.MSFT]]
    : [['Satya Nadella','MSFT','Sale disclosed','Sep 1, 2026','−$16,500,000',portraits.satyanadella?.src],['Jamie Dimon','JPM','Sale disclosed','Apr 15, 2026','−$40,000,000',portraits.jamiedimon?.src]]
  return <figure className="mktFocusPreview" aria-label={investor?'Investor history preview':'Disclosure feed preview'}>
    <header><span>{investor?'Investor dossier':'Explore'}</span><span className="mktFocusTag">Product preview</span></header>
    <p className="mktFocusEyebrow">{investor?'Insider':'Disclosed activity'}</p>
    <h3>{investor?'Satya Nadella':'The people behind the trades'}</h3>
    <div className="mktFocusRows">{rows.map(([name,ticker,action,date,amount,image])=><div className="mktFocusRow" key={name}>
      <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer"/>
      <div><strong>{name}</strong><small>{date}, {ticker}</small></div>
      <div className="mktFocusValue"><span>{action}</span><small>{amount}</small></div>
    </div>)}</div>
    <footer>{investor?'Trade log, daily performance, company context':'Insiders, politicians, institutions'}</footer>
  </figure>
}
