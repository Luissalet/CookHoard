// Signal B — "las lentejas no entran en verano".
// The season fit of a dish comes from the CHARACTER of the plate (temperature + heaviness),
// optionally reinforced by an explicit seasonAffinity the author set, matched against the
// current season (derived from month + hemisphere). No produce-seasonality tables needed:
// the signal is self-contained in the recipe's own tags.

import type { Hemisphere, Season, Recipe } from './types';

/** Month (1–12) + hemisphere → meteorological season. */
export function seasonForMonth(month: number, hemi: Hemisphere = 'N'): Season {
  const north: Season =
    month === 12 || month <= 2 ? 'winter' :
    month <= 5 ? 'spring' :
    month <= 8 ? 'summer' : 'autumn';
  if (hemi === 'N') return north;
  const flip: Record<Season, Season> = {
    winter: 'summer', summer: 'winter', spring: 'autumn', autumn: 'spring',
  };
  return flip[north];
}

/**
 * How much a HOT / HEARTY dish is wanted in a given season.
 * 0 = the season wants cold & light (peak summer); 1 = wants hot & hearty (deep winter).
 */
const seasonWarmth: Record<Season, number> = {
  summer: 0.0,
  spring: 0.4,
  autumn: 0.6,
  winter: 1.0,
};

/** Map a dish's own character to a 0..1 "warmth": 0 = cold & light, 1 = hot & hearty. */
export function dishWarmth(recipe: Recipe): number {
  const temp = recipe.temperature === 'hot' ? 1 : recipe.temperature === 'cold' ? 0 : 0.5;
  const heavy = recipe.heaviness ? (recipe.heaviness - 1) / 2 : 0.5; // 1→0, 2→0.5, 3→1
  return temp * 0.6 + heavy * 0.4;
}

/**
 * Signal B, in [-1, 1]. +1 = strongly in season, -1 = strongly out of season.
 * Blends the explicit seasonAffinity (if set) with the implicit character fit.
 */
export function dishSeasonFit(recipe: Recipe, season: Season): number {
  let score = 0;
  let weight = 0;

  // Explicit author signal (strong). Empty/undefined = "all year", contributes nothing.
  if (recipe.seasonAffinity && recipe.seasonAffinity.length) {
    score += (recipe.seasonAffinity.includes(season) ? 1 : -1);
    weight += 1;
  }

  // Implicit signal from the plate's character vs what the season wants.
  const want = seasonWarmth[season];        // 0 (summer) .. 1 (winter)
  const warm = dishWarmth(recipe);          // 0 (cold&light) .. 1 (hot&hearty)
  const charFit = 1 - 2 * Math.abs(warm - want); // matched → +1, opposite → -1
  score += charFit;
  weight += 1;

  return weight ? score / weight : 0;
}
