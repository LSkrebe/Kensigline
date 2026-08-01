/** Marketing copy — landing / auth / checkout (not in-app chrome). */

import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_SAVE_USD,
  formatUsd,
} from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - Track insider, PTR, and 13F disclosures',
  description:
    'Mercerline tracks Form 4, House/Senate PTR, and 13F disclosures for US equities — daily recap, investor dossiers, and company context when a filing clears.',
  path: '/',
  ogImage: '/og-image.png',
}

export const SUBSCRIBE_PAGE_META = {
  title: 'Subscribe to Mercerline - Insider disclosure tracking',
  description: `Subscribe to Mercerline from ${formatUsd(MONTHLY_PRICE_USD)}/mo. Track Form 4, PTR, and 13F disclosures with investor dossiers, company context, and a daily recap.`,
  path: '/subscribe',
  ogImage: '/og-image.png',
}

export const SIGN_IN_PAGE_META = {
  title: 'Sign in - Mercerline',
  description: 'Sign in to Mercerline to open your disclosure workspace.',
  path: '/sign-in',
  ogImage: '/og-image.png',
}

export const SIGN_IN = {
  eyebrow: 'Welcome back',
  headline: 'Sign in',
  lead: 'Open your disclosure workspace. New here? Create an account in the same form.',
}

export const INTRO_FOOTER = {
  nfa: 'Not investment advice',
  tagline: 'See who filed before the market does.',
  links: [
    { id: 'product', label: 'Product', href: '#product' },
    { id: 'faq', label: 'FAQ', href: '#faq' },
    { id: 'sign-in', label: 'Sign in', href: '/sign-in' },
  ],
}

export const HERO = {
  eyebrow: 'US equity disclosures',
  brand: 'Mercerline',
  headline: 'See who filed before the timeline moves.',
  lead: `A focused workspace to track insider, politician, and fund filings on US equities as they clear, from ${formatUsd(MONTHLY_PRICE_USD)}/mo.`,
  ctaPrimary: 'Get started',
  ctaSecondary: 'See product',
  note: 'Open the investor behind each filing when it matters',
}

/**
 * FOMO origin beat — concrete PTR story that explains why the niche exists.
 * Portrait: United States Congress bioguide photo (P000197).
 */
export const ORIGIN_STORY = {
  kicker: 'Why this exists',
  title: 'The NVDA disclosure everyone saw too late',
  lead: [
    { text: 'Nov 22, 2023', tone: 'date' },
    { text: ': a House PTR showed Paul Pelosi buying NVIDIA call options in the ' },
    { text: '$1M–$5M', tone: 'money' },
    { text: ' band. Twelve months later NVDA was up ' },
    { text: '~+200%', tone: 'up' },
    { text: ' — and most people only found out from a viral screenshot.' },
  ],
  person: {
    name: 'Nancy Pelosi',
    chamber: 'U.S. House',
    filing: 'Periodic Transaction Report',
    photoUrl: 'https://unitedstates.github.io/images/congress/225x275/P000197.jpg',
    photoAlt: 'Portrait of Nancy Pelosi',
  },
  trade: {
    filed: 'Nov 22, 2023',
    detail: 'NVDA calls, $1–5M',
    outcome: '+~200% / 12mo',
  },
  closer:
    'Mercerline exists for that gap: see the disclosure when it clears, open the investor dossier, and keep Form 4, PTR, and 13F on one rail.',
}

const SHOT_SIZES =
  '(max-width: 900px) calc(100vw - 48px), min(1120px, calc(100vw - 2 * clamp(24px, 5vw, 56px)))'

function shotMeta(name, alt) {
  return {
    src: `/intro/${name}.png`,
    srcSet: {
      webp: `/intro/${name}-768.webp 768w, /intro/${name}-1200.webp 1200w, /intro/${name}-2400.webp 2400w`,
    },
    sizes: SHOT_SIZES,
    width: 2880,
    height: 1800,
    alt,
  }
}

/** Marketing product screenshots (1440×900 @2x captures). */
export const MARKETING_SHOTS = {
  hero: shotMeta(
    'hero',
    'Mercerline Explore home with daily recap and investors directory above companies',
  ),
  deepInvestor: shotMeta(
    'deep-investor',
    'Mercerline investor dossier for Nancy Pelosi with PTR trades and track-record chart',
  ),
  deepCompany: shotMeta(
    'deep-company',
    'Mercerline company dossier with price chart, fundamentals, and financial model',
  ),
  investorsDirectory: shotMeta(
    'investors-directory',
    'Mercerline investors directory with insider, politician, and institution disclosures',
  ),
}

