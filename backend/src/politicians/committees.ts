/**
 * Politician primary-committee lookup (unitedstates/congress-legislators).
 * Stored in Postgres; refreshed periodically; stamped onto politician_transactions at ingest.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { db, runWithWorkerDb } from "../core/db.js";

const BASE = "https://unitedstates.github.io/congress-legislators";
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type LookupRow = { committee: string; chamber: string | null; bioguide: string | null };

let schemaReady: Promise<void> | null = null;
let memoryMap: Map<string, LookupRow> | null = null;
let memoryLoadedAt = 0;
let refreshInFlight: Promise<{ keys: number }> | null = null;

function sqlPath() {
  return join(dirname(fileURLToPath(import.meta.url)), "../../db/politician-committees.sql");
}

export async function ensurePoliticianCommitteeSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = readFileSync(sqlPath(), "utf8");
      await db.query(sql);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}

export function normalizePoliticianNameKey(raw: string): string {
  return String(raw ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9,\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function candidateNameKeys(raw: string): string[] {
  const s = String(raw ?? "").trim();
  if (!s) return [];
  const keys = new Set<string>();
  const add = (v: string) => {
    const k = normalizePoliticianNameKey(v);
    if (k) keys.add(k);
  };
  add(s);
  if (s.includes(",")) {
    const [last, rest] = s.split(",").map((p) => p.trim());
    if (last && rest) {
      add(`${rest} ${last}`);
      add(`${last}, ${rest}`);
      add(`${last} ${rest}`);
    }
  } else {
    const parts = s.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const last = parts[parts.length - 1]!;
      const first = parts.slice(0, -1).join(" ");
      add(`${last}, ${first}`);
      add(`${last} ${first}`);
      add(`${parts[0]} ${last}`);
    }
  }
  return [...keys];
}

function shortenCommitteeName(raw: string): string {
  return String(raw ?? "")
    .trim()
    .replace(/^House (Permanent )?Select Committee on /i, "")
    .replace(/^Senate (Permanent )?Select Committee on /i, "")
    .replace(/^Senate Special Committee on /i, "")
    .replace(/^House Permanent Select Committee on /i, "")
    .replace(/^Joint (Economic )?Committee( on)? /i, "")
    .replace(/^House Committee on /i, "")
    .replace(/^Senate Committee on /i, "")
    .replace(/^Joint Committee on /i, "")
    .replace(/^Committee on /i, "")
    .trim();
}

function isStandingFullId(id: string): boolean {
  const c = String(id ?? "");
  if (c.length !== 4) return false;
  return /^(HS|SS)[A-Z0-9]{2}$/i.test(c);
}

function titleScore(title: string): number {
  const t = String(title ?? "").toLowerCase();
  if (t.includes("chair") && !t.includes("vice")) return 0;
  if (t.includes("ranking")) return 1;
  if (t.includes("vice")) return 2;
  return 5;
}

type MembershipEntry = {
  title: string;
  rank: number;
  isFull: boolean;
  isStanding: boolean;
  name: string;
  parentName: string;
};

function pickCommittee(entries: MembershipEntry[] | undefined): string {
  if (!entries?.length) return "";
  const named = entries.filter((e) => e.name);
  if (!named.length) return "";
  const standing = named.filter((e) => e.isStanding);
  const pool = standing.length ? standing : named.filter((e) => e.isFull);
  const use = pool.length ? pool : named;
  use.sort((a, b) => {
    const ts = titleScore(a.title) - titleScore(b.title);
    if (ts) return ts;
    if (a.isStanding !== b.isStanding) return a.isStanding ? -1 : 1;
    if (a.isFull !== b.isFull) return a.isFull ? -1 : 1;
    return a.rank - b.rank || a.name.localeCompare(b.name);
  });
  const best = use[0]!;
  if (!best.isFull && best.parentName) return best.parentName;
  return best.name;
}

function nameKeysFromLegislator(person: any): string[] {
  const n = person?.name ?? {};
  const keys = new Set<string>();
  const add = (v: string) => {
    const k = normalizePoliticianNameKey(v);
    if (k) keys.add(k);
  };
  const first = String(n.first ?? "").trim();
  const last = String(n.last ?? "").trim();
  const middle = String(n.middle ?? "").trim();
  const official = String(n.official_full ?? "").trim();
  const nickname = String(n.nickname ?? "").trim();
  if (official) add(official);
  if (first && last) {
    add(`${first} ${last}`);
    add(`${last}, ${first}`);
    add(`${last} ${first}`);
    if (middle) {
      add(`${first} ${middle} ${last}`);
      add(`${last}, ${first} ${middle}`);
      const mi = middle[0];
      if (mi) {
        add(`${first} ${mi} ${last}`);
        add(`${last}, ${first} ${mi}`);
      }
    }
    if (nickname) {
      add(`${nickname} ${last}`);
      add(`${last}, ${nickname}`);
    }
  }
  return [...keys];
}

function chamberFromTerm(term: any): string {
  const t = String(term?.type ?? "").toLowerCase();
  if (t === "sen") return "senate";
  if (t === "rep") return "house";
  return "";
}

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "user-agent": "mercerline/0.1 (+politician-committees)" },
  });
  if (!res.ok) throw new Error(`politician_committees_fetch_${res.status}`);
  return res.json();
}

async function loadMemoryMap(force = false): Promise<Map<string, LookupRow>> {
  await ensurePoliticianCommitteeSchema();
  if (!force && memoryMap && Date.now() - memoryLoadedAt < 60_000) return memoryMap;
  const rows = await db.query<{
    name_key: string;
    committee: string;
    chamber: string | null;
    bioguide: string | null;
  }>(`SELECT name_key, committee, chamber, bioguide FROM politician_committee_lookup`);
  const map = new Map<string, LookupRow>();
  for (const r of rows) {
    map.set(r.name_key, {
      committee: r.committee,
      chamber: r.chamber,
      bioguide: r.bioguide,
    });
  }
  memoryMap = map;
  memoryLoadedAt = Date.now();
  return map;
}

export async function lookupPoliticianCommittee(name: string): Promise<string | null> {
  const map = await loadMemoryMap();
  for (const key of candidateNameKeys(name)) {
    const hit = map.get(key);
    if (hit?.committee) return hit.committee;
  }
  return null;
}

export async function lookupPoliticianCommittees(names: Iterable<string>): Promise<Map<string, string>> {
  const map = await loadMemoryMap();
  const out = new Map<string, string>();
  for (const name of names) {
    const raw = String(name ?? "").trim();
    if (!raw || out.has(raw)) continue;
    for (const key of candidateNameKeys(raw)) {
      const hit = map.get(key);
      if (hit?.committee) {
        out.set(raw, hit.committee);
        break;
      }
    }
  }
  return out;
}

/** Attach `committee` onto politician worksheet rows (mutates in place). */
export async function enrichPoliticianWorksheetRows<T extends Record<string, unknown>>(
  rows: T[] | null | undefined,
): Promise<T[]> {
  if (!Array.isArray(rows) || !rows.length) return rows ?? [];
  const names = rows.map((r) => String(r?.key ?? r?.politician_name ?? "").trim()).filter(Boolean);
  const found = await lookupPoliticianCommittees(names);
  for (const r of rows) {
    const name = String(r?.key ?? r?.politician_name ?? "").trim();
    const committee = (name && found.get(name)) || String(r?.committee ?? "").trim() || null;
    if (committee) (r as Record<string, unknown>).committee = committee;
  }
  return rows;
}

