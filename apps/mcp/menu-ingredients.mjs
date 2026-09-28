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
    notes: ['Las cantidades son necesidades totales del menú, no una lista de compra.',
      'Los opcionales se calculan aparte; los ingredientes no principales sí se incluyen en required.',
      'No se convierten unidades. Un total null indica cantidades desconocidas; known_quantity es solo el subtotal conocido.',
      'pantry_present solo indica presencia en la nevera: no garantiza cantidad suficiente ni se descuenta del total.'] };
}
