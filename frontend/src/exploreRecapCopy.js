/**
 * Templated Explore recap copy — no LLM.
 *
 * Headlines are newspaper-style hooks: no tickers, counts, $, %, commas-asides,
 * or document types (Form 4 / PTR / 8-K / 10-Q). Summaries may name sources.
 * Each catalog condition gets its own headline voice (no buy/sale mirror swaps).
 * Slots: {company}, {person}, {role} (role only in role-aware summary pools).
 *
 * Multiple variants per typeId so days don't feel identical. Selection is
 * deterministic from a seed (filing id / ticker) so live + mock stay stable.
 */

/** @typedef {{ headlines: string[], summaries: string[] }} RecapCopyPool */

/** @type {Record<string, RecapCopyPool>} */
export const EXPLORE_RECAP_COPY = {
  insider_buying_cluster: {
    headlines: [
      'Insiders lean in together',
      'Buying shows up across the suite',
      'Open-market purchases pile onto one name',
      'More than one desk bought in',
      'The C-suite puts money to work',
      'Inside capital rushes the same door',
      'Bullish filings gather in a pack',
    ],
    summaries: [
      'Open-market purchases arrived from more than one desk inside {company} in the same session.',
      'Several people close to {company} filed purchases that landed together.',
      'The disclosure feed shows coordinated buying activity around {company}.',
      'Purchase filings from multiple insiders at {company} cleared on the same day.',
      'More than one insider at {company} stepped in with open-market buys today.',
      'Form 4 purchase activity around {company} came from separate desks in the same session.',
      'Buying at {company} showed up across multiple insider filings before the day closed.',
    ],
  },
  insider_selling_cluster: {
    headlines: [
      'A wave of insider selling',
      'Liquidity leaves the suite',
      'Executives lighten the load',
      'More than one desk sold out of size',
      'Paper hits the tape from inside',
      'Hands come off the wheel together',
      'Selling pressure builds in the archive',
    ],
    summaries: [
      'Several people close to {company} filed sales that landed on the same day.',
      'Open-market sales arrived from more than one desk inside {company} in the same session.',
      'The disclosure feed shows clustered selling activity around {company}.',
      'Sale filings from multiple insiders at {company} cleared on the same day.',
      'More than one insider at {company} filed open-market sales today.',
      'Form 4 sale activity around {company} came from separate desks in the same session.',
      'Selling at {company} showed up across multiple insider filings before the day closed.',
    ],
  },
  politician_buying_cluster: {
    headlines: [
      'The Hill piles into one name',
      'Political capital finds a home',
      'Offices lean the same way on one stock',
      'Washington bids gather overnight',
      'Separate offices chase the same story',
      'Political money concentrates on one name',
      'A chorus of buys from the Hill',
    ],
    summaries: [
      'More than one political disclosure filed a purchase tied to {company} today.',
      'Separate PTR purchase filings landed around {company} in the same session.',
      'The feed shows clustered political buying activity involving {company}.',
      'Purchase reports from more than one political filer cleared for {company}.',
      'Hill disclosures stacked open-market buys linked to {company} today.',
      'Multiple political transaction reports show purchases involving {company}.',
      'Political buying around {company} showed up across more than one PTR filing.',
    ],
  },
  politician_selling_cluster: {
    headlines: [
      'Washington takes chips off the table',
      'Political selling floods one name',
      'Offices unload the same stock',
      'The Hill backs away in unison',
      'Separate offices exit together',
      'Political money drains from one name',
      'A chorus of exits from the Hill',
    ],
    summaries: [
      'More than one political disclosure filed a sale tied to {company} today.',
      'Separate PTR sale filings landed around {company} in the same session.',
      'The feed shows clustered political selling activity involving {company}.',
      'Sale reports from more than one political filer cleared for {company}.',
      'Hill disclosures stacked open-market sales linked to {company} today.',
      'Multiple political transaction reports show sales involving {company}.',
      'Political selling around {company} showed up across more than one PTR filing.',
    ],
  },
  multiple_people_one_company: {
    headlines: [
      'The filing desk got busy',
      'Multiple names on one company',
      'Insider paperwork stacked up',
      'A crowded day in the disclosures',
      'Traffic builds around a single issuer',
      'Activity spreads across the suite',
      'Separate desks hit the same issuer',
    ],
    summaries: [
      'More than one insider at {company} showed up in the disclosure feed today.',
      'Separate Form 4 filings tied to {company} arrived from different people.',
      'Activity around {company} spanned more than a single insider filing.',
      'The archive picked up several insider disclosures linked to {company}.',
      'Filing traffic at {company} came from more than one person today.',
      'Different insiders tied to {company} cleared disclosures in the same session.',
      '{company} drew insider paperwork from multiple names before the day closed.',
    ],
  },
  one_person_multiple_companies: {
    headlines: [
      'One name leaves a trail',
      'A trail across separate companies',
      'Activity that did not stay in one place',
      'Disclosures spanning the board',
      'One desk stretches across the market',
      'Cross-company activity from one desk',
      'The same name shows up twice',
    ],
    summaries: [
      '{person} left a trail of disclosures that spanned separate companies today.',
      '{person} filed activity tied to more than one company in the same session.',
      'The day’s feed shows {person} active across multiple names.',
      '{person} appeared in disclosures that were not limited to a single issuer.',
      'More than one company showed filings linked to {person} today.',
      '{person} cleared disclosures on separate issuers before the session closed.',
      'Activity from {person} stretched across more than one ticker today.',
    ],
  },
  one_person_multiple_companies_politician: {
    headlines: [
      'One office covers more ground',
      'A political trail across companies',
      'Hill activity that would not stay put',
      'Disclosures spanning separate issuers',
      'One office spans the board',
      'Political filings hop between names',
      'The same office shows up twice',
    ],
    summaries: [
      '{person} left a trail of political disclosures that spanned separate companies today.',
      '{person} filed PTR activity tied to more than one company in the same session.',
      'The day’s feed shows {person} active across multiple names.',
      '{person} appeared in political disclosures that were not limited to a single issuer.',
      'More than one company showed PTR filings linked to {person} today.',
      '{person} cleared political disclosures on separate issuers before the session closed.',
      'Political activity from {person} stretched across more than one ticker today.',
    ],
  },
  person_activity: {
    headlines: [
      'A busy day in the archive',
      'Stacked disclosures from one desk',
      'Repeat filings from a single name',
      'Repeated activity from a single filer',
      'One name keeps showing up',
      'Back-to-back filings from one person',
      'The same filer clears again',
    ],
    summaries: [
      '{person} stacked more than one disclosure before the session closed.',
      '{person} showed up more than once in today’s filing feed.',
      'Several disclosures tied to {person} cleared on the same day.',
      'The archive recorded repeated activity from {person} today.',
      'More than one filing linked to {person} landed in the same session.',
      '{person} cleared multiple disclosures before the day wrapped.',
      'Repeated paperwork from {person} showed up in today’s feed.',
    ],
  },
  person_activity_with_role: {
    headlines: [
      'A busy day in the archive',
      'Stacked disclosures from one desk',
      'Repeat filings from a single name',
      'Repeated activity from a single filer',
      'One name keeps showing up',
      'Back-to-back filings from one person',
      'The same filer clears again',
    ],
    summaries: [
      '{person}, {role}, stacked more than one disclosure before the session closed.',
      '{person}, {role}, showed up more than once in today’s filing feed.',
      'Several disclosures tied to {person}, {role}, cleared on the same day.',
      'The archive recorded repeated activity from {person}, {role}, today.',
      'More than one filing linked to {person}, {role}, landed in the same session.',
      '{person}, {role}, cleared multiple disclosures before the day wrapped.',
      'Repeated paperwork from {person}, {role}, showed up in today’s feed.',
    ],
  },
  person_activity_politician: {
    headlines: [
      'Repeated political disclosures',
      'An office that would not stay quiet',
      'Stacked reports from one office',
      'A busy day on the political wire',
      'One office keeps clearing paper',
      'Back-to-back political filings',
      'The same office clears again',
    ],
    summaries: [
      '{person} stacked more than one political disclosure before the session closed.',
      '{person} showed up more than once in today’s PTR feed.',
      'Several political disclosures tied to {person} cleared on the same day.',
      'The archive recorded repeated PTR activity from {person} today.',
      'More than one political filing linked to {person} landed in the same session.',
      '{person} cleared multiple PTR disclosures before the day wrapped.',
      'Repeated political paperwork from {person} showed up in today’s feed.',
    ],
  },
  person_activity_politician_with_role: {
    headlines: [
      'Repeated political disclosures',
      'An office that would not stay quiet',
      'Stacked reports from one office',
      'A busy day on the political wire',
      'One office keeps clearing paper',
      'Back-to-back political filings',
      'The same office clears again',
    ],
    summaries: [
      '{person}, {role}, stacked more than one political disclosure before the session closed.',
      '{person}, {role}, showed up more than once in today’s PTR feed.',
      'Several political disclosures tied to {person}, {role}, cleared on the same day.',
      'The archive recorded repeated PTR activity from {person}, {role}, today.',
      'More than one political filing linked to {person}, {role}, landed in the same session.',
      '{person}, {role}, cleared multiple PTR disclosures before the day wrapped.',
      'Repeated political paperwork from {person}, {role}, showed up in today’s feed.',
    ],
  },
  largest_insider_purchase: {
    headlines: [
      'The standout purchase of the day',
      'The session’s heaviest buy',
      'A purchase that led the tape of filings',
      'The largest open-market buy filed today',
      'The buy that outsized the rest',
      'Capital that dwarfed the rest of the day',
      'The session’s lead purchase filing',
    ],
    summaries: [
      'Among today’s purchases, the largest open-market filing came from {person} at {company}.',
      '{person} led the day’s purchase disclosures tied to {company}.',
      'The top purchase filing of the session points to {person} and {company}.',
      '{person} filed the session’s heaviest open-market buy in {company}.',
      'No other purchase filing today matched {person} at {company} on size.',
      'The day’s largest Form 4 buy is linked to {person} and {company}.',
      '{person} posted the standout open-market purchase in {company} today.',
    ],
  },
  largest_insider_purchase_with_role: {
    headlines: [
      'The standout purchase of the day',
      'The session’s heaviest buy',
      'A purchase that led the tape of filings',
      'The largest open-market buy filed today',
      'The buy that outsized the rest',
      'Capital that dwarfed the rest of the day',
      'The session’s lead purchase filing',
    ],
    summaries: [
      '{person}, {role}, filed the session’s heaviest open-market buy in {company}.',
      'Among today’s purchases, the largest open-market filing came from {person}, {role}, tied to {company}.',
      '{person}, {role}, led the day’s purchase disclosures tied to {company}.',
      'The top purchase filing of the session points to {person}, {role}, and {company}.',
      'No other purchase filing today matched {person}, {role}, at {company} on size.',
      'The day’s largest Form 4 buy is linked to {person}, {role}, and {company}.',
      '{person}, {role}, posted the standout open-market purchase in {company} today.',
    ],
  },
  largest_insider_sale: {
    headlines: [
      'The standout exit of the day',
      'Liquidity that led the session',
      'A sale that dominated the tape',
      'The heaviest open-market exit of the day',
      'Selling that outsized everything else',
      'The day’s heaviest hand off the wheel',
      'An exit that led the filing tape',
    ],
    summaries: [
      'Among today’s sales, the largest open-market filing came from {person} at {company}.',
      '{person} led the day’s sale disclosures tied to {company}.',
      'The top sale filing of the session points to {person} and {company}.',
      '{person} filed the session’s heaviest open-market sale in {company}.',
      'No other sale filing today matched {person} at {company} on size.',
      'The day’s largest Form 4 sale is linked to {person} and {company}.',
      '{person} posted the standout open-market sale in {company} today.',
    ],
  },
  largest_insider_sale_with_role: {
    headlines: [
      'The standout exit of the day',
      'Liquidity that led the session',
      'A sale that dominated the tape',
      'The heaviest open-market exit of the day',
      'Selling that outsized everything else',
      'The day’s heaviest hand off the wheel',
      'An exit that led the filing tape',
    ],
    summaries: [
      '{person}, {role}, filed the session’s heaviest open-market sale in {company}.',
      'Among today’s sales, the largest open-market filing came from {person}, {role}, tied to {company}.',
      '{person}, {role}, led the day’s sale disclosures tied to {company}.',
      'The top sale filing of the session points to {person}, {role}, and {company}.',
      'No other sale filing today matched {person}, {role}, at {company} on size.',
      'The day’s largest Form 4 sale is linked to {person}, {role}, and {company}.',
      '{person}, {role}, posted the standout open-market sale in {company} today.',
    ],
  },
  insider_purchase: {
    headlines: [
      'Buying from the inside',
      'An open-market purchase lands',
      'An insider stepped in',
      'A purchase filing clears the wire',
      'A quiet buy from the inside',
      'Fresh purchase disclosure arrives',
      'Inside buying shows up',
    ],
    summaries: [
      'A purchase disclosure from {person} landed for {company}.',
      '{person} filed an open-market buy linked to {company}.',
      'The feed picked up a purchase filing from {person} at {company}.',
      '{person} disclosed a purchase tied to {company}.',
      'An open-market purchase by {person} cleared for {company} today.',
      '{person} showed up in a Form 4 purchase tied to {company}.',
      'The archive recorded a buy filing from {person} involving {company}.',
    ],
  },
  insider_purchase_with_role: {
    headlines: [
      'Buying from the inside',
      'An open-market purchase lands',
      'An insider stepped in',
      'A purchase filing clears the wire',
      'A quiet buy from the inside',
      'Fresh purchase disclosure arrives',
      'Inside buying shows up',
    ],
    summaries: [
      '{person}, {role}, filed a purchase tied to {company}.',
      'A purchase disclosure from {person}, {role}, landed for {company}.',
      '{person}, {role}, filed an open-market buy linked to {company}.',
      'The feed picked up a purchase filing from {person}, {role}, tied to {company}.',
      'An open-market purchase by {person}, {role}, cleared for {company} today.',
      '{person}, {role}, showed up in a Form 4 purchase tied to {company}.',
      'The archive recorded a buy filing from {person}, {role}, involving {company}.',
    ],
  },
  insider_sale: {
    headlines: [
      'An insider stepped back',
      'Hands come off from the inside',
      'An exit clears from the suite',
      'Someone inside hits the offer',
      'Liquidity leaves via the suite',
      'Fresh sale disclosure arrives',
      'An open-market exit lands',
    ],
    summaries: [
      'A sale disclosure from {person} landed for {company}.',
      '{person} filed an open-market sale linked to {company}.',
      'The feed picked up a sale filing from {person} at {company}.',
      '{person} disclosed a sale tied to {company}.',
      'An open-market sale by {person} cleared for {company} today.',
      '{person} showed up in a Form 4 sale tied to {company}.',
      'The archive recorded a sale filing from {person} involving {company}.',
    ],
  },
  insider_sale_with_role: {
    headlines: [
      'An insider stepped back',
      'Hands come off from the inside',
      'An exit clears from the suite',
      'Someone inside hits the offer',
      'Liquidity leaves via the suite',
      'Fresh sale disclosure arrives',
      'An open-market exit lands',
    ],
    summaries: [
      '{person}, {role}, filed a sale tied to {company}.',
      'A sale disclosure from {person}, {role}, landed for {company}.',
      '{person}, {role}, filed an open-market sale linked to {company}.',
      'The feed picked up a sale filing from {person}, {role}, tied to {company}.',
      'An open-market sale by {person}, {role}, cleared for {company} today.',
      '{person}, {role}, showed up in a Form 4 sale tied to {company}.',
      'The archive recorded a sale filing from {person}, {role}, involving {company}.',
    ],
  },
  politician_purchase: {
    headlines: [
      'A political purchase hits the tape',
      'A disclosed buy from the Hill',
      'Political buying enters the feed',
      'Washington puts money to work',
      'An office steps into a name',
      'Fresh buying from the Hill',
      'Hill buying lands in the archive',
    ],
    summaries: [
      '{person} disclosed a stock purchase linked to {company}.',
      'A purchase disclosure from {person} landed for {company}.',
      '{person} filed a political transaction report tied to {company}.',
      'The feed picked up a PTR purchase from {person} involving {company}.',
      'A political purchase by {person} cleared for {company} today.',
      '{person} showed up in a PTR buy linked to {company}.',
      'The archive recorded a political purchase filing from {person} involving {company}.',
    ],
  },
  politician_sale: {
    headlines: [
      'Chips leave the Hill overnight',
      'A disclosed exit from Washington',
      'Political capital walks away',
      'An office files an exit',
      'Washington lightens a position',
      'Fresh selling from the Hill',
      'The Hill posts an exit',
    ],
    summaries: [
      '{person} disclosed a stock sale linked to {company}.',
      'A sale disclosure from {person} landed for {company}.',
      '{person} filed a political transaction report tied to {company}.',
      'The feed picked up a PTR sale from {person} involving {company}.',
      'A political sale by {person} cleared for {company} today.',
      '{person} showed up in a PTR sale linked to {company}.',
      'The archive recorded a political sale filing from {person} involving {company}.',
    ],
  },
  material_8k: {
    headlines: [
      'A material update lands',
      'Fresh current-report news',
      'The company put news on the wire',
      'A current report reshapes the day',
      'Material news clears for the street',
      'New current-report paper arrives',
      'A material filing hits the feed',
    ],
    summaries: [
      '{company} posted a current report that may reshape the near-term narrative.',
      'A material filing from {company} entered the feed today.',
      '{company} published a current report for the street to digest.',
      'The archive picked up a material update from {company}.',
      'An 8-K from {company} cleared in today’s disclosure feed.',
      '{company} put fresh current-report news into the archive.',
      'The session picked up a material company filing from {company}.',
    ],
  },
  quarterly_10q: {
    headlines: [
      'The quarterly picture arrives',
      'Period results hit the archive',
      'A quarterly filing clears',
      'The periodic report is out',
      'The quarter hits the street',
      'Fresh periodic report paper',
      'The quarter’s numbers are in',
    ],
    summaries: [
      '{company} filed its periodic report for the street to parse.',
      'A quarterly filing from {company} entered the disclosure feed.',
      '{company} posted its periodic report today.',
      'The archive picked up a quarterly filing from {company}.',
      'A 10-Q from {company} cleared in today’s feed.',
      '{company} put its periodic report into the archive.',
      'The session recorded a quarterly filing from {company}.',
    ],
  },
  company_filing_burst: {
    headlines: [
      'Paperwork piled up in one place',
      'A denser day of disclosures',
      'Filings stacked on one company',
      'The archive got crowded',
      'Elevated filing traffic on one name',
      'More paper than usual today',
      'Disclosure volume concentrates',
    ],
    summaries: [
      '{company} drew a denser than usual stack of filings in a single day.',
      'More than one disclosure tied to {company} cleared in the same session.',
      'The feed showed elevated filing activity around {company} today.',
      '{company} appeared across multiple filings before the day closed.',
      'Filing traffic around {company} ran hotter than a quiet session.',
      'Several disclosures linked to {company} landed before the day wrapped.',
      'The archive recorded a burst of paperwork tied to {company}.',
    ],
  },
  filing_price_reaction_up: {
    headlines: [
      'The tape answered the filing',
      'Price moved with the news',
      'A sharp bid after disclosure',
      'The market leaned into the filing',
      'Buyers showed up after the paper',
      'A firm session after disclosure',
      'The tape bid the news higher',
    ],
    summaries: [
      '{company} saw a sharp daily move after fresh disclosure hit the wire.',
      'Trading in {company} reacted quickly once the filing cleared.',
      'A notable daily move in {company} followed today’s disclosure.',
      'The session marked a strong reaction in {company} after new paper.',
      'Price action in {company} strengthened after the filing landed.',
      '{company} traded with a clear bid once disclosure hit the feed.',
      'The market answered today’s {company} filing with a firm daily move.',
    ],
  },
  filing_price_reaction_down: {
    headlines: [
      'The tape pushed back',
      'Price faded after disclosure',
      'Shares gave way after the paper',
      'The market leaned against the news',
      'Sellers flooded in after disclosure',
      'A soft session after the filing',
      'The offer swallowed the news',
    ],
    summaries: [
      '{company} saw a sharp daily move after fresh disclosure hit the wire.',
      'Trading in {company} reacted quickly once the filing cleared.',
      'A notable daily move in {company} followed today’s disclosure.',
      'The session marked a strong reaction in {company} after new paper.',
      'Price action in {company} softened after the filing landed.',
      '{company} traded with a clear offer once disclosure hit the feed.',
      'The market answered today’s {company} filing with a soft daily move.',
    ],
  },
  earnings_watch: {
    headlines: [
      'Names lining up for earnings',
      'The calendar gets loud',
      'Results season steps closer',
      'A watchlist ahead of the print',
      'Reports stack on the near calendar',
      'Earnings dates crowd the window',
      'A run of results is coming',
    ],
    summaries: [
      'Several coverage names report within the next stretch of sessions.',
      'A cluster of earnings dates is coming into view across the board.',
      'The near calendar is stacking results for names already on the tape.',
      'With {company} among them, a run of reports is about to clear.',
      'More than one coverage name is due to report in the near window.',
      'Earnings dates are clustering, including {company}, over the next sessions.',
      'The watchlist ahead of results includes {company} and other coverage names.',
    ],
  },
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str ?? '').length; i++) {
    h = Math.imul(h ^ String(str)[i].charCodeAt(i), 16777619)
  }
  return h >>> 0
}

