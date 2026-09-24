const CARD_W = 1600
const CARD_H = 900
const LEFT_W = 740
const RADIUS = 36

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function wrapLines(ctx, text, maxWidth, limit) {
  const words = String(text ?? '').trim().split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, limit)
}

function portraitUrl(src) {
  const url = String(src ?? '').trim()
  if (!url) return ''
  try {
    const parsed = new URL(url)
    if (parsed.hostname === 'thumb.wikimedia.org') parsed.hostname = 'upload.wikimedia.org'
    return parsed.toString()
  } catch {
    return url
  }
}

async function loadBitmap(url) {
  const res = await fetch(url, { mode: 'cors', credentials: 'omit' })
  if (!res.ok) throw new Error('image')
  return createImageBitmap(await res.blob())
}

function coverImage(ctx, img, x, y, w, h) {
  const scale = Math.max(w / img.width, h / img.height)
  const dw = img.width * scale
  const dh = img.height * scale
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) * 0.12
  ctx.drawImage(img, dx, dy, dw, dh)
}

function opaqueBox(canvas) {
  const ctx = canvas.getContext('2d')
  const { width, height, data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] < 20) continue
      if (x < minX) minX = x
      if (y < minY) minY = y
      if (x > maxX) maxX = x
      if (y > maxY) maxY = y
    }
  }
  if (maxX < minX) return { minX: 0, minY: 0, maxX: width - 1, maxY: height - 1 }
  return { minX, minY, maxX, maxY }
}

function tintMark(img, fill = '#141414') {
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = img.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0)
  ctx.globalCompositeOperation = 'source-in'
  ctx.fillStyle = fill
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return canvas
}

function drawChart(ctx, points, x, y, w, h, color) {
  const series = points
    .map((point) => Number(point?.cumulative))
    .filter((value) => Number.isFinite(value))
  if (series.length < 2) return
  const step = series.length > 160 ? Math.ceil(series.length / 160) : 1
  const sampled = series.filter((_, index) => index % step === 0 || index === series.length - 1)
  let min = Math.min(...sampled, 0)
  let max = Math.max(...sampled, 0)
  if (max - min < 0.002) {
    min -= 0.01
    max += 0.01
  }
  const pad = (max - min) * 0.08
  min -= pad
  max += pad
  const span = max - min || 1
  const coords = sampled.map((value, index) => ({
    x: x + (index / Math.max(1, sampled.length - 1)) * w,
    y: y + (1 - (value - min) / span) * h,
  }))
  ctx.beginPath()
  coords.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
  ctx.lineTo(coords.at(-1).x, y + h)
  ctx.lineTo(coords[0].x, y + h)
  ctx.closePath()
  const fill = ctx.createLinearGradient(0, y, 0, y + h)
  fill.addColorStop(0, color)
  fill.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.globalAlpha = 0.22
  ctx.fillStyle = fill
  ctx.fill()
  ctx.globalAlpha = 1
  ctx.beginPath()
  coords.forEach((point, index) => (index === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)))
  ctx.strokeStyle = color
  ctx.lineWidth = 5
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.stroke()
}

function drawPills(ctx, ranges, active, centerX, y, { onDark = false } = {}) {
  const list = (ranges?.length ? ranges : active ? [active] : []).map((range) => String(range))
  if (!list.length) return y
  ctx.font = '600 24px system-ui, -apple-system, sans-serif'
  const gap = 32
  const items = list.map((label) => {
    const textW = ctx.measureText(label).width
    const selected = label === active
    return { label, selected, width: selected ? textW + 36 : textW }
  })
  const total = items.reduce((sum, item) => sum + item.width, 0) + gap * Math.max(0, items.length - 1)
  let cursor = centerX - total / 2
  for (const item of items) {
    if (item.selected) {
      roundRect(ctx, cursor, y, item.width, 44, 22)
      ctx.fillStyle = onDark ? '#ffffff' : '#141414'
      ctx.fill()
    }
    ctx.fillStyle = item.selected
      ? onDark
        ? '#141414'
        : '#ffffff'
      : onDark
        ? 'rgba(255,255,255,0.55)'
        : '#3a3a3a'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(item.label, cursor + item.width / 2, y + 22)
    cursor += item.width + gap
  }
  return y + 44
}

function drawWrapped(ctx, text, x, y, maxWidth, lineHeight) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const word of words) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  lines.slice(0, 6).forEach((row, index) => ctx.fillText(row, x, y + index * lineHeight))
}

