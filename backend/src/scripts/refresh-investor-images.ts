import {configureImageLimits,imageRequestSlot,imageRateLimited} from '../identity/rate-limit.js';
import '../load-env.js';
import {db} from '../core/db.js';
import {ensureImageTables,imageNameKey} from '../identity/images.js';
import {namedPortraits,leadershipLinks} from '../identity/portrait-parser.js';
import {publicGet} from '../identity/public-fetch.js';
const pause=(ms:number)=>new Promise(r=>setTimeout(r,ms));
type Candidate={id:string;display_name:string;filer_type:string;ticker:string;company:string};
await ensureImageTables();
await db.queryApi('CREATE TABLE IF NOT EXISTS investor_image_rate_limits(host text PRIMARY KEY,retry_at timestamptz NOT NULL)');
await db.queryApi('ALTER TABLE investor_image_rate_limits ENABLE ROW LEVEL SECURITY');
const limits=await db.queryApi<{host:string;until:number}>('SELECT host,extract(epoch from retry_at)*1000 AS until FROM investor_image_rate_limits WHERE retry_at>now()');
configureImageLimits(limits.map(r=>({...r,until:Number(r.until)})),async(host,until)=>{await db.queryApi('INSERT INTO investor_image_rate_limits(host,retry_at) VALUES($1,to_timestamp($2/1000.0)) ON CONFLICT(host) DO UPDATE SET retry_at=excluded.retry_at',[host,until]);});
async function limitedFetch(url:string,options:RequestInit){const host=new URL(url).hostname;await imageRequestSlot(host);const r=await fetch(url,options);if(r.status===429)await imageRateLimited(host,r.headers.get('retry-after'));return r;}

await db.queryApi(`CREATE TABLE IF NOT EXISTS investor_image_company_sources(ticker text PRIMARY KEY,pages jsonb NOT NULL,checked_at timestamptz NOT NULL DEFAULT now())`);
await db.queryApi('ALTER TABLE investor_image_company_sources ENABLE ROW LEVEL SECURITY');
const limit=Math.min(200,Math.max(1,Number(process.env.IMAGE_REFRESH_LIMIT)||60));
const candidates=await db.queryApi<Candidate>(`WITH latest AS (
 SELECT DISTINCT ON(t.filer_id) t.filer_id,t.issuer_id,t.transaction_at FROM insider_transactions t WHERE t.transaction_at<=now() ORDER BY t.filer_id,t.transaction_at DESC
), ordered AS (SELECT f.id,f.display_name,f.filer_type,i.ticker,i.name company,l.transaction_at FROM latest l JOIN filers f ON f.id=l.filer_id JOIN issuers i ON i.id=l.issuer_id
 UNION ALL SELECT f.id,f.display_name,f.filer_type,NULL,NULL,f.updated_at FROM filers f WHERE f.filer_type IN ('institution','politician'))
 SELECT o.* FROM ordered o LEFT JOIN investor_images p ON p.filer_id=o.id WHERE (p.filer_id IS NULL OR p.retry_at<now()) AND ($2::text[] IS NULL OR o.ticker=ANY($2::text[]))
 ORDER BY (p.filer_id IS NULL) DESC,o.transaction_at DESC LIMIT $1`,[limit,process.env.IMAGE_REFRESH_TICKERS?.split(',')??null],60000);
