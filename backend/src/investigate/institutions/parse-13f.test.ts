import test from 'node:test';import assert from 'node:assert/strict';
process.env.DATABASE_URL ??= 'postgresql://localhost/parser_test';
const {parse13fHoldings,parse13fMeta}=await import('./parse-13f.js');
const xml='<infoTable><nameOfIssuer>Example</nameOfIssuer><cusip>123456789</cusip><titleOfClass>COM</titleOfClass><value>1000000</value><shrsOrPrnAmt><sshPrnamt>10000</sshPrnamt><sshPrnamtType>SH</sshPrnamtType></shrsOrPrnAmt></infoTable>';
test('2023+ values are dollars, historical values use declared date',()=>{assert.equal(parse13fHoldings(xml,'2026-08-14')[0]?.value_usd,1000000);assert.equal(parse13fHoldings(xml,'2022-11-14')[0]?.value_usd,1000000000);assert.equal(parse13fHoldings(xml)[0]?.value_usd,null)});
test('single row XML stays authoritative and put/call is retained',()=>{const r=parse13fHoldings(xml.replace('</infoTable>','<putCall>Put</putCall></infoTable>'),'2026-08-14');assert.equal(r.length,1);assert.equal(r[0]?.instrument_type,'put')});
test('SEC submission dates are parsed independently of ingestion',()=>{const m=parse13fMeta('COMPANY CONFORMED NAME: TEST MANAGER\nFILED AS OF DATE: 20260814\nCONFORMED PERIOD OF REPORT: 20260630');assert.equal(m.filed_at,'2026-08-14');assert.equal(m.period_of_report,'2026-06-30');assert.equal(m.filer_name,'TEST MANAGER')});
test('current cover XML period format is accepted',()=>{assert.equal(parse13fMeta('<reportCalendarOrQuarter>06-30-2026</reportCalendarOrQuarter>').period_of_report,'2026-06-30');assert.equal(parse13fMeta('<reportCalendarOrQuarter>06/30/2026</reportCalendarOrQuarter>').period_of_report,'2026-06-30');assert.equal(parse13fMeta('<periodOfReport>2026-06-30</periodOfReport>').period_of_report,'2026-06-30')});
test('separate securities do not become a plain-stock holding when consolidated',async()=>{const {consolidateMappedHoldingsByTicker}=await import('./resolve-13f-tickers.js');const row={...parse13fHoldings(xml,'2026-08-14')[0]!,ticker:'TEST',resolve_source:'name' as const};const out=consolidateMappedHoldingsByTicker([row,{...row,instrument_type:'call'}]);assert.equal(out[0]?.instrument_type,'mixed')});

test('13F amendments survive both SEC headers and namespaced XML',()=>{
 assert.equal(parse13fMeta('CONFORMED SUBMISSION TYPE: 13F-HR/A').is_amendment,true);
 assert.equal(parse13fMeta('<ns:isAmendment>true</ns:isAmendment>').is_amendment,true);
 assert.equal(parse13fMeta('<submissionType>13F-HR/A</submissionType>').is_amendment,true);
 assert.equal(parse13fMeta('<isAmendment>false</isAmendment>').is_amendment,false);
});
