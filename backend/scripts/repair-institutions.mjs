import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import crypto from 'node:crypto';import pg from 'pg';import dotenv from 'dotenv';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
dotenv.config({path:path.join(repo,'.env')});
const sourceDir=process.env.REPAIR_SOURCE_DIR??path.join(repo,'backend/.cache/institution-sources');
const root=path.join(repo,'backend/dist');
const {fetch13fFilingBundle}=await import(root+'/core/sec.js');const {parse13fMeta,parse13fHoldings}=await import(root+'/investigate/institutions/parse-13f.js');const {resolveHoldingsToTickers}=await import(root+'/investigate/institutions/resolve-13f-tickers.js');
const c=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:true,ca:fs.readFileSync(path.join(repo,'backend/certs/supabase-root-2021.crt'),'utf8')}});await c.connect();await c.query("SET statement_timeout='60s'");
const apply=process.argv.includes('--apply');const run=crypto.randomUUID();
const actors=(await c.query(`SELECT id,slug,display_name FROM filers WHERE filer_type='institution' AND (slug=ANY($1::text[]) OR slug LIKE 'vanguard-%')`,[['cik-2012383','renaissance-technologies']])).rows;
if(apply){await c.query(`CREATE TABLE IF NOT EXISTS institution_repair_backups (run_id uuid NOT NULL,source_url text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),data jsonb NOT NULL,PRIMARY KEY(run_id,source_url)); ALTER TABLE institution_repair_backups ENABLE ROW LEVEL SECURITY; REVOKE ALL ON institution_repair_backups FROM anon,authenticated`);}
fs.mkdirSync(sourceDir,{recursive:true});
for(const actor of actors){
 const groups=(await c.query(`SELECT d.url, count(*)::int as n FROM institution_transactions t JOIN filings d ON d.id=t.filing_id WHERE t.filer_id=$1 AND t.data_quality_version=0 GROUP BY d.url ORDER BY d.url DESC LIMIT 4`,[actor.id])).rows;
 for(const group of groups){try{
 const idx=group.url.replace(/[^/]+$/,'index.json'),key=crypto.createHash('sha256').update(idx).digest('hex'),file=path.join(sourceDir,key+'.txt');let bundle;
 if(fs.existsSync(file))bundle=fs.readFileSync(file,'utf8');else{bundle=(await fetch13fFilingBundle(idx)).bundle;fs.writeFileSync(file,bundle);}
 const meta=parse13fMeta(bundle,idx);if(!meta.filed_at||!meta.period_of_report)throw Error('missing_source_dates');
 const holdings=parse13fHoldings(bundle,meta.filed_at);
 const declared=Number(bundle.match(/<tableValueTotal>([^<]+)/i)?.[1]);
 if(declared && holdings.reduce((sum,h)=>sum+(h.value_usd??0),0)!==declared)throw Error('source_total_mismatch');const resolved=await resolveHoldingsToTickers(holdings);const mapped=new Map(resolved.mapped.map(h=>[h.ticker,h]));
 const old=(await c.query(`SELECT t.*,i.ticker,row_to_json(d) as filing FROM institution_transactions t JOIN issuers i ON i.id=t.issuer_id JOIN filings d ON d.id=t.filing_id WHERE t.filer_id=$1 AND d.url=$2`,[actor.id,group.url])).rows;
 const valid=old.filter(r=>mapped.has(r.ticker));const distinct=new Set(valid.map(r=>r.ticker));
 if(apply){await c.query('BEGIN');await c.query(`INSERT INTO institution_repair_backups(run_id,source_url,data) VALUES($1,$2,$3::jsonb)`,[run,group.url,JSON.stringify({actor,meta,old})]);
 const updates=valid.map(r=>({id:r.id,filing_id:r.filing_id,amount:mapped.get(r.ticker).value_usd,shares:mapped.get(r.ticker).shares,instrument:mapped.get(r.ticker).instrument_type??'other'}));
 await c.query(`WITH x AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS v(id uuid,amount numeric,shares numeric,instrument text)) UPDATE institution_transactions t SET amount_usd=x.amount,shares=x.shares,instrument_type=x.instrument,data_quality_version=1,transaction_at=$2::timestamptz,activity='Held' FROM x WHERE t.id=x.id`,[JSON.stringify(updates),meta.period_of_report]);
 const source=idx.replace(/index.json$/,meta.accession_no+'-index.htm');
 await c.query(`UPDATE filings SET filed_at=$2::timestamptz,event_at=$3::timestamptz,index_url=$4,form=$5 WHERE id=ANY($1::uuid[])`,[updates.map(r=>r.filing_id),meta.filed_at,meta.period_of_report,source,meta.is_amendment ? "13F/A" : "13F"]);
 await c.query('COMMIT');}
 console.log(JSON.stringify({run,apply,actor:actor.slug,source:group.url,meta,parsed:holdings.length,mapped:resolved.mapped.length,validated:valid.length,tickers:distinct.size,withheld:old.length-valid.length}));
 }catch(e){await c.query('ROLLBACK').catch(()=>{});console.log(JSON.stringify({actor:actor.slug,error:e.message,source:group.url}));}}
}
await c.end();process.exit(0);
