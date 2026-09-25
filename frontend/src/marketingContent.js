/** Marketing copy — landing / auth / checkout (not in-app chrome). */

import { DEFAULT_PRICING, formatUsd, SEO_PRICING } from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export function subscribePageMeta(pricing = SEO_PRICING) {
  return {
    title: 'Subscribe - Mercerline',
    description: `Subscribe to Mercerline from ${formatUsd(pricing.monthlyUsd)}/mo. Track insider, politician, and fund filings with investor dossiers and company context.`,
  path: '/subscribe',
  ogImage: '/og-image.png?v=20260908',
}
}

/** @deprecated Prefer subscribePageMeta(pricing) */
export const SUBSCRIBE_PAGE_META = subscribePageMeta()

/** @deprecated Use signInPageMeta() from marketingSeo.js */

export const WAITLIST_PAGE_META = {
  title: 'Join the waitlist - Mercerline',
  description: 'Join the Mercerline waitlist. We’ll email you when access opens.',
  path: '/waitlist',
    ogImage: '/og-image.png?v=20260908',
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
  checkout_sign_in: {title: 'Sign in after checkout', body: 'Sign in with the same email you used at checkout.'},
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
  return `Watch who filed, what they bought, and how it performed — curated politicians, insiders, and funds from ${formatUsd(pricing.monthlyUsd)}/mo.`
}

/** Lead with optional struck list price for founders mode. */
export function heroLeadParts(pricing = DEFAULT_PRICING) {
  if (pricing.waitlist) {
    return {
      prefix: 'Watch who filed, what they bought, and how it performed — curated politicians, insiders, and funds.',
      listPrice: null,
      price: null,
    }
  }
  const prefix = 'Watch who filed, what they bought, and how it performed — curated politicians, insiders, and funds from '
  if (pricing.founders && pricing.monthlyListUsd) {
    return {
      prefix,
      listPrice: `${formatUsd(pricing.monthlyListUsd)}/mo`,
      price: `${formatUsd(pricing.monthlyUsd)}/mo.`,
    }
  }
  return {
    prefix,
    listPrice: null,
    price: `${formatUsd(pricing.monthlyUsd)}/mo.`,
  }
}

