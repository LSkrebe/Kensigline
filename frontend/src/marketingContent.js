/** Marketing copy — landing / auth / checkout (not in-app chrome). */

import { DEFAULT_PRICING, formatUsd } from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - See who filed before the story breaks',
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

export const WAITLIST_PAGE_META = {
  title: 'Join the waitlist - Mercerline',
  description: 'Join the Mercerline waitlist. We’ll email you when access opens.',
  path: '/waitlist',
    ogImage: '/og-image.png',
  }

export const WAITLIST = {
  eyebrow: 'Early access',
  headline: 'Join the waitlist',
  lead: 'We’re finishing historical coverage. Leave your email and we’ll notify you when Mercerline opens.',
  submit: 'Notify me',
  success: 'You’re on the list. We’ll email you when access opens.',
  placeholder: 'you@email.com',
}

export const SIGN_IN = {
  eyebrow: 'Welcome back',
  headline: 'Sign in',
  lead: 'Use Google or your email and password. Sign in with the same email you used at checkout on Whop.',
}

export const SIGN_IN_GATE_MESSAGES = {
  no_subscription: {
    title: 'No active subscription',
    body: 'This account does not have an active Mercerline membership. Subscribe below or sign in with the email you used at checkout.',
    signedInBody: (email) =>
      `You're signed in as ${email || 'this account'}, but it doesn't have an active membership. View plans below or sign out to try another account.`,
  },
}

export const INTRO_FOOTER = {
  line: '© Mercerline, Not investment advice, All rights reserved',
  legal:
    'Mercerline is a research and information product only, not investment, legal, or tax advice; no broker, adviser, or fiduciary relationship is created, and you are solely responsible for your decisions. We process account, billing, and usage data to operate the service; payments are handled by Whop. Site content and software are owned by Mercerline or its licensors; unauthorized scraping, redistribution, or resale is prohibited. Contact research@mercerline.com for privacy or DMCA requests.',
}

export function heroLead(pricing = DEFAULT_PRICING) {
  return `Track insider, politician, and fund filings on US equities as they clear from ${formatUsd(pricing.monthlyUsd)}/mo.`
}

/** Lead with optional struck list price for founders mode. */
export function heroLeadParts(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return {
      prefix: 'Track insider, politician, and fund filings on US equities as they clear.',
      listPrice: null,
      price: null,
    }
  }
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

const HERO_HEADLINE = 'See who filed before the story breaks'

export function heroCopy(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return {
      eyebrow: null,
      brand: 'Mercerline',
      headline: HERO_HEADLINE,
      lead: null,
      ctaPrimary: 'Join waitlist',
      ctaSecondary: 'See product',
      note: "We'll notify you when access opens",
    }
  }
  if (pricing.founders) {
    return {
      eyebrow: null,
      brand: 'Mercerline',
      headline: HERO_HEADLINE,
      lead: null,
      ctaPrimary: 'Get 50% off',
      ctaSecondary: 'Learn more',
      note: 'Limited early access offer',
    }
  }
  return {
    eyebrow: null,
    brand: 'Mercerline',
    headline: HERO_HEADLINE,
    lead: heroLead(pricing),
    ctaPrimary: 'See pricing',
    ctaSecondary: 'Learn more',
    note: 'Pay once, start using Mercerline immediately',
  }
}

/** Bottom-of-page CTA on intro — same intent as hero, distinct wording. */
export function introClosingCopy(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return {
      title: 'Be first when access opens',
      ctaPrimary: 'Save my spot',
    }
  }
  if (pricing.founders) {
    return {
      title: 'Stay ahead of the headline',
      ctaPrimary: 'Pick your plan',
    }
  }
  return {
    title: 'Track disclosures while they still matter',
    ctaPrimary: 'Pick your plan',
  }
}

export const HERO = heroCopy()

