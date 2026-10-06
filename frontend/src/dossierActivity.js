/**
 * Investor dossier Stats / Holdings / Recent trades.
 *
 * Form 4 founders often have $0 converts/gifts that built the book and cash sells
 * afterward. Rebuild from disclosed sharesAfter when the dollar ledger is empty,
 * and never drop real sell/buy filings just because portfolio weights stay ~0.
 */

function dayKey(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatLongDate(ms) {
  const d = new Date(ms)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

function formatAum(n) {
  if (!(n > 0)) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`
  return `$${Math.round(n)}`
}

function formatDelay(days) {
  if (!Number.isFinite(days)) return '—'
  const rounded = Math.max(0, Math.round(days))
  if (rounded >= 6) {
    const weeks = Math.max(1, Math.round(rounded / 7))
    if (Math.abs(rounded - weeks * 7) <= 2) return weeks === 1 ? '1 week' : `${weeks} weeks`
  }
  return rounded === 1 ? '1 day' : `${rounded} days`
}

function shortCompany(name, ticker) {
  const cleaned = String(name || ticker || '')
    .replace(/,?\s+(Inc\.?|Incorporated|Corporation|Corp\.?|N\.V\.|Ltd\.?|Limited|plc|S\.A\.)$/i, '')
    .replace(/,?\s+Holdings$/i, '')
    .replace(/\s*\/[a-z]{2,}\s*$/i, '')
    .replace(/\.com$/i, '')
    .replace(/[,\s.]+$/g, '')
    .trim()
  return cleaned || ticker || '—'
}

function integerWeights(rows) {
  const total = rows.reduce((sum, row) => sum + (Number(row.dollars) || 0), 0)
  if (!(total > 0)) {
    return rows.map((row, index) => ({ ...row, pct: 0, index }))
  }
  const ranked = rows.map((row, index) => {
    const raw = ((Number(row.dollars) || 0) / total) * 100
    return { ...row, index, pct: Math.round(raw), frac: raw - Math.floor(raw) }
  })
  let leftover = 100 - ranked.reduce((sum, row) => sum + row.pct, 0)
  ranked
    .slice()
    .sort((a, b) => b.frac - a.frac)
    .forEach((row) => {
      if (leftover <= 0) return
      row.pct += 1
      leftover -= 1
    })
  return ranked.sort((a, b) => a.index - b.index)
}

export function isDossierTrade(row) {
  return row?.type !== 'meta' && row?.layout !== 'two' && (row?.type === 'trade' || String(row?.layout ?? '').startsWith('txn'))
}

/** Prefer explicit amountUsd; never treat "591K sh" share labels as dollars. */
export function tradeDollars(row) {
  const n = Number(row?.amountUsd)
  if (Number.isFinite(n) && n > 1) return n
  const raw = String(row?.value ?? '').trim()
  if (!raw || raw === '—') return 0
  if (/sh\b/i.test(raw) && !/\$/.test(raw)) return 0
  const text = raw.replace(/[$,]/g, '')
  const range = text.match(/([\d.]+)\s*-\s*([\d.]+)\s*([kmb])?/i)
  if (range) {
    const unit = String(range[3] || '').toLowerCase()
    const scale = unit === 'b' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1
    return ((Number(range[1]) + Number(range[2])) / 2) * scale
  }
  const single = text.match(/([\d.]+)\s*([kmb])?/i)
  if (!single) return 0
  const unit = String(single[2] || '').toLowerCase()
  const scale = unit === 'b' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1
  return Number(single[1]) * scale
}

export function tradeShares(row) {
  const direct = Number(row?.shares)
  if (Number.isFinite(direct) && direct > 0) return direct
  const raw = String(row?.value ?? '').trim()
  const m = raw.match(/([\d.]+)\s*([kmb])?\s*sh\b/i)
  if (!m) return 0
  const unit = String(m[2] || '').toLowerCase()
  const scale = unit === 'b' ? 1e9 : unit === 'm' ? 1e6 : unit === 'k' ? 1e3 : 1
  return Number(m[1]) * scale
}

function sharesAfterOf(row) {
  const raw =
    row?.sharesAfter ??
    row?.performanceMeta?.sharesAfter ??
    row?.sheetRow?.performanceMeta?.sharesAfter
  if (raw == null || raw === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

function unitPriceHint(row, dollars, shares) {
  const metaPrice = Number(row?.performanceMeta?.price ?? row?.price)
  if (Number.isFinite(metaPrice) && metaPrice > 0) return metaPrice
  if (dollars > 1 && shares > 0) return dollars / shares
  return null
}

function isSellTrade(meta, row) {
  if (meta?.codeTone === 'sell') return true
  if (meta?.codeTone === 'buy') return false
  const ad = String(row?.acquiredDisposed ?? '').toUpperCase()
  if (ad === 'D') return true
  if (ad === 'A') return false
  const code = String(meta?.code ?? row?.code ?? '').toUpperCase()
  return code === 'S' || code === 'F' || code === 'E' || code === 'K' || code === 'U' || code === 'Z'
}

/**
 * @param {any[]} rows dossier trade rows
 * @param {{ tradeRowMeta?: Function }} [opts]
 */
export function buildDossierActivity(rows, opts = {}) {
  const tradeRowMeta =
    opts.tradeRowMeta ??
    ((row) => ({
      ticker: String(row?.ticker ?? '').trim().toUpperCase() || '—',
      title: String(row?.companyName ?? row?.ticker ?? 'Trade').trim(),
      code: String(row?.code ?? '').trim().toUpperCase() || '—',
      codeTone: row?.codeTone ?? null,
    }))

  const trades = (rows ?? [])
    .filter(isDossierTrade)
    .map((row) => {
      const meta = tradeRowMeta(row)
      const tradeMs = new Date(row?.tradeTs ?? row?.ts ?? 0).getTime()
      const filedMs = new Date(row?.filedAt ?? row?.tradeTs ?? row?.ts ?? 0).getTime()
      const dollars = tradeDollars(row)
      const shares = tradeShares(row)
      const sharesAfter = sharesAfterOf(row)
      const sell = isSellTrade(meta, row)
      const price = unitPriceHint(row, dollars, shares)
      return {
        row,
        ticker: meta.ticker,
        name: shortCompany(row?.companyName || meta.title, meta.ticker),
        fullName: String(row?.companyName || meta.title || meta.ticker).trim(),
        dollars,
        shares,
        sharesAfter,
        price,
        sell,
        tradeMs: Number.isFinite(tradeMs) ? tradeMs : null,
        filedMs: Number.isFinite(filedMs) ? filedMs : null,
      }
    })
    .filter((trade) => trade.ticker && trade.ticker !== '—' && trade.tradeMs != null)

  trades.sort((a, b) => a.tradeMs - b.tradeMs || a.filedMs - b.filedMs)
  if (!trades.length) return null

  // Last known cash price per ticker (sells / priced rows) for AUM estimates.
  const lastPrice = new Map()
  for (const trade of trades) {
    if (trade.price != null && trade.price > 0) lastPrice.set(trade.ticker, trade.price)
  }

  const book = new Map()
  const groups = new Map()
  for (const trade of trades) {
    const key = dayKey(trade.filedMs ?? trade.tradeMs)
    if (!key) continue
    if (!groups.has(key)) groups.set(key, { key, filedMs: trade.filedMs ?? trade.tradeMs, trades: [] })
    groups.get(key).trades.push(trade)
  }
  const ordered = [...groups.values()].sort((a, b) => a.filedMs - b.filedMs)
  const filings = []

  for (const group of ordered) {
    const before = new Map(book)
    for (const trade of group.trades) {
      const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0
      // Prefer dollars; fall back to shares * last known price so $0 converts still size the book.
      const size =
        trade.dollars > 1
          ? trade.dollars
          : trade.shares > 0 && px > 0
            ? trade.shares * px
            : 0
      if (!(size > 0) && !(trade.sharesAfter != null && trade.sharesAfter >= 0)) continue
      const delta = trade.sell ? -size : size
      let next = Math.max(0, (book.get(trade.ticker)?.dollars ?? 0) + delta)
      // Authoritative Form 4 balance when present — survives sell-only windows.
      if (trade.sharesAfter != null && trade.sharesAfter >= 0 && px > 0) {
        next = trade.sharesAfter * px
      } else if (trade.sharesAfter === 0) {
        next = 0
      }
      if (next <= 1) book.delete(trade.ticker)
      else {
        book.set(trade.ticker, {
          dollars: next,
          shares: trade.sharesAfter != null && trade.sharesAfter >= 0 ? trade.sharesAfter : book.get(trade.ticker)?.shares ?? null,
          name: trade.name,
          fullName: trade.fullName || book.get(trade.ticker)?.fullName,
        })
      }
    }

    const totalBefore = [...before.values()].reduce((sum, item) => sum + item.dollars, 0)
    const totalAfter = [...book.values()].reduce((sum, item) => sum + item.dollars, 0)
    const weight = (map, total, ticker) => (total > 0 ? ((map.get(ticker)?.dollars ?? 0) / total) * 100 : 0)
    const seen = new Set()
    const changes = []

    const dayAbs = group.trades.reduce((sum, trade) => {
      const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0
      const size =
        trade.dollars > 1 ? trade.dollars : trade.shares > 0 && px > 0 ? trade.shares * px : trade.shares
      return sum + Math.abs(size || 0)
    }, 0)

    for (const trade of group.trades) {
      if (seen.has(trade.ticker)) continue
      seen.add(trade.ticker)
      const from = weight(before, totalBefore, trade.ticker)
      const to = weight(book, totalAfter, trade.ticker)
      const net = group.trades
        .filter((item) => item.ticker === trade.ticker)
        .reduce((sum, item) => {
          const px = lastPrice.get(item.ticker) ?? item.price ?? 0
          const size =
            item.dollars > 1 ? item.dollars : item.shares > 0 && px > 0 ? item.shares * px : 0
          return sum + (item.sell ? -size : size)
        }, 0)
      const had = (before.get(trade.ticker)?.dollars ?? 0) > 1
      const has = (book.get(trade.ticker)?.dollars ?? 0) > 1
      let kind = !had && has ? 'new' : had && !has ? 'closed' : net > 0 ? 'increased' : net < 0 ? 'decreased' : 'unchanged'

      // Sell-heavy Form 4s with no prior long book still need a visible trade row.
      if (kind === 'unchanged' || (from < 0.05 && to < 0.05)) {
        const tickerTrades = group.trades.filter((item) => item.ticker === trade.ticker)
        const anySell = tickerTrades.some((item) => item.sell)
        const anyBuy = tickerTrades.some((item) => !item.sell)
        const sized = tickerTrades.some((item) => item.dollars > 1 || item.shares > 0)
        if (!sized) continue
        if (anySell && !anyBuy) kind = had && !has ? 'closed' : 'decreased'
        else if (anyBuy && !anySell) kind = !had && has ? 'new' : 'increased'
        else if (net < 0) kind = 'decreased'
        else if (net > 0) kind = 'increased'
        else continue
      }

      let fromPct = from
      let toPct = to
      if (fromPct < 0.05 && toPct < 0.05 && dayAbs > 0) {
        const tickerAbs = group.trades
          .filter((item) => item.ticker === trade.ticker)
          .reduce((sum, item) => {
            const px = lastPrice.get(item.ticker) ?? item.price ?? 0
            const size =
              item.dollars > 1 ? item.dollars : item.shares > 0 && px > 0 ? item.shares * px : item.shares
            return sum + Math.abs(size || 0)
          }, 0)
        const slice = (tickerAbs / dayAbs) * 100
        if (kind === 'decreased' || kind === 'closed') {
          fromPct = slice
          toPct = 0
        } else {
          fromPct = 0
          toPct = slice
        }
      }

      const fullName = book.get(trade.ticker)?.fullName || before.get(trade.ticker)?.fullName || trade.fullName
      changes.push({
        ticker: trade.ticker,
        name: book.get(trade.ticker)?.name || before.get(trade.ticker)?.name || trade.name,
        fullName,
        from: fromPct,
        to: toPct,
        kind,
      })
    }

    const unchanged = []
    for (const [ticker, item] of book) {
      if (seen.has(ticker)) continue
      const to = weight(book, totalAfter, ticker)
      if (to < 0.05) continue
      unchanged.push({
        ticker,
        name: item.name,
        fullName: item.fullName || item.name,
        from: weight(before, totalBefore, ticker),
        to,
        kind: 'unchanged',
      })
    }
    unchanged.sort((a, b) => b.to - a.to)
    filings.push({ ...group, changes, unchanged })
  }

  // Prefer disclosed ending balances when the dollar reconstruction collapsed.
  const disclosed = new Map()
  for (let i = trades.length - 1; i >= 0; i--) {
    const trade = trades[i]
    if (disclosed.has(trade.ticker)) continue
    if (trade.sharesAfter == null || trade.sharesAfter < 0) continue
    const px = lastPrice.get(trade.ticker) ?? trade.price ?? 0
    const dollars = trade.sharesAfter > 0 && px > 0 ? trade.sharesAfter * px : trade.sharesAfter > 0 ? trade.sharesAfter : 0
    if (trade.sharesAfter <= 0) {
      disclosed.set(trade.ticker, null)
      continue
    }
    disclosed.set(trade.ticker, {
      dollars: dollars > 1 ? dollars : Math.max(dollars, 1),
      shares: trade.sharesAfter,
      name: trade.name,
      fullName: trade.fullName,
    })
  }

  let holdingSource = book
  if (book.size === 0 && [...disclosed.values()].some(Boolean)) {
    holdingSource = new Map([...disclosed.entries()].filter(([, v]) => v))
  } else if (book.size > 0) {
    // Merge in disclosed tickers missing from the dollar book (e.g. only converts).
    for (const [ticker, item] of disclosed) {
      if (!item || book.has(ticker)) continue
      holdingSource.set(ticker, item)
    }
  }

  const holdings = integerWeights(
    [...holdingSource.entries()].map(([ticker, item]) => ({
      ticker,
      name: item.name,
      fullName: item.fullName || item.name,
      dollars: item.dollars,
    })),
  )
    .filter((row) => row.dollars > 1)
    .sort((a, b) => b.pct - a.pct || b.dollars - a.dollars)

  const delays = trades
    .filter((trade) => trade.filedMs != null && trade.tradeMs != null && trade.filedMs >= trade.tradeMs)
    .map((trade) => (trade.filedMs - trade.tradeMs) / 86400000)
  const aum = holdings.reduce((sum, row) => sum + row.dollars, 0)
  return {
    since: formatLongDate(trades[0].tradeMs),
    aum: formatAum(aum),
    delay: formatDelay(delays.length ? delays.reduce((sum, n) => sum + n, 0) / delays.length : null),
    positions: String(holdings.length),
    holdings,
    filings: filings.filter((filing) => filing.changes.length).reverse(),
  }
}