const HERO_HEADLINE = 'See who bought before the headline hits'

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
      ctaPrimary: 'Start now — 50% off',
      ctaSecondary: 'See how it works',
      note: 'Founders pricing · cancel anytime',
    }
  }
  return {
    eyebrow: null,
    brand: 'Mercerline',
    headline: HERO_HEADLINE,
    lead: heroLead(pricing),
    ctaPrimary: 'Start tracking',
    ctaSecondary: 'See how it works',
    note: 'Pay once · open Explore immediately',
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
      title: 'See who is ahead — then subscribe',
      ctaPrimary: 'Pick your plan',
    }
  }
  return {
    title: 'Stop refreshing EDGAR. Start tracking winners.',
    ctaPrimary: 'Start tracking',
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

/** FOMO origin beat — filing vs headline on the same price path. */
export const ORIGIN_STORY = {
  kicker: 'The window',
  title: 'Public on day one. Headline months later.',
  tagline: 'Mercerline catches the filing when it clears, not when the headline lands.',
  person: {
    name: 'Mercerline',
    chamber: 'Filing alert',
    filing: 'Periodic Transaction Report',
    photoUrl: '/mercerline_mark.png',
    photoAlt: 'Mercerline',
    brandLogo: true,
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
  title: 'Filings are public. Rankings are not.',
  lead: 'Autopilot Explore surfaces who is ahead on real returns — then one tap opens the dossier behind the number.',
  shot: 'deepInvestor',
  points: [
    {
      id: 'recap',
      label: 'Explore ranking',
      body: 'Politicians, insiders, and funds sorted by performance, not noise.',
    },
    {
      id: 'filers',
      label: 'Stock vs options',
      body: 'Buys labeled clearly so a derivative does not look like a cash equity.',
    },
    {
      id: 'context',
      label: 'Filing brief',
      body: 'Email when tracked names disclose — portraits and short change rows.',
    },
    {
      id: 'sources',
      label: 'Coverage',
      body: 'Form 4, PTR, and 13F on a curated ~50 investor universe.',
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
  title: 'Who is winning — then what just filed',
  lead: 'Ranked performers with live returns, featured portraits, and today’s disclosures in one Autopilot-style feed.',
}

export const INVESTOR_SHOT = {
  kicker: 'Investor dossier',
  title: 'Open the person behind the %',
  lead: 'Trade history, stock vs option labels, amounts, and the track record on one scroll.',
}

export const MARKETING_SHOTS = {
  hero: shotMeta(
    'hero',
    'Mercerline Explore home with daily recap and investors directory above companies',
  ),
  deepEvent: shotMeta(
    'deep-event',
    'Mercerline recap event brief for an NVDA House PTR purchase with price chart and filing context',
  ),
  deepInvestor: shotMeta(
    'deep-investor',
    'Mercerline investor dossier with PTR trades, track-record chart, and disclosure history',
  ),
  deepCompany: shotMeta(
    'deep-company',
    'Mercerline company dossier with price chart and disclosure history',
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
    title: 'Autopilot Explore',
    body: 'Ranked politicians, insiders, and funds with live returns — so you open the winners first, not the loudest names.',
  },
  {
    id: 'investors',
    title: 'Investor dossiers',
    body: 'Every disclosure behind the number: Form 4, PTR, 13F, stock vs options, amounts, and outcomes on one rail.',
  },
  {
    id: 'companies',
    title: 'Filing brief email',
    body: 'When they disclose, you get a short dark brief with portraits and the move — not another EDGAR tab.',
  },
]

export const PRODUCT = {
  kicker: 'How it works',
  title: 'Ranked filers. Real returns. One feed.',
  lead: 'Politicians, insiders, and funds on one Autopilot-style Explore — portraits, performance, and the trades behind them.',
}

/** Focused previews, rather than a tour of every page. */
export const HOW_IT_WORKS = {
  kicker: 'Inside Mercerline',
  title: 'Open Explore. See who is winning. Drill in.',
  lead: '',
  steps: [
    { id:'recap', label:'Explore', title:'Top performers and today’s filings, ranked.', body:'Featured cards, return chips, and the people worth opening first.', shot:'watchlist' },
    { id:'filer', label:'Dossier', title:'Every disclosure behind the number.', body:'Stock buys vs options, amounts, and the track record on one scroll.', shot:'deepInvestor' },
  ],
}

/** @deprecated Removed from intro pricing — coverage lives in INTRO_DEPTH */
export const COVERAGE_NOTE = null

export const COVERAGE_STRIP = {
  label: 'Curated politicians, insiders, and active funds — not the whole market noise',
}

/** Standalone coverage section — header, dual marquees, proof band between rows. */
export const INTRO_COVERAGE = {
  kicker: 'Coverage',
  title: 'The names that move markets, already tracked',
  lead: 'A curated universe of politicians, corporate insiders, and active managers — Form 4, PTR, and 13F in one place.',
  stats: [
    { value: '~50', label: 'Tracked investors' },
    { value: 'Live', label: 'Filing brief email', featured: true },
    {
      value: '3',
      label: 'Disclosure rails',
    },
  ],
}

export const INTRO_REVIEWS = { title: '', lead: '', items: [] }

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
  'Explore with ranked performers and live returns',
  'Investor dossiers (Form 4, PTR, 13F)',
  'Company context when a ticker shows up',
  'Filing brief email when they disclose',
  'Stock vs option labeling done right',
  'Settings and self-serve billing',
]

/** Compact labels for subscribe — same chip treatment as intro Coverage. */
export const SUBSCRIBE_FEATURES = {
  items: [
    'Ranked Explore',
    'Investor dossiers',
    'Company dossiers',
    'Filing brief email',
    'Live returns',
    'Self-serve billing',
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
      a: 'You go straight into Mercerline. Explore rankings, investor dossiers, and the filing brief unlock immediately.',
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
        a: 'Autopilot-style Explore for US equity disclosures — ranked politicians, insiders, and funds with Form 4, PTR, and 13F.',
      },
      {
        q: 'When does access open?',
        a: 'Soon. Join the waitlist and we’ll email you the moment it does.',
      },
      {
        q: 'What will I get on day one?',
        a: 'Full access to Explore rankings, investor and company dossiers, and the filing brief email.',
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
      a: 'Autopilot-style Explore for US equity disclosures — ranked politicians, insiders, and funds with Form 4, PTR, and 13F, plus dossiers when you drill in.',
    },
    {
      q: 'What do I get on day one?',
      a: 'Full access to Explore rankings, investor and company dossiers, and the filing brief email.',
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
        title: 'See who is ahead — then subscribe',
        cta: 'Pick your plan',
      },
    }
  }
  return {
    eyebrow: 'Subscribe',
    headline: 'Choose your plan',
    lead: 'Full Explore access from day one — ranked filers, dossiers, filing brief.',
    reassurance: 'Secure Whop checkout. Cancel anytime.',
    planCta: {
      monthly: 'Continue with monthly',
      yearly: 'Continue with yearly',
    },
    closing: {
      title: 'Stop refreshing EDGAR. Start tracking winners.',
      cta: 'See plans',
    },
  }
}

/** @deprecated Prefer subscribeCopy(pricing) */
export const SUBSCRIBE = subscribeCopy()

/** Product plane under plans — frames the investors directory screenshot. */
export const SUBSCRIBE_PREVIEW = {
  kicker: 'What you unlock',
  title: 'Everything you need to track winners',
  lead: 'Every plan includes Autopilot Explore rankings, investor dossiers, and the filing brief from day one.',
  pillars: [
    {
      id: 'directory',
      title: 'Explore rankings',
      body: 'Politicians, insiders, and funds sorted by live returns — not noise.',
    },
    {
      id: 'dossiers',
      title: 'Investor dossiers',
      body: 'Open a filer for the disclosure trail, related tickers, and track-record outcomes on a single page.',
    },
    {
      id: 'explore',
      title: 'Filing brief',
      body: 'Email when tracked names disclose — portraits and short change rows, not another EDGAR tab.',
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
      a: 'You go straight into Mercerline. Explore rankings, investor dossiers, and the filing brief unlock immediately.',
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
