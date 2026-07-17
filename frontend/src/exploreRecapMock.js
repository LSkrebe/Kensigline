/**
 * Offline Explore daily recap — catalog-driven mock evaluation.
 * Live backend can later replace buildExploreRecapMockDay() with API data
 * while keeping evaluateExploreRecap() + slide UI.
 */

import { evaluateExploreRecap } from './exploreRecapEvaluate.js'
import { buildExploreRecapMockDay } from './exploreRecapMockDay.js'

/** @returns {{ slides: import('./exploreRecapEvaluate.js').RecapSlide[] }} */
export function buildExploreDailyRecap() {
  const day = buildExploreRecapMockDay()
  return evaluateExploreRecap(day)
}
