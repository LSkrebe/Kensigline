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
      '{countWord} insiders at {company} filed open-market purchases in the same session.',
      'Open-market purchases arrived from more than one desk inside {company} today.',
      'Several people close to {company} filed purchases that landed together.',
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
      '{countWord} insiders at {company} filed open-market sales in the same session.',
      'Several people close to {company} filed sales that landed on the same day.',
      'Open-market sales arrived from more than one desk inside {company} today.',
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
      '{person}, {role} at {company}, stacked more than one disclosure before the session closed.',
      '{person}, {role} at {company}, showed up more than once in today’s filing feed.',
      'Several disclosures tied to {person}, {role} at {company}, cleared on the same day.',
      'The archive recorded repeated activity from {person}, {role} at {company}, today.',
      'More than one filing linked to {person}, {role} at {company}, landed in the same session.',
      '{person}, {role} at {company}, cleared multiple disclosures before the day wrapped.',
      'Repeated paperwork from {person}, {role} at {company}, showed up in today’s feed.',
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
      '{person}, {role} at {company}, led the day’s purchase disclosures on size.',
      'Among today’s purchases, the largest open-market filing came from {person}, {role} at {company}.',
      '{person}, {role} at {company}, filed the session’s heaviest open-market buy.',
      'The top purchase filing of the session points to {person}, {role} at {company}.',
      'No other purchase filing today matched {person}, {role} at {company} on size.',
      'The day’s largest Form 4 buy is linked to {person}, {role} at {company}.',
      '{person}, {role} at {company}, posted the standout open-market purchase today.',
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
      '{person}, {role} at {company}, led the day’s sale disclosures on size.',
      'Among today’s sales, the largest open-market filing came from {person}, {role} at {company}.',
      '{person}, {role} at {company}, filed the session’s heaviest open-market sale.',
      'The top sale filing of the session points to {person}, {role} at {company}.',
      'No other sale filing today matched {person}, {role} at {company} on size.',
      'The day’s largest Form 4 sale is linked to {person}, {role} at {company}.',
      '{person}, {role} at {company}, posted the standout open-market sale today.',
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
      '{person}, {role} at {company}, filed a purchase disclosure today.',
      'A purchase disclosure from {person}, {role} at {company}, cleared in today’s feed.',
      '{person}, {role} at {company}, filed an open-market buy.',
      'The feed picked up a purchase filing from {person}, {role} at {company}.',
      'An open-market purchase by {person}, {role} at {company}, cleared today.',
      '{person}, {role} at {company}, showed up in a Form 4 purchase filing.',
      'The archive recorded a buy filing from {person}, {role} at {company}.',
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
      '{person}, {role} at {company}, filed a sale disclosure today.',
      'A sale disclosure from {person}, {role} at {company}, cleared in today’s feed.',
      '{person}, {role} at {company}, filed an open-market sale.',
      'The feed picked up a sale filing from {person}, {role} at {company}.',
      'An open-market sale by {person}, {role} at {company}, cleared today.',
      '{person}, {role} at {company}, showed up in a Form 4 sale filing.',
      'The archive recorded a sale filing from {person}, {role} at {company}.',
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

