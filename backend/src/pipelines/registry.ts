/**
 * Pipeline registry — maps frontend tabs/modes to queue source types and feed_kind.
 * Parse/enqueue implementations live next to each mode under `research/` or `investigate/`.
 */
export const QUEUE_SOURCES = {
  researchMarket: [
    "research_sec",
    "research_press_rss",
    "research_transcript_rss",
    "research_gov_contract",
    "bosha_sec",
    "bosha_press_rss",
    "bosha_transcript_rss",
    "bosha_gov_contract",
  ],
  researchClinical: ["sec_pharma_filing", "sec_filing"],
  investigateInsider: ["sec_form4", "sec_form3", "sec_form5"],
  investigatePoliticians: ["house_ptr", "senate_ptr"],
  investigateInstitutions: ["sec_13f"],
} as const;

export const FEED_KIND = {
  research: "research",
  pharma: "pharma",
  insider: "insider",
  politicians: "politicians",
  institutions: "institutions",
} as const;
