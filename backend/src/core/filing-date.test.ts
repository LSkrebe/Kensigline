import test from 'node:test';
import assert from 'node:assert/strict';
import {ownershipIndexUrl,parseSecFilingDate} from './filing-date.js';
test('derive SEC index and extract filing date, never period of report',()=>{
 assert.equal(ownershipIndexUrl('https://www.sec.gov/Archives/edgar/data/123/000000012326000001/xslF345X05/file.xml'),'https://www.sec.gov/Archives/edgar/data/123/000000012326000001/0000000123-26-000001-index.htm');
 assert.equal(ownershipIndexUrl('https://example.com/fake.xml'),null);
 assert.equal(parseSecFilingDate('<div class="infoHead">Filing Date</div><div class="info">2026-09-11</div>'),'2026-09-11');
 assert.equal(parseSecFilingDate('<periodOfReport>2026-09-09</periodOfReport>'),null);
});