/** Intro validation strip — recognizable issuers in the coverage universe. */
export const INTRO_TRACKED_COMPANIES = {
  rowA: [
    { ticker: 'NVDA', name: 'NVIDIA' },
    { ticker: 'AAPL', name: 'Apple' },
    { ticker: 'MSFT', name: 'Microsoft' },
    { ticker: 'GOOGL', name: 'Alphabet' },
    { ticker: 'AMZN', name: 'Amazon' },
    { ticker: 'META', name: 'Meta' },
    { ticker: 'TSLA', name: 'Tesla' },
    { ticker: 'V', name: 'Visa' },
    { ticker: 'MA', name: 'Mastercard' },
    { ticker: 'WMT', name: 'Walmart' },
    { ticker: 'COST', name: 'Costco' },
    { ticker: 'PEP', name: 'PepsiCo' },
    { ticker: 'KO', name: 'Coca-Cola' },
    { ticker: 'MCD', name: "McDonald's" },
    { ticker: 'ADBE', name: 'Adobe' },
    { ticker: 'PYPL', name: 'PayPal' },
    { ticker: 'UBER', name: 'Uber' },
    { ticker: 'ABNB', name: 'Airbnb' },
    { ticker: 'SPOT', name: 'Spotify' },
    { ticker: 'NFLX', name: 'Netflix' },
    { ticker: 'TGT', name: 'Target' },
    { ticker: 'HD', name: 'Home Depot' },
    { ticker: 'DASH', name: 'DoorDash' },
    { ticker: 'HOOD', name: 'Robinhood' },
    { ticker: 'NET', name: 'Cloudflare' },
    { ticker: 'SNAP', name: 'Snap' },
  ],
  rowB: [
    { ticker: 'AMD', name: 'AMD' },
    { ticker: 'ASML', name: 'ASML' },
    { ticker: 'TSM', name: 'TSMC' },
    { ticker: 'AVGO', name: 'Broadcom' },
    { ticker: 'CRM', name: 'Salesforce' },
    { ticker: 'QCOM', name: 'Qualcomm' },
    { ticker: 'MU', name: 'Micron' },
    { ticker: 'DIS', name: 'Disney' },
    { ticker: 'SMCI', name: 'Super Micro' },
    { ticker: 'LRCX', name: 'Lam Research' },
    { ticker: 'AMAT', name: 'Applied Materials' },
    { ticker: 'KLAC', name: 'KLA' },
    { ticker: 'MRVL', name: 'Marvell' },
    { ticker: 'SHOP', name: 'Shopify' },
    { ticker: 'COIN', name: 'Coinbase' },
    { ticker: 'RBLX', name: 'Roblox' },
    { ticker: 'SBUX', name: 'Starbucks' },
    { ticker: 'NKE', name: 'Nike' },
    { ticker: 'CMG', name: 'Chipotle' },
    { ticker: 'SNPS', name: 'Synopsys' },
    { ticker: 'ARM', name: 'Arm Holdings' },
    { ticker: 'TXN', name: 'Texas Instruments' },
    { ticker: 'ADI', name: 'Analog Devices' },
    { ticker: 'CDNS', name: 'Cadence' },
    { ticker: 'FTNT', name: 'Fortinet' },
    { ticker: 'ZS', name: 'Zscaler' },
  ],
}

export function introCompanyLogoSrc(ticker) {
  return `/intro/company-logos/${String(ticker ?? '').trim().toUpperCase()}.png`
}

/**
 * FOMO origin beat — concrete PTR story that explains why the niche exists.
 * Portrait: United States Congress bioguide photo (P000197).
 */
export const ORIGIN_STORY = {
  kicker: 'The window',
  title: 'Public on day one. Headline months later.',
  tagline: 'Mercerline catches the filing when it clears, not when the headline lands.',
  person: {
    name: 'Nancy Pelosi',
    chamber: 'U.S. House',
    filing: 'Periodic Transaction Report',
    photoUrl: 'https://unitedstates.github.io/images/congress/225x275/P000197.jpg',
    photoAlt: 'Portrait of Nancy Pelosi',
  },
  trade: {
    filed: 'Nov 22, 2023',
    filedIso: '2023-11-22',
    detail: 'NVDA calls, $1 to 5M',
  },
  timeline: {
    filing: {
      date: '2023-11-22',
      label: 'Filing',
    },
    news: {
      date: '2024-06-05',
      label: 'News',
      name: 'News',
    },
    end: {
      date: '2024-11-22',
    },
  },
  outcome: {
    ticker: 'NVDA',
    move: '+~191%',
    period: '12 mo',
    note: 'Mercerline members saw the filing on day one.',
    chartCaption: 'NVDA split-adjusted daily closes',
  },
}

