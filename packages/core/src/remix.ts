// Remixes: lineage for recipes. A remix is a full recipe that points to its
// base via `remixOf`. Pure helpers: lineage walking, descendant counting, and a structural diff
// ("what did this remix change?") used by the recipe page. No UI here; fully testable in Node.

import type { Recipe, RecipeIngredient } from './types';

/** Direct remixes (children) of a recipe, newest first. */
export function remixesOf(recipes: Recipe[], id: string): Recipe[] {
  return recipes
    .filter((r) => r.remixOf === id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Ancestors of a recipe, nearest first (parent, grandparent…). Cycle-safe. */
export function remixLineage(recipes: Recipe[], recipe: Recipe): Recipe[] {
  const byId = new Map(recipes.map((r) => [r.id, r]));
  const out: Recipe[] = [];
  const seen = new Set<string>([recipe.id]);
  let cur = recipe.remixOf ? byId.get(recipe.remixOf) : undefined;
  while (cur && !seen.has(cur.id)) {
    out.push(cur);
    seen.add(cur.id);
    cur = cur.remixOf ? byId.get(cur.remixOf) : undefined;
  }
  return out;
}

/** All descendants (remixes of remixes…) of a recipe. Cycle-safe. */
export function remixFamily(recipes: Recipe[], id: string): Recipe[] {
  const out: Recipe[] = [];
  const seen = new Set<string>([id]);
  let frontier = [id];
  while (frontier.length) {
    const next: string[] = [];
    for (const r of recipes) {
      if (r.remixOf && frontier.includes(r.remixOf) && !seen.has(r.id)) {
        seen.add(r.id);
        out.push(r);
        next.push(r.id);
      }
    }
    frontier = next;
  }
  return out;
}

export interface IngredientChange {
  ingredientId: string;
  base: RecipeIngredient;
  remix: RecipeIngredient;
}

export interface RecipeDiff {
  addedIngredients: RecipeIngredient[];    // in the remix, not in the base
  removedIngredients: RecipeIngredient[];  // in the base, not in the remix
  changedIngredients: IngredientChange[];  // same ingredient, different qty/unit/optional
  addedSteps: string[];
  removedSteps: string[];
  /** true when nothing differs (a straight copy). */
  identical: boolean;
}

const sameAmount = (a: RecipeIngredient, b: RecipeIngredient) =>
  (a.quantity ?? null) === (b.quantity ?? null) &&
  (a.unit ?? '') === (b.unit ?? '') &&
  !!a.optional === !!b.optional;

const normStep = (s: string) => s.trim().toLowerCase();

/** Structural diff between a base recipe and its remix. */
export function diffRecipes(base: Recipe, remix: Recipe): RecipeDiff {
  const baseIngs = new Map(base.ingredients.map((i) => [i.ingredientId, i]));
  const remixIngs = new Map(remix.ingredients.map((i) => [i.ingredientId, i]));

  const addedIngredients: RecipeIngredient[] = [];
  const changedIngredients: IngredientChange[] = [];
  for (const [id, ri] of remixIngs) {
    const b = baseIngs.get(id);
    if (!b) addedIngredients.push(ri);
    else if (!sameAmount(b, ri)) changedIngredients.push({ ingredientId: id, base: b, remix: ri });
  }
  const removedIngredients = [...baseIngs.values()].filter((i) => !remixIngs.has(i.ingredientId));

  const baseSteps = new Set(base.steps.map((s) => normStep(s.text)));
  const remixSteps = new Set(remix.steps.map((s) => normStep(s.text)));
  const addedSteps = remix.steps.map((s) => s.text).filter((t) => !baseSteps.has(normStep(t)));
  const removedSteps = base.steps.map((s) => s.text).filter((t) => !remixSteps.has(normStep(t)));

  const identical =
    addedIngredients.length === 0 && removedIngredients.length === 0 &&
    changedIngredients.length === 0 && addedSteps.length === 0 && removedSteps.length === 0;

  return { addedIngredients, removedIngredients, changedIngredients, addedSteps, removedSteps, identical };
}