export async function enrichPoliticianDocumentData(data: any): Promise<any> {
  if (!data || typeof data !== "object") return data;
  const rows = data?.cluster?.worksheet_rows;
  if (!Array.isArray(rows) || !rows.length) return data;
  await enrichPoliticianWorksheetRows(rows);
  return data;
}

async function latestRefreshAt(): Promise<number | null> {
  await ensurePoliticianCommitteeSchema();
  const rows = await db.query<{ t: string | null }>(
    `SELECT max(refreshed_at)::text AS t FROM politician_committee_lookup`,
  );
  const t = rows[0]?.t;
  if (!t) return null;
  const ms = Date.parse(t);
  return Number.isFinite(ms) ? ms : null;
}

export async function refreshPoliticianCommitteeLookup(): Promise<{ keys: number }> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    await ensurePoliticianCommitteeSchema();
    const [legislators, committees, membership] = await Promise.all([
      fetchJson(`${BASE}/legislators-current.json`),
      fetchJson(`${BASE}/committees-current.json`),
      fetchJson(`${BASE}/committee-membership-current.json`),
    ]);

    const committeeMeta = new Map<string, { name: string; parentName?: string }>();
    for (const c of committees as any[]) {
      const id = String(c.thomas_id || "").trim();
      if (!id) continue;
      const name = shortenCommitteeName(String(c.name || ""));
      committeeMeta.set(id, { name });
      for (const sub of c.subcommittees || []) {
        const sid = id + String(sub.thomas_id || "").trim();
        const subName = String(sub.name || "").trim();
        if (!sid || !subName) continue;
        committeeMeta.set(sid, { name: `${name} (${subName})`, parentName: name });
      }
    }

    const byBio = new Map<string, MembershipEntry[]>();
    for (const [cid, members] of Object.entries(membership as Record<string, any[]>)) {
      const meta = committeeMeta.get(cid) || { name: "" };
      const isFull = String(cid).length === 4;
      const isStanding =
        isStandingFullId(cid) || (String(cid).length > 4 && isStandingFullId(String(cid).slice(0, 4)));
      for (const m of members || []) {
        const bio = String(m.bioguide || "").trim();
        if (!bio) continue;
        if (!byBio.has(bio)) byBio.set(bio, []);
        byBio.get(bio)!.push({
          title: String(m.title || "").trim(),
          rank: Number(m.rank) || 99,
          isFull,
          isStanding,
          name: meta.name || "",
          parentName: meta.parentName || (isFull ? meta.name : ""),
        });
      }
    }

    const now = new Date().toISOString();
    const entries: Array<{ name_key: string; committee: string; chamber: string | null; bioguide: string | null }> =
      [];
    const seen = new Set<string>();

    for (const person of legislators as any[]) {
      const bio = String(person.id?.bioguide || "").trim();
      const committee = pickCommittee(byBio.get(bio));
      if (!committee) continue;
      const term = (person.terms || []).at(-1);
      const chamber = chamberFromTerm(term) || null;
      for (const key of nameKeysFromLegislator(person)) {
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({ name_key: key, committee, chamber, bioguide: bio || null });
      }
    }

    await db.query(`DELETE FROM politician_committee_lookup`);
    const chunk = 200;
    for (let i = 0; i < entries.length; i += chunk) {
      const slice = entries.slice(i, i + chunk);
      const values: unknown[] = [];
      const placeholders: string[] = [];
      slice.forEach((e, idx) => {
        const o = idx * 5;
        placeholders.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}::timestamptz)`);
        values.push(e.name_key, e.committee, e.chamber, e.bioguide, now);
      });
      await db.query(
        `
        INSERT INTO politician_committee_lookup (name_key, committee, chamber, bioguide, refreshed_at)
        VALUES ${placeholders.join(", ")}
        `,
        values,
      );
    }

    memoryMap = null;
    await loadMemoryMap(true);
    console.log(`[politician-committees] refreshed keys=${entries.length}`);
    return { keys: entries.length };
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

export async function refreshPoliticianCommitteesIfStale(
  maxAgeMs = DEFAULT_MAX_AGE_MS,
): Promise<{ keys: number; skipped: boolean }> {
  const latest = await latestRefreshAt();
  if (latest != null && Date.now() - latest < maxAgeMs) {
    await loadMemoryMap();
    return { keys: memoryMap?.size ?? 0, skipped: true };
  }
  const r = await refreshPoliticianCommitteeLookup();
  return { ...r, skipped: false };
}

/** Weekly refresh loop (non-blocking). */
export function startPoliticianCommitteeRefreshWorker(): { stop(): void } {
  let stopped = false;
  let timer: ReturnType<typeof setInterval> | undefined;

  const tick = () => {
    if (stopped) return;
    void runWithWorkerDb(() => refreshPoliticianCommitteesIfStale()).catch((err) => {
      console.warn("[politician-committees] refresh failed", err instanceof Error ? err.message : err);
    });
  };

  void tick();
  timer = setInterval(tick, 24 * 60 * 60 * 1000);

  return {
    stop() {
      stopped = true;
      if (timer) clearInterval(timer);
    },
  };
}
