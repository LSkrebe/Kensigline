/** Reparse cached primary House PDFs. Dry-run by default. Run after npm run build.
 * node backend/scripts/repair-house-history.mjs /absolute/path/to/house [--apply]
 * Every changed database row is backed up in house_repair_backups in the same transaction.
 */
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import dotenv from 'dotenv';
import {parseHousePtrPdfText} from '../dist/investigate/politicians/house-ptr-parse.js';
const dir=process.argv[2]; if(!dir)throw Error('source cache directory required');
dotenv.config({path:new URL('../../.env',import.meta.url).pathname,quiet:true});
const apply=process.argv.includes('--apply');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json'),'utf8'));
const client=new pg.Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:process.env.DATABASE_SSL_REJECT_UNAUTHORIZED!=='0'}});
await client.connect();
try {
 const urls=manifest.map(r=>r.url);
 const filings=(await client.query('SELECT * FROM filings WHERE url=ANY($1::text[])',[urls])).rows;
 const ids=filings.map(f=>f.id);
 const transactions=(await client.query('SELECT * FROM politician_transactions WHERE filing_id=ANY($1::uuid[])',[ids])).rows;
 const issuers=(await client.query('SELECT id,ticker,name FROM issuers')).rows;
 const tickerMap=new Map(issuers.map(i=>[i.ticker,i]));
 const originalFeeds=(await client.query("SELECT * FROM feed_entries WHERE feed_kind='politicians'")).rows;
 const nextFilings=[],nextTransactions=[],quarantine=[];
 const runId=randomUUID(),now=new Date().toISOString();
 let repairedReports=0;const unsupported=[];
 for(const source of manifest){
  const sourceFilings=filings.filter(f=>f.url===source.url);
  const sourceIds=new Set(sourceFilings.map(f=>f.id));
  const oldTxns=transactions.filter(t=>sourceIds.has(t.filing_id));
  const filerIds=[...new Set(oldTxns.map(t=>t.filer_id))];
  if(filerIds.length!==1)throw Error(`ambiguous filer ${source.url}`);
  const id=source.url.match(/(\d+)\.pdf$/)?.[1];
  const text=fs.readFileSync(path.join(dir,`${id}.txt`),'utf8');
  const parsed=parseHousePtrPdfText(text,source.url);
  const isPtr=/Periodic Transaction Report/i.test(text.replaceAll('\0','')) && !/Filing Type:\s*Annual Report/i.test(text);
  const rows=isPtr&&parsed.filed_at?parsed.transactions.filter(t=>['ST','OP'].includes(t.asset_type)&&['P','S','E'].includes(t.transaction_type)&&tickerMap.has(t.ticker)&&t.transaction_date&&t.amount_range):[];
  const grouped=Map.groupBy(rows,t=>t.ticker);
  if(!rows.length)unsupported.push({url:source.url,reason:!isPtr?'unsupported_report_type':!parsed.filed_at?'missing_signature_date':'no_explicit_stock_or_option_rows'});
  const used=new Set();
  for(const [ticker,ts] of grouped){
   const issuer=tickerMap.get(ticker);
   const old=sourceFilings.find(f=>f.issuer_id===issuer.id);
   const f={...(old??sourceFilings[0]),id:old?.id??randomUUID(),issuer_id:issuer.id,feed_kind:'politicians',form:'PTR',filed_at:parsed.filed_at+'T00:00:00Z',parsed_at:now,event_at:parsed.filed_at+'T00:00:00Z',show_on_ticker:true,content_sha256:old?.content_sha256??`house-repair:${id}:${ticker}`,title:`${ts.length} disclosed transaction${ts.length===1?'':'s'}`,analysis:`House PTR signed ${parsed.filed_at}. ${ts.length} stock or option transaction rows. Amounts are reported ranges.`,signal_score:null,signal_label:null,signal_reasons:[]};
   used.add(f.id);nextFilings.push(f);
   for(const t of ts){
    const values=t.amount_range.match(/[\d,]+(?:\.\d{2})?/g)?.map(v=>Number(v.replaceAll(',','')));
    if(!values||values.length!==2||values.some(v=>!Number.isFinite(v))||values[1]<values[0])throw Error(`invalid amount ${id}`);
    nextTransactions.push({id:randomUUID(),filing_id:f.id,issuer_id:issuer.id,filer_id:filerIds[0],chamber:'house',committee:oldTxns[0]?.committee??null,transaction_type:t.transaction_type,amount_usd:(values[0]+values[1])/2,amount_usd_mid:(values[0]+values[1])/2,amount_range:t.amount_range,asset_name:`${issuer.name??ticker} (${ticker}) [${t.asset_type}]`,description:[t.owner?`Owner: ${t.owner}.`:null,t.description].filter(Boolean).join(' ')||null,transaction_at:t.transaction_date+'T00:00:00Z'});
   }
  }
  for(const f of sourceFilings)if(!used.has(f.id))quarantine.push(f.id);
  if(rows.length)repairedReports++;
 }
 const report={runId,apply,sourceReports:manifest.length,repairedReports,unsupported,oldTransactions:transactions.length,newTransactions:nextTransactions.length,quarantinedFilings:quarantine.length,newFilings:nextFilings.filter(f=>!ids.includes(f.id)).length};
 fs.writeFileSync(path.join(dir,apply?'repair-applied.json':'repair-dry-run.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify({...report,unsupported:unsupported.length}));
 if(!apply)process.exitCode=0;
 else {
  if(nextTransactions.length>15000||nextTransactions.length<transactions.length)throw Error('unexpected row count; review before applying');
  await client.query('BEGIN');
  try {
   await client.query("SET LOCAL statement_timeout='60s'");
   await client.query(`CREATE TABLE IF NOT EXISTS house_repair_backups(run_id uuid PRIMARY KEY,created_at timestamptz NOT NULL DEFAULT now(),snapshot jsonb NOT NULL); ALTER TABLE house_repair_backups ENABLE ROW LEVEL SECURITY; REVOKE ALL ON house_repair_backups FROM anon,authenticated`);
   await client.query('INSERT INTO house_repair_backups(run_id,snapshot) VALUES($1,$2::jsonb)',[runId,JSON.stringify({filings,transactions,feeds:originalFeeds,report,newFilingIds:nextFilings.filter(f=>!ids.includes(f.id)).map(f=>f.id)})]);
   await client.query('DELETE FROM politician_transactions WHERE filing_id=ANY($1::uuid[])',[ids]);
   await client.query("UPDATE filings SET show_on_ticker=false,feed_kind=NULL,analysis='Quarantined by source audit: unsupported or incorrectly assigned transaction rows.' WHERE id=ANY($1::uuid[])",[quarantine]);
   await client.query(`INSERT INTO filings SELECT * FROM jsonb_populate_recordset(NULL::filings,$1::jsonb) ON CONFLICT(id) DO UPDATE SET filed_at=EXCLUDED.filed_at,event_at=EXCLUDED.event_at,parsed_at=EXCLUDED.parsed_at,form=EXCLUDED.form,feed_kind=EXCLUDED.feed_kind,show_on_ticker=true,title=EXCLUDED.title,analysis=EXCLUDED.analysis,signal_score=NULL,signal_label=NULL,signal_reasons='{}'`,[JSON.stringify(nextFilings)]);
   await client.query('INSERT INTO politician_transactions SELECT * FROM jsonb_populate_recordset(NULL::politician_transactions,$1::jsonb)',[JSON.stringify(nextTransactions)]);
   await client.query("DELETE FROM feed_entries WHERE feed_kind='politicians' AND filing_id=ANY($1::uuid[])",[ids]);
   await client.query(`INSERT INTO feed_entries(feed_kind,issuer_id,filing_id,feed_at,feed_label,source_key,today_count)
    SELECT 'politicians',f.issuer_id,f.id,coalesce(f.filed_at,f.event_at),count(t.id)::text||' disclosed transactions','PTR',count(t.id)::int
    FROM (SELECT DISTINCT ON (issuer_id) * FROM filings WHERE feed_kind='politicians' AND show_on_ticker=true ORDER BY issuer_id,coalesce(filed_at,event_at) DESC) f
    JOIN politician_transactions t ON t.filing_id=f.id GROUP BY f.id,f.issuer_id,f.filed_at,f.event_at
    ON CONFLICT(feed_kind,issuer_id) DO UPDATE SET filing_id=EXCLUDED.filing_id,feed_at=EXCLUDED.feed_at,feed_label=EXCLUDED.feed_label,today_count=EXCLUDED.today_count,updated_at=now()`);
   const count=(await client.query('SELECT count(*)::int n FROM politician_transactions WHERE filing_id=ANY($1::uuid[])',[nextFilings.map(f=>f.id)])).rows[0].n;
   if(count!==nextTransactions.length)throw Error('post-write count mismatch');
   await client.query('COMMIT');console.log('Committed with database backup',runId);
  }catch(error){await client.query('ROLLBACK');throw error;}
 }
}finally{await client.end();}
