/**
 * Learn lesson registry — add new lessons here.
 * Each page teaches a concept + how to apply it in Mercerline.
 */

export const LEARN_LESSONS = [
  {
    slug: 'form-4-insider-filings',
    title: 'What is a Form 4?',
    description:
      'How insider buy and sell disclosures work, when they hit EDGAR, and why the filing date matters more than the headline date.',
    eyebrow: 'Insider disclosures',
    sections: [
      {
        heading: 'Public record, private timing',
        body: 'When executives, directors, or large shareholders trade their company’s stock, they file Form 4 with the SEC. The trade is often weeks old by the time casual observers notice — but the filing timestamp is fixed the moment it clears.',
      },
      {
        heading: 'What you actually get',
        body: 'A Form 4 names the insider, the ticker, transaction type (buy/sell), and date. It does not come with narrative context. That is why a feed that assembles filings beats refreshing EDGAR manually.',
      },
    ],
    mercerline: {
      heading: 'In Mercerline',
      body: 'Form 4 filings appear in the daily recap as they clear. Click the filer to open an investor dossier with trade history, related tickers, and outcomes — the same rail members use before the market opens.',
      bullets: ['Daily recap → see new Form 4 entries', 'Investor dossier → full insider trail', 'Company context → jump to the issuer'],
    },
    related: ['why-filings-beat-headlines', 'using-mercerline-daily-recap'],
  },
  {
    slug: 'politician-ptr-disclosures',
    title: 'Reading politician PTR filings',
    description:
      'House and Senate periodic transaction reports (PTR) disclose stock trades by members of Congress — often before financial media catches up.',
    eyebrow: 'Political disclosures',
    sections: [
      {
        heading: 'PTR vs insider Form 4',
        body: 'Politicians file PTRs under different rules and timelines than corporate insiders. The asset, ticker, and transaction type are public — but scattered across separate systems and easy to miss in a headline-driven workflow.',
      },
      {
        heading: 'Why the window matters',
        body: 'The Pelosi NVDA example is extreme, but the pattern is common: filing public on day one, mainstream coverage months later. Research workflows built on news feeds systematically arrive late.',
      },
    ],
    mercerline: {
      heading: 'In Mercerline',
      body: 'PTR entries sit on the same rail as insider and fund filings. Filter the investor directory by politicians, or open a PTR from the daily recap and stay on one dossier.',
      bullets: ['Politician trades in the recap feed', 'Investor dossier with PTR history', 'Track record context where available'],
    },
    related: ['form-4-insider-filings', 'why-filings-beat-headlines'],
  },
  {
    slug: '13f-institutional-filings',
    title: 'What 13F filings tell you',
    description:
      'Quarterly 13F reports show what large investment managers held — useful context, with different timing than insider or politician trades.',
    eyebrow: 'Institutional filings',
    sections: [
      {
        heading: 'Holdings, not day trades',
        body: '13F reports disclose long equity positions above reporting thresholds. They lag the quarter end and are not real-time trade alerts — but they show which funds increased or decreased exposure.',
      },
      {
        heading: 'Combine with faster disclosures',
        body: 'The edge is pairing slow 13F context with fast Form 4 and PTR signals on the same ticker. One screen for “who moved recently” and “who holds size.”',
      },
    ],
    mercerline: {
      heading: 'In Mercerline',
      body: 'Institution activity appears in the recap and investor directory. Open a fund filer for position changes and related tickers without leaving the workspace.',
      bullets: ['13F in the daily recap', 'Institution rows in Explore', 'Company dossier for issuer context'],
    },
    related: ['form-4-insider-filings', 'using-mercerline-daily-recap'],
  },
  {
    slug: 'why-filings-beat-headlines',
    title: 'Why filings beat headlines',
    description:
      'Disclosures are public on day one. Narratives arrive later. A research stack built on filings fixes the timing problem.',
    eyebrow: 'The window',
    sections: [
      {
        heading: 'Two clocks',
        body: 'Every US equity disclosure has a filing clock (when EDGAR or PTR systems publish) and a media clock (when journalists, newsletters, or social pick it up). Those clocks are not synchronized.',
      },
      {
        heading: 'Category, not content volume',
        body: 'You do not need more news. You need one workspace that respects filing time — the narrow job Mercerline is built for.',
      },
    ],
    mercerline: {
      heading: 'In Mercerline',
      body: 'Explore opens to a daily recap assembled from what cleared overnight. One headline in our public research section; the full rail is inside for members.',
      bullets: ['Recap first, dossier second', 'Same data model as the app', 'No substitute for investment advice — a timing tool'],
    },
    related: ['using-mercerline-daily-recap', 'form-4-insider-filings'],
  },
  {
    slug: 'using-mercerline-daily-recap',
    title: 'Using the daily recap',
    description:
      'A practical workflow: open Explore, scan what filed, open the filer or company when something clears your bar.',
    eyebrow: 'Workflow',
    sections: [
      {
        heading: 'Morning pass',
        body: 'Start with the recap — Form 4, PTR, and 13F in one list sorted by what cleared recently. You are looking for tickers and filers worth a second click, not reading every line item.',
      },
      {
        heading: 'When to open a dossier',
        body: 'Open the investor when you care about the filer’s history. Open the company when the ticker matters more than who filed. Skip everything else — the product is designed for selective depth.',
      },
    ],
    mercerline: {
      heading: 'Get started',
      body: 'Sign in with the email you used at checkout. Google or email/password both work. Full Explore, dossiers, and macro calendar unlock immediately with an active membership.',
      bullets: ['Explore home → daily recap', 'Investors directory → browse filers', 'Sign in → same workspace as the product tour'],
    },
    related: ['form-4-insider-filings', 'politician-ptr-disclosures', 'why-filings-beat-headlines'],
  },
]

export function getLearnLesson(slug) {
  const s = String(slug ?? '').trim().toLowerCase()
  return LEARN_LESSONS.find((l) => l.slug === s) ?? null
}

export function getLearnLessonSlugs() {
  return LEARN_LESSONS.map((l) => l.slug)
}
