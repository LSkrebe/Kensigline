import {fetchJsonSafe} from './api.js'
export const investorImageKey=name=>(String(name??'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/^(the honorable|honorable|hon\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/,'').match(/[a-z]+/g)||[]).filter(w=>w.length>1&&!['jr','sr'].includes(w)).sort().join(' ')
const cache=new Map(),pending=new Map();let timer=null
function flush(){
 timer=null
 const batch=[...pending.entries()].filter(([,x])=>!x.started).slice(0,40)
 if(!batch.length)return
 for(const [,x] of batch)x.started=true
 void fetchJsonSafe('/api/investor-images?'+new URLSearchParams({names:batch.map(([,x])=>x.name).join('|')}),{timeoutMs:5000}).then(r=>{
  for(const [key,x] of batch){const src=r.ok?r.data?.images?.[key]?.src??null:null;if(r.ok){if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(key,{src,at:Date.now()})}pending.delete(key);x.resolve(src)}
 }).finally(()=>{if([...pending.values()].some(x=>!x.started)&&!timer)timer=setTimeout(flush,40)})
}
export function lookupInvestorImage(name){
 const key=investorImageKey(name);if(!key)return Promise.resolve(null)
 const hit=cache.get(key);if(hit&&Date.now()-hit.at< (hit.src?3600000:60000))return Promise.resolve(hit.src)
 if(pending.has(key))return pending.get(key).promise
 let resolve;const promise=new Promise(r=>{resolve=r});pending.set(key,{name,promise,resolve,started:false});if(!timer)timer=setTimeout(flush,40);return promise
}
