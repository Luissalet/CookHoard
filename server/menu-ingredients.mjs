// Quantities belong to a recipe's complete yield; units remain exactly as authored.
export function menuIngredients(menu, recipes, pantryIds, selectedDays) {
  const required = new Map();
  const optional = new Map();
  const days = [];
  for (const [index, day] of menu.days.entries()) {
    if (selectedDays && !selectedDays.includes(index + 1)) continue;
    const recipe = recipes.find((item) => item.id === day.recipeId);
    if (!recipe) throw new Error(`Receta no encontrada para el día ${index + 1}.`);
    const hasBase = Number.isFinite(recipe.servings) && recipe.servings > 0;
    if (day.servings != null && (!Number.isFinite(day.servings) || day.servings <= 0 || !hasBase)) {
      throw new Error(`No se pueden escalar las raciones del día ${index + 1}: revisa las raciones base de la receta y las del menú.`);
    }
    const factor = day.servings == null ? 1 : day.servings / recipe.servings;
    days.push({ day: index + 1, recipe_id: recipe.id, title: recipe.title,
      base_servings: hasBase ? recipe.servings : null,
      servings: day.servings ?? (hasBase ? recipe.servings : null), factor });
    for (const ingredient of recipe.ingredients) {
      const groups = ingredient.optional ? optional : required;
      const unit = ingredient.unit || null;
      const key = JSON.stringify([ingredient.ingredientId, unit]);
      if (!groups.has(key)) groups.set(key, { ingredient_id: ingredient.ingredientId, unit,
        quantity: 0, known_quantity: 0, unknown_quantity_count: 0,
        pantry_present: pantryIds.includes(ingredient.ingredientId), contributions: [] });
      const group = groups.get(key);
      const quantity = Number.isFinite(ingredient.quantity) && ingredient.quantity > 0
        ? ingredient.quantity * factor : null;
      if (quantity === null) group.unknown_quantity_count++;
      else group.known_quantity += quantity;
      group.quantity = group.unknown_quantity_count ? null : group.known_quantity;
      group.contributions.push({ day: index + 1, recipe_id: recipe.id, quantity,
        original_quantity: ingredient.quantity ?? null, factor, note: ingredient.note ?? null });
    }
  }
  return { days, required: [...required.values()], optional: [...optional.values()],
    notes: ['quantity es la demanda total del menú antes de descontar despensa; los opcionales se calculan aparte y los ingredientes no principales se incluyen.',
      'Las demandas conservan sus unidades. quantity null indica cantidades desconocidas; known_quantity es solo el subtotal conocido.'] };
}

const unitScale = (unit) => {
  if (unit === 'g') return { family: 'mass', factor: 1 };
  if (unit === 'kg') return { family: 'mass', factor: 1000 };
  if (unit === 'ml') return { family: 'volume', factor: 1 };
  if (unit === 'L') return { family: 'volume', factor: 1000 };
  return unit ? { family: `exact:${unit}`, factor: 1 } : null;
};

/** Allocate known pantry stock to required ingredients first, then optional ones. */
export function addStockCoverage(result, shopping, staples) {
  const items = new Map(shopping.map((item) => [item.ingredientId, item]));
  const remaining = new Map();
  for (const group of [...result.required, ...result.optional]) {
    const item = items.get(group.ingredient_id);
    const stock = item?.checked ? unitScale(item.unit) : null;
    const demand = unitScale(group.unit);
    const explicitDepleted = item && !item.checked;
    let status;
    let covered = null;
    let toBuy = null;
    if (group.quantity === null) {
      status = 'unknown_required_quantity';
      remaining.set(group.ingredient_id, null);
    } else if (!item?.checked && staples.has(group.ingredient_id) && !explicitDepleted) {
      status = 'assumed_staple';
    } else if (!item?.checked) {
      status = 'to_buy';
      covered = 0;
      toBuy = group.quantity;
    } else if (!Number.isFinite(item.qty) || item.qty <= 0 || !stock || !demand || stock.family !== demand.family) {
      status = 'check_stock';
    } else {
      if (!remaining.has(group.ingredient_id)) remaining.set(group.ingredient_id, item.qty * stock.factor);
      const available = remaining.get(group.ingredient_id);
      if (available === null) {
        status = 'check_stock';
      } else {
        const used = Math.min(group.quantity * demand.factor, available);
        remaining.set(group.ingredient_id, available - used);
        covered = used / demand.factor;
        toBuy = Math.max(0, (group.quantity * demand.factor - used) / demand.factor);
        status = toBuy > 0 ? 'to_buy' : 'covered';
      }
    }
    group.stock_status = status;
    group.covered_quantity = covered;
    group.to_buy_quantity = toBuy;
  }
  result.notes.push('covered_quantity son existencias asignadas; to_buy_quantity es el déficit exacto cuando se conocen cantidades y las unidades son compatibles. Los ingredientes obligatorios consumen existencias antes que los opcionales.');
  return result;
}
