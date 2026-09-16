/** NYSE full-day closures, 2024–2028. Early closes still provide a daily close.
 * Source: https://www.nyse.com/markets/hours-calendars ; extraordinary closure 2025-01-09.
 * Outside the audited calendar range return null rather than infer a session from missing prices.
 */
const closed=new Set([
'2024-01-01','2024-01-15','2024-02-19','2024-03-29','2024-05-27','2024-06-19','2024-07-04','2024-09-02','2024-11-28','2024-12-25',
'2025-01-01','2025-01-09','2025-01-20','2025-02-17','2025-04-18','2025-05-26','2025-06-19','2025-07-04','2025-09-01','2025-11-27','2025-12-25',
'2026-01-01','2026-01-19','2026-02-16','2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07','2026-11-26','2026-12-25',
'2027-01-01','2027-01-18','2027-02-15','2027-03-26','2027-05-31','2027-06-18','2027-07-05','2027-09-06','2027-11-25','2027-12-24',
'2028-01-17','2028-02-21','2028-04-14','2028-05-29','2028-06-19','2028-07-04','2028-09-04','2028-11-23','2028-12-25'
]);
export function marketSession(day:string,direction:1|-1=1):string|null {
 const year=Number(day.slice(0,4));if(year<2024||year>2028)return null;
 let date=new Date(day+'T00:00:00Z');if(!Number.isFinite(date.getTime()))return null;
 for(let i=0;i<10;i++){
  const current=date.toISOString().slice(0,10),weekday=date.getUTCDay();
  if(weekday!==0&&weekday!==6&&!closed.has(current))return current;
  date=new Date(date.getTime()+direction*86400000);
 }
 return null;
}

export function completedDay(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now);
  const get=(key:string)=>parts.find(p=>p.type===key)!.value;
  let day=`${get('year')}-${get('month')}-${get('day')}`;
  // Allow final daily aggregates to settle, including the ordinary 16:00 ET close.
  if(Number(get('hour'))<18)day=new Date(Date.parse(day)-86400000).toISOString().slice(0,10);
  return marketSession(day,-1)??day;
}
