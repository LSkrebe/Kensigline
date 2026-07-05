/** Intro + subscribe copy - aligned with live terminal (Discover · Research · Investigate). */

import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_SAVE_USD,
  formatUsd,
} from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - Event-driven research terminal for US equities',
  description:
    'Event-driven research terminal for US equities. SEC filings, insider PTR, 13F flow, and macro calendar with historical outcomes on every rail.',
  path: '/',
  ogImage: '/og-image.png',
}

export const SUBSCRIBE_PAGE_META = {
  title: 'Subscribe - Mercerline full terminal access',
  description:
    'Choose monthly or yearly Mercerline access. Unlock Discover, Research, and Investigate - macro calendar, exportable research papers, insider PTR, and 13F flow with historical outcomes.',
  path: '/subscribe',
  ogImage: '/og-image.png',
}

export const SIGN_IN_PAGE_META = {
  title: 'Sign in - Mercerline research terminal',
  description:
    'Sign in or create your Mercerline account to access the full catalyst research terminal - Discover, Research, and Investigate with SEC filings, insider flow, and historical outcomes.',
  path: '/sign-in',
  ogImage: '/og-image.png',
}

/** @param {{ ticker: string; company: string }} payload */
export function publicTickerPageMeta(payload) {
  const t = payload.ticker
  const name = payload.company
  return {
    title: `${t} research timeline - ${name} | Mercerline`,
    description: `Delayed public sample of ${name} (${t}) catalyst, SEC filing, and flow research on Mercerline. Full live terminal with Analyse, Investigate, and historical outcomes requires subscription.`,
    path: `/ticker/${t.toLowerCase()}`,
    ogImage: '/og-image.png',
  }
}

export const SIGN_IN = {
  eyebrow: 'Account access',
  headline: 'Sign in to continue',
  lead: 'Create an account or sign in, then choose your plan.',
}

export const INTRO_FOOTER = {
  nfa: 'Not investment advice',
  tagline:
    'Event-driven research terminal for US equities - SEC filings, insider and institutional flow, and catalyst timelines.',
  links: [
    { id: 'how', label: 'How it works', href: '#how' },
    { id: 'pricing', label: 'Pricing', href: '#pricing' },
    { id: 'faq', label: 'FAQ', href: '#faq' },
    { id: 'sign-in', label: 'Sign in', href: '/sign-in' },
  ],
}

export const HERO = {
  eyebrow: 'Mercerline · US equities',
  headline: 'Event-driven research terminal',
  headlineAccent: 'for the catalyst trade.',
  lead:
    'Event-driven research terminal for US equities. Scan the week, build the research paper, and drill insider and institutional flow with historical outcomes on every rail.',
  ctaPrimary: `Start researching - ${formatUsd(MONTHLY_PRICE_USD)}/mo`,
  ctaSecondary: 'See how it works',
  reassurance: 'Cancel anytime · Full terminal · SEC, PTR, and 13F',
  rails: 'Analyse · Discover · Research · Investigate',
}

export const INTRO_SCREENSHOTS = {
  hero: '/intro/hero-1200.webp',
  heroSrcSet: {
    avif: '/intro/hero-768.avif 768w, /intro/hero-1200.avif 1200w',
    webp: '/intro/hero-768.webp 768w, /intro/hero-1200.webp 1200w',
    fallback: '/intro/hero.png',
  },
  heroSizes: '(max-width: 900px) 100vw, 1180px',
}

export const WORKFLOW = {
  kicker: 'How it works',
  title: 'Event-driven research terminal workflow',
  lead:
    'Discover macro catalysts. Research ticker papers. Analyse drivers. Investigate insider PTR and 13F flow on one grid.',
}

export const SHOWCASE_TABS = [
  {
    id: 'discover',
    step: '01',
    label: 'Discover',
    title: 'Scan the macro week',
    bodyLines: [
      'Weekly catalyst calendar and watchlist moves before the open.',
    ],
    bullets: [
      'US, EU, UK, and China macro releases with impact tags',
      'FOMC, CPI, payrolls, ECB, and PMI on one timeline',
      'Watchlist catalysts beside sector and index moves',
    ],
  },
  {
    id: 'research',
    step: '02',
    label: 'Research',
    title: 'Build the ticker paper',
    bodyLines: [
      'Ticker-deep feed, context panel, and exportable research paper.',
    ],
    bullets: [
      '8-K, 10-Q, press releases, and earnings call transcripts',
      'Form 4 insider flow, politician PTR, and 13F filings',
      'Price chart, fundamentals, ownership, and macro context',
    ],
  },
  {
    id: 'analyse',
    step: '03',
    label: 'Analyse',
    title: 'Model the drivers',
    bodyLines: [
      'Quarterly financials and business-driver roll-ups for US issuers.',
    ],
    bullets: [
      'Revenue and margin grid with editable forecast columns',
      'Driver bridge tied to the live price chart',
      'Sector, domicile, and market-cap context on every name',
    ],
  },
  {
    id: 'investigate',
    step: '04',
    label: 'Investigate',
    title: 'Drill the flow',
    bodyLines: [
      'Insider, politician, and institutional modes with case worksheets.',
    ],
    bullets: [
      'Form 4 clusters and officer purchase windows',
      'House and Senate PTR disclosures (STOCK Act)',
      '13F allocator changes with historical win rates',
    ],
  },
]

