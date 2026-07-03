/**
 * One rolling week of realistic semiconductor mock data (anchored to app load).
 * ~12 items per calendar day across feeds, timelines, and discover panels.
 */

import { mockAtDaysAgo, mockDateOnlyDaysAgo } from './mockDates.js'

export const MOCK_WEEK_DAYS = 7
export const MOCK_ITEMS_PER_DAY = 12
export const MOCK_INVESTIGATE_FEED_ROWS = MOCK_WEEK_DAYS * MOCK_ITEMS_PER_DAY

export const MOCK_SEMIS = [
  { ticker: 'NVDA', name: 'NVIDIA Corporation', sector: 'Semiconductors', mcap: '$3.2T' },
  { ticker: 'ASML', name: 'ASML Holding N.V.', sector: 'Semiconductor equipment', mcap: '$350B' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor', sector: 'Semiconductors', mcap: '$780B' },
  { ticker: 'AMD', name: 'Advanced Micro Devices, Inc.', sector: 'Semiconductors', mcap: '$220B' },
  { ticker: 'LRCX', name: 'Lam Research Corporation', sector: 'Semiconductor equipment', mcap: '$115B' },
  { ticker: 'AMAT', name: 'Applied Materials, Inc.', sector: 'Semiconductor equipment', mcap: '$145B' },
  { ticker: 'MU', name: 'Micron Technology, Inc.', sector: 'Semiconductors', mcap: '$130B' },
  { ticker: 'AVGO', name: 'Broadcom Inc.', sector: 'Semiconductors', mcap: '$720B' },
  { ticker: 'KLAC', name: 'KLA Corporation', sector: 'Semiconductor equipment', mcap: '$95B' },
  { ticker: 'INTC', name: 'Intel Corporation', sector: 'Semiconductors', mcap: '$185B' },
  { ticker: 'QCOM', name: 'Qualcomm Incorporated', sector: 'Semiconductors', mcap: '$195B' },
  { ticker: 'MRVL', name: 'Marvell Technology, Inc.', sector: 'Semiconductors', mcap: '$68B' },
]

export const MOCK_SEMIS_BY_TICKER = Object.fromEntries(MOCK_SEMIS.map((c) => [c.ticker, c]))

/** Realistic discover past-event narratives — rotated across the week. */
const DISCOVER_PAST_POOL = [
  {
    ticker: 'NVDA',
    title: 'GB200 NVL72 rack deployment update',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'nvda-q1-earnings',
    summary:
      'Management cites accelerating GB200 rack deployments at hyperscalers while CoWoS-L and HBM3e packaging remain the binding constraints on shipment cadence.',
    idea_best: true,
  },
  {
    ticker: 'NVDA',
    title: 'Blackwell supply commentary at industry conference',
    kind: 'catalyst',
    source: 'Investor presentation',
    impact: 'high',
    briefKey: 'nvda-computex',
    summary:
      'Keynote reiterates multi-quarter visibility on data-center GPUs; packaging partners—not wafer starts—called out as the gating step for rack-scale AI systems.',
    idea_best: true,
  },
  {
    ticker: 'ASML',
    title: 'EUV high-NA install base update',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'asml-orders',
    summary:
      'Commentary points to extended high-NA delivery windows and stable EUV backlog; customers still prioritizing leading-edge slots over mature-node spend.',
    idea_best: true,
  },
  {
    ticker: 'ASML',
    title: 'DoD lithography sustainment task order',
    kind: 'filing',
    source: 'Gov contract',
    impact: 'medium',
    briefKey: 'asml-gov-dod',
    summary:
      'Federal sustainment award covers EUV field engineering at a US fab—installed-base support, not a new platform cancellation signal.',
    idea_best: false,
  },
  {
    ticker: 'TSM',
    title: 'N3E utilization and CoWoS capacity briefing',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'tsm-cmd',
    summary:
      'Foundry update highlights tight advanced-packaging capacity and sustained N3/N3E demand from AI accelerator customers.',
    idea_best: true,
  },
  {
    ticker: 'AMD',
    title: 'MI350 series data-center attach commentary',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    briefKey: 'amd-guidance',
    summary:
      'Management raised near-term data-center GPU outlook after hyperscaler qualification milestones; HBM supply still cited as the pacing item.',
    idea_best: true,
  },
  {
    ticker: 'AMD',
    title: 'Advancing AI keynote — rack-scale roadmap',
    kind: 'catalyst',
    source: 'Investor presentation',
    impact: 'high',
    briefKey: 'amd-keynote',
    summary:
      'Roadmap emphasizes rack-scale AI platforms and software attach; no change to the view that packaging supply caps near-term shipments.',
    idea_best: true,
  },
  {
    ticker: 'LRCX',
    title: 'WFE orders tied to HBM etch intensity',
    kind: 'filing',
    source: '8-K',
    impact: 'medium',
    briefKey: 'lrcx-analyst',
    summary:
      'Equipment orders commentary links memory-layer etch demand to HBM capacity ramps at Korean and Taiwanese fabs.',
    idea_best: true,
  },
  {
    ticker: 'AMAT',
    title: 'Gate-all-around transition tool demand',
    kind: 'filing',
    source: '8-K',
    impact: 'medium',
    briefKey: 'amat-guidance',
    summary:
      'Management highlights GAA-related deposition and epi tool interest as customers prepare 2nm-class lines.',
    idea_best: true,
  },
  {
    ticker: 'MU',
    title: 'HBM3e bit supply update for AI accelerators',
    kind: 'filing',
    source: '8-K',
    impact: 'high',
    summary:
      'Memory supplier update cites sold-out HBM3e capacity through year-end with pricing firm versus commodity DRAM.',
    idea_best: true,
  },
  {
    ticker: 'AVGO',
    title: 'Custom XPU program revenue recognition timing',
    kind: 'filing',
    source: '8-K',
    impact: 'medium',
    summary:
      'Custom silicon segment commentary points to lumpier recognition as hyperscaler ASIC programs move from NPI to volume.',
    idea_best: false,
  },
  {
    ticker: 'KLAC',
    title: 'Process control intensity on advanced nodes',
    kind: 'filing',
    source: '8-K',
    impact: 'medium',
    summary:
      'Inspection and metrology demand tied to yield learning on N3E and backside power delivery flows.',
    idea_best: true,
  },
  {
    ticker: 'INTC',
    title: 'Foundry services external customer update',
    kind: 'filing',
    source: '8-K',
    impact: 'medium',
    summary:
      'Intel Foundry update lists new packaging customers; commentary still cautious on leading-edge yield timelines.',
    idea_best: false,
  },
  {
    ticker: 'QCOM',
    title: 'On-device AI SoC design win disclosure',
    kind: 'filing',
    source: 'Press release',
    impact: 'medium',
    summary:
      'Handset OEM design win for Snapdragon platform with expanded NPU TOPS—edge AI attach without data-center exposure.',
    idea_best: false,
  },
  {
    ticker: 'MRVL',
    title: 'Custom electro-optics for AI clusters',
    kind: 'filing',
    source: 'Press release',
    impact: 'medium',
    summary:
      'Marvell discloses electro-optics content win in 800G/1.6T AI cluster builds; ties revenue to hyperscaler capex cycles.',
    idea_best: true,
  },
  {
    ticker: 'NVDA',
    title: 'Colette Kress open-market purchase cluster',
    kind: 'flow',
    source: 'Form 4',
    impact: 'medium',
    summary:
      'Form 4 shows three Code P purchases by CFO Colette Kress totaling ~62,400 shares (~$8.1M notional) after Blackwell shipment commentary.',
    idea_best: true,
  },
  {
    ticker: 'LRCX',
    title: 'CEO Timothy Archer Code P purchase',
    kind: 'flow',
    source: 'Form 4',
    impact: 'medium',
    summary:
      'CEO Timothy Archer filed a Code P purchase of 18,200 shares (~$2.4M) following WFE order commentary.',
    idea_best: true,
  },
  {
    ticker: 'ASML',
    title: 'House PTR purchase disclosure',
    kind: 'flow',
    source: 'PTR',
    impact: 'low',
    summary:
      'Representative Dan Crenshaw reported two ASML purchases at a disclosed midpoint of ~$215K.',
    idea_best: true,
  },
]

const DISCOVER_FLOW_POOL = [
  {
    ticker: 'NVDA',
    source: 'Form 4',
    title: '3 Code P purchases · Colette Kress',
    summary:
      'Form 4 cluster: EVP & CFO Colette Kress acquired 62,400 shares (~$8.1M) across three open-market purchases.',
    idea_score: 78,
    idea_reasons: ['Insider purchase cluster', 'Executive buyer'],
  },
  {
    ticker: 'NVDA',
    source: 'Form 4',
    title: '1 Code P purchase · Jensen Huang',
    summary:
      'CEO Jensen Huang filed a Code P purchase of 40,000 shares (~$5.2M notional) following product roadmap commentary.',
    idea_score: 82,
    idea_reasons: ['CEO open-market purchase'],
  },
  {
    ticker: 'AMD',
    source: 'Form 4',
    title: '2 Code P purchases · Lisa Su',
    summary:
      'Chair & CEO Lisa Su reported two Code P purchases totaling 28,500 shares (~$1.9M).',
    idea_score: 76,
    idea_reasons: ['CEO purchase cluster'],
  },
  {
    ticker: 'LRCX',
    source: 'Form 4',
    title: '1 Code P purchase · Timothy Archer',
    summary:
      'CEO Timothy Archer acquired 18,200 shares (~$2.4M) in Lam Research Corporation.',
    idea_score: 74,
    idea_reasons: ['CEO open-market purchase'],
  },
  {
    ticker: 'MU',
    source: 'Form 4',
    title: 'CFO Code P purchase · 24,800 shares',
    summary:
      'Micron CFO filed a Code P purchase of 24,800 shares (~$1.1M) after HBM supply commentary.',
    idea_score: 71,
    idea_reasons: ['CFO open-market purchase'],
  },
  {
    ticker: 'ASML',
    source: 'PTR',
    title: '2 stock purchases · Dan Crenshaw',
    summary:
      'House PTR: Representative Dan Crenshaw reported two ASML purchases (~$215K midpoint).',
    idea_score: 71,
    idea_reasons: ['Politician purchase cluster'],
  },
  {
    ticker: 'NVDA',
    source: 'PTR',
    title: '1 purchase · Ro Khanna',
    summary:
      'House PTR: Representative Ro Khanna disclosed an NVDA purchase in the $100K–$250K range.',
    idea_score: 69,
    idea_reasons: ['Politician purchase'],
  },
  {
    ticker: 'TSM',
    source: '13F',
    title: 'Increased stake · Vanguard Group',
    summary:
      '13F shows Vanguard Group increased TSM stake, disclosed value ~$4.2B (1,842,000 shares).',
    idea_score: 68,
    idea_reasons: ['Institutional accumulation'],
  },
  {
    ticker: 'NVDA',
    source: '13F',
    title: 'New position · Renaissance Technologies',
    summary:
      '13F filing shows Renaissance Technologies opened a new NVDA position valued at ~$612M.',
    idea_score: 72,
    idea_reasons: ['New institutional position'],
  },
  {
    ticker: 'AVGO',
    source: '13F',
    title: 'Increased stake · BlackRock',
    summary:
      'BlackRock increased AVGO stake in the latest 13F; disclosed value ~$18.4B.',
    idea_score: 66,
    idea_reasons: ['Institutional accumulation'],
  },
  {
    ticker: 'AMAT',
    source: 'Form 4',
    title: 'Director Code P purchase',
    summary:
      'Director filed a Code P purchase of 8,400 shares (~$620K) in Applied Materials.',
    idea_score: 65,
    idea_reasons: ['Director purchase'],
  },
  {
    ticker: 'KLAC',
    source: 'Form 4',
    title: 'EVP Code S sale · tax lot',
    summary:
      'EVP filed Code S sales totaling 6,200 shares (~$2.8M) under a 10b5-1 plan.',
    idea_score: 58,
    idea_reasons: ['Planned insider sale'],
  },
  {
    ticker: 'AMD',
    source: 'PTR',
    title: '1 purchase · Tommy Tuberville',
    summary:
      'Senate PTR: Senator Tommy Tuberville disclosed an AMD purchase ($50K–$100K range).',
    idea_score: 64,
    idea_reasons: ['Politician purchase'],
  },
  {
    ticker: 'INTC',
    source: '13F',
    title: 'Reduced stake · Capital Group',
    summary:
      'Capital Group trimmed INTC exposure in the latest 13F; disclosed value down ~$240M quarter-over-quarter.',
    idea_score: 55,
    idea_reasons: ['Institutional reduction'],
  },
]

const RESEARCH_DOC_TITLES = [
  { source: '8-K', title: 'Supply-chain and demand update', briefKey: 'asml-q1' },
  { source: 'Press release', title: 'Product roadmap and customer commentary' },
  { source: 'Gov contract', title: 'Federal fab incentive task order', briefKey: 'asml-gov-dod' },
  { source: 'Investor presentation', title: 'Investor deck — capacity cadence' },
  { source: '8-K', title: 'Lead-time and backlog commentary', briefKey: 'asml-orders' },
  { source: 'Form 4', title: 'Insider transaction filing' },
  { source: 'Annual report', title: 'Annual report excerpt — long-cycle demand' },
  { source: '8-K', title: 'Guidance update on data-center mix', briefKey: 'amd-guidance' },
  { source: 'Press release', title: 'Technology milestone announcement' },
  { source: 'Gov contract', title: 'Defense packaging prototype award' },
  { source: 'Investor presentation', title: 'Analyst event slides' },
  { source: '8-K', title: 'Material customer concentration disclosure' },
]

const INSIDER_ROSTER = {
  NVDA: [
    { key: 'CEO', person: 'Jensen Huang' },
    { key: 'CFO', person: 'Colette Kress' },
    { key: 'EVP', person: 'Debora Shoquist' },
  ],
  ASML: [
    { key: 'CEO', person: 'Christophe Borel' },
    { key: 'CFO', person: 'Roger Dassen' },
    { key: 'CTO', person: 'Frederic Schneider-Maunoury' },
  ],
  AMD: [
    { key: 'CEO', person: 'Lisa Su' },
    { key: 'CFO', person: 'Jean Hu' },
    { key: 'EVP', person: 'Forrest Norrod' },
  ],
  TSM: [
    { key: 'CEO', person: 'C.C. Wei' },
    { key: 'CFO', person: 'Wendell Huang' },
  ],
  LRCX: [
    { key: 'CEO', person: 'Timothy Archer' },
    { key: 'CFO', person: 'Douglas Bettinger' },
  ],
  AMAT: [
    { key: 'CEO', person: 'Gary Dickerson' },
    { key: 'CFO', person: 'Brice Hill' },
  ],
  MU: [
    { key: 'CEO', person: 'Sanjay Mehrotra' },
    { key: 'CFO', person: 'Mark Murphy' },
  ],
  AVGO: [
    { key: 'CEO', person: 'Hock Tan' },
    { key: 'CFO', person: 'Kirsten Spears' },
  ],
  KLAC: [
    { key: 'CEO', person: 'Rick Wallace' },
    { key: 'CFO', person: 'Brennan Kiernan' },
  ],
  INTC: [
    { key: 'CEO', person: 'Pat Gelsinger' },
    { key: 'CFO', person: 'David Zinsner' },
  ],
  QCOM: [
    { key: 'CEO', person: 'Cristiano Amon' },
    { key: 'CFO', person: 'Akash Palkhiwala' },
  ],
  MRVL: [
    { key: 'CEO', person: 'Matt Murphy' },
    { key: 'CFO', person: 'Jean Hu' },
  ],
}

const POLITICIAN_ROSTER = [
  { name: 'Nancy Pelosi', chamber: 'house' },
  { name: 'Ro Khanna', chamber: 'house' },
  { name: 'Dan Crenshaw', chamber: 'house' },
  { name: 'Josh Gottheimer', chamber: 'house' },
  { name: 'Michael McCaul', chamber: 'house' },
  { name: 'Tommy Tuberville', chamber: 'senate' },
  { name: 'John Thune', chamber: 'senate' },
  { name: 'Mark Kelly', chamber: 'senate' },
]

const INSTITUTION_ROSTER = [
  'Vanguard Group',
  'BlackRock',
  'State Street Global Advisors',
  'Fidelity Management',
  'Capital Group',
  'Goldman Sachs',
  'Citadel Advisors',
  'Renaissance Technologies',
]

const INSTITUTION_ACTIVITIES = ['Increased stake', 'New position', 'Reduced stake']

function companyForTicker(ticker) {
  return MOCK_SEMIS_BY_TICKER[String(ticker ?? '').toUpperCase()] ?? MOCK_SEMIS[0]
}

function slotTime(daysAgo, slot) {
  return {
    daysAgo,
    hour: 8 + (slot % 10),
    minute: 6 + (slot * 13) % 54,
  }
}

/** ~12 discover past cards per day × 7 days. */
export function buildMockWeekDiscoverPastEvents() {
  const out = []
  for (let day = 0; day < MOCK_WEEK_DAYS; day++) {
    for (let slot = 0; slot < MOCK_ITEMS_PER_DAY; slot++) {
      const tpl = DISCOVER_PAST_POOL[(day * MOCK_ITEMS_PER_DAY + slot) % DISCOVER_PAST_POOL.length]
      const ticker = tpl.ticker ?? MOCK_SEMIS[(day + slot) % MOCK_SEMIS.length].ticker
      const co = companyForTicker(ticker)
      const { hour, minute } = slotTime(day, slot)
      out.push({
        id: `disc-week-d${day}-s${slot}-${ticker.toLowerCase()}`,
        ticker,
        companyName: co.name,
        at: mockAtDaysAgo(day, hour, minute),
        title: tpl.title,
        kind: tpl.kind ?? 'filing',
        source: tpl.source ?? '8-K',
        impact: tpl.impact ?? 'medium',
        ...(tpl.briefKey ? { briefKey: tpl.briefKey } : {}),
        summary: tpl.summary ?? '',
        url:
          String(tpl.source ?? '').toLowerCase().includes('gov')
            ? 'https://sam.gov/'
            : `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(ticker)}`,
        idea_best: tpl.idea_best ?? false,
      })
    }
  }
  return out
}

/** ~2 highlighted flow moves per day across the week. */
export function buildMockWeekDiscoverFlowMoves() {
  const out = []
  let idx = 0
  for (let day = 0; day < MOCK_WEEK_DAYS; day++) {
    for (let slot = 0; slot < 2; slot++) {
      const tpl = DISCOVER_FLOW_POOL[idx % DISCOVER_FLOW_POOL.length]
      idx += 1
      const ticker = tpl.ticker ?? MOCK_SEMIS[(day + slot) % MOCK_SEMIS.length].ticker
      const co = companyForTicker(ticker)
      const { hour, minute } = slotTime(day, slot + 3)
      out.push({
        id: `doc:mock-flow-d${day}-s${slot}-${ticker.toLowerCase()}`,
        ticker,
        companyName: co.name,
        at: mockAtDaysAgo(day, hour, minute),
        title: tpl.title,
        kind: 'flow',
        source: tpl.source,
        summary: tpl.summary,
        url: `https://www.sec.gov/edgar/search/#/q=${encodeURIComponent(ticker)}`,
        idea_score: tpl.idea_score ?? 65,
        idea_best: true,
        idea_reasons: tpl.idea_reasons ?? ['Flow cluster'],
      })
    }
  }
  return out
}

/** ~12 research paper documents per day × 7 days (reused per ticker). */
export function buildMockWeekResearchDocSpecs() {
  const specs = []
  for (let day = 0; day < MOCK_WEEK_DAYS; day++) {
    for (let slot = 0; slot < MOCK_ITEMS_PER_DAY; slot++) {
      const tpl = RESEARCH_DOC_TITLES[slot % RESEARCH_DOC_TITLES.length]
      const { hour, minute } = slotTime(day, slot)
      specs.push({
        slug: `d${day}-s${slot}`,
        source: tpl.source,
        daysAgo: day,
        hour,
        minute,
        ...(tpl.briefKey ? { briefKey: tpl.briefKey } : {}),
        headline: tpl.title,
        analysis:
          '{NAME} filed a {SOURCE} on {HEADLINE}. Disclosure reads consistent with capacity-constrained leading-edge demand rather than a near-term order air pocket.',
        genericAnalysis:
          '{NAME} filed a {SOURCE} ({HEADLINE}). Useful for timing when equity attention shifts between downstream AI hardware and upstream tool or memory bottlenecks.',
      })
    }
  }
  return specs
}

/** Week of insider / PTR / 13F rows for the research context panel. */
export function buildMockWeekContextFlows(ticker) {
  const t = String(ticker ?? 'ASML').toUpperCase()
  const roster = INSIDER_ROSTER[t] ?? INSIDER_ROSTER.ASML
  const insiders = []
  const politicians = []
  const filings13f = []

  for (let day = 0; day < MOCK_WEEK_DAYS; day++) {
    for (let slot = 0; slot < 2; slot++) {
      const who = roster[(day + slot) % roster.length]
      const code = slot === 0 ? 'P' : 'M'
      const amounts = ['$420K', '$1.1M', '$640K', '$2.4M', '$890K', '$180K', '$3.2M', '$95K']
      insiders.push({
        key: who.key,
        person: who.person,
        at: day === 0 && slot === 0 ? 'today' : mockDateOnlyDaysAgo(day),
        amount: amounts[(day + slot) % amounts.length],
        transactionCode: code,
      })
    }
    const pol = POLITICIAN_ROSTER[day % POLITICIAN_ROSTER.length]
    politicians.push({
      name: pol.name,
      chamber: pol.chamber,
      at: day === 0 ? 'today' : mockDateOnlyDaysAgo(day),
      amount: ['$95K', '$180K', '$420K', '$250K', '$75K', '$310K', '$140K'][day % 7],
      transactionType: day % 3 === 0 ? 'S' : 'P',
    })
    const filer = INSTITUTION_ROSTER[day % INSTITUTION_ROSTER.length]
    filings13f.push({
      filer,
      activity: INSTITUTION_ACTIVITIES[day % INSTITUTION_ACTIVITIES.length],
      at: mockDateOnlyDaysAgo(day),
      amount: ['$84M', '$42M', '$18M', '$120M', '$56M', '$210M', '$33M'][day % 7],
    })
  }

  return { insiders, politicians, filings13f }
}

/** Filing timestamp for investigate feed row index (12 rows per day). */
export function mockInvestigateFeedAtForIndex(i) {
  const day = Math.floor(i / MOCK_ITEMS_PER_DAY)
  const slot = i % MOCK_ITEMS_PER_DAY
  const { hour, minute } = slotTime(day, slot)
  return mockAtDaysAgo(day, hour, minute)
}
