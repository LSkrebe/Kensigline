import {ExplorePersonRow} from './ExplorePersonRow.jsx'
import {useUserWatchlist} from './UserWatchlistContext.jsx'
import {investorRowWatchlistSlug} from './userWatchlist.js'

export function ExploreInvestorDirectoryRow({row,onClick}){
  const {hasPerson,addPersonFromRow}=useUserWatchlist()
  const saved=hasPerson(investorRowWatchlistSlug(row),row.name)
  const label=saved?`${row.name} is on your watchlist`:`Add ${row.name} to watchlist`
  return <ExplorePersonRow row={row} onClick={onClick} trailingAction={
    <button type="button" className="exploreInvestorSave" disabled={saved} aria-label={label} title={label} onClick={()=>addPersonFromRow(row)}>
      <svg width="16" height="18" viewBox="0 0 20 22" fill="none" aria-hidden="true"><path d="M5 3h10v16l-5-3-5 3V3Z" stroke="currentColor" strokeWidth="1.25"/>{saved?<path d="m7 9 2 2 4-4" stroke="currentColor" strokeWidth="1.25"/>:<path d="M10 7v6M7 10h6" stroke="currentColor" strokeWidth="1.25"/>}</svg>
    </button>
  }/>
}