export const PROOF_POINTS = [
  {
    stat: 'SEC',
    label: 'filings and flow',
    detail: '8-K, 10-Q, Form 4, PTR, 13F, press releases, and earnings transcripts in one feed.',
  },
  {
    stat: '4',
    label: 'macro regions',
    detail: 'US, EU, UK, and China catalyst calendar with impact tags.',
  },
  {
    stat: 'Outcomes',
    label: 'on every rail',
    detail: 'Forward returns and win rates on similar setups. Not another alert feed.',
  },
  {
    stat: 'US',
    label: 'equities focus',
    detail: 'Listed stocks and ADRs. Catalyst process from discover to investigate.',
  },
]

export const DATA_SOURCES =
  'SEC EDGAR · Form 4 · PTR · 13F · Earnings transcripts · Macro US · EU · UK · CN'

export const PLAN_FEATURES = [
  'Discover - macro calendar, watchlist catalysts, market moves',
  'Research - ticker feed, context panel, exportable papers',
  'Investigate - insider, PTR, and 13F with case sheets',
  'Historical outcomes on similar setups',
  'Settings - billing and account',
]

export const INTRO_FAQ = [
  {
    q: 'Is this a Bloomberg replacement?',
    a: 'No. Mercerline focuses on catalyst equities, a discover timeline, research papers, and flow investigation.',
  },
  {
    q: 'Discover vs Research?',
    a: 'Discover scans your week: macro, watchlist, and moves. Research is ticker-deep with feed, paper, and context.',
  },
  {
    q: 'What sources are included?',
    a: 'SEC filings, PTR, 13F, company press releases, and earnings transcripts on one timeline.',
  },
  {
    q: 'Can I cancel?',
    a: `Yes. ${formatUsd(MONTHLY_PRICE_USD)}/mo or ${formatUsd(YEARLY_PRICE_USD)}/yr with self-serve Stripe billing.`,
  },
  {
    q: 'Investment advice?',
    a: 'No. Mercerline is a research workspace only.',
  },
]

export const PRICING = {
  kicker: 'Pricing',
  title: 'One plan. Full terminal.',
  sub: `Most members choose yearly - ${formatUsd(YEARLY_SAVE_USD)} less than twelve monthly payments.`,
  yearlyBadge: `Save ${formatUsd(YEARLY_SAVE_USD)}`,
  monthlyNoteLines: ['Billed monthly', 'Cancel anytime'],
  yearlyNoteLines: ['Billed annually'],
}

export const SUBSCRIBE_FOOTER = {
  nfa: INTRO_FOOTER.nfa,
  tagline: INTRO_FOOTER.tagline,
  links: [
    { id: 'pricing', label: 'Pricing', href: '#subscribe-pricing' },
    { id: 'faq', label: 'FAQ', href: '#subscribe-faq' },
  ],
}

export const SUBSCRIBE = {
  eyebrow: 'Step 2 · Checkout',
  headline: 'One plan.',
  headlineAccent: 'Full terminal.',
  lead: `Choose monthly at ${formatUsd(MONTHLY_PRICE_USD)}/mo or yearly at ${formatUsd(YEARLY_PRICE_USD)}/yr - save ${formatUsd(YEARLY_SAVE_USD)} vs twelve monthly payments.`,
  reassurance: 'Secure Stripe checkout · Cancel anytime · Manage billing in Settings',
}

export const SUBSCRIBE_FAQ = [
  {
    q: 'Switch monthly or yearly later?',
    a: 'Yes - from billing settings inside the terminal.',
  },
  {
    q: 'What happens after I pay?',
    a: 'You land in the full terminal with Discover, Research, and Investigate unlocked.',
  },
  {
    q: 'Why is yearly featured?',
    a: `${formatUsd(YEARLY_SAVE_USD)} less than paying monthly for twelve months. Most members choose annual.`,
  },
]
