/** Intro + subscribe copy - aligned with live terminal (Discover · Research · Investigate). */

import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_SAVE_USD,
  formatUsd,
} from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const HERO = {
  eyebrow: 'Event-driven research terminal',
  headline: 'The catalyst trade,',
  headlineAccent: 'one terminal.',
  lead:
    'Scan the week, build the research paper, drill insider and institutional flow - with historical outcomes on every rail.',
  ctaPrimary: `Get access - ${formatUsd(MONTHLY_PRICE_USD)}/mo`,
  ctaSecondary: 'See how it works',
  reassurance: 'Cancel anytime · Full terminal · SEC, PTR, 13F, and trials',
  rails: 'Discover · Research · Investigate',
}

export const SHOWCASE_TABS = [
  {
    id: 'discover',
    step: '01',
    label: 'Discover',
    title: 'Scan before the print',
    body: 'Macro calendar across US, EU, CN, and UK. Watchlist catalysts beside market moves with post-event reaction charts.',
  },
  {
    id: 'research',
    step: '02',
    label: 'Research',
    title: 'Build the paper',
    body: '12+ feed types on one timeline - filings, trials, PR, Form 4, PTR, 13F. Export a screenshot-ready research paper with context panel.',
  },
  {
    id: 'investigate',
    step: '03',
    label: 'Investigate',
    title: 'Drill the flow',
    body: 'Insider, politician PTR, and institutional 13F modes. Case worksheet, chart trade marks, and historical win rates before you size.',
  },
]

export const PROOF_POINTS = [
  {
    stat: '12+',
    label: 'document feeds',
    detail: 'SEC, trials, PR, flow - one timeline card pattern.',
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

export const DATA_SOURCES = 'SEC · PTR · 13F · ClinicalTrials.gov'

export const PLAN_FEATURES = [
  'Discover - macro calendar, watchlist catalysts, market moves',
  'Research - market and clinical intel, exportable papers',
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
    a: 'SEC filings, PTR, 13F, ClinicalTrials.gov, and company PR - unified on one timeline.',
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
  monthlyNote: 'Billed monthly · cancel anytime',
  yearlyNote: `Save ${formatUsd(YEARLY_SAVE_USD)} vs monthly · ${formatUsd(YEARLY_PRICE_USD)}/yr billed annually`,
}

export const SUBSCRIBE = {
  eyebrow: 'Step 2 · Checkout',
  headline: 'One plan.',
  headlineAccent: 'Full terminal.',
  lead: `Choose monthly at ${formatUsd(MONTHLY_PRICE_USD)}/mo or yearly at ${formatUsd(YEARLY_PRICE_USD)}/yr — save ${formatUsd(YEARLY_SAVE_USD)} vs twelve monthly payments.`,
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
