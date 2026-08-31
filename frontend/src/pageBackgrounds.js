/** Per-page Mercerline background art — each route gets a unique composition. */

const DEFAULT_MOBILE_BG_SIZE = '220% auto'

export const PAGE_BG = {
  intro: {
    expanded: '/backgrounds/ml_bg_intro.png',
    compact: '/backgrounds/ml_bg_intro.png',
    expandedPosition: '78% 12%',
    compactPosition: '22% 68%',
    mobileExpandedSize: '210% auto',
    mobileCompactSize: '210% auto',
    mobileExpandedPosition: '78% 12%',
    mobileCompactPosition: '22% 68%',
  },
  signIn: {
    expanded: '/backgrounds/ml_bg_sign_in.png',
    compact: '/backgrounds/ml_bg_sign_in.png',
    expandedPosition: '12% 35%',
    compactPosition: '88% 55%',
  },
  waitlist: {
    expanded: '/backgrounds/ml_bg_waitlist.png',
    compact: '/backgrounds/ml_bg_waitlist.png',
    expandedPosition: '65% 82%',
    compactPosition: '35% 18%',
  },
  subscribe: {
    expanded: '/backgrounds/ml_bg_subscribe.png',
    compact: '/backgrounds/ml_bg_subscribe.png',
    expandedPosition: '8% 22%',
    compactPosition: '72% 78%',
  },
  publicCompany: {
    expanded: '/backgrounds/ml_bg_public_company.png',
    compact: '/backgrounds/ml_bg_public_company.png',
    expandedPosition: '50% 88%',
    compactPosition: '50% 15%',
  },
  exploreHome: {
    expanded: '/backgrounds/ml_bg_explore_home.png',
    compact: '/backgrounds/ml_bg_explore_home.png',
    expandedPosition: '85% 45%',
    compactPosition: '15% 62%',
    mobileExpandedSize: '260% auto',
    mobileCompactSize: '260% auto',
    mobileExpandedPosition: '85% 45%',
    mobileCompactPosition: '15% 62%',
  },
  exploreCompanies: {
    expanded: '/backgrounds/ml_bg_explore_companies.png',
    compact: '/backgrounds/ml_bg_explore_companies.png',
    expandedPosition: '28% 75%',
    compactPosition: '92% 28%',
  },
  exploreInvestors: {
    expanded: '/backgrounds/ml_bg_explore_investors.png',
    compact: '/backgrounds/ml_bg_explore_investors.png',
    expandedPosition: '5% 48%',
    compactPosition: '55% 85%',
  },
  exploreEvent: {
    expanded: '/backgrounds/ml_bg_explore_event.png',
    compact: '/backgrounds/ml_bg_explore_event.png',
    expandedPosition: '48% 8%',
    compactPosition: '62% 92%',
  },
  dossierCompany: {
    expanded: '/backgrounds/ml_bg_dossier_company.png',
    compact: '/backgrounds/ml_bg_dossier_company.png',
    expandedPosition: '18% 55%',
    compactPosition: '82% 35%',
  },
  dossierInvestor: {
    expanded: '/backgrounds/ml_bg_dossier_investor.png',
    compact: '/backgrounds/ml_bg_dossier_investor.png',
    expandedPosition: '90% 62%',
    compactPosition: '10% 25%',
  },
  settings: {
    expanded: '/backgrounds/ml_bg_settings.png',
    compact: '/backgrounds/ml_bg_settings.png',
    expandedPosition: '42% 92%',
    compactPosition: '58% 8%',
  },
  macro: {
    expanded: '/backgrounds/ml_bg_macro.png',
    compact: '/backgrounds/ml_bg_macro.png',
    expandedPosition: '95% 38%',
    compactPosition: '5% 72%',
  },
}

/** CSS custom properties for hero / dock background layers. */
export function pageBackgroundStyle(key) {
  const bg = PAGE_BG[key] ?? PAGE_BG.intro
  const style = {
    '--ml-bg-expanded': `url('${bg.expanded}')`,
    '--ml-bg-compact': `url('${bg.compact}')`,
    '--ml-bg-expanded-position': bg.expandedPosition,
    '--ml-bg-compact-position': bg.compactPosition,
    '--ml-bg-expanded-size': bg.expandedSize ?? 'cover',
    '--ml-bg-compact-size': bg.compactSize ?? 'cover',
    '--ml-bg-mobile-expanded-size': bg.mobileExpandedSize ?? DEFAULT_MOBILE_BG_SIZE,
    '--ml-bg-mobile-compact-size': bg.mobileCompactSize ?? DEFAULT_MOBILE_BG_SIZE,
  }
  if (bg.mobileExpandedPosition) {
    style['--ml-bg-mobile-expanded-position'] = bg.mobileExpandedPosition
  }
  if (bg.mobileCompactPosition) {
    style['--ml-bg-mobile-compact-position'] = bg.mobileCompactPosition
  }
  return style
}

/** Resolve terminal app background key from shell + explore subview. */
export function terminalPageBackgroundKey(shell, exploreSubview) {
  if (shell === 'settings') return 'settings'
  if (shell === 'macro') return 'macro'
  if (shell !== 'explore') return 'exploreHome'
  if (exploreSubview === 'companies') return 'exploreCompanies'
  if (exploreSubview === 'investors') return 'exploreInvestors'
  if (exploreSubview === 'eventDetail') return 'exploreEvent'
  if (exploreSubview === 'companyDetail') return 'dossierCompany'
  if (exploreSubview === 'investorDetail') return 'dossierInvestor'
  return 'exploreHome'
}

const preloadedBgUrls = new Set()

/** Warm-decode page background art before hero layers paint. */
export function preloadPageBackgrounds() {
  if (typeof window === 'undefined') return Promise.resolve()
  const urls = [
    ...new Set(
      Object.values(PAGE_BG).flatMap((bg) => [bg.expanded, bg.compact].filter(Boolean)),
    ),
  ]
  return Promise.all(
    urls.map(
      (url) =>
        new Promise((resolve) => {
          if (preloadedBgUrls.has(url)) {
            resolve()
            return
          }
          preloadedBgUrls.add(url)
          const img = new Image()
          img.decoding = 'async'
          img.onload = () => resolve()
          img.onerror = () => resolve()
          img.src = url
        }),
    ),
  )
}
