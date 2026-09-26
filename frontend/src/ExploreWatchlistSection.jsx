import { useEffect, useMemo, useState } from 'react'
import { ImageOrInitials, normalizeInvestorName } from './ExplorePersonRow.jsx'
import { PRICE_RANGE_OPTS } from './MiniPriceChart.jsx'
import { FORCE_MOCK_DATA } from './dataMode.js'
import portraits from './explorePortraits.json'
import { SkeletonList } from './AppSkeleton.jsx'

/**
 * Sample returns by dossier chart range, while Explore is on mock data.
 * Pelosi's windows stay pinned so they match her sample dossier curve.
 */
const MOCK_RETURNS = {
  '1M': {
    'nancy-pelosi': 0.042,
    'jensen-huang': 0.081,
    'berkshire-hathaway': 0.036,
    'mark-zuckerberg': 0.028,
    'elon-musk': 0.027,
    'lisa-su': 0.063,
    'dan-crenshaw': 0.019,
    'satya-nadella': 0.033,
    'josh-gottheimer': 0.014,
    'citadel-advisors': 0.011,
    'pershing-square': 0.022,
    'donald-trump': 0.009,
    'tim-cook': -0.012,
    'alex-karp': 0.041,
    'jamie-dimon': 0.015,
    'renaissance-technologies': 0.011,
    'hock-tan': 0.018,
    'larry-ellison': -0.008,
    'marjorie-taylor-greene': 0.006,
    'april-mcclain-delaney': 0.004,
    'andy-jassy': -0.016,
    'bridgewater': 0.007,
    'icahn-capital': -0.021,
    'mary-barra': 0.003,
    'gilbert-cisneros': 0.012,
    'lisa-mcclain': -0.005,
    'reed-hastings': -0.014,
    'marc-benioff': 0.008,
    'tommy-tuberville': -0.021,
    'colette-kress': 0.017,
    'markwayne-mullin': 0.019,
    'jared-moskowitz': -0.011,
    'daniel-goldman': 0.005,
    'sheldon-whitehouse': -0.006,
    'byron-donalds': 0.051,
    'jefferson-shreve': -0.009,
    'julia-letlow': 0.013,
    'john-boozman': 0.008,
    'kevin-hern': -0.018,
    'elliott-management': 0.016,
    'tiger-global': 0.024,
    'third-point': -0.007,
    'appaloosa': 0.031,
    'duquesne-family-office': 0.02,
    'coatue': 0.015,
    'viking-global': -0.004,
    'lone-pine': 0.01,
    'baupost': 0.002,
    'suzan-delbene': -0.013,
    'rob-bresnahan': 0.007,
  },
  '3M': {
    'nancy-pelosi': 0.124,
    'jensen-huang': 0.097,
    'berkshire-hathaway': 0.068,
    'mark-zuckerberg': 0.081,
    'elon-musk': -0.016,
    'lisa-su': 0.071,
    'dan-crenshaw': 0.044,
    'satya-nadella': 0.054,
    'josh-gottheimer': 0.037,
    'citadel-advisors': 0.029,
    'pershing-square': 0.058,
    'donald-trump': 0.033,
    'tim-cook': 0.018,
    'alex-karp': 0.062,
    'jamie-dimon': 0.022,
    'renaissance-technologies': -0.012,
    'hock-tan': 0.041,
    'larry-ellison': 0.019,
    'marjorie-taylor-greene': 0.014,
    'april-mcclain-delaney': 0.027,
    'andy-jassy': -0.023,
    'bridgewater': 0.016,
    'icahn-capital': -0.031,
    'mary-barra': 0.009,
    'gilbert-cisneros': 0.021,
    'lisa-mcclain': -0.008,
    'reed-hastings': -0.019,
    'marc-benioff': 0.012,
    'tommy-tuberville': -0.041,
    'colette-kress': 0.026,
    'markwayne-mullin': -0.058,
    'jared-moskowitz': -0.022,
    'daniel-goldman': 0.008,
    'sheldon-whitehouse': -0.034,
    'byron-donalds': -0.028,
    'jefferson-shreve': 0.031,
    'julia-letlow': -0.015,
    'john-boozman': 0.011,
    'kevin-hern': -0.027,
    'elliott-management': 0.018,
    'tiger-global': 0.047,
    'third-point': 0.013,
    'appaloosa': 0.055,
    'duquesne-family-office': 0.039,
    'coatue': 0.024,
    'viking-global': 0.006,
    'lone-pine': -0.011,
    'baupost': 0.004,
    'suzan-delbene': -0.017,
    'rob-bresnahan': 0.015,
  },
  '6M': {
    'jensen-huang': 0.563,
    'berkshire-hathaway': 0.341,
    'nancy-pelosi': 0.246,
    'lisa-su': 0.221,
    'mark-zuckerberg': 0.198,
    'elon-musk': 0.176,
    'dan-crenshaw': 0.164,
    'satya-nadella': 0.154,
    'appaloosa': 0.136,
    'josh-gottheimer': 0.142,
    'citadel-advisors': 0.128,
    'pershing-square': 0.117,
    'donald-trump': 0.109,
    'tiger-global': 0.093,
    'duquesne-family-office': 0.088,
    'tim-cook': 0.087,
    'alex-karp': 0.081,
    'jamie-dimon': 0.074,
    'renaissance-technologies': 0.072,
    'hock-tan': 0.066,
    'coatue': 0.061,
    'larry-ellison': 0.058,
    'marjorie-taylor-greene': 0.051,
    'third-point': 0.047,
    'april-mcclain-delaney': 0.044,
    'andy-jassy': 0.038,
    'bridgewater': 0.031,
    'viking-global': 0.029,
    'icahn-capital': 0.024,
    'rob-bresnahan': 0.021,
    'mary-barra': 0.018,
    'lone-pine': 0.015,
    'gilbert-cisneros': 0.012,
    'baupost': 0.008,
    'lisa-mcclain': 0.007,
    'reed-hastings': -0.011,
    'elliott-management': -0.018,
    'marc-benioff': -0.019,
    'tommy-tuberville': -0.028,
    'suzan-delbene': -0.033,
    'colette-kress': -0.036,
    'markwayne-mullin': -0.042,
    'jared-moskowitz': -0.055,
    'daniel-goldman': -0.063,
    'sheldon-whitehouse': -0.071,
    'byron-donalds': -0.084,
    'jefferson-shreve': -0.092,
    'julia-letlow': -0.101,
    'john-boozman': -0.112,
    'kevin-hern': -0.121,
  },
  '1Y': {
    'nancy-pelosi': 0.274,
    'lisa-su': 0.412,
    'jensen-huang': 0.388,
    'berkshire-hathaway': 0.246,
    'mark-zuckerberg': 0.221,
    'elon-musk': -0.091,
    'dan-crenshaw': 0.186,
    'satya-nadella': 0.171,
    'josh-gottheimer': 0.154,
    'citadel-advisors': 0.132,
    'pershing-square': 0.168,
    'donald-trump': 0.119,
    'tim-cook': 0.196,
    'alex-karp': 0.243,
    'jamie-dimon': 0.084,
    'renaissance-technologies': 0.053,
    'hock-tan': 0.207,
    'larry-ellison': 0.096,
    'marjorie-taylor-greene': 0.072,
    'april-mcclain-delaney': 0.061,
    'andy-jassy': 0.044,
    'bridgewater': 0.038,
    'icahn-capital': -0.027,
    'mary-barra': 0.033,
    'gilbert-cisneros': 0.058,
    'lisa-mcclain': 0.021,
    'reed-hastings': 0.014,
    'marc-benioff': -0.019,
    'tommy-tuberville': -0.018,
    'colette-kress': 0.087,
    'markwayne-mullin': -0.127,
    'jared-moskowitz': 0.026,
    'daniel-goldman': 0.041,
    'sheldon-whitehouse': 0.029,
    'byron-donalds': -0.044,
    'jefferson-shreve': 0.112,
    'julia-letlow': 0.067,
    'john-boozman': 0.062,
    'kevin-hern': -0.036,
    'elliott-management': 0.049,
    'tiger-global': 0.158,
    'third-point': 0.073,
    'appaloosa': 0.191,
    'duquesne-family-office': 0.124,
    'coatue': 0.103,
    'viking-global': 0.045,
    'lone-pine': 0.031,
    'baupost': 0.018,
    'suzan-delbene': -0.022,
    'rob-bresnahan': 0.039,
  },
  YTD: {
    'nancy-pelosi': 0.198,
    'jensen-huang': 0.176,
    'berkshire-hathaway': 0.154,
    'mark-zuckerberg': 0.132,
    'elon-musk': -0.057,
    'lisa-su': 0.143,
    'dan-crenshaw': 0.091,
    'satya-nadella': 0.088,
    'josh-gottheimer': 0.074,
    'citadel-advisors': 0.066,
    'pershing-square': 0.081,
    'donald-trump': 0.058,
    'tim-cook': 0.061,
    'alex-karp': 0.109,
    'jamie-dimon': 0.027,
    'renaissance-technologies': 0.019,
    'hock-tan': 0.097,
    'larry-ellison': 0.042,
    'marjorie-taylor-greene': 0.031,
    'april-mcclain-delaney': 0.024,
    'andy-jassy': 0.016,
    'bridgewater': 0.021,
    'icahn-capital': -0.014,
    'mary-barra': 0.011,
    'gilbert-cisneros': 0.028,
    'lisa-mcclain': 0.006,
    'reed-hastings': -0.008,
    'marc-benioff': 0.013,
    'tommy-tuberville': -0.009,
    'colette-kress': 0.037,
    'markwayne-mullin': -0.072,
    'jared-moskowitz': -0.018,
    'daniel-goldman': 0.009,
    'sheldon-whitehouse': 0.012,
    'byron-donalds': -0.033,
    'jefferson-shreve': 0.047,
    'julia-letlow': 0.022,
    'john-boozman': 0.044,
    'kevin-hern': -0.026,
    'elliott-management': 0.015,
    'tiger-global': 0.069,
    'third-point': 0.018,
    'appaloosa': 0.086,
    'duquesne-family-office': 0.053,
    'coatue': 0.041,
    'viking-global': 0.012,
    'lone-pine': -0.007,
    'baupost': 0.005,
    'suzan-delbene': -0.011,
    'rob-bresnahan': 0.017,
  },
}