function fillSlots(template, slots) {
  return String(template ?? '')
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = slots?.[key]
      return v != null && String(v).trim() ? String(v).trim() : ''
    })
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Pick headline + summary for a catalog type.
 * @param {string} typeId catalog id (or tone-suffixed copy key)
 * @param {string} seed stable id for deterministic variant choice
 * @param {{ company?: string, person?: string, role?: string }} slots
 */
export function pickRecapCopy(typeId, seed, slots = {}) {
  const pool = EXPLORE_RECAP_COPY[typeId]
  if (!pool?.headlines?.length) {
    return {
      headline: 'A filing worth a closer look',
      summary: fillSlots('Fresh disclosure tied to {company}.', slots) || 'Fresh disclosure entered the feed.',
    }
  }
  const h = hashSeed(`${typeId}|${seed}`)
  const headline = pool.headlines[h % pool.headlines.length]
  const summary = fillSlots(pool.summaries[(h >>> 8) % pool.summaries.length], slots)
  return { headline, summary }
}

/** Prefer role-aware templates when role text is present (avoids awkward empty slots). */
export function withRoleCopyKey(baseKey, role) {
  return role && String(role).trim() ? `${baseKey}_with_role` : baseKey
}

/**
 * Person-activity / multi-company copy keyed by actor mode.
 * Politicians get PTR-safe language (no "desk" / insider framing).
 */
export function actorStoryCopyKey(baseKey, { role, actorMode, doc } = {}) {
  const isPol = actorMode === 'politicians' || doc === 'PTR'
  const keyed = isPol ? `${baseKey}_politician` : baseKey
  // Generic "House PTR" / "Senate PTR" labels read awkwardly in "{person}, {role}," slots.
  const roleOk =
    role &&
    String(role).trim() &&
    !/^(house|senate|executive)\s*ptr$/i.test(String(role).trim()) &&
    !/^ptr$/i.test(String(role).trim()) &&
    !/form\s*278/i.test(String(role).trim())
  return withRoleCopyKey(keyed, roleOk ? role : '')
}

/** @deprecated use withRoleCopyKey('person_activity', role) */
export function personActivityCopyKey(role) {
  return withRoleCopyKey('person_activity', role)
}

export function priceReactionCopyKey(moveUp) {
  return moveUp ? 'filing_price_reaction_up' : 'filing_price_reaction_down'
}
