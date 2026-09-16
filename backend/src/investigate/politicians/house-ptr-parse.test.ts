import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseHousePtrPdfText as parse} from './house-ptr-parse.js';
// Public House source: https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035143.pdf
test('source fixture preserves stock and option rows, dates, and ranges',()=>{
 const text=readFileSync(new URL('./fixtures/house-20035143.txt',import.meta.url),'utf8');
 const r=parse(text,'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035143.pdf');
 assert.equal(r.filed_at,'2026-08-21');
 assert.equal(r.transactions.length,7);
 assert.equal(r.transactions.filter(t=>t.ticker==='BE').length,4);
 assert.equal(r.transactions.filter(t=>t.ticker==='INTC').length,2);
 assert.equal(r.transactions.filter(t=>t.asset_type==='OP').length,3);
 const property=r.transactions.find(t=>t.asset_type==='AB');
 assert.equal(property?.ticker,null);
 assert.equal(property?.transaction_date,'2026-07-27');
 assert.equal(r.transactions[2]?.transaction_date,'2026-07-28');
 assert.equal(r.transactions[4]?.amount_range,'$250,001 - $500,000');
});
test('notification date is never promoted to filing date',()=>{
 assert.equal(parse('Notification Date: 07/24/2026','x').filed_at,null);
});
test('partial sales without owner labels preserve every source ticker',()=>{
 const text=readFileSync(new URL('./fixtures/house-20030716.txt',import.meta.url),'utf8');
 const r=parse(text,'https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2025/20030716.pdf');
 assert.equal(r.transactions.length,10);
 assert.deepEqual(r.transactions.map(t=>t.ticker),['ANET','T','AVGO','CHDN','DOV','HD','MRVL','PYPL','CRM','VRSN']);
 assert.ok(r.transactions.every(t=>t.transaction_type==='S'));
 assert.equal(r.filed_at,'2025-08-11');
});
test('asset codes and account labels are never borrowed as tickers',()=>{
 const r=parse('Name: Example Status: Member SP Acme (ACME) [ST] P 01/01/2026 01/02/2026 $1,001 - $15,000 F S: New S O: Brokerage (CB) Private property [AB] P 01/03/2026 01/04/2026 $15,001 - $50,000 Digitally Signed: Example, 01/10/2026','x');
 assert.equal(r.transactions[1]?.ticker,null);
});
test('signature names can contain commas',()=>{
 assert.equal(parse('Digitally Signed: Hon. Neal Patrick MD, Facs Dunn , 03/10/2025','x').filed_at,'2025-03-10');
});
test('Washington DC in a page header is not a dependent-child owner',()=>{
 const result=parse('Washington, DC 20515 Name: Test Member Status: Member Cap. Gains > $200? Apple (AAPL) [ST] P 06/23/2026 06/24/2026 $1,001 - $15,000 Digitally Signed: Test Member, 07/01/2026','');
 assert.equal(result.transactions[0]?.owner,null);assert.equal(result.transactions[0]?.asset_name,'Apple (AAPL) [ST]');
});
