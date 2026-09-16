import test from 'node:test'
import assert from 'node:assert/strict'
import {selectEventPerformance} from './exploreEventPerformance.js'
const tx=(id,returnFraction,extra={})=>({id,returnFraction,latestDay:'2026-09-11',...extra})
test('matches watchlist lead and preserves subsequent stock return sign for sales',()=>{
 assert.equal(selectEventPerformance({id:'watch-person',events:[{id:'wl-p-123'}]},[tx('123',-.12)]).fraction,-.12)
 assert.equal(selectEventPerformance({id:'a-123'},[tx('other',.9)]),null)
})
test('averages complete grouped transactions without duplicating a record',()=>{
 assert.equal(selectEventPerformance({performanceEventIds:['a-1','a-2','a-1']},[tx('1',.1),tx('2',.3)]).fraction,.2)
})
test('missing, stale, amended, invalid or mixed price dates never invent a percentage',()=>{
 const row={performanceEventIds:['a-1','a-2']}
 for(const second of [null,tx('2',null),tx('2',.2,{stale:true}),tx('2',.2,{reason:'Amendment unresolved'}),tx('2',.2,{latestDay:'2026-09-10'})])
 assert.equal(selectEventPerformance(row,[tx('1',.1),...(second?[second]:[])]),null)
})
