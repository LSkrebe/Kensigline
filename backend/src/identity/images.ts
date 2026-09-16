import {db} from '../core/db.js';
import {imageNameKey} from './name-key.js';
export {imageNameKey} from './name-key.js';
export async function ensureImageTables(){await db.queryApi(`CREATE TABLE IF NOT EXISTS investor_images (
 filer_id uuid PRIMARY KEY REFERENCES filers(id), name_key text NOT NULL, src text, source_url text,
 checked_at timestamptz NOT NULL DEFAULT now(), retry_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL DEFAULT 'missing'
)`);await db.queryApi('ALTER TABLE investor_images ENABLE ROW LEVEL SECURITY');await db.queryApi('CREATE INDEX IF NOT EXISTS investor_images_name_key_idx ON investor_images(name_key)');}
export async function lookupInvestorImages(names:string[]){
 const keys=[...new Set(names.map(imageNameKey).filter(Boolean))].slice(0,50);
 if(!keys.length)return {};
 const rows=await db.queryApi<{name_key:string;src:string;source_url:string}>(`SELECT name_key,src,source_url FROM investor_images WHERE name_key=ANY($1::text[]) AND src IS NOT NULL`,[keys]);
 const result:Record<string,{src:string;source:string}>={};
 for(const key of keys){const matches=rows.filter(r=>r.name_key===key);if(matches.length===1)result[key]={src:matches[0]!.src,source:matches[0]!.source_url};}
 return result;
}
