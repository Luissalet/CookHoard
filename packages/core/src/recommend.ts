// The fridge recommender. Takes what you have + the month/hemisphere and ranks recipes by
// (1) how much of the recipe you can already make, and (2) Signal B season fit.
// Pure function, fully testable in Node.

import type { Recipe, Hemisphere } from './types';
import { seasonForMonth, dishSeasonFit } from './season';

export interface Weights {
  coverage: number; // reward having a high % of ingredients
  missing: number;  // penalise each missing core ingredient
  season: number;   // weight of Signal B
  rating: number;   // nudge by community rating
}

export const DEFAULT_WEIGHTS: Weights = {
  coverage: 2.0,
  missing: 1.0,
  season: 1.2,
  rating: 0.5,
};

export interface RecommendContext {
  pantry: string[];          // ingredient ids the user has
  month?: number;            // 1..12, defaults to current month
  hemisphere?: Hemisphere;   // defaults 'N'
  staples?: Set<string>;     // assumed on-hand; never count as missing
  weights?: Partial<Weights>;
}

export type Bucket = 'ready' | 'missing1' | 'missing2to3' | 'missingMany';

export type Reason =
  | { kind: 'ready' }
  | { kind: 'missing'; count: number }
  | { kind: 'inSeason' }
  | { kind: 'outSeason' }
  | { kind: 'popular'; rating: number };

export interface Scored {
  recipe: Recipe;
  have: string[];      // core ingredient ids you have (incl. staples)
  missing: string[];   // core ingredient ids you lack
  coverage: number;    // 0..1
  bucket: Bucket;
  seasonFit: number;   // -1..1 (Signal B)
  score: number;
  reasons: Reason[];
}

/** Core ingredients = required (not optional, not explicitly non-core). */
export function coreIngredientIds(r: Recipe): string[] {
  return r.ingredients
    .filter((i) => i.isCore !== false && !i.optional)
    .map((i) => i.ingredientId);
}

export function scoreRecipe(recipe: Recipe, ctx: RecommendContext): Scored {
  const month = ctx.month ?? new Date().getMonth() + 1;
  const hemi = ctx.hemisphere ?? 'N';
  const staples = ctx.staples ?? new Set<string>();
  const w: Weights = { ...DEFAULT_WEIGHTS, ...(ctx.weights ?? {}) };
  const have0 = new Set(ctx.pantry);

  const core = coreIngredientIds(recipe);
  const have: string[] = [];
  const missing: string[] = [];
  for (const id of core) {
    if (have0.has(id) || staples.has(id)) have.push(id);
    else missing.push(id);
  }

  const coverage = core.length ? have.length / core.length : 1;
  const missingCount = missing.length;
  const bucket: Bucket =
    missingCount === 0 ? 'ready' :
    missingCount === 1 ? 'missing1' :
    missingCount <= 3 ? 'missing2to3' : 'missingMany';

  const season = seasonForMonth(month, hemi);
  const seasonFit = dishSeasonFit(recipe, season);

  const ratingNudge = recipe.ratingAvg ? (recipe.ratingAvg - 3) / 2 : 0; // -1..1 around 3★

  const score =
    w.coverage * coverage
    - w.missing * missingCount
    + w.season * seasonFit
    + w.rating * ratingNudge;

  const reasons: Reason[] = [];
  if (bucket === 'ready') reasons.push({ kind: 'ready' });
  else reasons.push({ kind: 'missing', count: missingCount });
  if (seasonFit >= 0.34) reasons.push({ kind: 'inSeason' });
  else if (seasonFit <= -0.34) reasons.push({ kind: 'outSeason' });
  if ((recipe.ratingAvg ?? 0) >= 4.3) reasons.push({ kind: 'popular', rating: recipe.ratingAvg! });

  return { recipe, have, missing, coverage, bucket, seasonFit, score, reasons };
}

/** Rank all recipes for the given fridge/context, best first. */
export function recommend(recipes: Recipe[], ctx: RecommendContext): Scored[] {
  return recipes
    .map((r) => scoreRecipe(r, ctx))
    .sort((a, b) => b.score - a.score);
}