/** Higher scores surface first in Most Popular. The same people can also lead Top Performers. */
const POPULARITY = {
  'nancy-pelosi': 100,
  'elon-musk': 97,
  'jensen-huang': 94,
  'mark-zuckerberg': 91,
  'berkshire-hathaway': 88,
  'tim-cook': 85,
  'satya-nadella': 82,
  'jamie-dimon': 79,
  'lisa-su': 76,
  'marjorie-taylor-greene': 73,
  'citadel-advisors': 70,
  'pershing-square': 67,
  'josh-gottheimer': 64,
  'tommy-tuberville': 61,
  'dan-crenshaw': 58,
  'donald-trump': 55,
  'renaissance-technologies': 52,
  'bridgewater': 49,
  'alex-karp': 46,
  'larry-ellison': 43,
  'markwayne-mullin': 40,
  'icahn-capital': 38,
  'andy-jassy': 36,
  'april-mcclain-delaney': 34,
  'jared-moskowitz': 32,
  'byron-donalds': 30,
  'mary-barra': 28,
  'marc-benioff': 26,
  'reed-hastings': 24,
  'lisa-mcclain': 22,
  'gilbert-cisneros': 20,
  'daniel-goldman': 18,
  'sheldon-whitehouse': 16,
  'julia-letlow': 15,
  'jefferson-shreve': 14,
  'john-boozman': 13,
  'kevin-hern': 12,
  'elliott-management': 11,
  'tiger-global': 10,
  'hock-tan': 9,
  'third-point': 8,
  'appaloosa': 7,
  'duquesne-family-office': 6,
  'coatue': 5,
  'colette-kress': 4,
  'viking-global': 3,
  'lone-pine': 2,
  'baupost': 2,
  'rob-bresnahan': 1,
  'suzan-delbene': 1,
}

