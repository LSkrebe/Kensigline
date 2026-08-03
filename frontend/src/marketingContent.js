/** Marketing copy — landing / auth / checkout (not in-app chrome). */

import { DEFAULT_PRICING, formatUsd } from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - See who filed before the timeline moves',
  description:
    'Track insider, politician, and fund filings on US equities as they clear. Open investor dossiers and company context when a disclosure matters.',
  path: '/',
  ogImage: '/og-image.png',
}

export function subscribePageMeta(pricing = DEFAULT_PRICING) {
  return {
    title: 'Subscribe - Mercerline',
    description: `Subscribe to Mercerline from ${formatUsd(pricing.monthlyUsd)}/mo. Track insider, politician, and fund filings with investor dossiers and company context.`,
    path: '/subscribe',
    ogImage: '/og-image.png',
  }
}

/** @deprecated Prefer subscribePageMeta(pricing) */
export const SUBSCRIBE_PAGE_META = subscribePageMeta()

export const SIGN_IN_PAGE_META = {
  title: 'Sign in - Mercerline',
  description: 'Sign in to Mercerline to track US equity disclosures.',
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

export function heroLead(pricing = DEFAULT_PRICING) {
  return `Track insider, politician, and fund filings on US equities as they clear from ${formatUsd(pricing.monthlyUsd)}/mo.`
}

/** Lead with optional struck list price for founders mode. */
export function heroLeadParts(pricing = DEFAULT_PRICING) {
  const prefix = 'Track insider, politician, and fund filings on US equities as they clear from '
  if (pricing.founders && pricing.monthlyListUsd) {
    return {
      prefix,
      listPrice: `${formatUsd(pricing.monthlyListUsd)}/mo`,
      price: `${formatUsd(pricing.monthlyUsd)}/mo.`,
    }
  }
  return {
    prefix: `${prefix}${formatUsd(pricing.monthlyUsd)}/mo.`,
    listPrice: null,
    price: null,
  }
}

export function heroCopy(pricing = DEFAULT_PRICING) {
  if (pricing.founders) {
    return {
      eyebrow: 'Founders pricing — 50% off',
      brand: 'Mercerline',
      headline: 'See who filed before the timeline moves.',
      lead: heroLead(pricing),
      ctaPrimary: 'Claim founders rate',
      ctaSecondary: 'See product',
      note: 'Limited early access — lock in half price before it closes.',
    }
  }
  return {
    eyebrow: 'US equity disclosures',
    brand: 'Mercerline',
    headline: 'See who filed before the timeline moves.',
    lead: heroLead(pricing),
    ctaPrimary: 'Get started',
    ctaSecondary: 'See product',
    note: 'Open the investor behind each filing when it matters',
  }
}

export const HERO = heroCopy()

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

export function introFaq(pricing = DEFAULT_PRICING) {
  return [
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
      a: `Yes. ${formatUsd(pricing.monthlyUsd)}/mo or ${formatUsd(pricing.yearlyUsd)}/yr with Stripe. Manage billing anytime in Settings.`,
    },
    {
      q: 'Is this investment advice?',
      a: 'No. Mercerline is a research workspace only.',
    },
  ]
}

/** @deprecated Prefer introFaq(pricing) */
export const INTRO_FAQ = introFaq()

export function pricingCopy(pricing = DEFAULT_PRICING) {
  return {
    kicker: 'Pricing',
    title: 'Simple pricing. Full access.',
    sub: pricing.founders
      ? 'Founders pricing — early access rate. Most members choose yearly.'
      : `Most members choose yearly and save ${formatUsd(pricing.yearlySaveUsd)}.`,
    monthlyNote: 'Billed monthly, cancel anytime',
    yearlyNote: 'Billed annually',
  }
}

/** @deprecated Prefer pricingCopy(pricing) */
export const PRICING = pricingCopy()

export const SUBSCRIBE_FOOTER = {
  nfa: INTRO_FOOTER.nfa,
  tagline: INTRO_FOOTER.tagline,
}

export function subscribeCopy(pricing = DEFAULT_PRICING) {
  if (pricing.founders) {
    return {
      eyebrow: 'Limited offer',
      headline: 'Founders pricing',
      lead: '50% off — exclusive early access. Lock this rate in before it disappears.',
      reassurance: 'Your price stays locked for as long as you stay subscribed.',
    }
  }
  return {
    eyebrow: 'Subscribe',
    headline: 'Choose your plan',
    lead: 'Full disclosure access from day one.',
    reassurance: 'Secure Stripe checkout. Cancel anytime.',
  }
}

/** @deprecated Prefer subscribeCopy(pricing) */
export const SUBSCRIBE = subscribeCopy()

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

export function subscribeFaq(pricing = DEFAULT_PRICING) {
  return [
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
      a: pricing.founders
        ? `Lock in founders pricing and save ${formatUsd(pricing.yearlySaveUsd)} vs paying monthly for twelve months.`
        : `${formatUsd(pricing.yearlySaveUsd)} less than paying monthly for twelve months.`,
    },
    {
      q: 'Can I cancel anytime?',
      a: 'Yes. Manage or cancel from Settings. Access stays active through the billed period.',
    },
  ]
}

/** @deprecated Prefer subscribeFaq(pricing) */
export const SUBSCRIBE_FAQ = subscribeFaq()
