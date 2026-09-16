import {imageNameKey} from './name-key.js';
const decode=(s:string)=>s.replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n)));
export function attributes(tag:string){const out:Record<string,string>={};for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(["'])(.*?)\2/gs))out[m[1]!.toLowerCase()]=decode(m[3]!);return out;}
export function namedPortraits(html:string,page:string,name:string){
 const key=imageNameKey(name);if(key.split(' ').length<2)return [];
 const results=new Set<string>();
 for(const m of html.replace(/\\"/g,'"').matchAll(/<img\b[^>]*>/gi)){
  const a=attributes(m[0]);const label=(a.alt||a.title||'').replace(/\b(headshot|portrait|photo|photograph|of)\b/gi,'').trim();
  if(imageNameKey(label)!==key)continue;
  const raw=a['data-src']||a.src;if(!raw)continue;
  try{const u=new URL(raw,page);if(u.protocol==='https:'&&!/logo|sprite|placeholder/i.test(u.pathname))results.add(u.href);}catch{}
 }
 return [...results];
}
export function leadershipLinks(html:string,page:string){
 const base=new URL(page),out=new Set<string>();
 for(const m of html.replace(/\\"/g,'"').matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
  const href=attributes(m[1]!).href;if(!href||!/(leadership|management|executive|directors|our.team|about.us|about-)/i.test(href+' '+m[2]))continue;
  try{const u=new URL(href,page);if(u.hostname===base.hostname&&u.protocol==='https:'){u.hash='';out.add(u.href);}}catch{}
 }
 return [...out].sort((a,b)=>Number(/leadership|management|executive/i.test(b))-Number(/leadership|management|executive/i.test(a))).slice(0,6);
}
