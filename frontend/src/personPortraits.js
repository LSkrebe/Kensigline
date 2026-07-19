/**
 * Profile portraits for insiders, politicians, and institutions.
 * Shared URL resolution + probe cache for case headers and paper txn rails.
 */

import { useEffect, useState } from 'react'

const CONGRESS_LEGISLATORS_URL =
  'https://unitedstates.github.io/congress-legislators/legislators-current.json'

const CONGRESS_PHOTO_BASE = 'https://unitedstates.github.io/images/congress/225x275'

/** Fast-path bioguide IDs (also used when legislator index is still loading). */
const POLITICIAN_BIOGUIDE_BY_KEY = {
  'nancy pelosi': 'P000197',
  'dan crenshaw': 'C001120',
  'josh gottheimer': 'G000583',
  'ro khanna': 'K000389',
  'tommy tuberville': 'T000278',
  'michael mccaul': 'M001157',
  'john thune': 'T000250',
  'mark kelly': 'K000377',
  'tom cotton': 'C001095',
  'ted cruz': 'C001098',
  'marco rubio': 'R000595',
  'bernie sanders': 'S000033',
  'mitch mcconnell': 'M000355',
  'chuck schumer': 'S000148',
}

/** Non-Congress officials (Wikimedia Commons filenames). */
const POLITICIAN_EXECUTIVE_PHOTO_FILE = {
  'gina raimondo': 'Gina_Raimondo_2021.jpg',
  'donald j trump': 'Donald_Trump_official_portrait.jpg',
  'donald trump': 'Donald_Trump_official_portrait.jpg',
}

const INSIDER_PHOTO_PEOPLE = [
  { fullName: 'Tim Cook', photoFile: 'Tim_Cook_2009_cropped.jpg' },
  { fullName: 'Satya Nadella', photoFile: 'Satya_Nadella.jpg' },
  { fullName: 'Jamie Dimon', photoFile: 'Jamie_Dimon,_CEO_of_JPMorgan_Chase.jpg' },
  { fullName: 'Mary Barra', photoFile: 'Mary_Barra,_Chairman_and_CEO,_General_Motors.jpg' },
  { fullName: 'Sundar Pichai', photoFile: 'Sundar_pichai.png' },
  { fullName: 'Jensen Huang', photoFile: 'Jensen_Huang_(cropped).jpg' },
  { fullName: 'Lisa Su', photoFile: 'Lisa_Su_at_Computex_2024.jpg' },
  { fullName: 'Ruth Porat', photoFile: 'RuthPorat2016 (cropped).jpg' },
  { fullName: 'Brian Moynihan', photoFile: 'Brian_Moynihan.jpg' },
  { fullName: 'Arvind Krishna', photoFile: 'Arvind_Krishna_(cropped).jpg' },
  { fullName: 'Indra Nooyi', photoFile: 'Indra_Nooyi_(cropped).jpg' },
  { fullName: 'Marc Benioff', photoFile: 'Marc_Benioff_2010.jpg' },
  { fullName: 'Pat Gelsinger', photoFile: 'Pat_Gelsinger_(cropped).jpg' },
  { fullName: 'Safra Catz', photoFile: 'Safra_Catz_2019.jpg' },
  { fullName: 'Andy Jassy', photoFile: 'Andy_Jassy_(cropped).jpg' },
  { fullName: 'Nancy Pelosi', photoFile: 'Nancy_Pelosi_2019.jpg' },
  { fullName: 'Dan Crenshaw', photoFile: 'Dan_Crenshaw,_official_portrait,_116th_Congress.jpg' },
]

/** Mock feed / case insiders (names only — photos resolved via personPortraits). */
export const MOCK_INSIDER_PEOPLE = INSIDER_PHOTO_PEOPLE

/** Institution / 13F filer logos (Wikimedia Commons filenames). */
const INSTITUTION_PHOTO_FILE = {
  vanguard: 'Vanguard_Group_logo.svg',
  blackrock: 'BlackRock,_Inc._logo.svg',
  fidelity: 'Fidelity_Investments_logo.svg',
  'state street': 'State_Street_Corporation_logo.svg',
  berkshire: 'Berkshire_Hathaway_logo.svg',
  goldman: 'Goldman_Sachs.svg',
  jpmorgan: 'JPMorgan_Chase_logo.svg',
  'morgan stanley': 'Morgan_Stanley_Logo_1.svg',
  citadel: 'Citadel_LLC_logo.svg',
  bridgewater: 'Bridgewater_Associates_logo.png',
  renaissance: 'Renaissance_Technologies_logo.png',
  citigroup: 'Citigroup_logo.svg',
  'bank of america': 'Bank_of_America_logo.svg',
  wells: 'Wells_Fargo_Logo_(2020).png',
  capital: 'Capital_Group_Companies_logo.svg',
  troweprice: 'T._Rowe_Price_logo.svg',
  invesco: 'Invesco_logo.svg',
  franklin: 'Franklin_Templeton_Investments_logo.svg',
  dimensional: 'Dimensional_Fund_Advisors_logo.svg',
  schwab: 'Charles_Schwab_Corporation_logo.svg',
  ubs: 'UBS_Logo.svg',
  deutsche: 'Deutsche_Bank_logo_without_wordmark.svg',
  amundi: 'Amundi_logo.svg',
}

