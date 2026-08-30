/**
 * Learn lesson registry. Each lesson: concept sections + Mercerline application.
 * Avoid em dashes in copy; use full sentences.
 */

export const LEARN_LESSONS = [
  {
    slug: 'form-4-insider-filings',
    title: 'What is a Form 4?',
    description:
      'A complete introduction to insider transaction reports: who must file, what fields mean, filing deadlines, and how to read buys and sells in context.',
    eyebrow: 'Insider disclosures',
    sections: [
      {
        heading: 'What Form 4 is and who files it',
        paragraphs: [
          'Form 4 is an SEC disclosure that reports changes in beneficial ownership by corporate insiders. Insiders include officers, directors, and any shareholder who owns more than ten percent of a class of equity securities. When they buy or sell company stock, grant options, or exercise awards in ways that change ownership, the transaction generally must be reported.',
          'The form is part of the Section 16 reporting regime under the Securities Exchange Act. Its purpose is transparency: the investing public can see when people with inside access trade the same stock ordinary shareholders own. That does not mean every Form 4 is a signal, but it does mean the data is structured, dated, and searchable once it hits EDGAR.',
        ],
      },
      {
        heading: 'What appears on the form',
        paragraphs: [
          'Each filing identifies the reporting person, the issuer ticker, the transaction date, the filing date, transaction codes, shares, price, and whether shares were acquired or disposed. Transaction codes matter. Code P often indicates an open market purchase. Code S often indicates a sale. Other codes cover tax withholding, gifts, conversions, and derivative exercises. Reading the code row is as important as reading the dollar figure.',
          'Form 4 also distinguishes direct and indirect ownership. A CEO might hold shares through a trust or family entity. The filing still attributes economic exposure back to the insider. For research, the practical question is simple: did this person increase or decrease exposure, and when did the market receive the record?',
        ],
      },
      {
        heading: 'Filing timing and the reporting window',
        paragraphs: [
          'Insiders do not file at the moment of every button click. Rules require reporting within two business days after the transaction in most cases. That creates a short but real lag between the trade and public visibility. Still, the filing timestamp is far earlier than when social media, newsletters, or mainstream outlets usually discuss the same trade.',
          'Many researchers underestimate how much edge comes from process, not prophecy. You are not trying to guess what an insider knew. You are trying to see the same public record sooner and place it next to price, history, and other filings on the same ticker. Form 4 is the raw input for that workflow.',
        ],
      },
      {
        heading: 'How to interpret buys and sells',
        paragraphs: [
          'Not every insider sale is bearish. Executives sell for diversification, tax planning, estate moves, and pre programmed 10b5 1 schedules. A sale under a plan filed months earlier carries different information than a discretionary open market purchase after a quiet period. Context from prior filings on the same person matters.',
          'Open market purchases, especially repeated purchases or clusters across multiple insiders on one ticker, tend to attract more research attention. The market often reacts to size, timing around earnings, and whether the filer has a history of meaningful trades. Your job is to notice the filing early, then decide if the filer and ticker deserve dossier depth.',
        ],
      },
      {
        heading: 'Common mistakes when reading Form 4',
        paragraphs: [
          'Treatinng every line item as a standalone headline is the most common mistake. Form 4 is a ledger, not a story. Another mistake is ignoring amendments. Form 4/A can correct prior rows. Always check whether you are looking at the latest version.',
          'Finally, do not confuse filing date with transaction date. Media often narrates trades using the day journalists noticed them. Your research clock should start at filing clearance on EDGAR. That is the clock Mercerline is built around.',
        ],
      },
    ],
    mercerline: {
      heading: 'Using Mercerline for Form 4 research',
      paragraphs: [
        'Form 4 entries surface in the daily recap as they clear. You see the filer, ticker, side, and document type without refreshing EDGAR or rebuilding a spreadsheet every morning.',
        'When a filing clears your threshold, open the investor dossier for that insider. You get trade history, related tickers, and outcome context on one rail instead of five browser tabs. If the ticker is more interesting than the person, jump to the company dossier for price, fundamentals, and filing archive.',
      ],
      bullets: [
        'Daily recap lists new Form 4 rows as they publish',
        'Investor dossier shows the filer trail over time',
        'Company dossier connects the issuer to price and fundamentals',
      ],
    },
    related: ['why-filings-beat-headlines', 'using-mercerline-daily-recap'],
  },
  {
    slug: 'politician-ptr-disclosures',
    title: 'Reading politician PTR filings',
    description:
      'How House and Senate periodic transaction reports work, what they disclose, where timing differs from Form 4, and how to research political stock trades responsibly.',
    eyebrow: 'Political disclosures',
    sections: [
      {
        heading: 'What PTR reports are',
        paragraphs: [
          'Members of Congress and certain senior staff must disclose securities transactions under the STOCK Act and related ethics rules. Periodic Transaction Reports, commonly called PTRs, list trades in stocks, bonds, and other securities above reporting thresholds. The reports are public accountability documents. They are also research inputs.',
          'PTRs differ from Form 4 in issuer, format, and timing culture. Corporate insiders file standardized SEC forms on EDGAR. Congressional disclosures flow through separate publication systems with their own review and release patterns. The underlying asset can still be the same ordinary US equity ticker you follow elsewhere.',
        ],
      },
      {
        heading: 'What a PTR row tells you',
        paragraphs: [
          'A useful PTR row typically includes the asset name or ticker reference, transaction type such as purchase or sale, amount expressed as a range, and transaction date. Ranges are intentional. You often see buckets like 1,001 to 15,000 dollars rather than exact share counts. Research therefore emphasizes direction, timing, and repeat behavior more than precision on size.',
          'Pay attention to the filer identity and chamber. House and Senate publication paths differ slightly. Some trades involve spouses or dependent children reported under shared disclosure obligations. The economic exposure still maps back to a named public official whose committee assignments and legislative exposure may relate to sectors they trade.',
        ],
      },
      {
        heading: 'Timing: why political trades feel "late" or "early" depending on your source',
        paragraphs: [
          'PTRs must be filed within 45 days after the transaction under current rules, with ongoing legislative debate about tighter windows. Compare that to Form 4’s short corporate window and you see why politician trade discourse on social media often mixes old transactions with new information. The filing date on the official record is the anchor.',
          'High profile examples, including widely discussed NVDA option trades filed in late 2023 and covered in mainstream press months later, illustrate the gap between public record and public attention. Whether you agree with the politics or not, the research lesson is identical: the filing clock and the headline clock are not the same clock.',
        ],
      },
      {
        heading: 'How to research PTR without turning it into gossip',
        paragraphs: [
          'Start from the document, not from a screenshot. Confirm ticker mapping, transaction direction, and filing date. Then ask whether the official has a history of trading the same sector. Repeated activity across related tickers is a stronger research thread than a single isolated row.',
          'Combine PTR with issuer level context. A politician buying a semiconductor name means more when you also see insider activity, fund flows, or earnings timing on the same ticker. PTR alone is rarely a complete thesis. It is an early public fact that deserves a place in a structured workflow.',
        ],
      },
    ],
    mercerline: {
      heading: 'Using Mercerline for PTR research',
      paragraphs: [
        'PTR rows appear in the same daily recap as Form 4 and 13F activity. You do not need a separate political tracker tab. When a politician trade clears, it sits beside other disclosures on the same ticker or in the same session.',
        'Open the politician in the investor directory to see PTR history, related tickers, and dossier context. Mercerline keeps politicians on the same rail as insiders and funds so you can move from recap to filer without switching tools.',
      ],
      bullets: [
        'PTR entries in the daily recap feed',
        'Politician filter in the investors directory',
        'Investor dossier with disclosure history on one page',
      ],
    },
    related: ['form-4-insider-filings', 'why-filings-beat-headlines'],
  },
  {
    slug: '13f-institutional-filings',
    title: 'What 13F filings tell you',
    description:
      'Understand quarterly institutional holdings reports: what is disclosed, what is excluded, reporting lag, and how to combine 13F context with faster filing types.',
    eyebrow: 'Institutional filings',
    sections: [
      {
        heading: 'Purpose of Form 13F',
        paragraphs: [
          'Form 13F is a quarterly report filed by institutional investment managers who exercise investment discretion over $100 million or more in certain equity securities. It lists long US equity positions above the reporting threshold. The form exists so the public can see what large managers held at quarter end.',
          '13F is often misread as a trade feed. It is not. It is a snapshot of holdings as of the last day of the quarter, filed up to 45 days after quarter end. By the time you read a March 31 snapshot in mid May, the manager may have changed positions materially. Treat 13F as context, not as a live order log.',
        ],
      },
      {
        heading: 'What you see and what you do not',
        paragraphs: [
          'You see issuer names, share counts, and reported market values for qualifying long positions. You do not see short positions, many international listings, private holdings, or the intra quarter path that produced the ending stake. A new large position might represent a fresh thesis or a brief trade that was mostly unwound before quarter end.',
          'Still, 13F has real value. It shows which managers carry size in a name. It highlights new entries and exits relative to prior quarters. It helps you ask better questions when a faster filing type hits the same ticker.',
        ],
      },
      {
        heading: 'Reading changes quarter to quarter',
        paragraphs: [
          'Compare line items sequentially. Did shares rise or fall versus the prior 13F? Did a manager enter or exit entirely? Did several funds increase exposure at the same time? Clustered institutional behavior can frame how you interpret insider buys or politician purchases on the same issuer.',
          'Always normalize for splits, spinoffs, and corporate actions. Share counts can move for mechanical reasons. Use reported value and share count together, and cross check price levels around quarter end when precision matters.',
        ],
      },
      {
        heading: 'Combining 13F with Form 4 and PTR',
        paragraphs: [
          'The strongest public research stacks combine speeds. Form 4 and PTR can signal recent human decisions. 13F shows whether large allocators carry weight in the name. Earnings dates and macro events supply calendar context. Mercerline’s design assumes you will move across these layers instead of worshipping one form type.',
          'If you only read 13F, you will feel late. If you only read Form 4, you may miss who holds size. Together they describe both recent behavior and structural ownership.',
        ],
      },
    ],
    mercerline: {
      heading: 'Using Mercerline for 13F research',
      paragraphs: [
        'Institutional activity appears in the recap when relevant filings clear and in the investors directory under funds and managers. Open an institution dossier to see related tickers and filing trail without exporting CSVs from EDGAR.',
        'When a ticker already interests you from an insider or politician row, check whether institutions also hold size. That combination helps you decide whether to open the company dossier or stop at the recap.',
      ],
      bullets: [
        '13F related rows in Explore feeds',
        'Institution entries in the investors directory',
        'Company dossier for issuer level fundamentals',
      ],
    },
    related: ['form-4-insider-filings', 'using-mercerline-daily-recap'],
  },
  {
    slug: 'why-filings-beat-headlines',
    title: 'Why filings beat headlines',
    description:
      'Two clocks drive markets: when disclosures become public record, and when narratives form. This lesson explains the timing gap and how to build a research process around it.',
    eyebrow: 'The window',
    sections: [
      {
        heading: 'Public on day one, narrative later',
        paragraphs: [
          'When a Form 4 or PTR clears, the data is public. Anyone can read it. Yet most participants do not reorganize their day around EDGAR timestamps. They reorganize around headlines, podcasts, and push alerts. That creates a persistent gap between record availability and attention availability.',
          'Mercerline exists inside that gap. The product does not claim hidden data. It claims earlier assembly. You still need judgment. You simply stop discovering the same filing hours or weeks after it was already legible on the official record.',
        ],
      },
      {
        heading: 'Why news feeds fail this specific job',
        paragraphs: [
          'News is optimized for narrative coherence, not ledger completeness. Editors pick one story. Filings are numerous, granular, and unevenly important. A general finance newsletter might never mention a mid cap insider cluster because it is not a story their audience expects.',
          'Social platforms amplify what is already trending. Filing driven research is often unfashionable until it becomes obvious. By then price may have moved. If your edge is timing, the filing clock must be primary and headlines secondary.',
        ],
      },
      {
        heading: 'Building a filing first habit',
        paragraphs: [
          'A filing first habit has three steps. First, scan what cleared recently without judging every row. Second, promote a small subset to dossier depth based on filer quality, ticker liquidity, and repetition. Third, only then seek narrative context from news or sell side commentary.',
          'This inversion feels slower for beginners and faster for experienced users. You skip hundreds of low value stories because you never treated them as stories. You treat them as rows in a recap until one row justifies depth.',
        ],
      },
      {
        heading: 'What this is not',
        paragraphs: [
          'Filing first research is not insider trading and not guaranteed alpha. Filings are public. Others can read them too. You are improving your place in line, not escaping the line.',
          'Mercerline is a research workspace, not investment advice. The goal is disciplined visibility into who filed, on which ticker, and when the record cleared. What you do with that visibility remains your responsibility.',
        ],
      },
    ],
    mercerline: {
      heading: 'Where Mercerline fits',
      paragraphs: [
        'Explore opens to a daily recap built from what cleared overnight. Public research on mercerline.com shows one headline per day. Members see the full rail inside the product.',
        'That split is intentional. The public page teaches the category. The product delivers the workflow.',
      ],
      bullets: [
        'Recap first, dossier second',
        'Same filing model in marketing and in app',
        'Sign in for full investor and company depth',
      ],
    },
    related: ['using-mercerline-daily-recap', 'form-4-insider-filings'],
  },
  {
    slug: 'using-mercerline-daily-recap',
    title: 'Using the daily recap',
    description:
      'A step by step workflow for Explore: morning scan, promotion rules, when to open investor vs company dossiers, and how to avoid feed overload.',
    eyebrow: 'Workflow',
    sections: [
      {
        heading: 'Start with the recap, not a ticker list',
        paragraphs: [
          'Most users open Explore with a blank slate and ask what matters today. The recap answers that question with rows that cleared recently across Form 4, PTR, and 13F. Sort mentally by novelty and size, not by alphabet.',
          'Your first pass should be fast. Spend a few minutes identifying two or three rows worth a second click. If nothing clears your bar, that is also information. Not every session produces action.',
        ],
      },
      {
        heading: 'When to open the investor dossier',
        paragraphs: [
          'Open the investor when the filer is the story. Repeat insiders with meaningful track records, politicians who trade a sector repeatedly, or funds that appear on multiple related tickers deserve filer level depth. The dossier shows history, related names, and disclosure trail on one page.',
          'Stay on the investor rail if you are comparing whether this trade fits prior behavior. Ask whether this person typically trades size, whether they cluster buys, and whether their recent history suggests informational vs routine activity.',
        ],
      },
      {
        heading: 'When to open the company dossier',
        paragraphs: [
          'Open the company when the ticker is the story even if the filer is unfamiliar. Small insider buys on a large cap might matter less than the same pattern on a thinly covered name. Company context adds price history, fundamentals, earnings timing, and other filings on the same issuer.',
          'Jump from recap row to company when you already watch the ticker or when multiple filers hit the same symbol in one session. Convergence across filer types is often more interesting than any single row.',
        ],
      },
      {
        heading: 'Avoiding overload',
        paragraphs: [
          'The recap can list many rows on busy days. Do not attempt full diligence on each one. Use promotion rules: minimum liquidity, filer history, direction of trade, and whether the ticker already sits on your watchlist.',
          'Mercerline is designed for selective depth. The product fails if you treat every row like an emergency. It succeeds if you reliably notice the one or two rows that deserve an hour of context before the broader market catches up narratively.',
        ],
      },
      {
        heading: 'End of session checklist',
        paragraphs: [
          'Before you close Explore, note which tickers you promoted and why. Over weeks you will learn which filers and patterns match your process. That feedback loop is more valuable than any single trade idea.',
          'Return the next session through the recap again. Filings are continuous. The habit matters more than any one morning.',
        ],
      },
    ],
    mercerline: {
      heading: 'Get started in the product',
      paragraphs: [
        'Sign in with the email you used at checkout. Google sign in and email password both work. Active members get Explore, investor dossiers, company context, and the macro calendar immediately.',
        'If you are new, read the Form 4 and PTR lessons first, then run this workflow for one week without forcing trades. Learn the cadence of what clears on ordinary days versus busy days.',
      ],
      bullets: [
        'Explore home shows the daily recap',
        'Investors directory browses filers by type',
        'Company dossier opens from any ticker row',
      ],
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