function activityTs(row) {
  const raw = row?.date ?? row?.lastEventAt ?? row?.filedAt ?? ''
  const t = Date.parse(String(raw).slice(0, 10))
  return Number.isFinite(t) ? t : 0
}

function returnFor(row, range) {
  // Live prod: never invent returns. Only show a % when the row carries a real one.
  if (!FORCE_MOCK_DATA) {
    const byRange = row?.returnsByRange?.[range]
    if (Number.isFinite(Number(byRange))) return Number(byRange)
    const live = row?.returnFraction ?? row?.performanceReturn
    return Number.isFinite(Number(live)) ? Number(live) : null
  }
  const table = MOCK_RETURNS[range] ?? MOCK_RETURNS['6M']
  const value = table[row.actorSlug]
  if (Number.isFinite(value)) return value
  return extraReturn(row.actorSlug)
}

function peopleWithReturns(people, range) {
  // Keep the full curated list; sort people with measurable returns first.
  return [...people].sort(
    (a, b) =>
      (returnFor(b, range) ?? -Infinity) - (returnFor(a, range) ?? -Infinity) ||
      String(a.name).localeCompare(String(b.name)),
  )
}

function investedOf(row) {
  const live = Number(row?.investedUsd)
  if (Number.isFinite(live) && live > 0) return live
  if (FORCE_MOCK_DATA) return investedFor(row.actorSlug) ?? 0
  return 0
}

