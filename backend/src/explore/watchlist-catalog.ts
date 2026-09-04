/** Curated explore watchlist — slug aliases must match production filers.slug values. */
export type ExploreWatchlistCatalogEntry = {
  id: string;
  name: string;
  slugs: string[];
  mode: "politicians" | "institutions" | "insiders";
};

/** Default watchlist — all entries verified against production filer coverage. */
export const EXPLORE_WATCHLIST_CATALOG: ExploreWatchlistCatalogEntry[] = [
  {
    id: "nancy-pelosi",
    name: "Nancy Pelosi",
    slugs: ["nancy-pelosi", "hon-nancy-pelosi", "the-honorable-nancy-pelosi"],
    mode: "politicians",
  },
  {
    id: "tommy-tuberville",
    name: "Tommy Tuberville",
    slugs: ["tommy-tuberville", "mr-thomas-h-tuberville", "thomas-tuberville"],
    mode: "politicians",
  },
  {
    id: "markwayne-mullin",
    name: "Markwayne Mullin",
    slugs: ["markwayne-mullin", "the-honorable-markwayne-mullin"],
    mode: "politicians",
  },
  {
    id: "sheldon-whitehouse",
    name: "Sheldon Whitehouse",
    slugs: ["sheldon-whitehouse", "the-honorable-sheldon-whitehouse"],
    mode: "politicians",
  },
  {
    id: "john-boozman",
    name: "John Boozman",
    slugs: ["john-boozman", "the-honorable-john-boozman"],
    mode: "politicians",
  },
  {
    id: "byron-donalds",
    name: "Byron Donalds",
    slugs: ["byron-donalds", "hon-byron-donalds"],
    mode: "politicians",
  },
  {
    id: "jensen-huang",
    name: "Jensen Huang",
    slugs: ["jensen-huang", "huang-jen-hsun"],
    mode: "insiders",
  },
  {
    id: "tim-cook",
    name: "Tim Cook",
    slugs: ["tim-cook", "cook-timothy-d"],
    mode: "insiders",
  },
  {
    id: "lisa-su",
    name: "Lisa Su",
    slugs: ["lisa-su", "su-lisa-t"],
    mode: "insiders",
  },
  {
    id: "vanguard",
    name: "Vanguard Group",
    slugs: [
      "vanguard-group",
      "vanguard",
      "vanguard-capital-management",
      "vanguard-asset-management",
      "vanguard-global-advisers-llc",
      "vanguard-portfolio-management",
    ],
    mode: "institutions",
  },
  {
    id: "blackrock",
    name: "BlackRock",
    slugs: ["blackrock", "cik-2012383"],
    mode: "institutions",
  },
  {
    id: "renaissance-technologies",
    name: "Renaissance Technologies",
    slugs: ["renaissance-technologies"],
    mode: "institutions",
  },
];

export function allWatchlistSlugs(): string[] {
  return [...new Set(EXPLORE_WATCHLIST_CATALOG.flatMap((e) => e.slugs.map((s) => s.toLowerCase())))];
}
