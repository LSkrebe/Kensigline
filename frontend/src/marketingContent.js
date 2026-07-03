/** Intro + subscribe copy - aligned with live terminal (Discover · Research · Investigate). */

import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_SAVE_USD,
  formatUsd,
} from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - Event-driven research terminal for catalyst traders',
  description:
    'Scan macro catalysts, build ticker research papers, and drill insider, politician, and institutional flow - with historical outcomes on every rail. SEC filings, PTR, and 13F in one grid.',
  path: '/',
  ogImage: '/mercerline_background_1.png',
}

export const SUBSCRIBE_PAGE_META = {
  title: 'Subscribe - Mercerline full terminal access',
  description:
    'Choose monthly or yearly Mercerline access. Unlock Discover, Research, and Investigate - macro calendar, exportable research papers, insider PTR, and 13F flow with historical outcomes.',
  path: '/subscribe',
  ogImage: '/mercerline_background_2.png',
}

export const SIGN_IN_PAGE_META = {
  title: 'Sign in - Mercerline research terminal',
  description:
    'Sign in or create your Mercerline account to access the full catalyst research terminal - Discover, Research, and Investigate with SEC filings, insider flow, and historical outcomes.',
  path: '/sign-in',
  ogImage: '/mercerline_background_1.png',
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
  eyebrow: 'Event-driven research terminal',
  headline: 'The catalyst trade,',
  headlineAccent: 'one terminal.',
  lead:
    'Scan the week, build the research paper, drill insider and institutional flow - with historical outcomes on every rail.',
  ctaPrimary: `Start researching - ${formatUsd(MONTHLY_PRICE_USD)}/mo`,
  ctaSecondary: 'See how it works',
  reassurance: 'Cancel anytime · Full terminal · SEC, PTR, and 13F',
  rails: 'Analyse · Discover · Research · Investigate',
}

export const INTRO_SCREENSHOTS = {
  hero: '/intro/hero.png',
  research: '/intro/research.png',
  analyse: '/intro/analyse.png',
  discover: '/intro/discover.png',
  investigateInsider: '/intro/investigate-insider.png',
}

export const SHOWCASE_TABS = [
  {
    id: 'discover',
    step: '01',
    label: 'Discover',
    title: 'Scan before the print',
    body: 'Macro calendar across US, EU, CN, and UK. Watchlist catalysts beside market moves with post-event reaction charts.',
    image: INTRO_SCREENSHOTS.discover,
    imageAlt: 'Discover tab with macro calendar and highlighted market moves',
  },
  {
    id: 'research',
    step: '02',
    label: 'Research',
    title: 'Build the paper',
    body: '12+ feed types on one timeline - filings, press releases, transcripts, Form 4, PTR, and 13F. Export a screenshot-ready research paper with context panel.',
    image: INTRO_SCREENSHOTS.research,
    imageAlt: 'Research tab with ticker feed, ASML paper timeline, and context panel',
  },
  {
    id: 'analyse',
    step: '03',
    label: 'Analyse',
    title: 'Model the drivers',
    body: 'Quarterly financial grid with editable forecast columns, business-driver roll-ups, and a live valuation bridge tied to the price chart.',
    image: INTRO_SCREENSHOTS.analyse,
    imageAlt: 'Analyse tab with ASML price chart, business drivers, and financial model',
  },
  {
    id: 'investigate',
    step: '04',
    label: 'Investigate',
    title: 'Drill the flow',
    body: 'Insider, politician PTR, and institutional 13F modes. Case worksheet, chart trade marks, and historical win rates before you size.',
    image: INTRO_SCREENSHOTS.investigateInsider,
    imageAlt: 'Investigate tab with insider feed, case worksheet, and historical outcomes',
  },
]

export const PROOF_POINTS = [
  {
    stat: '12+',
    label: 'document feeds',
    detail: 'SEC, PR, transcripts, flow - one timeline card pattern.',
  },
  {
    stat: '3',
    label: 'investigate modes',
    detail: 'Insider Form 4, politician PTR, institutional 13F.',
  },
  {
    stat: 'Outcomes',
    label: 'on every rail',
    detail: 'Win rates and forward returns - not another alert stream.',
  },
  {
    stat: '1 grid',
    label: 'keyboard-first',
    detail: 'Tab between Discover, Research, Investigate all day.',
  },
]

export const DATA_SOURCES = 'SEC · PTR · 13F'

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
    a: 'No. Mercerline is narrow by design - catalyst equities, discover timeline, research papers, and flow investigation.',
  },
  {
    q: 'Discover vs Research?',
    a: 'Discover scans your week - macro, watchlist, moves. Research is ticker-deep: feed, paper, and context panel.',
  },
  {
    q: 'What sources are included?',
    a: 'SEC filings, PTR, 13F, company press releases, and earnings transcripts - unified on one timeline.',
  },
  {
    q: 'Can I cancel?',
    a: `Yes - ${formatUsd(MONTHLY_PRICE_USD)}/mo or ${formatUsd(YEARLY_PRICE_USD)}/yr, self-serve billing via Stripe.`,
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
