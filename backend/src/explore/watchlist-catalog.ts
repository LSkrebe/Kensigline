/** Curated explore universe — must stay aligned with frontend exploreWatchlistCatalog.js. */
export type ExploreWatchlistCatalogEntry = {
  id: string;
  name: string;
  slugs: string[];
  mode: "politicians" | "institutions" | "insiders";
  matchNames: string[];
};

/** Default tracked universe — politicians, insiders, active managers (no index books). */
export const EXPLORE_WATCHLIST_CATALOG: ExploreWatchlistCatalogEntry[] = [
  {
    id: "nancy-pelosi",
    name: "Nancy Pelosi",
    slugs: ["nancy-pelosi", "hon-nancy-pelosi", "the-honorable-nancy-pelosi"],
    mode: "politicians",
    matchNames: ["Hon. Nancy Pelosi", "Nancy Pelosi", "The Honorable Nancy Pelosi"],
  },
  {
    id: "josh-gottheimer",
    name: "Josh Gottheimer",
    slugs: ["josh-gottheimer", "hon-josh-gottheimer"],
    mode: "politicians",
    matchNames: ["Josh Gottheimer", "Joshua Gottheimer"],
  },
  {
    id: "donald-trump",
    name: "Donald Trump",
    slugs: ["donald-trump", "donald-j-trump", "trump"],
    mode: "politicians",
    matchNames: ["Donald Trump", "Donald J Trump", "Donald J. Trump", "Trump, Donald"],
  },
  {
    id: "april-mcclain-delaney",
    name: "April McClain Delaney",
    slugs: ["april-mcclain-delaney", "hon-april-mcclain-delaney"],
    mode: "politicians",
    matchNames: ["April McClain Delaney", "Hon. April McClain Delaney", "McClain Delaney, Hon. April"],
  },
  {
    id: "gilbert-cisneros",
    name: "Gilbert Cisneros",
    slugs: ["gilbert-cisneros", "hon-gilbert-cisneros"],
    mode: "politicians",
    matchNames: ["Gilbert Cisneros", "Gilbert R. Cisneros"],
  },
  {
    id: "lisa-mcclain",
    name: "Lisa McClain",
    slugs: ["lisa-mcclain", "hon-lisa-mcclain"],
    mode: "politicians",
    matchNames: ["Lisa McClain", "Hon. Lisa McClain"],
  },
  {
    id: "tommy-tuberville",
    name: "Tommy Tuberville",
    slugs: ["tommy-tuberville", "mr-thomas-h-tuberville", "thomas-tuberville"],
    mode: "politicians",
    matchNames: ["Mr. Thomas H Tuberville", "Thomas H Tuberville", "Thomas Tuberville", "Tommy Tuberville"],
  },
  {
    id: "dan-crenshaw",
    name: "Dan Crenshaw",
    slugs: ["dan-crenshaw", "hon-daniel-crenshaw", "daniel-crenshaw"],
    mode: "politicians",
    matchNames: ["Dan Crenshaw", "Daniel Crenshaw", "Hon. Daniel Crenshaw"],
  },
  {
    id: "jefferson-shreve",
    name: "Jefferson Shreve",
    slugs: ["jefferson-shreve", "hon-jefferson-shreve"],
    mode: "politicians",
    matchNames: ["Jefferson Shreve", "Hon. Jefferson Shreve", "Shreve, Hon. Jefferson"],
  },
  {
    id: "jared-moskowitz",
    name: "Jared Moskowitz",
    slugs: ["jared-moskowitz", "hon-jared-moskowitz"],
    mode: "politicians",
    matchNames: ["Jared Moskowitz", "Hon. Jared Moskowitz", "Moskowitz, Hon. Jared"],
  },
  {
    id: "marjorie-taylor-greene",
    name: "Marjorie Taylor Greene",
    slugs: ["marjorie-taylor-greene", "hon-marjorie-taylor-greene", "greene-marjorie-taylor"],
    mode: "politicians",
    matchNames: ["Marjorie Taylor Greene", "Hon. Marjorie Taylor Greene", "Greene, Hon. Marjorie Taylor"],
  },
  {
    id: "markwayne-mullin",
    name: "Markwayne Mullin",
    slugs: ["markwayne-mullin", "the-honorable-markwayne-mullin"],
    mode: "politicians",
    matchNames: ["The Honorable Markwayne Mullin", "Markwayne Mullin"],
  },
  {
    id: "daniel-goldman",
    name: "Daniel Goldman",
    slugs: ["daniel-goldman", "hon-daniel-goldman", "hon-daniel-s-goldman"],
    mode: "politicians",
    matchNames: ["Daniel Goldman", "Daniel S. Goldman", "Hon. Daniel Goldman", "Goldman, Hon. Daniel"],
  },
  {
    id: "sheldon-whitehouse",
    name: "Sheldon Whitehouse",
    slugs: ["sheldon-whitehouse", "the-honorable-sheldon-whitehouse"],
    mode: "politicians",
    matchNames: ["The Honorable Sheldon Whitehouse", "Sheldon Whitehouse"],
  },
  {
    id: "rob-bresnahan",
    name: "Rob Bresnahan",
    slugs: ["rob-bresnahan", "hon-rob-bresnahan"],
    mode: "politicians",
    matchNames: ["Rob Bresnahan", "Robert Bresnahan", "Robert P. Bresnahan"],
  },
  {
    id: "kevin-hern",
    name: "Kevin Hern",
    slugs: ["kevin-hern", "hon-kevin-hern"],
    mode: "politicians",
    matchNames: ["Kevin Hern"],
  },
  {
    id: "julia-letlow",
    name: "Julia Letlow",
    slugs: ["julia-letlow", "hon-julia-letlow"],
    mode: "politicians",
    matchNames: ["Julia Letlow", "Hon. Julia Letlow", "Letlow, Hon. Julia"],
  },
  {
    id: "john-boozman",
    name: "John Boozman",
    slugs: ["john-boozman", "the-honorable-john-boozman"],
    mode: "politicians",
    matchNames: ["The Honorable John Boozman", "John Boozman"],
  },
  {
    id: "byron-donalds",
    name: "Byron Donalds",
    slugs: ["byron-donalds", "hon-byron-donalds"],
    mode: "politicians",
    matchNames: ["Hon. Byron Donalds", "Byron Donalds"],
  },
  {
    id: "suzan-delbene",
    name: "Suzan DelBene",
    slugs: ["suzan-delbene", "hon-suzan-k-delbene"],
    mode: "politicians",
    matchNames: ["Suzan DelBene", "Suzan K. DelBene", "Hon. Suzan K. DelBene"],
  },
  {
    id: "jensen-huang",
    name: "Jensen Huang",
    slugs: ["jensen-huang", "huang-jen-hsun"],
    mode: "insiders",
    matchNames: ["HUANG JEN HSUN", "Jen-Hsun Huang", "Jensen Huang"],
  },
  {
    id: "elon-musk",
    name: "Elon Musk",
    slugs: ["elon-musk", "musk-elon"],
    mode: "insiders",
    matchNames: ["Musk Elon", "Elon Musk"],
  },
  {
    id: "tim-cook",
    name: "Tim Cook",
    slugs: ["tim-cook", "cook-timothy-d"],
    mode: "insiders",
    matchNames: ["COOK TIMOTHY D", "Timothy D Cook", "Tim Cook"],
  },
  {
    id: "satya-nadella",
    name: "Satya Nadella",
    slugs: ["satya-nadella", "nadella-satya"],
    mode: "insiders",
    matchNames: ["Nadella Satya", "Satya Nadella"],
  },
  {
    id: "mark-zuckerberg",
    name: "Mark Zuckerberg",
    slugs: ["mark-zuckerberg", "zuckerberg-mark"],
    mode: "insiders",
    matchNames: ["Mark Zuckerberg", "Zuckerberg Mark"],
  },
  {
    id: "larry-ellison",
    name: "Larry Ellison",
    slugs: ["larry-ellison", "ellison-lawrence-joseph"],
    mode: "insiders",
    matchNames: ["Larry Ellison", "Lawrence J. Ellison", "Ellison Lawrence", "ELLISON LAWRENCE JOSEPH"],
  },
  {
    id: "lisa-su",
    name: "Lisa Su",
    slugs: ["lisa-su", "su-lisa-t"],
    mode: "insiders",
    matchNames: ["Su Lisa T", "Lisa Su", "Lisa T Su"],
  },
  {
    id: "andy-jassy",
    name: "Andy Jassy",
    slugs: ["andy-jassy", "jassy-andrew-r", "andrew-jassy"],
    mode: "insiders",
    matchNames: ["Andy Jassy", "Andrew Jassy", "Jassy Andrew R", "Andrew R Jassy"],
  },
  {
    id: "alex-karp",
    name: "Alex Karp",
    slugs: ["alex-karp", "karp-alexander-c", "alexander-karp"],
    mode: "insiders",
    matchNames: ["Alex Karp", "Alexander Karp", "Karp Alexander C", "Alexander C. Karp"],
  },
  {
    id: "hock-tan",
    name: "Hock Tan",
    slugs: ["hock-tan", "tan-hock-e"],
    mode: "insiders",
    matchNames: ["Hock Tan", "Hock E. Tan", "TAN HOCK E"],
  },
  {
    id: "marc-benioff",
    name: "Marc Benioff",
    slugs: ["marc-benioff", "benioff-marc"],
    mode: "insiders",
    matchNames: ["Marc Benioff", "Benioff Marc"],
  },
  {
    id: "jamie-dimon",
    name: "Jamie Dimon",
    slugs: ["jamie-dimon", "dimon-james"],
    mode: "insiders",
    matchNames: ["DIMON JAMES", "Jamie Dimon"],
  },
  {
    id: "mary-barra",
    name: "Mary Barra",
    slugs: ["mary-barra", "barra-mary-t"],
    mode: "insiders",
    matchNames: ["Mary Barra", "Mary T. Barra", "Barra Mary T"],
  },
  {
    id: "reed-hastings",
    name: "Reed Hastings",
    slugs: ["reed-hastings", "hastings-reed"],
    mode: "insiders",
    matchNames: ["Reed Hastings", "Wilmot Reed Hastings", "HASTINGS REED"],
  },
  {
    id: "colette-kress",
    name: "Colette Kress",
    slugs: ["colette-kress", "kress-colette"],
    mode: "insiders",
    matchNames: ["Colette Kress", "Kress Colette"],
  },
  {
    id: "berkshire-hathaway",
    name: "Berkshire Hathaway",
    slugs: ["berkshire-hathaway", "berkshire-hathaway-inc", "berkshire-hathaway-inc-institution-813696"],
    mode: "institutions",
    matchNames: ["Berkshire Hathaway", "Berkshire Hathaway Inc", "Berkshire Hathaway Inc.", "BERKSHIRE HATHAWAY INC"],
  },
  {
    id: "pershing-square",
    name: "Pershing Square",
    slugs: [
      "pershing-square",
      "pershing-square-capital-management-l-p-institution-dde950",
      "pershing-square-capital-management",
    ],
    mode: "institutions",
    matchNames: ["Pershing Square", "Pershing Square Capital Management", "Pershing Square Capital Management, L.P."],
  },
  {
    id: "duquesne-family-office",
    name: "Duquesne Family Office",
    slugs: ["duquesne-family-office", "duquesne-family-office-llc"],
    mode: "institutions",
    matchNames: ["Duquesne Family Office", "Duquesne Family Office LLC"],
  },
  {
    id: "appaloosa",
    name: "Appaloosa",
    slugs: ["appaloosa", "appaloosa-lp"],
    mode: "institutions",
    matchNames: ["Appaloosa", "Appaloosa Management", "Appaloosa LP"],
  },
  {
    id: "citadel-advisors",
    name: "Citadel Advisors",
    slugs: ["citadel-advisors", "citadel-advisors-llc"],
    mode: "institutions",
    matchNames: ["Citadel Advisors", "Citadel", "CITADEL ADVISORS LLC"],
  },
  {
    id: "renaissance-technologies",
    name: "Renaissance Technologies",
    slugs: ["renaissance-technologies"],
    mode: "institutions",
    matchNames: ["Renaissance Technologies", "RENAISSANCE TECHNOLOGIES LLC"],
  },
  {
    id: "bridgewater",
    name: "Bridgewater",
    slugs: ["bridgewater", "bridgewater-associates-lp"],
    mode: "institutions",
    matchNames: ["Bridgewater", "Bridgewater Associates", "Bridgewater Associates, LP"],
  },
  {
    id: "elliott-management",
    name: "Elliott Management",
    slugs: ["elliott-management", "elliott-management-corp", "elliott-investment-management-l-p"],
    mode: "institutions",
    matchNames: ["Elliott Management", "Elliott Investment Management", "ELLIOTT MANAGEMENT CORP"],
  },
  {
    id: "third-point",
    name: "Third Point",
    slugs: ["third-point", "third-point-llc"],
    mode: "institutions",
    matchNames: ["Third Point", "Third Point Management", "Third Point LLC"],
  },
  {
    id: "baupost",
    name: "Baupost",
    slugs: ["baupost", "baupost-group-llc-ma", "the-baupost-group"],
    mode: "institutions",
    matchNames: ["Baupost", "The Baupost Group", "Baupost Group LLC MA", "BAUPOST GROUP LLC/MA"],
  },
  {
    id: "tiger-global",
    name: "Tiger Global",
    slugs: ["tiger-global", "tiger-global-management-llc", "tiger-global-management"],
    mode: "institutions",
    matchNames: ["Tiger Global", "Tiger Global Management", "Tiger Global Management LLC"],
  },
  {
    id: "coatue",
    name: "Coatue",
    slugs: ["coatue", "coatue-management", "coatue-management-llc"],
    mode: "institutions",
    matchNames: ["Coatue", "Coatue Management", "COATUE MANAGEMENT LLC"],
  },
  {
    id: "viking-global",
    name: "Viking Global",
    slugs: [
      "viking-global",
      "viking-global-investors-lp",
      "viking-global-investors-lp-institution-d70de6",
    ],
    mode: "institutions",
    matchNames: ["Viking Global", "Viking Global Investors", "Viking Global Investors LP"],
  },
  {
    id: "lone-pine",
    name: "Lone Pine",
    slugs: ["lone-pine", "lone-pine-capital", "lone-pine-capital-llc"],
    mode: "institutions",
    matchNames: ["Lone Pine", "Lone Pine Capital", "LONE PINE CAPITAL LLC"],
  },
  {
    id: "icahn-capital",
    name: "Icahn Capital",
    slugs: ["icahn-capital", "icahn-carl-c-institution-1589ad", "icahn-carl-c"],
    mode: "institutions",
    matchNames: ["Icahn Capital", "Carl Icahn", "Icahn Carl C", "ICAHN CARL C"],
  },
];

