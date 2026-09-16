import {imageRequestSlot,imageRateLimited} from './rate-limit.js';
import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';
export function publicIPv4(ip:string){const p=ip.split('.').map(Number) as [number,number,number,number];return p.length===4&&p.every(n=>n>=0&&n<=255)&&![0,10,127].includes(p[0])&&p[0]<224&&!(p[0]===169&&p[1]===254)&&!(p[0]===172&&p[1]>=16&&p[1]<=31)&&!(p[0]===192&&[0,168].includes(p[1]))&&!(p[0]===100&&p[1]>=64&&p[1]<=127)&&!(p[0]===198&&[18,19].includes(p[1]));}
/** Bounded worker-only fetch. Pin public DNS result, including every redirect. */
export async function publicGet(raw:string,redirects=0):Promise<{body:string;type:string;url:string}>{
 const u=new URL(raw);if(u.protocol!=='https:'||u.username||u.password||(u.port&&u.port!=='443')||isIP(u.hostname))throw Error('unsafe_image_source');
 await imageRequestSlot(u.hostname);
 const records=await lookup(u.hostname,{family:4,all:true});if(!records.length||records.some(r=>!publicIPv4(r.address)))throw Error('nonpublic_source');
 const result=await new Promise<{body:string;type:string;location:string|undefined;code:number;retryAfter:string|null}>((resolve,reject)=>{
  const req=https.get(u,{headers:{'User-Agent':'MercerLine/1.0 (public leadership image indexing; research@mercerline.com)'},lookup:((_host:any,_opts:any,cb:any)=>_opts?.all?cb(null,records.map(r=>({address:r.address,family:4}))):cb(null,records[0]!.address,4)) as any},res=>{
   const chunks:Buffer[]=[];let size=0;
   res.on('data',c=>{size+=c.length;if(size>2_000_000){res.destroy(Error('source_too_large'));return;}chunks.push(c)});
   res.on('error',reject);res.on('end',()=>resolve({body:Buffer.concat(chunks).toString('utf8'),type:String(res.headers['content-type']??''),location:res.headers.location,code:res.statusCode??0,retryAfter:typeof res.headers['retry-after']==='string'?res.headers['retry-after']:null}));
  });req.setTimeout(8000,()=>req.destroy(Error('source_timeout')));req.on('error',reject);
 });
 if(result.code===429)await imageRateLimited(u.hostname,result.retryAfter);
 if(result.code>=300&&result.code<400&&result.location&&redirects<3)return publicGet(new URL(result.location,u).href,redirects+1);
 if(result.code!==200)throw Error('source_http_'+result.code);
 return {...result,url:u.href};
}
