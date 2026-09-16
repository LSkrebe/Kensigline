const next=new Map<string,number>(),blocked=new Map<string,number>();
let persist:((host:string,until:number)=>Promise<void>)|null=null;
export function configureImageLimits(existing:{host:string;until:number}[],save:typeof persist){for(const r of existing)blocked.set(r.host,r.until);persist=save;}
export function retryAfterUntil(value:string|null,now=Date.now()){
 const seconds=Number(value);const parsed=value&&Number.isFinite(seconds)?now+Math.max(0,seconds)*1000:Date.parse(value??'');
 return Math.max(now+3600000,Number.isFinite(parsed)?parsed:0);
}
export async function imageRequestSlot(host:string){
 if((blocked.get(host)??0)>Date.now())throw Error('image_source_cooldown');
 const ms=host==='api.polygon.io'?12500:host==='en.wikipedia.org'?3000:1500;
 const wait=Math.max(0,(next.get(host)??0)-Date.now());if(wait)await new Promise(r=>setTimeout(r,wait));next.set(host,Date.now()+ms);
}
export async function imageRateLimited(host:string,retryAfter:string|null){const until=retryAfterUntil(retryAfter);blocked.set(host,until);await persist?.(host,until);throw Error('image_source_rate_limited');}
