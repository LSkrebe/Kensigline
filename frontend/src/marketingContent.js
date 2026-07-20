/** Marketing copy — landing / auth / checkout (not in-app chrome). */

import {
  MONTHLY_PRICE_USD,
  YEARLY_PRICE_USD,
  YEARLY_SAVE_USD,
  formatUsd,
} from './billingPlans.js'

export const PRODUCT_NAME = 'Mercerline'

export const INTRO_PAGE_META = {
  title: 'Mercerline - Research terminal for US equity catalysts',
  description:
    'Start from the day\'s filings and flow. Mercerline assembles a daily recap, company and investor dossiers, and a macro calendar — with SEC, Form 4, PTR, and 13F in context.',
  path: '/',
  ogImage: '/og-image.png',
}

export const SUBSCRIBE_PAGE_META = {
  title: 'Subscribe - Mercerline',
  description: `Full terminal access from ${formatUsd(MONTHLY_PRICE_USD)}/mo. Explore, dossiers, and macro calendar.`,
  path: '/subscribe',
  ogImage: '/og-image.png',
}

export const SIGN_IN_PAGE_META = {
  title: 'Sign in - Mercerline',
  description: 'Sign in to Mercerline to open the research terminal.',
  path: '/sign-in',
  ogImage: '/og-image.png',
}

export const SIGN_IN = {
  eyebrow: 'Welcome back',
  headline: 'Sign in',
  lead: 'Access your terminal. New here? Create an account in the same form.',
}

export const INTRO_FOOTER = {
  nfa: 'Not investment advice',
  tagline: 'Research terminal for US equities.',
  links: [
    { id: 'product', label: 'Product', href: '#product' },
    { id: 'pricing', label: 'Pricing', href: '#pricing' },
    { id: 'faq', label: 'FAQ', href: '#faq' },
    { id: 'sign-in', label: 'Sign in', href: '/sign-in' },
  ],
}

export const HERO = {
  eyebrow: 'US Equities Research',
  brand: 'Mercerline',
  headline: 'See the day\'s catalysts before you dig in.',
  lead:
    'A research terminal that opens on a daily recap, then company and investor dossiers with filings, Form 4, PTR, and 13F on one timeline.',
  ctaPrimary: 'Get started',
  ctaSecondary: 'See product',
  note: 'SEC Filings, Form 4, PTR, 13F, Earnings Transcripts',
}

export const INTRO_SCREENSHOTS = {
  hero: '/intro/hero.png',
  heroSrcSet: {
    webp: '/intro/hero-768.webp 768w, /intro/hero-1200.webp 1200w, /intro/hero-2400.webp 2400w',
  },
  heroSizes: '(max-width: 900px) calc(100vw - 48px), min(1120px, calc(100vw - 2 * clamp(24px, 5vw, 56px)))',
  width: 2880,
  height: 1800,
  alt: 'Mercerline Explore home with daily recap and company directory',
}

export const PILLARS = [
  {
    id: 'recap',
    title: 'Daily recap',
    body: 'The filings and flow that cleared the bar, assembled each session — not another alert firehose.',
  },
  {
    id: 'dossiers',
    title: 'Deep dossiers',
    body: 'Open a company or investor and stay on one paper rail: filings, insiders, politicians, 13F, outcomes.',
  },
  {
    id: 'macro',
    title: 'Macro beside equities',
    body: 'US, EU, UK, and China calendar releases with impact tags — without leaving the equity workflow.',
  },
]

export const PRODUCT = {
  kicker: 'Product',
  title: 'Built around how catalyst research actually runs',
  lead: 'Explore first. Drill when something matters. Macro when the calendar moves.',
}

export const SOURCES = {
  kicker: 'Coverage',
  title: 'Sources that matter for US equities',
  items: [
    'SEC EDGAR',
    'Form 4',
    'House / Senate / Executive PTR',
    '13F',
    'Earnings Transcripts',
    'Press & 8-K',
    'Macro US, EU, UK, CN',
  ],
}

export const PLAN_FEATURES = [
  'Explore home — daily recap and directories',
  'Company and investor dossiers',
  'Macro calendar across four regions',
  'Historical outcomes on similar setups',
  'Settings and self-serve billing',
]

export const INTRO_FAQ = [
  {
    q: 'Is Mercerline a Bloomberg replacement?',
    a: 'No. It is a focused terminal for catalyst equities — recap, dossiers, and flow — not a full market-data desk.',
  },
  {
    q: 'What do I get on day one?',
    a: 'Full access to Explore, company and investor dossiers, and the macro calendar.',
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
  title: 'Simple pricing. Full terminal.',
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
  lead: 'Full access to Explore, dossiers, and the macro calendar from day one.',
  reassurance: 'Secure Stripe checkout. Cancel anytime.',
}

export const SUBSCRIBE_FAQ = [
  {
    q: 'Can I switch monthly and yearly later?',
    a: 'Yes. Change plans anytime from billing settings inside the terminal.',
  },
  {
    q: 'What happens after I pay?',
    a: 'You land in Explore with dossiers and macro unlocked.',
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