export const PORTRAIT_PROBE_FAILED = new Set()
export const PORTRAIT_PROBE_LOADED = new Set()

let congressIndex = null
let congressIndexPromise = null
let congressIndexRevision = 0
const congressIndexListeners = new Set()

function notifyCongressIndexReady() {
  congressIndexRevision += 1
  for (const fn of congressIndexListeners) {
    try {
      fn(congressIndexRevision)
    } catch {
      /* ignore */
    }
  }
}

export function subscribeCongressLegislatorIndex(listener) {
  congressIndexListeners.add(listener)
  return () => congressIndexListeners.delete(listener)
}

export function getCongressLegislatorIndexRevision() {
  return congressIndexRevision
}

export function wikimediaPortraitUrl(fileName, width = 220) {
  const file = String(fileName ?? '').trim()
  if (!file) return null
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${width}`
}

function lastName(name) {
  const parts = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  return (parts.at(-1) ?? '').replace(/[^A-Za-z]/g, '') || String(name ?? '').trim()
}

export function normalizePersonNameKey(name) {
  return String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/^(sen\.|rep\.|hon\.|mr\.|mrs\.|ms\.|dr\.)\s+/i, '')
    .replace(/^(senate|house|executive|hse|sen|exe)\s*,?\s*/i, '')
    .replace(/,/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Candidate keys for fuzzy person-name portrait lookup. */
export function personNameLookupKeys(name) {
  const raw = String(name ?? '').trim()
  const keys = new Set()
  const norm = normalizePersonNameKey(raw)
  if (norm) keys.add(norm)

  if (raw.includes(',')) {
    const [lastPart, ...rest] = raw.split(',')
    const lastKey = normalizePersonNameKey(lastPart)
    const firstRest = normalizePersonNameKey(rest.join(','))
    if (lastKey) keys.add(lastKey)
    if (firstRest && lastKey) {
      keys.add(`${firstRest} ${lastKey}`)
      keys.add(`${lastKey} ${firstRest}`)
    }
    const flipped = normalizePersonNameKey(`${rest.join(',').trim()} ${lastPart.trim()}`)
    if (flipped) keys.add(flipped)
  }

  const parts = norm.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    keys.add(parts.join(' '))
    keys.add(`${parts.at(-1)} ${parts.slice(0, -1).join(' ')}`)
    keys.add(parts.at(-1))
  } else if (parts.length === 1) {
    keys.add(parts[0])
  }

  return [...keys]
}

function institutionNameLookupKeys(name) {
  const keys = new Set(personNameLookupKeys(name))
  const raw = String(name ?? '').trim().toLowerCase()
  const stripped = raw
    .replace(/\b(the|inc|incorporated|llc|l\.p\.|lp|corp|corporation|co|company|group|advisors|advisers|advisory|management|capital|trust|fund|funds|investments|investment|services|service|bank|bancorp|holdings|partners|associates)\b/gi, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (stripped) {
    keys.add(stripped)
    const first = stripped.split(/\s+/)[0]
    if (first && first.length >= 4) keys.add(first)
  }
  return [...keys]
}

const INSIDER_PHOTO_BY_NAME_KEY = Object.fromEntries(
  INSIDER_PHOTO_PEOPLE.map((p) => [normalizePersonNameKey(p.fullName), wikimediaPortraitUrl(p.photoFile)]),
)
const INSIDER_PHOTO_BY_LAST_KEY = Object.fromEntries(
  INSIDER_PHOTO_PEOPLE.map((p) => {
    const last = normalizePersonNameKey(lastName(p.fullName))
    return last ? [last, wikimediaPortraitUrl(p.photoFile)] : null
  }).filter(Boolean),
)

function congressPhotoUrl(bioguide) {
  const id = String(bioguide ?? '').trim()
  if (!id) return null
  return `${CONGRESS_PHOTO_BASE}/${id}.jpg`
}

function politicianBioguideForName(fullName) {
  for (const key of personNameLookupKeys(fullName)) {
    const staticId = POLITICIAN_BIOGUIDE_BY_KEY[key]
    if (staticId) return staticId
    const fromIndex = congressIndex?.get(key)
    if (fromIndex) return fromIndex
  }
  return null
}

function politicianPhotoUrlForName(fullName) {
  const bioguide = politicianBioguideForName(fullName)
  if (bioguide) return congressPhotoUrl(bioguide)
  for (const key of personNameLookupKeys(fullName)) {
    const file = POLITICIAN_EXECUTIVE_PHOTO_FILE[key]
    if (file) return wikimediaPortraitUrl(file)
  }
  return null
}

function insiderPhotoUrlForName(fullName) {
  for (const key of personNameLookupKeys(fullName)) {
    if (INSIDER_PHOTO_BY_NAME_KEY[key]) return INSIDER_PHOTO_BY_NAME_KEY[key]
    if (INSIDER_PHOTO_BY_LAST_KEY[key]) return INSIDER_PHOTO_BY_LAST_KEY[key]
  }
  return null
}

function institutionPhotoUrlForName(fullName) {
  const keys = institutionNameLookupKeys(fullName)
  for (const key of keys) {
    const file = INSTITUTION_PHOTO_FILE[key]
    if (file) return wikimediaPortraitUrl(file, 180)
  }
  for (const key of keys) {
    for (const [instKey, file] of Object.entries(INSTITUTION_PHOTO_FILE)) {
      if (key.length < 4 || instKey.length < 4) continue
      if (key.includes(instKey) || instKey.includes(key)) {
        return wikimediaPortraitUrl(file, 180)
      }
    }
  }
  return null
}

export function casePersonPhotoUrl(fullName, mode) {
  const name = String(fullName ?? '').trim()
  if (!name) return null
  if (mode === 'institutions') return institutionPhotoUrlForName(name)
  if (mode === 'politicians') return politicianPhotoUrlForName(name)
  return insiderPhotoUrlForName(name)
}

/** Try primary name then alternates (feed matchNames, surname-only keys, etc.). */
export function resolveCasePersonPhotoUrl(primaryName, mode, altNames = []) {
  const seen = new Set()
  const candidates = [primaryName, ...(Array.isArray(altNames) ? altNames : [])]
  for (const raw of candidates) {
    const name = String(raw ?? '').trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const url = casePersonPhotoUrl(name, mode)
    if (url) return url
  }
  return null
}

export function usePortraitLookupRevision() {
  const [revision, setRevision] = useState(() => getCongressLegislatorIndexRevision())
  useEffect(() => {
    void preloadCongressLegislatorIndex()
    return subscribeCongressLegislatorIndex(setRevision)
  }, [])
  return revision
}

export function portraitIsLogo(mode) {
  return mode === 'institutions'
}

export function portraitDisplayState(photoUrl) {
  if (!photoUrl || PORTRAIT_PROBE_FAILED.has(photoUrl)) return 'blank'
  if (PORTRAIT_PROBE_LOADED.has(photoUrl)) return 'photo'
  return 'pending'
}

/** Probe a portrait URL once; results are cached for all consumers. */
export function probePortraitUrl(photoUrl, { onLoad, onError, timeoutMs = 10000 } = {}) {
  if (!photoUrl) {
    onError?.()
    return () => {}
  }
  if (PORTRAIT_PROBE_LOADED.has(photoUrl)) {
    onLoad?.()
    return () => {}
  }
  if (PORTRAIT_PROBE_FAILED.has(photoUrl)) {
    onError?.()
    return () => {}
  }

  let active = true
  const fail = () => {
    PORTRAIT_PROBE_FAILED.add(photoUrl)
    if (active) onError?.()
  }
  const succeed = () => {
    PORTRAIT_PROBE_LOADED.add(photoUrl)
    if (active) onLoad?.()
  }

  const timeoutId =
    timeoutMs > 0
      ? window.setTimeout(() => {
          if (!PORTRAIT_PROBE_LOADED.has(photoUrl)) fail()
        }, timeoutMs)
      : null

  const probe = new Image()
  probe.referrerPolicy = 'no-referrer'
  probe.decoding = 'async'
  probe.onload = () => {
    if (timeoutId != null) window.clearTimeout(timeoutId)
    succeed()
  }
  probe.onerror = () => {
    if (timeoutId != null) window.clearTimeout(timeoutId)
    fail()
  }
  probe.src = photoUrl

  return () => {
    active = false
    if (timeoutId != null) window.clearTimeout(timeoutId)
  }
}

export function preloadCongressLegislatorIndex() {
  if (congressIndex) return Promise.resolve(congressIndex)
  if (congressIndexPromise) return congressIndexPromise

  congressIndexPromise = fetch(CONGRESS_LEGISLATORS_URL, { credentials: 'omit', referrerPolicy: 'no-referrer' })
    .then((res) => (res.ok ? res.json() : []))
    .then((rows) => {
      const map = new Map()
      for (const leg of rows ?? []) {
        const bioguide = leg?.id?.bioguide
        if (!bioguide) continue
        const first = String(leg?.name?.first ?? '').trim()
        const last = String(leg?.name?.last ?? '').trim()
        const official = String(leg?.name?.official_full ?? `${first} ${last}`.trim()).trim()
        for (const key of personNameLookupKeys(official)) {
          if (!map.has(key)) map.set(key, bioguide)
        }
        if (last && !map.has(last)) map.set(last, bioguide)
        const flipped = normalizePersonNameKey(`${last} ${first}`)
        if (flipped && !map.has(flipped)) map.set(flipped, bioguide)
      }
      congressIndex = map
      notifyCongressIndexReady()
      return map
    })
    .catch(() => {
      congressIndex = new Map()
      notifyCongressIndexReady()
      return congressIndex
    })

  return congressIndexPromise
}

/** Politician display name from feed row (Last, First → First Last). */
export function politicianDisplayNameFromRow(r) {
  const full = String(r?.whoFullName ?? '').trim()
  if (full.includes(',')) {
    const after = full.split(',').pop()?.trim()
    if (after) return after
  }
  return full
}
