export const PERFORMANCE_GROUPS=[['politicians','Politicians'],['insiders','Insiders'],['institutions','Institutions']]
export function buildPerformanceSlides(data,events=[]){
  const today=new Date().toISOString().slice(0,10)
  return PERFORMANCE_GROUPS.map(([kind,label])=>{
    const seen=new Set()
    const recent=events.filter(e=>e.date&&e.date<=today&&(/ptr/i.test(e.docType)?'politicians':/13f/i.test(e.docType)?'institutions':'insiders')===kind)
      .sort((a,b)=>b.date.localeCompare(a.date)||String(a.id).localeCompare(String(b.id)))
      .filter(e=>{const key=`${e.actorSlug||e.name}:${e.ticker}:${e.date}:${e.docType}`;if(seen.has(key))return false;seen.add(key);return true}).slice(0,3)
    return {id:`performance-${kind}`,kind:'performance',label,group:data?.groups?.find(g=>g.kind===kind),asOf:data?.end,recent}
  })
}