export function allWatchlistSlugs(): string[] {
  return [...new Set(EXPLORE_WATCHLIST_CATALOG.flatMap((e) => e.slugs.map((s) => s.toLowerCase())))];
}

/** When false, pipelines accept any filer (legacy). Default: curated universe only. */
export function trackedUniverseOnly(): boolean {
  return String(process.env.TRACKED_UNIVERSE_ONLY ?? "1").trim() !== "0";
}

export function normalizeTrackedName(raw: string | null | undefined): string {
  return String(raw ?? "")
    .toLowerCase()
    .replace(/^(the\s+)?(honorable|hon\.?|mr\.?|mrs\.?|ms\.?)\s+/i, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const TRACKED_NAME_KEYS = new Set<string>();
const TRACKED_SLUGS = new Set(allWatchlistSlugs());

for (const entry of EXPLORE_WATCHLIST_CATALOG) {
  TRACKED_NAME_KEYS.add(normalizeTrackedName(entry.name));
  for (const n of entry.matchNames) TRACKED_NAME_KEYS.add(normalizeTrackedName(n));
  for (const slug of entry.slugs) {
    TRACKED_NAME_KEYS.add(normalizeTrackedName(slug.replace(/-/g, " ")));
  }
}

export function isTrackedUniverseSlug(slug: string | null | undefined): boolean {
  const s = String(slug ?? "").trim().toLowerCase();
  return Boolean(s) && TRACKED_SLUGS.has(s);
}

/**
 * True when this filer belongs in the curated universe.
 * Also accepts when the normalized name contains a tracked key (SEC "LAST FIRST" forms).
 */
export function isTrackedUniverseName(name: string | null | undefined): boolean {
  const key = normalizeTrackedName(name);
  if (!key) return false;
  if (TRACKED_NAME_KEYS.has(key)) return true;
  // SEC often uses "LAST FIRST MIDDLE" — check if any tracked key is a token subset match.
  for (const tracked of TRACKED_NAME_KEYS) {
    if (tracked.length < 4) continue;
    if (key.includes(tracked) || tracked.includes(key)) return true;
    const trackedParts = tracked.split(" ").filter(Boolean);
    if (trackedParts.length >= 2 && trackedParts.every((p) => key.includes(p))) return true;
  }
  return false;
}

export function shouldIngestFiler(name: string | null | undefined, slug?: string | null): boolean {
  if (!trackedUniverseOnly()) return true;
  if (slug && isTrackedUniverseSlug(slug)) return true;
  return isTrackedUniverseName(name);
}

function nameKeysForEntry(entry: ExploreWatchlistCatalogEntry): string[] {
  const keys = [normalizeTrackedName(entry.name), ...entry.matchNames.map(normalizeTrackedName)];
  for (const slug of entry.slugs) keys.push(normalizeTrackedName(slug.replace(/-/g, " ")));
  return [...new Set(keys.filter(Boolean))];
}

function nameKeyMatchesFiler(filerKey: string, trackedKey: string): boolean {
  if (!filerKey || !trackedKey) return false;
  if (filerKey === trackedKey) return true;
  if (filerKey.includes(trackedKey) || trackedKey.includes(filerKey)) return true;
  const parts = trackedKey.split(" ").filter(Boolean);
  return parts.length >= 2 && parts.every((p) => filerKey.includes(p));
}

/** Map a DB filer identity onto the Explore catalog id used by the frontend. */
export function catalogIdForFiler(slug: string | null | undefined, name?: string | null): string | null {
  const s = String(slug ?? "").trim().toLowerCase();
  if (s) {
    for (const entry of EXPLORE_WATCHLIST_CATALOG) {
      if (entry.id === s || entry.slugs.some((x) => x.toLowerCase() === s)) return entry.id;
      // Institution slugs often append `-institution-<hex>`; accept prefix.
      const bare = s.replace(/-institution-[a-f0-9]+$/i, "");
      if (bare !== s && (entry.id === bare || entry.slugs.some((x) => x.toLowerCase() === bare))) return entry.id;
      if (entry.slugs.some((x) => {
        const a = x.toLowerCase();
        return s === a || s.startsWith(`${a}-`) || a.startsWith(`${s}-`);
      })) return entry.id;
    }
  }
  const key = normalizeTrackedName(name);
  if (!key) return s || null;
  for (const entry of EXPLORE_WATCHLIST_CATALOG) {
    if (nameKeysForEntry(entry).some((tracked) => nameKeyMatchesFiler(key, tracked))) return entry.id;
  }
  return s || null;
}
