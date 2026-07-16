// Shopping list = the union of missing core ingredients across chosen recipes, given the pantry.
import type { Recipe } from './types';
import { coreIngredientIds } from './recommend';

export interface ShoppingItem {
  ingredientId: string;
  fromRecipes: string[]; // recipe ids that need it
  checked?: boolean;
}

/** Build a shopping list from recipes, excluding what you already have (pantry + staples). */
export function buildShoppingList(recipes: Recipe[], have: Set<string>): ShoppingItem[] {
  const map = new Map<string, string[]>();
  for (const r of recipes) {
    for (const id of coreIngredientIds(r)) {
      if (have.has(id)) continue;
      const arr = map.get(id) ?? [];
      arr.push(r.id);
      map.set(id, arr);
    }
  }
  return [...map.entries()].map(([ingredientId, fromRecipes]) => ({ ingredientId, fromRecipes }));
}

/** Merge new items into an existing list, keeping checked state and de-duping. */
export function mergeShopping(existing: ShoppingItem[], incoming: ShoppingItem[]): ShoppingItem[] {
  const byId = new Map(existing.map((i) => [i.ingredientId, { ...i }]));
  for (const inc of incoming) {
    const cur = byId.get(inc.ingredientId);
    if (cur) cur.fromRecipes = [...new Set([...cur.fromRecipes, ...inc.fromRecipes])];
    else byId.set(inc.ingredientId, { ...inc });
  }
  return [...byId.values()];
}