function formatCardDate(ts) {
  const date = new Date(ts)
  if (Number.isNaN(date.getTime())) return ''
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${month}/${day}/${date.getFullYear()}`
}

export async function renderDossierShareCard({
  name,
  portraitSrc,
  heroColor = null,
  sourceLabel,
  sourceMark,
  aum,
  returnText,
  tone,
  rangeLabel,
  range,
  ranges,
  points,
}) {
  const canvas = document.createElement('canvas')
  canvas.width = CARD_W
  canvas.height = CARD_H
  const ctx = canvas.getContext('2d')
  const up = tone === 'isUp'
  const down = tone === 'isDown'
  const accent = up ? '#1c9a4a' : down ? '#d4534a' : '#6d6d6d'
  const panelColor = typeof heroColor === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(heroColor.trim())
    ? heroColor.trim()
    : '#f6f6f4'
  const onDark = panelColor !== '#f6f6f4'

  ctx.clearRect(0, 0, CARD_W, CARD_H)
  roundRect(ctx, 0, 0, CARD_W, CARD_H, RADIUS)
  ctx.save()
  ctx.clip()
  ctx.fillStyle = panelColor
  ctx.fillRect(0, 0, CARD_W, CARD_H)

  ctx.save()
  ctx.beginPath()
  ctx.rect(0, 0, LEFT_W, CARD_H)
  ctx.clip()
  ctx.fillStyle = '#161616'
  ctx.fillRect(0, 0, LEFT_W, CARD_H)
  const photoUrl = portraitUrl(portraitSrc)
  if (photoUrl) {
    try {
      coverImage(ctx, await loadBitmap(photoUrl), 0, 0, LEFT_W, CARD_H)
    } catch {
      /* initials stay on the dark panel */
    }
  }
  const topShade = ctx.createLinearGradient(0, 0, 0, 220)
  topShade.addColorStop(0, 'rgba(0,0,0,0.45)')
  topShade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = topShade
  ctx.fillRect(0, 0, LEFT_W, 220)
  const bottomShade = ctx.createLinearGradient(0, CARD_H - 340, 0, CARD_H)
  bottomShade.addColorStop(0, 'rgba(0,0,0,0)')
  bottomShade.addColorStop(1, 'rgba(0,0,0,0.78)')
  ctx.fillStyle = bottomShade
  ctx.fillRect(0, CARD_H - 340, LEFT_W, 340)

  const nameSize = 58
  const topY = 40
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.font = `700 ${nameSize}px system-ui, -apple-system, sans-serif`
  const displayName = name || 'Investor'
  const nameLines = wrapLines(ctx, displayName, LEFT_W - 80, 2)
  nameLines.forEach((line, index) => ctx.fillText(line, 40, topY + index * (nameSize + 8)))

  const btnH = 58
  const btnX = 32
  const btnW = LEFT_W - 64
  const btnY = CARD_H - 36 - btnH
  const aumSize = 54
  const aumY = btnY - 28 - aumSize
  if (aum) {
    ctx.font = '500 20px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,0.78)'
    ctx.textBaseline = 'top'
    ctx.fillText('AUM', 40, aumY - 30)
    ctx.font = `700 ${aumSize}px system-ui, -apple-system, sans-serif`
    ctx.fillStyle = '#ffffff'
    ctx.fillText(aum, 40, aumY)
  }
  if (sourceLabel) {
    ctx.font = '600 26px system-ui, -apple-system, sans-serif'
    ctx.fillStyle = '#ffffff'
    ctx.textBaseline = 'top'
    const byText = `By ${sourceLabel}`
    const sealSize = 42
    ctx.font = '600 24px system-ui, -apple-system, sans-serif'
    const byW = ctx.measureText(byText).width
    const groupW = sealSize + 10 + byW
    const groupX = LEFT_W - 36 - groupW
    const midY = aum ? aumY + aumSize / 2 : aumY + 24
    let seal = null
    if (sourceMark) {
      try {
        seal = await loadBitmap(portraitUrl(sourceMark))
      } catch {
        seal = null
      }
    }
    ctx.save()
    ctx.beginPath()
    ctx.arc(groupX + sealSize / 2, midY, sealSize / 2, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    if (seal) {
      ctx.clip()
      const pad = 4
      ctx.drawImage(seal, groupX + pad, midY - sealSize / 2 + pad, sealSize - pad * 2, sealSize - pad * 2)
    }
    ctx.restore()
    ctx.fillStyle = '#ffffff'
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    ctx.fillText(byText, groupX + sealSize + 10, midY)
  }

  const cta = `View ${displayName} on Mercerline`
  let ctaSize = 26
  ctx.font = `700 ${ctaSize}px system-ui, -apple-system, sans-serif`
  while (ctaSize > 16 && ctx.measureText(cta).width > btnW - 36) {
    ctaSize -= 1
    ctx.font = `700 ${ctaSize}px system-ui, -apple-system, sans-serif`
  }
  roundRect(ctx, btnX, btnY, btnW, btnH, 29)
  ctx.fillStyle = '#111111'
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(cta, btnX + btnW / 2, btnY + btnH / 2 + 1)
  ctx.restore()

  const rightX = LEFT_W + 44
  const rightEdge = CARD_W - 44
  const arrow = up ? '▲ ' : down ? '▼ ' : ''
  const pnlText = `${arrow}${returnText || '—'}`
  ctx.font = '700 78px system-ui, -apple-system, sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = accent
  ctx.fillText(pnlText, rightX, topY)

  const word = 'MERCERLINE'
  const wordSize = 36
  ctx.font = `400 ${wordSize}px "Instrument Serif", Georgia, serif`
  const wordMetrics = ctx.measureText(word)
  const logoH = Math.max(24, Math.ceil(wordMetrics.actualBoundingBoxAscent || wordSize * 0.72))
  const wordW = wordMetrics.width
  let logoDrawW = logoH
  let mark = null
  let box = null
  const brandFill = onDark ? '#ffffff' : '#141414'
  try {
    mark = tintMark(await loadBitmap('/mercerline_mark.png'), brandFill)
    box = opaqueBox(mark)
    logoDrawW = (logoH * (box.maxX - box.minX + 1)) / (box.maxY - box.minY + 1)
  } catch {
    mark = null
  }
  const brandW = logoDrawW + 10 + wordW
  const brandX = rightEdge - brandW
  const brandBase = topY + nameSize * 0.72
  if (mark && box) {
    const srcH = box.maxY - box.minY + 1
    const scale = logoH / srcH
    ctx.drawImage(mark, brandX - box.minX * scale, brandBase - logoH - box.minY * scale, mark.width * scale, mark.height * scale)
  }
  ctx.fillStyle = brandFill
  ctx.font = `400 ${wordSize}px "Instrument Serif", Georgia, serif`
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(word, brandX + logoDrawW + 10, brandBase)

  const start = formatCardDate(points?.[0]?.ts)
  const end = formatCardDate(points?.at(-1)?.ts)
  const span = start && end ? `${start}  –  ${end}` : ''
  ctx.textBaseline = 'top'
  ctx.fillStyle = onDark ? 'rgba(255,255,255,0.58)' : '#8a8a86'
  ctx.font = '500 24px system-ui, -apple-system, sans-serif'
  ctx.fillText([rangeLabel, span].filter(Boolean).join('   '), rightX, topY + 92)

  const windowLabel = span ? `${start} – ${end}` : 'the tracked window'
  const filingSource = sourceLabel ? `public ${sourceLabel} filings` : 'public filings'
  const note = `${rangeLabel || 'This range'} ${returnText || '—'} for ${windowLabel}. The line is that window rebased to its first day, priced from disclosed positions. AUM is the reconstructed value of the current disclosed book, not money copied into an account. ${filingSource[0].toUpperCase()}${filingSource.slice(1)} are released after the trade, so this is not a same-day record. Not a recommendation. Past performance is not a guarantee of future results.`
  const pillsY = CARD_H - 168
  drawChart(ctx, points ?? [], rightX, topY + 146, rightEdge - rightX, pillsY - 20 - (topY + 146), accent)
  const pillsBottom = drawPills(ctx, ranges, range, (rightX + rightEdge) / 2, pillsY, { onDark })
  ctx.fillStyle = onDark ? 'rgba(255,255,255,0.48)' : '#8d8d89'
  ctx.font = '400 15px system-ui, -apple-system, sans-serif'
  drawWrapped(ctx, note, rightX, pillsBottom + 14, rightEdge - rightX, 19)
  ctx.restore()
  return canvas
}

function canvasToPng(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png'))), 'image/png')
  })
}

function downloadBlob(blob, name) {
  const slug = String(name ?? 'dossier').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'dossier'
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${slug}.png`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export async function copyDossierShareCard(input) {
  const makeBlob = () => renderDossierShareCard(input).then(canvasToPng)
  if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': makeBlob() })])
      return 'copied'
    } catch {
      /* paste is blocked; save the file instead */
    }
  }
  downloadBlob(await makeBlob(), input?.name)
  return 'saved'
}
