import {useEffect,useState} from 'react'
import {fetchJsonSafe} from './api.js'
import {isMockDataMode} from './dataMode.js'
import {exploreInvestorDetailPath,navigateExploreInvestorDetail} from './terminalRoute.js'
import {stripExploreInvestorHonorific} from './exploreDirectoryNav.js'
import {ImageOrInitials} from './ExplorePersonRow.jsx'
import portraits from './explorePortraits.json'

const MOCK_EXPLORE_PERFORMANCE = {
  ok: true,
  end: '2026-09-22',
  groups: [
    { kind: 'politicians', returnFraction: 0.184, investors: 6 },
    { kind: 'insiders', returnFraction: 0.312, investors: 6 },
    { kind: 'institutions', returnFraction: 0.091, investors: 8 },
  ],
}

export {buildPerformanceSlides} from './explorePerformanceHero.js'
export function useExplorePerformance(){
  const mock = isMockDataMode(false)
  const [data,setData]=useState(() => (mock ? MOCK_EXPLORE_PERFORMANCE : null))
  useEffect(()=>{
    if (mock) return undefined
    let alive=true
    const refresh=async()=>{const r=await fetchJsonSafe('/api/explore/performance',{timeoutMs:60000});if(alive&&r.ok&&r.data?.ok)setData(r.data)}
    void refresh()
    const timer=setInterval(refresh,60000)
    return()=>{alive=false;clearInterval(timer)}
  },[mock])
  return data
}
export function ExplorePerformanceSlide({slide}){
  const value=slide.group?.returnFraction
  return <article className="exploreRecapSlide explorePerformanceSlide">
    <div className="explorePerformanceHeroInner">
      <div className="explorePerformanceHeroOverview">
        <p className="exploreRecapSlideKicker mono">Disclosed performance</p>
        <h2 className="exploreRecapEventTitle">{slide.label}</h2>
        <div className={`explorePerformanceHeroValue mono ${value==null?'':value>=0?'isUp':'isDown'}`}>{value==null?'—':`${value>0?'+':''}${(value*100).toFixed(2)}%`}</div>
        <div className="explorePerformanceHeroFacts mono"><span>Past year</span><span>{slide.group?.investors!=null?`${slide.group.investors.toLocaleString('en-US')} investors`:'—'}</span></div>
        <time className="explorePerformanceHeroAsOf mono">{slide.asOf||'—'}</time>
      </div>
      <div className="explorePerformanceHeroActivity">
        <p className="exploreRecapSlideKicker mono">Recent activity</p>
        {slide.recent.length?<ul>{slide.recent.map(event=>{
          const name=stripExploreInvestorHonorific(event.name)
          const key=name.toLowerCase().replace(/[^a-z0-9]/g,'')
          const action=/sale|sell|trim|reduc/i.test(event.docType)?'Sale':/purchase|buy|add|new/i.test(event.docType)?'Purchase':'Disclosure'
          return <li key={event.id}><a href={exploreInvestorDetailPath(event.name,event.actorSlug)} onClick={e=>{if(e.button===0&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey){e.preventDefault();navigateExploreInvestorDetail(event.name,event.actorSlug)}}}>
            <ImageOrInitials src={portraits[key]?.src} name={name} className="explorePersonPortrait"/>
            <span className="explorePerformanceActivityCopy"><span className="exploreDirectoryName">{name}</span><span className="mono">{event.ticker}, {event.date.slice(5)}</span></span>
            <span className={`explorePersonAction mono ${action==='Sale'?'isDown':action==='Purchase'?'isUp':''}`}>{action}</span>
          </a></li>
        })}</ul>:<p className="explorePerformanceHeroEmpty mono">No recent activity available.</p>}
      </div>
    </div>
  </article>
}