/** Deeper value block — after product walkthrough, before social proof. */
export const INTRO_DEPTH = {
  kicker: 'The gap',
  title: 'Filings are public. Attention is not.',
  lead: 'Mercerline assembles what cleared overnight so you open one workspace instead of five tabs.',
  shot: 'deepInvestor',
  points: [
    {
      id: 'recap',
      label: 'Daily recap',
      body: 'Form 4, PTR, and 13F in one feed, updated as disclosures clear.',
    },
    {
      id: 'filers',
      label: 'Investor rail',
      body: 'Open the filer for trade history, related tickers, and outcomes.',
    },
    {
      id: 'context',
      label: 'Company context',
      body: 'Jump into the issuer when a filing clears the bar.',
    },
    {
      id: 'sources',
      label: 'Coverage',
      body: 'SEC EDGAR, earnings, press, and macro data across US, EU, UK, and CN.',
    },
  ],
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

/** Screenshot section labels for the intro page. */
export const EXPLORE_SHOT = {
  kicker: 'Explore',
  title: 'See what filed as it clears',
  lead: 'The daily recap shows new Form 4, PTR, and 13F filings in one place, updated as they come in.',
}

export const INVESTOR_SHOT = {
  kicker: 'Investor dossier',
  title: 'Open the investor behind the filing',
  lead: 'You get trade history, track record, and related tickers on one page instead of jumping across different sites.',
}

export const MARKETING_SHOTS = {
  hero: shotMeta(
    'hero',
    'Mercerline Explore home with daily recap and investors directory above companies',
  ),
  deepInvestor: shotMeta(
    'deep-investor',
    'Mercerline investor dossier with PTR trades, track-record chart, and disclosure history',
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
    id: 'recap',
    title: 'Daily disclosure recap',
    body: 'Form 4, PTR, and 13F that cleared the bar, assembled each session so you see what filed instead of what went viral.',
  },
  {
    id: 'investors',
    title: 'Investor dossiers',
    body: 'Open the filer, whether insider, politician, or institution, and stay on one rail of disclosures, related tickers, and outcomes.',
  },
  {
    id: 'companies',
    title: 'Company context when it matters',
    body: 'Jump from a disclosure into the issuer with price, filings, and fundamentals, only when the ticker deserves a closer look.',
  },
]

export const PRODUCT = {
  kicker: 'How it works',
  title: 'Track the filing. Know the filer.',
  lead: 'Insiders, politicians, and big funds are all on the same rail, from the daily recap to the dossier.',
}

/** Visual 3-step walkthrough on intro — labels only, screenshots carry the story. */
export const HOW_IT_WORKS = {
  kicker: 'How it works',
  title: 'Your morning edge in three steps',
  lead: 'Filings are public. Mercerline puts them on one screen before the headline.',
  steps: [
    {
      id: 'recap',
      label: 'Recap clears',
      title: 'See what filed overnight',
      body: 'Form 4, PTR, and 13F land in one feed as disclosures clear. Open Mercerline before the market and you already know who moved.',
      shot: 'hero',
    },
    {
      id: 'filer',
      label: 'Open the filer',
      title: 'Trade history on one page',
      body: 'Click the filer for every trade, related tickers, and outcomes. No digging through EDGAR or waiting for a tweet thread.',
      shot: 'deepInvestor',
    },
    {
      id: 'directory',
      label: 'Browse the rail',
      title: 'Every insider, politician, and fund',
      body: 'Scan the full investor rail when you want context. Politicians, insiders, and funds on one screen.',
      shot: 'investorsDirectory',
    },
  ],
}

/** @deprecated Removed from intro pricing — coverage lives in INTRO_DEPTH */
export const COVERAGE_NOTE = null

export const COVERAGE_STRIP = {
  label: 'Tracking disclosures across 500+ issuers',
}

/** Standalone coverage section — header, dual marquees, proof band between rows. */
export const INTRO_COVERAGE = {
  kicker: 'Coverage',
  title: 'Every name that matters, already in the feed',
  lead: 'Mercerline tracks disclosures across 500+ US issuers, from mega-cap tech to the names that file after hours.',
  stats: [
    { value: '500+', label: 'Issuers tracked' },
    { value: 'Daily', label: 'Recap clears', featured: true },
    {
      value: '10+',
      label: 'Disclosure types',
    },
  ],
}

/** Member quotes for intro reviews section. */
export const INTRO_REVIEWS = {
  title: 'What members are saying',
  lead: 'Real members, real filings they spotted in Mercerline, and the trades they made after seeing them in the feed.',
  items: [
    {
      id: 'lucas',
      name: 'Lucas S.',
      role: 'Active investor',
      verified: true,
      rating: 5,
      quote:
        'I was scrolling the morning recap with my coffee and Pelosi’s NVDA filing was just sitting there. Bought some that week and didn’t think about it again until the chart looked ridiculous.',
      catch: {
        ticker: 'NVDA',
        filer: 'Nancy Pelosi',
        filed: 'Nov 22, 2023',
        filedIso: '2023-11-22',
        chartEnd: '2024-11-22',
        move: '+191%',
        period: '12 mo',
      },
    },
    {
      id: 'jhon',
      name: 'Jhon J.',
      role: 'Swing trader',
      verified: true,
      rating: 5,
      quote:
        'Opened the app before work and Zuckerberg’s META buy was right at the top of the feed. I took a small swing on it and somehow ended up holding most of it for months.',
      catch: {
        ticker: 'META',
        filer: 'Mark Zuckerberg',
        filed: 'Feb 8, 2024',
        filedIso: '2024-02-08',
        chartEnd: '2024-12-11',
        move: '+35%',
        period: '10 mo',
      },
    },
    {
      id: 'faust',
      name: 'Faust R.',
      role: 'Long-term investor',
      verified: true,
      rating: 5,
      quote:
        'Almost skipped the recap but Lisa Su filing AMD made me stop mid-scroll. Threw in a small position and it turned into one of the better chip trades I’ve had this year.',
      catch: {
        ticker: 'AMD',
        filer: 'Lisa Su',
        filed: 'Apr 9, 2025',
        filedIso: '2025-04-09',
        chartEnd: '2025-08-29',
        move: '+68%',
        period: '5 mo',
      },
    },
  ],
}

export const SOURCES = {
  kicker: 'Coverage',
  title: 'What we track',
  lead: 'Form 4, politician PTR, 13F, earnings, press, and macro data, without piecing together five different sites.',
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
  'Historical outcomes after filings',
  'Settings and self-serve billing',
]

/** Compact labels for subscribe — same chip treatment as intro Coverage. */
export const SUBSCRIBE_FEATURES = {
  items: [
    'Daily recap',
    'Investor list',
    'Investor dossiers',
    'Company dossiers',
    'Macro calendar',
    'Track record',
  ],
}

/** Purchase-focused FAQ for intro — objections only, not product tour copy. */
export function introConversionFaq(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return introFaq(pricing)
  }
  return [
    {
      q: 'What happens after I pay?',
      a: 'You go straight into Mercerline. Explore, investor dossiers, company context, and the macro calendar unlock immediately.',
    },
    {
      q: 'Can I cancel?',
      a: `Yes. ${formatUsd(pricing.monthlyUsd)}/mo or ${formatUsd(pricing.yearlyUsd)}/yr with Whop. Manage billing anytime in Settings.`,
    },
    {
      q: 'Already a member?',
      a: 'Choose Sign in in the menu. Google opens instantly. Use the same email as your Whop checkout.',
    },
    {
      q: 'Why choose yearly?',
      a: pricing.founders
        ? `Lock in founders pricing and save ${formatUsd(pricing.yearlySaveUsd)} vs paying monthly for twelve months.`
        : `${formatUsd(pricing.yearlySaveUsd)} less than paying monthly for twelve months.`,
    },
    {
      q: 'Can I switch monthly and yearly later?',
      a: 'Yes. Change plans anytime from billing settings in Mercerline.',
    },
    {
      q: 'Is this investment advice?',
      a: 'No. Mercerline is a research workspace only.',
    },
  ]
}

