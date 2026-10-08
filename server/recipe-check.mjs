// One recipe's demand, using the same scaling and stock allocation as the weekly menu.
import { DEFAULT_STAPLES } from '@cookhoard/core';
import { menuIngredients, addStockCoverage } from './menu-ingredients.mjs';
import { nameOf, pantryIds } from './tools/common.mjs';

export function recipeCheck(state, recipe, servings) {
  const day = { recipeId: recipe.id, ...(servings !== undefined ? { servings } : {}) };
  const result = menuIngredients({ days: [day] }, [recipe], pantryIds(state));
  addStockCoverage(result, state.shopping, DEFAULT_STAPLES);
  for (const group of [...result.required, ...result.optional]) group.name = nameOf(state, group.ingredient_id);
  const shortages = result.required.filter((g) => g.to_buy_quantity > 0);
  const uncertain = result.required.filter((g) => g.stock_status !== 'covered' && !(g.to_buy_quantity > 0));
  const { base_servings, servings: target, factor } = result.days[0];
  return { recipe_id: recipe.id, title: recipe.title, base_servings, servings: target, factor,
    stock_sufficient: shortages.length ? false : uncertain.length ? null : true,
    required: result.required, optional: result.optional,
    missing: shortages.map((g) => ({ ingredient_id: g.ingredient_id, name: g.name, quantity: g.to_buy_quantity, unit: g.unit })),
    needs_check: uncertain.map((g) => ({ ingredient_id: g.ingredient_id, name: g.name, reason: g.stock_status })),
    notes: [...result.notes, 'stock_sufficient solo comprueba cantidades obligatorias: true confirmado, false déficit conocido, null datos insuficientes. Los básicos supuestos no son existencias confirmadas. No comprueba caducidad ni consume existencias.'] };
}
