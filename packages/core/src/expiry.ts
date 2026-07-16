// "Use it up": surface pantry items about to expire and recipes that use them, so nothing is wasted.
import type { Recipe, PantryItem, Hemisphere } from './types';
import { recommend, type Scored } from './recommend';

export function expiringSoon(pantry: PantryItem[], withinDays = 3, today = new Date()): PantryItem[] {
  const limit = today.getTime() + withinDays * 86_400_000;
  return pantry.filter((p) => p.expiresAt && new Date(p.expiresAt).getTime() <= limit);
}

/** Recipes that use the expiring ingredients, ranked so the most-used-up come first. */
export function useItUp(
  recipes: Recipe[],
  expiringIds: string[],
  ctx: { pantry: string[]; month?: number; hemisphere?: Hemisphere; staples?: Set<string> },
): Scored[] {
  const expiring = new Set(expiringIds);
  const uses = (r: Recipe) => r.ingredients.filter((i) => expiring.has(i.ingredientId)).length;
  return recommend(recipes, ctx)
    .filter((s) => uses(s.recipe) > 0)
    .sort((a, b) => uses(b.recipe) - uses(a.recipe) || b.score - a.score);
}