function formatReturn(fraction) {
  if (fraction == null || !Number.isFinite(fraction)) return null
  const pct = fraction * 100
  const abs = Math.abs(pct).toFixed(1)
  if (pct > 0.05) return { text: `+${abs}%`, tone: 'isUp' }
  if (pct < -0.05) return { text: `−${abs}%`, tone: 'isDown' }
  return { text: '0.0%', tone: 'isFlat' }
}

/** Sample dollars people have put in, while Explore is on mock data. */
const INVESTED = {
  'nancy-pelosi': 2_840_000,
  'elon-musk': 12_600_000,
  'jensen-huang': 8_150_000,
  'mark-zuckerberg': 6_420_000,
  'berkshire-hathaway': 18_400_000,
  'tim-cook': 4_220_000,
  'satya-nadella': 2_140_000,
  'jamie-dimon': 5_480_000,
  'lisa-su': 3_160_000,
  'marjorie-taylor-greene': 1_940_000,
  'citadel-advisors': 11_200_000,
  'pershing-square': 7_650_000,
  'josh-gottheimer': 1_520_000,
  'tommy-tuberville': 1_280_000,
  'dan-crenshaw': 980_000,
  'donald-trump': 1_140_000,
  'renaissance-technologies': 9_800_000,
  'bridgewater': 8_350_000,
  'alex-karp': 2_760_000,
  'larry-ellison': 3_480_000,
  'markwayne-mullin': 860_000,
  'icahn-capital': 4_920_000,
  'andy-jassy': 1_860_000,
  'april-mcclain-delaney': 740_000,
  'jared-moskowitz': 690_000,
  'byron-donalds': 640_000,
  'mary-barra': 1_120_000,
  'marc-benioff': 1_540_000,
  'reed-hastings': 1_380_000,
  'lisa-mcclain': 520_000,
  'gilbert-cisneros': 610_000,
  'daniel-goldman': 480_000,
  'sheldon-whitehouse': 510_000,
  'julia-letlow': 890_000,
  'jefferson-shreve': 1_760_000,
  'john-boozman': 430_000,
  'kevin-hern': 390_000,
  'elliott-management': 6_240_000,
  'tiger-global': 5_180_000,
  'hock-tan': 2_260_000,
  'third-point': 3_720_000,
  'appaloosa': 4_410_000,
  'duquesne-family-office': 3_960_000,
  'coatue': 2_880_000,
  'colette-kress': 1_640_000,
  'viking-global': 2_450_000,
  'lone-pine': 2_110_000,
  'baupost': 3_280_000,
  'rob-bresnahan': 360_000,
  'suzan-delbene': 410_000,
}

