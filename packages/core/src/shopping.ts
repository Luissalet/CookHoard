// Unified pantry/shopping list. A single list of ingredient items where `checked` means
// "I have this" (it's in the fridge/pantry and counts for recipe matching); unchecked means
// "I need to buy it". The Fridge tab shows the checked items, the Shopping list the unchecked
// ones. As you use something up, you uncheck it and it reappears on the shopping list.
import type { Recipe } from './types';
import { coreIngredientIds } from './recommend';

// Quantity units offered in the manual add UI.
export type ShopUnit = 'ud' | 'L' | 'kg' | 'g' | 'ml' | 'ración';
export const SHOP_UNITS: ShopUnit[] = ['ud', 'L', 'kg', 'g', 'ml', 'ración'];

export interface ShoppingItem {
  ingredientId: string;   // canonical dictionary id, or a free-text slug for custom items
  fromRecipes: string[];  // recipe ids that need it (empty for manually added items)
  name?: string;          // custom label for free-text items not in the dictionary
  qty?: number;           // optional amount
  unit?: ShopUnit;        // optional unit for the amount
  checked?: boolean;      // true = you have it (in the fridge); false/undefined = to buy
}

/** Build a manual item (free-text or resolved dictionary id). */
export function manualShoppingItem(
  ingredientId: string,
  opts: { name?: string; qty?: number; unit?: ShopUnit; checked?: boolean } = {},
): ShoppingItem {
  return {
    ingredientId,
    fromRecipes: [],
    name: opts.name,
    qty: opts.qty,
    unit: opts.unit,
    checked: opts.checked ?? false,
  };
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
