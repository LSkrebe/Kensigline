#!/usr/bin/env node
// Add source metadata only after matching a canonical row back to its exact XML transaction.
import '../dist/load-env.js';
import {db} from '../dist/core/db.js';
import {fetchForm4Text} from '../dist/core/sec.js';
import {extractAllFormTransactions,extractFormReportingOwners,firstXmlTagText} from '../dist/investigate/insider/xml-extract.js';
const apply=process.argv.includes('--apply');
const filings=await db.queryApi(`WITH recent AS (SELECT DISTINCT filing_id FROM (SELECT filing_id FROM insider_transactions WHERE performance_meta IS NULL ORDER BY transaction_at DESC LIMIT 150) t) SELECT fil.id,fil.url,fil.form,fil.event_at FROM recent JOIN filings fil ON fil.id=recent.filing_id WHERE fil.url IS NOT NULL LIMIT 20`,[],20000);
let matched=0,skipped=0;
for(const f of filings){
 try {
  const xml=await fetchForm4Text(f.url);const parsed=extractAllFormTransactions(xml);const owners=extractFormReportingOwners(xml);
  const rows=await db.queryApi('SELECT id,transaction_at::date::text AS day,transaction_code,shares::float8,amount_usd::float8,is_derivative FROM insider_transactions WHERE filing_id=$1',[f.id]);
  for(const r of rows){
   const matches=parsed.map((t,ordinal)=>({t,ordinal})).filter(({t})=>t.transaction_date?.slice(0,10)===r.day&&t.transaction_code===r.transaction_code&&t.is_derivative===r.is_derivative&&t.shares===r.shares&&(t.amount_usd==null?r.amount_usd==null:Math.abs(t.amount_usd-r.amount_usd)<.02));
   if(matches.length!==1){skipped++;continue;}
   const {t,ordinal}=matches[0];const meta={version:1,price:t.price,securityTitle:t.security_title,sharesAfter:t.shares_after,ownership:t.ownership,ownershipNature:t.ownership_nature,footnoteIds:t.footnote_ids,ordinal,jointOwners:owners.length>1,amendment:/\/A$/i.test(firstXmlTagText(xml,'documentType')??''),originalFiledDate:firstXmlTagText(xml,'dateOfOriginalSubmission')};
   if(apply)await db.queryApi('UPDATE insider_transactions SET performance_meta=$2::jsonb WHERE id=$1 AND performance_meta IS NULL',[r.id,JSON.stringify(meta)]);
   matched++;
  }
  console.log(JSON.stringify({filing:f.id,parsed:parsed.length,matched,skipped,applied:apply}));
 }catch(e){console.log(JSON.stringify({filing:f.id,error:e.message}));}
}
console.log(JSON.stringify({matched,skipped,applied:apply}));process.exit(0);
