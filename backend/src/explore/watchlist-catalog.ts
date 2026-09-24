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
    slugs: ["josh-gottheimer"],
    mode: "politicians",
    matchNames: ["Josh Gottheimer", "Joshua Gottheimer"],
  },
  {
    id: "ro-khanna",
    name: "Ro Khanna",
    slugs: ["ro-khanna"],
    mode: "politicians",
    matchNames: ["Ro Khanna", "Rohit Khanna"],
  },
  {
    id: "michael-mccaul",
    name: "Michael McCaul",
    slugs: ["michael-mccaul"],
    mode: "politicians",
    matchNames: ["Michael McCaul", "Michael T. McCaul"],
  },
  {
    id: "gilbert-cisneros",
    name: "Gilbert Cisneros",
    slugs: ["gilbert-cisneros"],
    mode: "politicians",
    matchNames: ["Gilbert Cisneros", "Gilbert R. Cisneros"],
  },
  {
    id: "lisa-mcclain",
    name: "Lisa McClain",
    slugs: ["lisa-mcclain"],
    mode: "politicians",
    matchNames: ["Lisa McClain"],
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
    slugs: ["dan-crenshaw"],
    mode: "politicians",
    matchNames: ["Dan Crenshaw", "Daniel Crenshaw"],
  },
  {
    id: "jefferson-shreve",
    name: "Jefferson Shreve",
    slugs: ["jefferson-shreve"],
    mode: "politicians",
    matchNames: ["Jefferson Shreve"],
  },
  {
    id: "richard-blumenthal",
    name: "Richard Blumenthal",
    slugs: ["richard-blumenthal"],
    mode: "politicians",
    matchNames: ["Richard Blumenthal"],
  },
  {
    id: "marjorie-taylor-greene",
    name: "Marjorie Taylor Greene",
    slugs: ["marjorie-taylor-greene"],
    mode: "politicians",
    matchNames: ["Marjorie Taylor Greene"],
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
    slugs: ["daniel-goldman"],
    mode: "politicians",
    matchNames: ["Daniel Goldman", "Daniel S. Goldman"],
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
    slugs: ["rob-bresnahan"],
    mode: "politicians",
    matchNames: ["Rob Bresnahan", "Robert Bresnahan", "Robert P. Bresnahan"],
  },
  {
    id: "kevin-hern",
    name: "Kevin Hern",
    slugs: ["kevin-hern"],
    mode: "politicians",
    matchNames: ["Kevin Hern"],
  },
  {
    id: "rick-scott",
    name: "Rick Scott",
    slugs: ["rick-scott"],
    mode: "politicians",
    matchNames: ["Rick Scott", "Richard Scott"],
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
    slugs: ["suzan-delbene"],
    mode: "politicians",
    matchNames: ["Suzan DelBene", "Suzan K. DelBene"],
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
    slugs: ["mark-zuckerberg"],
    mode: "insiders",
    matchNames: ["Mark Zuckerberg", "Zuckerberg Mark"],
  },
  {
    id: "larry-ellison",
    name: "Larry Ellison",
    slugs: ["larry-ellison"],
    mode: "insiders",
    matchNames: ["Larry Ellison", "Lawrence J. Ellison", "Ellison Lawrence"],
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
    slugs: ["andy-jassy"],
    mode: "insiders",
    matchNames: ["Andy Jassy", "Andrew Jassy"],
  },
  {
    id: "alex-karp",
    name: "Alex Karp",
    slugs: ["alex-karp"],
    mode: "insiders",
    matchNames: ["Alex Karp", "Alexander Karp"],
  },
  {
    id: "hock-tan",
    name: "Hock Tan",
    slugs: ["hock-tan"],
    mode: "insiders",
    matchNames: ["Hock Tan", "Hock E. Tan"],
  },
  {
    id: "marc-benioff",
    name: "Marc Benioff",
    slugs: ["marc-benioff"],
    mode: "insiders",
    matchNames: ["Marc Benioff"],
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
    slugs: ["mary-barra"],
    mode: "insiders",
    matchNames: ["Mary Barra", "Mary T. Barra"],
  },
  {
    id: "reed-hastings",
    name: "Reed Hastings",
    slugs: ["reed-hastings"],
    mode: "insiders",
    matchNames: ["Reed Hastings", "Wilmot Reed Hastings"],
  },
  {
    id: "colette-kress",
    name: "Colette Kress",
    slugs: ["colette-kress"],
    mode: "insiders",
    matchNames: ["Colette Kress"],
  },
  {
    id: "berkshire-hathaway",
    name: "Berkshire Hathaway",
    slugs: ["berkshire-hathaway"],
    mode: "institutions",
    matchNames: ["Berkshire Hathaway", "Berkshire Hathaway Inc", "Berkshire Hathaway Inc."],
  },
  {
    id: "pershing-square",
    name: "Pershing Square",
    slugs: ["pershing-square"],
    mode: "institutions",
    matchNames: ["Pershing Square", "Pershing Square Capital Management"],
  },
  {
    id: "duquesne-family-office",
    name: "Duquesne Family Office",
    slugs: ["duquesne-family-office"],
    mode: "institutions",
    matchNames: ["Duquesne Family Office"],
  },
  {
    id: "appaloosa",
    name: "Appaloosa",
    slugs: ["appaloosa"],
    mode: "institutions",
    matchNames: ["Appaloosa", "Appaloosa Management"],
  },
  {
    id: "citadel-advisors",
    name: "Citadel Advisors",
    slugs: ["citadel-advisors"],
    mode: "institutions",
    matchNames: ["Citadel Advisors", "Citadel"],
  },
  {
    id: "renaissance-technologies",
    name: "Renaissance Technologies",
    slugs: ["renaissance-technologies"],
    mode: "institutions",
    matchNames: ["Renaissance Technologies"],
  },
  {
    id: "bridgewater",
    name: "Bridgewater",
    slugs: ["bridgewater"],
    mode: "institutions",
    matchNames: ["Bridgewater", "Bridgewater Associates"],
  },
  {
    id: "elliott-management",
    name: "Elliott Management",
    slugs: ["elliott-management"],
    mode: "institutions",
    matchNames: ["Elliott Management", "Elliott Investment Management"],
  },
  {
    id: "third-point",
    name: "Third Point",
    slugs: ["third-point"],
    mode: "institutions",
    matchNames: ["Third Point", "Third Point Management"],
  },
  {
    id: "baupost",
    name: "Baupost",
    slugs: ["baupost"],
    mode: "institutions",
    matchNames: ["Baupost", "The Baupost Group"],
  },
  {
    id: "tiger-global",
    name: "Tiger Global",
    slugs: ["tiger-global"],
    mode: "institutions",
    matchNames: ["Tiger Global", "Tiger Global Management"],
  },
  {
    id: "coatue",
    name: "Coatue",
    slugs: ["coatue"],
    mode: "institutions",
    matchNames: ["Coatue", "Coatue Management"],
  },
  {
    id: "viking-global",
    name: "Viking Global",
    slugs: ["viking-global"],
    mode: "institutions",
    matchNames: ["Viking Global", "Viking Global Investors"],
  },
  {
    id: "lone-pine",
    name: "Lone Pine",
    slugs: ["lone-pine"],
    mode: "institutions",
    matchNames: ["Lone Pine", "Lone Pine Capital"],
  },
  {
    id: "icahn-capital",
    name: "Icahn Capital",
    slugs: ["icahn-capital"],
    mode: "institutions",
    matchNames: ["Icahn Capital", "Carl Icahn"],
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