/** Short company name for prose — trim legal suffixes; fall back to ticker when too long. */
export function sanitizeRecapCompany(name, ticker) {
  let s = String(name ?? '')
    .trim()
    .replace(/\.+$/, '')
  if (!s) s = String(ticker ?? '').trim()
  if (!s) return 'the company'

  s = s
    .replace(/,?\s*\b(Inc\.?|Incorporated|Corp\.?|Corporation|Ltd\.?|Limited|LLC|L\.P\.?|PLC|S\.A\.B\.?\s*de\s*C\.V\.?)\b\.?/gi, '')
    .replace(/\s*\/\s*PA\s*\/?\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()

  if (s.length > 44 && ticker) return String(ticker).trim().toUpperCase()
  return s || String(ticker ?? 'the company').trim().toUpperCase()
}

export function sanitizeRecapPerson(name) {
  const s = String(name ?? '')
    .trim()
    .replace(/\s+/g, ' ')
  if (!s || /^(unknown|n\/a|null|undefined|—|-|–|--)$/i.test(s)) return ''
  return s
}

/** Role title only — avoids "DIR at Company" when company is its own slot. */
export function sanitizeRecapRoleTitle(role, company) {
  const raw = String(role ?? '')
    .replace(/\s*·\s*/g, ' at ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!raw) return ''

  if (/^insider at /i.test(raw)) return ''
  if (/^(house|senate|executive)\s*ptr$/i.test(raw)) return ''
  if (/^ptr$/i.test(raw)) return ''
  if (/form\s*278/i.test(raw)) return ''

  const atIdx = raw.toLowerCase().indexOf(' at ')
  if (atIdx > 0) {
    const title = raw.slice(0, atIdx).trim()
    const roleCompany = raw.slice(atIdx + 4).trim()
    const companyNorm = String(company ?? '').trim().toLowerCase()
    if (companyNorm && roleCompany.toLowerCase().includes(companyNorm.slice(0, 12))) {
      return title
    }
    if (/^(dir|ceo|cfo|coo|pres|vp|off|gc|10%|10%-owner)/i.test(title) || title.length <= 24) {
      return title
    }
  }

  if (/member of congress|senator|representative/i.test(raw)) return raw
  return raw.length > 36 ? raw.slice(0, 36).trim() : raw
}

export function formatRecapCount(n) {
  const x = Math.floor(Number(n))
  if (!Number.isFinite(x) || x < 2) return 'Multiple'
  if (x === 2) return 'Two'
  if (x === 3) return 'Three'
  if (x === 4) return 'Four'
  if (x === 5) return 'Five'
  return 'Several'
}

/**
 * Normalize slots passed into templates.
 * @param {{ companyName?: string, ticker?: string, person?: string, role?: string, count?: number }} input
 */
export function buildRecapCopySlots(input = {}) {
  const ticker = String(input.ticker ?? '').trim().toUpperCase()
  const company = sanitizeRecapCompany(input.companyName, ticker)
  const person = sanitizeRecapPerson(input.person)
  const role = sanitizeRecapRoleTitle(input.role, company)
  const count = Number.isFinite(Number(input.count)) ? Math.max(0, Math.floor(Number(input.count))) : 0
  const countWord = formatRecapCount(count)
  return { company, person, role, count, countWord, ticker }
}

function templateNeeds(template, key) {
  return new RegExp(`\\{${key}\\}`).test(String(template ?? ''))
}

function fillSlots(template, slots) {
  return String(template ?? '')
    .replace(/\{(\w+)\}/g, (_, key) => {
      const v = slots?.[key]
      return v != null && String(v).trim() ? String(v).trim() : ''
    })
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function polishRecapCopy(text) {
  return String(text ?? '')
    .replace(/\s+,/g, ',')
    .replace(/,\s*,/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/\bat at\b/gi, 'at')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/^\s*,\s*/g, '')
    .replace(/,\s*$/g, '')
    .trim()
}

function copyIsValid(text, slots, template) {
  const body = polishRecapCopy(text)
  if (!body || body.length < 12) return false
  if (/\{[a-z]+\}/i.test(body)) return false
  if (/,\s*,/.test(body)) return false
  if (/\b(undefined|null)\b/i.test(body)) return false
  if (/\bfrom\s+,/i.test(body)) return false
  if (/\btied to\s+\./i.test(body)) return false
  if (templateNeeds(template, 'person') && !slots.person) return false
  if (templateNeeds(template, 'company') && !slots.company) return false
  if (templateNeeds(template, 'role') && !slots.role) return false
  if (templateNeeds(template, 'countWord') && (!slots.count || slots.count < 2)) return false
  return true
}

function pickFromPool(items, seed, slots, kind) {
  const list = Array.isArray(items) ? items.filter(Boolean) : []
  if (!list.length) return ''

  const valid = list.filter((t) => copyIsValid(fillSlots(t, slots), slots, t))
  const pool = valid.length ? valid : list
  const h = hashSeed(`${seed}|${kind}`)
  return pool[h % pool.length]
}

function headlinePrefScore(text, slots) {
  let score = 0
  const body = String(text ?? '').toLowerCase()
  const count = Number(slots.count ?? 0)
  if (count === 2 && /(pack|c-suite|chorus|crowd)/.test(body)) score -= 2
  if (count >= 3 && /(pack|cluster|crowd|pile)/.test(body)) score += 1
  if (count >= 4 && /more than one/.test(body)) score -= 1
  return score
}

function pickHeadline(pool, seed, slots) {
  const headlines = pool?.headlines ?? []
  if (!headlines.length) return ''

  const ranked = headlines
    .map((text, idx) => ({
      text,
      idx,
      pref: headlinePrefScore(text, slots),
      valid: copyIsValid(fillSlots(text, slots), slots, text),
    }))
    .filter((x) => x.valid)
  const candidates = ranked.length ? ranked : headlines.map((text, idx) => ({ text, idx, pref: 0, valid: true }))
  const h = hashSeed(`${seed}|headline`)
  const bucket = candidates.sort((a, b) => b.pref - a.pref || a.idx - b.idx)
  return bucket[h % bucket.length]?.text ?? headlines[0]
}

/**
 * Pick headline + summary for a catalog type.
 * @param {string} typeId catalog id (or tone-suffixed copy key)
 * @param {string} seed stable id for deterministic variant choice
 * @param {{ company?: string, person?: string, role?: string, count?: number, countWord?: string, ticker?: string }} slots
 */
export function pickRecapCopy(typeId, seed, slots = {}) {
  const normalized =
    slots.company != null || slots.person != null
      ? buildRecapCopySlots({
          companyName: slots.company,
          ticker: slots.ticker,
          person: slots.person,
          role: slots.role,
          count: slots.count,
        })
      : buildRecapCopySlots(slots)

  const pool = EXPLORE_RECAP_COPY[typeId]
  if (!pool?.headlines?.length) {
    const fallbackSummary =
      normalized.person && normalized.company
        ? `${normalized.person} filed fresh disclosure tied to ${normalized.company}.`
        : normalized.company
          ? `Fresh disclosure tied to ${normalized.company}.`
          : 'Fresh disclosure entered the feed.'
    return {
      headline: 'A filing worth a closer look',
      summary: polishRecapCopy(fallbackSummary),
    }
  }

  const headline = pickHeadline(pool, seed, normalized)
  const summaryTemplate = pickFromPool(pool.summaries, seed, normalized, 'summary')
  const summary = polishRecapCopy(fillSlots(summaryTemplate, normalized))

  const safeSummary =
    copyIsValid(summary, normalized, summaryTemplate)
      ? summary
      : polishRecapCopy(
          fillSlots(
            normalized.person && normalized.company
              ? '{person} filed disclosure tied to {company}.'
              : '{company} drew fresh disclosure today.',
            normalized,
          ),
        )

  return {
    headline: polishRecapCopy(fillSlots(headline, normalized)) || 'A filing worth a closer look',
    summary: safeSummary || 'Fresh disclosure entered the feed.',
  }
}

/** Prefer role-aware templates when a clean role title is available. */
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
  const roleTitle = sanitizeRecapRoleTitle(role, '')
  const roleOk =
    roleTitle &&
    !/^(house|senate|executive)\s*ptr$/i.test(roleTitle) &&
    !/^ptr$/i.test(roleTitle) &&
    !/form\s*278/i.test(roleTitle)
  return withRoleCopyKey(keyed, roleOk ? roleTitle : '')
}

/** @deprecated use withRoleCopyKey('person_activity', role) */
export function personActivityCopyKey(role) {
  return withRoleCopyKey('person_activity', role)
}

export function priceReactionCopyKey(moveUp) {
  return moveUp ? 'filing_price_reaction_up' : 'filing_price_reaction_down'
}