/** @deprecated Prefer MARKETING_SHOTS.hero — kept for older imports. */
export const INTRO_SCREENSHOTS = {
  hero: MARKETING_SHOTS.hero.src,
  heroSrcSet: MARKETING_SHOTS.hero.srcSet,
  heroSizes: MARKETING_SHOTS.hero.sizes,
  width: MARKETING_SHOTS.hero.width,
  height: MARKETING_SHOTS.hero.height,
  alt: MARKETING_SHOTS.hero.alt,
}

export const PILLARS = [
  {
    id: 'investors',
    title: 'Investor dossiers first',
    body: 'Open a filer — insider, politician, or institution — and stay on one rail of disclosures, related tickers, and outcomes.',
  },
  {
    id: 'recap',
    title: 'Daily disclosure recap',
    body: 'Form 4, PTR, and 13F flow that cleared the bar, assembled each session so you start from what actually filed.',
  },
  {
    id: 'companies',
    title: 'Company context on demand',
    body: 'Jump from a disclosure into the issuer — price, filings, and fundamentals — only when the ticker deserves it.',
  },
]

export const PRODUCT = {
  kicker: 'Product',
  title: 'Built around who filed',
  lead: 'Start with the disclosure. Drill the investor. Open the company only when the name matters.',
}

export const SOURCES = {
  kicker: 'Coverage',
  title: 'What we track',
  items: [
    'Form 4',
    'House PTR',
    'Senate PTR',
    'Executive PTR',
    '13F',
    'SEC EDGAR',
    'Earnings Transcripts',
    'Press',
    '8-K',
    'Macro US',
    'Macro EU',
    'Macro UK',
    'Macro CN',
  ],
}

export const PLAN_FEATURES = [
  'Explore home with daily disclosure recap',
  'Investor dossiers (Form 4, PTR, 13F)',
  'Company dossiers when you need issuer context',
  'Macro calendar across four regions',
  'Historical outcomes on similar setups',
  'Settings and self-serve billing',
]

export const INTRO_FAQ = [
  {
    q: 'What is Mercerline for?',
    a: 'Tracking US equity disclosures — insider Form 4, politician PTR, and institution 13F — with investor dossiers and company context when you need it.',
  },
  {
    q: 'What do I get on day one?',
    a: 'Full access to Explore, investor and company dossiers, and the macro calendar.',
  },
  {
    q: 'Can I cancel?',
    a: `Yes. ${formatUsd(MONTHLY_PRICE_USD)}/mo or ${formatUsd(YEARLY_PRICE_USD)}/yr with Stripe. Manage billing anytime in Settings.`,
  },
  {
    q: 'Is this investment advice?',
    a: 'No. Mercerline is a research workspace only.',
  },
]

export const PRICING = {
  kicker: 'Pricing',
  title: 'Simple pricing. Full access.',
  sub: `Most members choose yearly and save ${formatUsd(YEARLY_SAVE_USD)}.`,
  monthlyNote: 'Billed monthly, cancel anytime',
  yearlyNote: 'Billed annually',
}

export const SUBSCRIBE_FOOTER = {
  nfa: INTRO_FOOTER.nfa,
  tagline: INTRO_FOOTER.tagline,
  links: [
    { id: 'pricing', label: 'Plans', href: '#subscribe-pricing' },
    { id: 'faq', label: 'FAQ', href: '#subscribe-faq' },
  ],
}

export const SUBSCRIBE = {
  eyebrow: 'Subscribe',
  headline: 'Choose your plan',
  lead: 'Full disclosure access from day one.',
  reassurance: 'Secure Stripe checkout. Cancel anytime.',
}

/** Product plane under plans — frames the investors directory screenshot. */
export const SUBSCRIBE_PREVIEW = {
  kicker: 'What you unlock',
  title: 'Everything you need to track disclosures',
  lead: 'Every plan includes Explore with investor directories first, deep investor and company dossiers, and the macro calendar from day one.',
  pillars: [
    {
      id: 'directory',
      title: 'Investors directory',
      body: 'Browse insider Form 4, politician PTR, and institution 13F disclosures in one searchable list.',
    },
    {
      id: 'dossiers',
      title: 'Investor dossiers',
      body: 'Open a filer for the disclosure trail, related tickers, and track-record outcomes on a single page.',
    },
    {
      id: 'explore',
      title: 'Explore',
      body: 'Start each session from the daily disclosure recap, then drill when a filing clears the bar.',
    },
  ],
}

export const SUBSCRIBE_FAQ = [
  {
    q: 'Can I switch monthly and yearly later?',
    a: 'Yes. Change plans anytime from billing settings in Mercerline.',
  },
  {
    q: 'What happens after I pay?',
    a: 'You land in Explore with investor dossiers, company context, and the macro calendar unlocked.',
  },
  {
    q: 'Why choose yearly?',
    a: `${formatUsd(YEARLY_SAVE_USD)} less than paying monthly for twelve months.`,
  },
  {
    q: 'Can I cancel anytime?',
    a: 'Yes. Manage or cancel from Settings. Access stays active through the billed period.',
  },
]
