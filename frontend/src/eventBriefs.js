/** Shared mock brief metadata — analysis lives on events/docs; names keyed here for now. */

/**
 * @typedef {Object} EventMentioned
 * @property {string[]} [upstream]
 * @property {string[]} [downstream]
 * @property {string[]} [adjacent]
 */

/** @type {Record<string, EventMentioned>} */
export const EVENT_MENTIONED_BY_KEY = {
  'atyr-8k-today': { downstream: ['REGN', 'VRTX', 'BIIB'] },
  'atyr-8k-cash': { downstream: ['MRNA', 'SRPT', 'REGN'] },
  'atyr-8k-safety': { downstream: ['REGN', 'BIIB', 'VRTX'] },
  'atyr-10q-risk': { downstream: ['REGN', 'VRTX', 'MRNA'] },
  'atyr-enrollment': { downstream: ['MRNA', 'REGN', 'BIIB'] },
  'atyr-connect': { downstream: ['MRNA', 'REGN', 'VRTX'] },
  'asml-gov-dod': {
    upstream: ['AMAT', 'LRCX'],
    downstream: ['TSM', 'NVDA'],
  },
  'asml-q1': {
    upstream: ['AMAT', 'LRCX'],
    downstream: ['TSM', 'NVDA'],
  },
  'asml-orders': {
    upstream: ['AMAT', 'KLAC'],
    downstream: ['TSM', 'NVDA'],
  },
  'srpt-fda-req': { downstream: ['BIIB', 'VRTX', 'MRNA'] },
  'mrna-phase2': { downstream: ['REGN', 'VRTX', 'BIIB'] },
  'nvda-q1-earnings': {
    upstream: ['TSM', 'MU'],
    downstream: ['MSFT', 'GOOG', 'AMZN'],
  },
  'atyr-topline': { downstream: ['REGN', 'VRTX', 'BIIB'] },
  'asml-earnings': { upstream: ['AMAT', 'LRCX'], downstream: ['TSM', 'NVDA'] },
  'atyr-biomarker': { downstream: ['REGN', 'MRNA'] },
  'nvda-computex': { upstream: ['TSM', 'MU'], downstream: ['MSFT', 'GOOG'] },
  'srpt-fda': { downstream: ['BIIB', 'VRTX', 'MRNA'] },
  'mrna-rsv': { downstream: ['REGN', 'PFE', 'BIIB'] },
  'biib-adu': { downstream: ['LLY', 'REGN'] },
  'tsm-cmd': { upstream: ['ASML', 'AMAT'], downstream: ['NVDA', 'AMD'] },
  'lrcx-analyst': { upstream: ['ASML'], downstream: ['MU', 'NVDA'] },
}

function normTicker(t) {
  return String(t ?? '').trim().toUpperCase()
}

/** @param {string | null | undefined} ticker @param {EventMentioned | null | undefined} mentioned */
export function eventMentionedChain(ticker, mentioned) {
  const current = normTicker(ticker)
  if (!current || !mentioned) return []

  const upstream = (mentioned.upstream ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .filter((t) => normTicker(t) !== current)
  const downstream = (mentioned.downstream?.length ? mentioned.downstream : mentioned.adjacent ?? [])
    .map((t) => String(t).trim())
    .filter(Boolean)
    .filter((t) => normTicker(t) !== current)

  if (!upstream.length && !downstream.length) return []

  return [...upstream, current, ...downstream]
}

/** @param {string | null | undefined} ticker @param {EventMentioned | null | undefined} mentioned */
export function eventMentionedSearchText(ticker, mentioned) {
  return eventMentionedChain(ticker, mentioned).join(' ').toLowerCase()
}

/** @param {string | null | undefined} briefKey */
export function getEventMentioned(briefKey) {
  const key = String(briefKey ?? '').trim()
  if (!key) return null
  return EVENT_MENTIONED_BY_KEY[key] ?? null
}
