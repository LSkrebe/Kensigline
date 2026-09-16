import test from 'node:test';import assert from 'node:assert/strict';
import {parseOge278tPdfText} from './oge-278t-parse.js';import {resolveStockNames} from './resolve-stock.js';
const header="Filer's Name Paj\nDonald J Trump Page 02 of 34\nTransactions\n";
test('OCR table separators, repeated rows and stock names are preserved',()=>{
 const p=parseOge278tPdfText(header+'1 Apple Inc sale 6/23/2026 No|$50,001 - $100,000\n2 Apple Inc sale 6/23/2026 No|$50,001 - $100,000','https://example.test/08.12.2026-278T.pdf');
 assert.equal(p.filer.name,'Donald J Trump');assert.equal(p.transactions.length,2);
 const mapped=resolveStockNames(p.transactions,new Map([['AAPL','Apple Inc.']]));assert.equal(mapped[0]!.ticker,'AAPL');assert.equal(mapped[0]!.asset_type,'ST');
});
test('invalid dates and OCR-damaged range boundaries are rejected',()=>{
 assert.equal(parseOge278tPdfText(header+'1 Apple Inc purchase 2/30/2026 No $1,001 - $15,000\n2 Apple Inc purchase 6/23/2026 No $2,001 - $15,000','').transactions.length,0);
});
test('ambiguous company names and bonds never become guessed stocks',()=>{
 const rows=[{ticker:null,asset_name:'Alphabet Inc',asset_type:null},{ticker:null,asset_name:'Apple Inc bond due 2030',asset_type:null}];
 assert.ok(resolveStockNames(rows,new Map([['GOOG','Alphabet Inc'],['GOOGL','Alphabet Inc'],['AAPL','Apple Inc']])).every(r=>r.ticker===null));
});