export function introFaq(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return [
      {
        q: 'What is Mercerline for?',
        a: 'Tracking US equity disclosures, including insider Form 4, politician PTR, and institution 13F, with investor dossiers and company context when you need it.',
      },
      {
        q: 'When does access open?',
        a: 'Soon. Join the waitlist and we’ll email you the moment it does.',
      },
      {
        q: 'What will I get on day one?',
        a: 'Full access to Explore, investor and company dossiers, and the macro calendar.',
      },
      {
        q: 'Is this investment advice?',
        a: 'No. Mercerline is a research workspace only.',
      },
    ]
  }
  return [
    {
      q: 'What is Mercerline for?',
      a: 'Tracking US equity disclosures, including insider Form 4, politician PTR, and institution 13F, with investor dossiers and company context when you need it.',
    },
    {
      q: 'What do I get on day one?',
      a: 'Full access to Explore, investor and company dossiers, and the macro calendar.',
  },
  {
    q: 'Can I cancel?',
      a: `Yes. ${formatUsd(pricing.monthlyUsd)}/mo or ${formatUsd(pricing.yearlyUsd)}/yr with Whop. Manage billing anytime in Settings.`,
    },
    {
      q: 'Already a member?',
      a: 'Choose Sign in in the menu. Google opens instantly. Use the same email as your Whop checkout.',
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
      ? 'Founders pricing at the early access rate, 50% off locked in. Full access from day one. Most members choose yearly.'
      : `Most members choose yearly and save ${formatUsd(pricing.yearlySaveUsd)}.`,
    monthlyNote: 'Billed monthly, cancel anytime',
    yearlyNote: 'Billed annually',
  }
}