function investedFor(slug) {
  if (INVESTED[slug] != null) return INVESTED[slug]
  const index = EXTRA_PEOPLE.findIndex((person) => person.actorSlug === slug)
  if (index < 0) return 250_000
  return 980_000 - index * 45_000
}

function compactDollars(amount, suffix) {
  const rounded = amount >= 100 ? Math.round(amount) : Math.round(amount * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `$${text}${suffix}`
}

function formatInvested(amount) {
  const value = Number(amount)
  if (!Number.isFinite(value)) return null
  if (value >= 1_000_000_000) return compactDollars(value / 1_000_000_000, 'B')
  if (value >= 1_000_000) return compactDollars(value / 1_000_000, 'M')
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`
  return `$${Math.round(value)}`
}

function ExploreTapeRow({ row, rank, range, plain = false, invested = false, onClick }) {
  const portrait = portraits[normalizeInvestorName(row.name)]
  const logo = portrait?.kind === 'logo'
  const thumb = portrait?.thumb || portrait?.src
  const perf = formatReturn(returnFor(row, range))
  const liveInvested = Number.isFinite(Number(row?.investedUsd)) ? Number(row.investedUsd) : null
  const investedAmount = invested
    ? liveInvested ?? (FORCE_MOCK_DATA ? investedFor(row.actorSlug) : null)
    : null
  const investedLabel = investedAmount != null ? formatInvested(investedAmount) : null
  const content = (
    <>
      <span className="exploreTapeRank">{rank}</span>
      <span className={`exploreTapeAvatar${logo ? ' isLogo' : ''}`}>
        <ImageOrInitials src={thumb} name={row.name} className="explorePersonPortrait" logo={logo} discover={false} />
      </span>
      <span className="exploreTapeCopy">
        {investedLabel ? (
          <span className="exploreTapeInvested">
            <span className="exploreTapeInvestedValue isUp">{investedLabel}</span>
            <span className="exploreTapeInvestedLabel">Invested</span>
          </span>
        ) : null}
        {!invested && perf ? <span className={`exploreTapeReturn ${plain ? 'isPlain' : ''} ${perf.tone}`}>{perf.text}</span> : null}
        <span className="exploreTapeName">{row.name}</span>
        <span className="exploreTapeMeta">{row.modeLabel || 'Investor'}</span>
      </span>
      <span className="exploreTapeChevron" aria-hidden="true">
        ›
      </span>
    </>
  )

  return (
    <li className="exploreTapeRow">
      {onClick ? (
        <button type="button" className="exploreTapeRowBtn" aria-label={`Open ${row.name}`} onClick={() => onClick(row)}>
          {content}
        </button>
      ) : (
        <div className="exploreTapeRowBtn">{content}</div>
      )}
    </li>
  )
}

function ExploreTapeList({ rows, range, plain = false, invested = false, onRowClick, loading, empty }) {
  if (!rows.length) {
    if (loading) return <SkeletonList count={4} />
    return <p className="exploreDirectoryEmpty">{empty}</p>
  }
  return (
    <ul className="exploreTapeList">
      {rows.map((row, index) => (
        <ExploreTapeRow key={row.id} row={row} rank={index + 1} range={range} plain={plain} invested={invested} onClick={onRowClick} />
      ))}
    </ul>
  )
}

const POPULAR_RANGE = '6M'
const TAPE_PAGE = 12
const TAPE_MAX = 99
const TAPE_NARROW = '(max-width: 899px)'

/** The mock catalog is the full Explore list. Nothing extra is appended. */
const EXTRA_PEOPLE = []

function extraReturn(slug) {
  const index = EXTRA_PEOPLE.findIndex((person) => person.actorSlug === slug)
  if (index < 0) return null
  return -0.16 - index * 0.008
}

function popularityOf(slug) {
  if (POPULARITY[slug] != null) return POPULARITY[slug]
  const index = EXTRA_PEOPLE.findIndex((person) => person.actorSlug === slug)
  return index < 0 ? 0 : 28 - index
}

function tapePeople(rows) {
  const source = (rows ?? []).filter((row) => String(row.actorSlug ?? '').toLowerCase() !== 'blackrock')
  const seen = new Set(source.map((row) => row.actorSlug))
  return [...source, ...EXTRA_PEOPLE.filter((person) => !seen.has(person.actorSlug))]
}

export function explorePerformerReturn(row, range = '6M') {
  return returnFor(row, range)
}

/** Sample disclosed tickers for intro Leaders holdings cells (pre-backfill). */
const HOLDINGS = {
  'lisa-su': ['AMD', 'NVDA', 'AVGO', 'TSM', 'ASML'],
  'jensen-huang': ['NVDA', 'AVGO', 'TSM', 'AMD'],
  'nancy-pelosi': ['NVDA', 'AAPL', 'GOOGL', 'AMZN', 'MSFT', 'CRM'],
  'berkshire-hathaway': ['AAPL', 'AMZN', 'KO', 'AXP', 'OXY', 'BAC'],
  'alex-karp': ['PLTR', 'NVDA', 'MSFT', 'AMZN'],
  'mark-zuckerberg': ['META', 'NVDA', 'GOOGL', 'AMZN', 'AAPL'],
  'tim-cook': ['AAPL', 'NVDA', 'MSFT', 'AVGO'],
  'satya-nadella': ['MSFT', 'NVDA', 'AMD', 'AVGO'],
  'dan-crenshaw': ['NVDA', 'MU', 'LRCX', 'AVGO'],
  'hock-tan': ['AVGO', 'NVDA', 'TSM', 'AMD', 'QCOM'],
  'appaloosa': ['NVDA', 'META', 'AMZN', 'GOOGL', 'MSFT'],
  'pershing-square': ['GOOGL', 'CMG', 'HLT', 'QSR', 'BN'],
  'citadel-advisors': ['NVDA', 'AAPL', 'MSFT', 'AMZN', 'META', 'GOOGL'],
  'tiger-global': ['META', 'SE', 'SHOP', 'COIN', 'SNOW'],
  'jamie-dimon': ['JPM', 'AAPL', 'MSFT', 'BAC'],
}

export function exploreHoldingsFor(slug) {
  const key = String(slug ?? '').toLowerCase()
  return HOLDINGS[key] ? [...HOLDINGS[key]] : []
}

export function exploreMockReturnsTable(range = '1Y') {
  return MOCK_RETURNS[range] ?? MOCK_RETURNS['6M'] ?? {}
}

export function explorePopularityScore(slug) {
  return popularityOf(String(slug ?? '').toLowerCase())
}

export function formatExploreTapeReturn(fraction) {
  return formatReturn(fraction)
}

export function selectExploreFeatured(rows, range = '6M') {
  return peopleWithReturns([...tapePeople(rows)], range).slice(0, 3)
}

function useNarrowTape() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(TAPE_NARROW).matches : false,
  )
  useEffect(() => {
    const query = window.matchMedia(TAPE_NARROW)
    const sync = () => setNarrow(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return narrow
}

function ExploreTapeMore({ onClick }) {
  return (
    <div className="exploreTapeMoreWrap">
      <button type="button" className="exploreTapeMore" onClick={onClick}>
        More
      </button>
    </div>
  )
}

export function ExploreWatchlistSection({
  rows = [],
  onRowClick = null,
  loading = false,
  range: rangeProp,
  onRangeChange = null,
}) {
  const narrow = useNarrowTape()
  const [internalRange, setInternalRange] = useState('6M')
  const range = rangeProp ?? internalRange
  const setRange = onRangeChange ?? setInternalRange
  const [performerCount, setPerformerCount] = useState(TAPE_PAGE)
  const [popularCount, setPopularCount] = useState(TAPE_PAGE)
  const [sharedCount, setSharedCount] = useState(TAPE_PAGE)
  const people = useMemo(() => tapePeople(rows), [rows])
  const performers = useMemo(() => {
    // Always show the full curated universe; measurable returns sort to the top.
    return [...people].sort(
      (a, b) =>
        (returnFor(b, range) ?? -Infinity) - (returnFor(a, range) ?? -Infinity) ||
        String(a.name).localeCompare(String(b.name)),
    )
  }, [people, range])
  const popular = useMemo(() => {
    return [...people].sort(
      (a, b) =>
        investedOf(b) - investedOf(a) ||
        activityTs(b) - activityTs(a) ||
        String(a.name).localeCompare(String(b.name)),
    )
  }, [people])
  // Page in 12 at a time so desktop always has a More control once the curated list is longer.
  const performerLimit = Math.min(TAPE_MAX, narrow ? performerCount : sharedCount)
  const popularLimit = Math.min(TAPE_MAX, narrow ? popularCount : sharedCount)
  const morePerformers = performerLimit < TAPE_MAX && performers.length > performerLimit
  const morePopular = popularLimit < TAPE_MAX && popular.length > popularLimit
  const showSharedMore = !narrow && (morePerformers || morePopular)

  return (
    <>
      <div className="exploreTapeBoard">
        <section className="exploreTapeSection" aria-label="Top Performers">
          <div className="exploreTapeHead">
            <h2 className="exploreTapeTitle">Top Performers</h2>
            <div className="exploreTapeRanges" role="group" aria-label="Chart range">
              {PRICE_RANGE_OPTS.map((option) => (
      <button
                  key={option}
        type="button"
                  className={option === range ? 'exploreTapeRange isActive' : 'exploreTapeRange'}
                  aria-pressed={option === range}
                  onClick={() => setRange(option)}
                >
                  {option}
      </button>
              ))}
            </div>
          </div>
          <ExploreTapeList
            rows={performers.slice(0, performerLimit)}
            range={range}
            onRowClick={onRowClick}
            loading={loading}
            empty="No activity"
          />
          {narrow && morePerformers ? (
            <ExploreTapeMore onClick={() => setPerformerCount((count) => Math.min(TAPE_MAX, count + TAPE_PAGE))} />
          ) : null}
        </section>
        <section className="exploreTapeSection" aria-label="Most Popular">
          <div className="exploreTapeHead">
            <h2 className="exploreTapeTitle">Most Popular</h2>
          </div>
          <ExploreTapeList
            rows={popular.slice(0, popularLimit)}
            range={POPULAR_RANGE}
            invested
            onRowClick={onRowClick}
            loading={loading}
            empty="No activity"
          />
          {narrow && morePopular ? (
            <ExploreTapeMore onClick={() => setPopularCount((count) => Math.min(TAPE_MAX, count + TAPE_PAGE))} />
          ) : null}
        </section>
      </div>
      {!narrow && showSharedMore ? (
        <ExploreTapeMore onClick={() => setSharedCount((count) => Math.min(TAPE_MAX, count + TAPE_PAGE))} />
      ) : null}
    </>
  )
}
