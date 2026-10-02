// Small helpers the importers share.
import { getSettings } from '@cookhoard/core';
import { recipeSummary } from '../tools/common.mjs';

export { getSettings };

/** The already saved recipe that came from this link, as a summary, or null. */
export function recipeSummaryByUrl(state, url) {
  const found = state.recipes.find((recipe) => recipe.sourceUrl === url || recipe.source?.url === url);
  return found ? { ...recipeSummary(found, state), steps: found.steps } : null;
}
