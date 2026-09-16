import type {Bar} from './calculate.js';
export function mergeDailyCloses(old:Bar[],previous:Bar,today:Bar):Bar[]|null {
 const last=old.at(-1);
 if(!last)return [previous,today];
 const overlap=last.day===today.day?today:last.day===previous.day?previous:null;
 if(!overlap)return null;
 if(!(last.unadjustedClose!>0&&overlap.unadjustedClose!>0))return null;
 const factor=(last.unadjustedClose!/last.close)/(overlap.unadjustedClose!/overlap.close);
 if(!(factor>0&&Number.isFinite(factor)))return null;
 const rebased=old.map(b=>({...b,close:b.close*factor}));
 rebased[rebased.length-1]=overlap;
 if(last.day!==today.day)rebased.push(today);
 return rebased;
}
