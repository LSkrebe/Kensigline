/**
 * Templated Explore recap copy — no LLM.
 *
 * Headlines are mostly fixed hooks (no tickers / counts / $ / %).
 * Summaries use a small slot set that always reads cleanly:
 *   {company}  — company display name
 *   {person}   — actor display name
 *   {role}     — plain role phrase (optional; variants either require it or avoid it)
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
      'A cluster of open-market purchases',
      'More than one desk bought in',
    ],
    summaries: [
      'Open-market purchases arrived from more than one desk inside {company} in the same session.',
      'Several people close to {company} filed purchases that landed together.',
      'The disclosure feed shows coordinated buying activity around {company}.',
      'Purchase filings from multiple insiders at {company} cleared on the same day.',
    ],
  },
  insider_selling_cluster: {
    headlines: [
      'A wave of insider selling',
      'Selling shows up across the suite',
      'A cluster of open-market sales',
      'More than one desk sold out of size',
    ],
    summaries: [
      'Several people close to {company} filed sales that landed on the same day.',
      'Open-market sales arrived from more than one desk inside {company} in the same session.',
      'The disclosure feed shows clustered selling activity around {company}.',
      'Sale filings from multiple insiders at {company} cleared on the same day.',
    ],
  },
  multiple_people_one_company: {
    headlines: [
      'The filing desk got busy',
      'Multiple names on one company',
      'Insider paperwork stacked up',
      'A crowded day in the disclosures',
    ],
    summaries: [
      'More than one insider at {company} showed up in the disclosure feed today.',
      'Separate Form 4 filings tied to {company} arrived from different people.',
      'Activity around {company} spanned more than a single insider filing.',
      'The archive picked up several insider disclosures linked to {company}.',
    ],
  },
  one_person_multiple_companies: {
    headlines: [
      'One name, more than one story',
      'A trail across separate companies',
      'Activity that did not stay in one place',
      'Disclosures spanning the board',
    ],
    summaries: [
      '{person} left a trail of disclosures that spanned separate companies today.',
      '{person} filed activity tied to more than one company in the same session.',
      'The day’s feed shows {person} active across multiple names.',
      '{person} appeared in disclosures that were not limited to a single issuer.',
    ],
  },
  person_activity: {
    headlines: [
      'A busy day in the archive',
      'Stacked disclosures from one desk',
      'More than one filing, same name',
      'Repeated activity from a single filer',
    ],
    summaries: [
      '{person} stacked more than one disclosure before the session closed.',
      '{person} showed up more than once in today’s filing feed.',
      'Several disclosures tied to {person} cleared on the same day.',
      'The archive recorded repeated activity from {person} today.',
    ],
  },
  person_activity_with_role: {
    headlines: [
      'A busy day in the archive',
      'Stacked disclosures from one desk',
      'More than one filing, same name',
      'Repeated activity from a single filer',
    ],
    summaries: [
      '{person}, {role}, stacked more than one disclosure before the session closed.',
      '{person}, {role}, showed up more than once in today’s filing feed.',
      'Several disclosures tied to {person}, {role}, cleared on the same day.',
      'The archive recorded repeated activity from {person}, {role}, today.',
    ],
  },
  largest_insider_purchase: {
    headlines: [
      'The standout purchase of the day',
      'The session’s heaviest buy',
      'A purchase that led the tape of filings',
      'The largest open-market buy filed today',
    ],
    summaries: [
      'Among today’s purchases, the largest open-market filing came from {person} at {company}.',
      '{person} led the day’s purchase disclosures tied to {company}.',
      'The top purchase filing of the session points to {person} and {company}.',
      '{person} filed the session’s heaviest open-market buy in {company}.',
    ],
  },
  largest_insider_purchase_with_role: {
    headlines: [
      'The standout purchase of the day',
      'The session’s heaviest buy',
      'A purchase that led the tape of filings',
      'The largest open-market buy filed today',
    ],
    summaries: [
      '{person}, {role}, filed the session’s heaviest open-market buy in {company}.',
      'Among today’s purchases, the largest open-market filing came from {person}, {role}, tied to {company}.',
      '{person}, {role}, led the day’s purchase disclosures tied to {company}.',
      'The top purchase filing of the session points to {person}, {role}, and {company}.',
    ],
  },
  largest_insider_sale: {
    headlines: [
      'The standout sale of the day',
      'The session’s heaviest sale',
      'A sale that led the tape of filings',
      'The largest open-market sale filed today',
    ],
    summaries: [
      'Among today’s sales, the largest open-market filing came from {person} at {company}.',
      '{person} led the day’s sale disclosures tied to {company}.',
      'The top sale filing of the session points to {person} and {company}.',
      '{person} filed the session’s heaviest open-market sale in {company}.',
    ],
  },
  largest_insider_sale_with_role: {
    headlines: [
      'The standout sale of the day',
      'The session’s heaviest sale',
      'A sale that led the tape of filings',
      'The largest open-market sale filed today',
    ],
    summaries: [
      '{person}, {role}, filed the session’s heaviest open-market sale in {company}.',
      'Among today’s sales, the largest open-market filing came from {person}, {role}, tied to {company}.',
      '{person}, {role}, led the day’s sale disclosures tied to {company}.',
      'The top sale filing of the session points to {person}, {role}, and {company}.',
    ],
  },
  insider_purchase: {
    headlines: [
      'Buying from the inside',
      'An open-market purchase lands',
      'An insider stepped in',
      'A purchase filing clears the wire',
    ],
    summaries: [
      'A purchase disclosure from {person} landed for {company}.',
      '{person} filed an open-market buy linked to {company}.',
      'The feed picked up a purchase filing from {person} at {company}.',
      '{person} disclosed a purchase tied to {company}.',
    ],
  },
  insider_purchase_with_role: {
    headlines: [
      'Buying from the inside',
      'An open-market purchase lands',
      'An insider stepped in',
      'A purchase filing clears the wire',
    ],
    summaries: [
      '{person}, {role}, filed a purchase tied to {company}.',
      'A purchase disclosure from {person}, {role}, landed for {company}.',
      '{person}, {role}, filed an open-market buy linked to {company}.',
      'The feed picked up a purchase filing from {person}, {role}, tied to {company}.',
    ],
  },
  insider_sale: {
    headlines: [
      'An insider stepped back',
      'An open-market sale lands',
      'Selling from the inside',
      'A sale filing clears the wire',
    ],
    summaries: [
      'A sale disclosure from {person} landed for {company}.',
      '{person} filed an open-market sale linked to {company}.',
      'The feed picked up a sale filing from {person} at {company}.',
      '{person} disclosed a sale tied to {company}.',
    ],
  },
  insider_sale_with_role: {
    headlines: [
      'An insider stepped back',
      'An open-market sale lands',
      'Selling from the inside',
      'A sale filing clears the wire',
    ],
    summaries: [
      '{person}, {role}, filed a sale tied to {company}.',
      'A sale disclosure from {person}, {role}, landed for {company}.',
      '{person}, {role}, filed an open-market sale linked to {company}.',
      'The feed picked up a sale filing from {person}, {role}, tied to {company}.',
    ],
  },
  politician_purchase: {
    headlines: [
      'A political purchase hits the tape',
      'A disclosed buy from the Hill',
      'Political buying enters the feed',
      'A PTR purchase clears',
    ],
    summaries: [
      '{person} disclosed a stock purchase linked to {company}.',
      'A purchase disclosure from {person} landed for {company}.',
      '{person} filed a political transaction report tied to {company}.',
      'The feed picked up a PTR purchase from {person} involving {company}.',
    ],
  },
  politician_sale: {
    headlines: [
      'A political sale hits the tape',
      'A disclosed sale from the Hill',
      'Political selling enters the feed',
      'A PTR sale clears',
    ],
    summaries: [
      '{person} disclosed a stock sale linked to {company}.',
      'A sale disclosure from {person} landed for {company}.',
      '{person} filed a political transaction report tied to {company}.',
      'The feed picked up a PTR sale from {person} involving {company}.',
    ],
  },
  material_8k: {
    headlines: [
      'A material update lands',
      'Fresh current-report news',
      'The company put news on the wire',
      'A current report reshapes the day',
    ],
    summaries: [
      '{company} posted a current report that may reshape the near-term narrative.',
      'A material filing from {company} entered the feed today.',
      '{company} published a current report for the street to digest.',
      'The archive picked up a material update from {company}.',
    ],
  },
  quarterly_10q: {
    headlines: [
      'The quarterly picture arrives',
      'Period results hit the archive',
      'A quarterly filing clears',
      'The periodic report is out',
    ],
    summaries: [
      '{company} filed its periodic report for the street to parse.',
      'A quarterly filing from {company} entered the disclosure feed.',
      '{company} posted its periodic report today.',
      'The archive picked up a quarterly filing from {company}.',
    ],
  },
  company_filing_burst: {
    headlines: [
      'Paperwork piled up in one place',
      'A denser day of disclosures',
      'Filings stacked on one company',
      'The archive got crowded',
    ],
    summaries: [
      '{company} drew a denser than usual stack of filings in a single day.',
      'More than one disclosure tied to {company} cleared in the same session.',
      'The feed showed elevated filing activity around {company} today.',
      '{company} appeared across multiple filings before the day closed.',
    ],
  },
  filing_price_reaction_up: {
    headlines: [
      'The tape answered the filing',
      'Price moved with the news',
      'A sharp bid after disclosure',
      'The market leaned into the filing',
    ],
    summaries: [
      '{company} saw a sharp daily move after fresh disclosure hit the wire.',
      'Trading in {company} reacted quickly once the filing cleared.',
      'A notable daily move in {company} followed today’s disclosure.',
      'The session marked a strong reaction in {company} after new paper.',
    ],
  },
  filing_price_reaction_down: {
    headlines: [
      'The tape pushed back',
      'Price faded after disclosure',
      'A sharp offer after the filing',
      'The market leaned against the news',
    ],
    summaries: [
      '{company} saw a sharp daily move after fresh disclosure hit the wire.',
      'Trading in {company} reacted quickly once the filing cleared.',
      'A notable daily move in {company} followed today’s disclosure.',
      'The session marked a strong reaction in {company} after new paper.',
    ],
  },
  earnings_watch: {
    headlines: [
      'Names lining up for earnings',
      'The calendar gets loud',
      'Results season steps closer',
      'A watchlist ahead of the print',
    ],
    summaries: [
      'Several coverage names report within the next stretch of sessions.',
      'A cluster of earnings dates is coming into view across the board.',
      'The near calendar is stacking results for names already on the tape.',
      'With {company} among them, a run of reports is about to clear.',
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
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => {
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

/** @deprecated use withRoleCopyKey('person_activity', role) */
export function personActivityCopyKey(role) {
  return withRoleCopyKey('person_activity', role)
}

export function priceReactionCopyKey(moveUp) {
  return moveUp ? 'filing_price_reaction_up' : 'filing_price_reaction_down'
}