/** @deprecated Prefer pricingCopy(pricing) */
export const PRICING = pricingCopy()

export const SUBSCRIBE_FOOTER = {
  line: INTRO_FOOTER.line,
  legal: INTRO_FOOTER.legal,
}

export function subscribeCopy(pricing = DEFAULT_PRICING) {
  if (pricing.founders) {
    return {
      eyebrow: null,
      headline: 'Early access offer',
      lead: 'Founders pricing at the early access rate, 50% off locked in. Full access from day one. Most members choose yearly.',
      reassurance: null,
      planCta: {
        monthly: 'Lock in 50% off',
        yearly: 'Lock in 50% off',
      },
      closing: {
        title: 'Stay ahead of the headline',
        cta: 'Pick your plan',
      },
    }
  }
  return {
    eyebrow: 'Subscribe',
    headline: 'Choose your plan',
    lead: 'Full disclosure access from day one.',
    reassurance: 'Secure Whop checkout. Cancel anytime.',
    planCta: {
      monthly: 'Continue with monthly',
      yearly: 'Continue with yearly',
    },
    closing: {
      title: 'Track disclosures while they still matter',
      cta: 'See plans',
    },
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
      a: 'You go straight into Mercerline. Explore, investor dossiers, company context, and the macro calendar unlock immediately.',
    },
    {
      q: 'Why choose yearly?',
      a: pricing.founders
        ? `Lock in founders pricing and save ${formatUsd(pricing.yearlySaveUsd)} vs paying monthly for twelve months.`
        : `${formatUsd(pricing.yearlySaveUsd)} less than paying monthly for twelve months.`,
    },
  ]
}

/** @deprecated Prefer subscribeFaq(pricing) */
export const SUBSCRIBE_FAQ = subscribeFaq()
