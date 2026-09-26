import {lookupInvestorImage} from './investorImageLookup.js'
import {useEffect,useRef,useState} from 'react'
import {selectEventPerformance} from './exploreEventPerformance.js'
import { lookupExplorePortrait, normalizeInvestorName } from './explorePortraitLookup.js'
import { companyLogoFallback, companyLogoSrc } from './localImages.js'
import {fetchJsonSafe} from './api.js'
import {MiniPriceChart} from './MiniPriceChart.jsx'
import {exploreRowDateLabel} from './ExploreDirectoryRows.jsx'
import {formatExploreDirectoryTrailLabel,expandExploreAmountLabel} from './exploreDirectoryTrail.js'

export { normalizeInvestorName } from './explorePortraitLookup.js'
const chartCache=new Map()
const queue=[];let active=0
function pump(){while(active<3&&queue.length){active++;const work=queue.shift();work().finally(()=>{active--;pump()})}}
function prices(ticker){
  const cached=chartCache.get(ticker)
  if(cached&&Date.now()-cached.at<120000)return cached.promise
  const promise=new Promise(resolve=>{queue.push(async()=>{try{const r=await fetchJsonSafe(`/api/bars?ticker=${encodeURIComponent(ticker)}&days=35`,{timeoutMs:12000});resolve(r.ok?(r.data?.items??[]).map(b=>Number(b.close)).filter(v=>Number.isFinite(v)&&v>0):[])}catch{resolve([])}});pump()})
  chartCache.set(ticker,{at:Date.now(),promise});return promise
}
export function ImageOrInitials({src,name,className,logo=false,discover=true,fallbackSrc=null}){
  const [failed,setFailed]=useState(false),[usedFallback,setUsedFallback]=useState(false),[discovered,setDiscovered]=useState(null)
  const imageRef=useRef(null)
  useEffect(()=>{setFailed(false);setUsedFallback(false);setDiscovered(null)},[src,name,fallbackSrc])
  useEffect(()=>{
    if(!discover||logo||(src&&!failed))return
    let alive=true,started=false
    const observer=new IntersectionObserver(entries=>{if(started||!entries.some(e=>e.isIntersecting))return;started=true;void lookupInvestorImage(name).then(value=>{if(alive)setDiscovered(value)})},{rootMargin:'200px'})
    if(imageRef.current)observer.observe(imageRef.current)
    return()=>{alive=false;observer.disconnect()}
  },[name,src,logo,failed,discover])
  const imageSrc=(!failed&&src)||(usedFallback&&fallbackSrc)||discovered
  const letters=String(name??'').replace(/^(hon\.?|mr\.?|mrs\.?)\s+/i,'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase()||'—'
  return <span ref={imageRef} className={className} aria-hidden="true">{imageSrc?<img src={imageSrc} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={()=>{if(imageSrc===discovered)setDiscovered(null);else if(!usedFallback&&fallbackSrc&&imageSrc===src)setUsedFallback(true);else{setFailed(true);setUsedFallback(false)}}}/>:<span className="mono">{logo?String(name??'').slice(0,3):letters}</span>}</span>
}
export function ExplorePersonRow({row,onClick=null,companyOnly=false,investorOnly=false,performanceTransactions=null,trailingAction=null}){
  const ref=useRef(null),[series,setSeries]=useState([]),[performance,setPerformance]=useState(null)
  const candidates=Array.isArray(row.tickers)?row.tickers:[]
  const tickers=[...new Set((candidates.length?candidates:[row.ticker]).map(t=>String(t).trim().toUpperCase()).filter(t=>/^[A-Z][A-Z0-9.-]{0,9}$/.test(t)&&!['F4','F13','PTR','13F','F4/A'].includes(t)))]
  const ticker=tickers.length===1?tickers[0]:null
  const portraitEntry=lookupExplorePortrait(row.name, row.actorSlug)
  const portrait=portraitEntry?.src
  const logo=portraitEntry?.kind==='logo'
  useEffect(()=>{
    let alive=true,started=false
    setSeries([])
    if(investorOnly)return
    const mq=window.matchMedia('(min-width: 961px)')
    const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting))load()},{rootMargin:'160px'})
    function load(){if(!alive||started||!mq.matches||!ticker)return;started=true;void prices(ticker).then(s=>{if(alive){setSeries(s);started=false;}})}
    function resized(){if(ref.current){const r=ref.current.getBoundingClientRect();if(r.top<window.innerHeight+160&&r.bottom>-160)load()}}
    if(ref.current)observer.observe(ref.current);mq.addEventListener('change',resized)
    const timer=setInterval(resized,120000)
    return()=>{alive=false;observer.disconnect();mq.removeEventListener('change',resized);clearInterval(timer)}
  },[ticker,investorOnly])
  const performanceKey=JSON.stringify([
    performanceTransactions === null ? null : 'txns',
    row.actorSlug,row.name,row.docType,row.performanceEventIds,row.events?.[0]?.id,row.id,
  ])
  // Never hit /api/dossier/investor from list rows — that stampedes cold rebuilds.
  // Per-event % only when the parent already has performanceTransactions.
  useEffect(()=>{
    if (performanceTransactions !== null) {
      setPerformance(selectEventPerformance(row, performanceTransactions))
      return
    }
    setPerformance(null)
  },[performanceKey,performanceTransactions,row])
  const event=String(row.event??'').replace(/^(Form 4|PTR|13F)\s*/i,'').replace(/^(insider|politician|institution)\s*/i,'')||'Disclosure'
  const eventTone=/sale|sell|sold|decreas|dispos|exit|reduc/i.test(event)?'isDown':/purchas|buy|bought|increas|acquir|add|new position/i.test(event)?'isUp':'isFlat'
  const companyLabel=tickers.length>1?(row.companies?.length?row.companies.map(c=>c.name||c.ticker).join(' · '):tickers.join(' · ')):(String(row.companyName??'').trim()||ticker||'—')
  const transaction=<span className="explorePersonTransaction mono">
    <span className="explorePersonLogos">{tickers.slice(0,3).map(t=><ImageOrInitials key={t} src={companyLogoSrc(t)} fallbackSrc={companyLogoFallback(t)} name={t} className="explorePersonLogo" logo/>)}</span>
    <span className={`explorePersonAction ${eventTone}`}>{event}</span>{tickers.length>3?<span>+{tickers.length-3}</span>:null}
  </span>
  const investorType=/ptr/i.test(row.docType??'')?'Politician':/13f/i.test(row.docType??'')?'Institution':'Insider'
  const dateTicker=`${exploreRowDateLabel(row)}, ${tickers.join(' · ')||'—'}`
  const pct=performance?performance.fraction*100:null
  const returnText=pct==null?'—':`${pct>0?'+':pct<0?'−':''}${Math.abs(pct).toFixed(2)}%`
  const returnTitle=performance?`${performance.count>1?'Equal-weight average stock return since these transactions':'Stock return since transaction'} through ${performance.asOf}`:'Transaction performance unavailable'
  const compactIdentity=companyOnly||investorOnly
  const content=<>
    <ImageOrInitials src={companyOnly?companyLogoSrc(ticker):portrait} fallbackSrc={companyOnly?companyLogoFallback(ticker):null} name={companyOnly?ticker:row.name} className="explorePersonPortrait" logo={companyOnly||logo}/>
    <span className="explorePersonCopy">
      <span className="explorePersonMobileTransaction">{compactIdentity?<span className={`explorePersonAction mono ${eventTone}`}>{event}</span>:transaction}</span>
      <span className="exploreDirectoryName">{companyOnly?companyLabel:row.name}</span>
      <span className={`explorePersonInvestorType ${compactIdentity?`explorePersonAction mono ${eventTone}`:""}`}>{compactIdentity?event:investorType}</span>
      <span className="explorePersonMeta mono"><span className="explorePersonDesktopDate">{compactIdentity?dateTicker:exploreRowDateLabel(row)}</span><span className="explorePersonCompactDate">{dateTicker}</span></span>
    </span>
    {!compactIdentity&&<span className="explorePersonCompanyColumn">
      {transaction}
      <span className="explorePersonCompany" title={companyLabel}>{companyLabel}</span>
      <span className="explorePersonMeta mono">{tickers.join(', ')||'—'}</span>
    </span>}
    {!investorOnly&&<span className={`explorePersonChart ${series.length>1&&ticker?'':'isEmpty'}`} aria-hidden="true">{series.length>1&&ticker?<MiniPriceChart series={series} label={ticker} showMeta={false} chartRange="1M" hideAxisLabels lineOnly layoutSize={{w:120,h:48}}/>:null}</span>}
    <span className="explorePersonNumbers">
      <span className="exploreDirectoryAmount explorePersonAmount mono"><span className="explorePersonAmountCompact">{formatExploreDirectoryTrailLabel(row.trail)}</span><span className="explorePersonAmountFull">{expandExploreAmountLabel(row.trail)}</span></span>
      <span className={`explorePersonReturn mono ${pct>0?'isUp':pct<0?'isDown':'isFlat'}`} title={returnTitle} aria-label={`${returnTitle}: ${returnText}`}>{returnText}</span>
    </span>
  </>
  return <li ref={ref} className={`exploreDirectoryRow explorePersonRow ${compactIdentity?"explorePersonRow--company":""} ${investorOnly?"explorePersonRow--investorOnly":""} ${trailingAction?"exploreInvestorEventRow":""}`}>{onClick?<button type="button" className="exploreDirectoryRowBtn explorePersonRowBtn" aria-label={`Open ${companyOnly?companyLabel:row.name}`} onClick={()=>onClick(row)}>{content}</button>:<div className="explorePersonRowBtn">{content}</div>}{trailingAction}</li>
}