const memo=new Map<string,Promise<{url:string;html:string}[]>>();
async function companyPages(ticker:string){
 if(memo.has(ticker))return memo.get(ticker)!;
 const work=(async()=>{
  const cached=await db.queryApi<{pages:{url:string;html:string}[]}>(`SELECT pages FROM investor_image_company_sources WHERE ticker=$1 AND checked_at>now()-interval '7 days'`,[ticker]);
  if(cached[0])return cached[0].pages;
  if(!process.env.POLYGON_API_KEY)return [];
  const r=await limitedFetch(`https://api.polygon.io/v3/reference/tickers/${encodeURIComponent(ticker)}?apiKey=${encodeURIComponent(process.env.POLYGON_API_KEY)}`,{signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw Error('company_source_'+r.status);
  const x:any=await r.json();const homepage=x.results?.homepage_url;if(!homepage)return [];
  const start=await publicGet(homepage.replace(/^http:/,'https:'));const pages=[{url:start.url,html:start.body}];
  const seen=new Set([start.url]),queue=leadershipLinks(start.body,start.url);
  while(queue.length&&seen.size<9){const url=queue.shift()!;if(seen.has(url))continue;seen.add(url);await pause(250);try{const p=await publicGet(url);if(!p.type.includes('html'))continue;pages.push({url:p.url,html:p.body});if(seen.size<4)queue.push(...leadershipLinks(p.body,p.url));}catch{}}
  await db.queryApi(`INSERT INTO investor_image_company_sources(ticker,pages) VALUES($1,$2::jsonb) ON CONFLICT(ticker) DO UPDATE SET pages=excluded.pages,checked_at=now()`,[ticker,JSON.stringify(pages)]);
  return pages;
 })();memo.set(ticker,work);return work;
}
let wikiUnavailable=false;
async function wikiImage(c:Candidate){
 if(wikiUnavailable)throw Error('wiki_rate_limited');
 // Exact title only, with employer corroboration for people. Never accept search's first face.
 const words=c.display_name.replace(/[,]/g,'').split(/\s+/);const cleanName=c.display_name.replace(/^(the honorable|honorable|hon\.?|mr\.?|mrs\.?|ms\.?|dr\.?)\s+/i,'');const variants=[cleanName,...(c.filer_type==='insider'?[words.slice(1).concat(words[0]??'').filter(w=>w.length>1).join(' ')]:[])];
 for(const name of variants.slice(0,2)){
  await pause(1000);
  const r=await limitedFetch('https://en.wikipedia.org/api/rest_v1/page/summary/'+encodeURIComponent(name.replace(/ /g,'_')),{signal:AbortSignal.timeout(8000)});
  if(r.status===429){wikiUnavailable=true;throw Error('wiki_rate_limited');}if(!r.ok)continue;
  const x:any=await r.json();if(x.type==='disambiguation'||imageNameKey(x.title)!==imageNameKey(c.display_name))continue;
  const src=x.thumbnail?.source;if(!src)continue;
  if(c.filer_type==='institution'){if(!/logo|wordmark/i.test(src))continue;}
  else if(c.filer_type==='politician'){if(!/senator|congress|representative|president|governor/i.test(x.extract??''))continue;}
  else {const companyWords=(c.company??'').toLowerCase().match(/[a-z]{4,}/g)?.filter(w=>!['corp','corporation','incorporated','holdings','company','group'].includes(w))??[];if(!companyWords.some(w=>String(x.extract??'').toLowerCase().includes(w)))continue;}
  return {src,source:x.content_urls?.desktop?.page};
 }
 return null;
}
let found=0,missing=0,failed=0;
for(const c of candidates){
 try{
  let image:{src:string;source:string}|null=null;
  if(c.filer_type==='insider'&&c.ticker){
   const pages=await companyPages(c.ticker);const matches=pages.flatMap(p=>namedPortraits(p.html,p.url,c.display_name).map(src=>({src,source:p.url})));
   // Duplicate copies of the same headshot are fine; conflicting matches fail closed.
   const unique=[...new Map(matches.map(m=>[m.src,m])).values()];if(unique.length===1)image=unique[0]!;
  }
  if(!image)image=await wikiImage(c);
  if(image){const check=await publicGet(image.src);if(!check.type.startsWith('image/'))throw Error('not_image');found++;}else missing++;
  await db.queryApi(`INSERT INTO investor_images(filer_id,name_key,src,source_url,status,retry_at) VALUES($1,$2,$3,$4,$5,now()+$6::interval)
 ON CONFLICT(filer_id) DO UPDATE SET name_key=excluded.name_key,src=excluded.src,source_url=excluded.source_url,status=excluded.status,checked_at=now(),retry_at=excluded.retry_at`,[c.id,imageNameKey(c.display_name),image?.src??null,image?.source??null,image?'found':'missing',image?'30 days':'7 days']);
  console.log(image?'image_found':'image_missing',c.display_name);
 }catch(e){failed++;console.warn('image_retry',c.display_name,e instanceof Error?e.message:'failed');
  await db.queryApi(`INSERT INTO investor_images(filer_id,name_key,status,retry_at) VALUES($1,$2,'retry',now()+interval '1 day') ON CONFLICT(filer_id) DO UPDATE SET retry_at=excluded.retry_at`,[c.id,imageNameKey(c.display_name)]);
 }
 await pause(500);
}
console.log({checked:candidates.length,found,missing,failed});process.exit(0);
