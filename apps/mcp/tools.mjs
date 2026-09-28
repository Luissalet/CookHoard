import { z } from 'zod';
import crypto from 'node:crypto';
import {
  SEED_RECIPES, INGREDIENT_BY_ID, DEFAULT_STAPLES, recommend, planWeek,
  menuWeekKey, replaceMenuDay, buildShoppingList, mergeShopping,
  manualShoppingItem, resolveIngredient, estimateRecipeNutrition,
  expiringSoon, useItUp, computeBadges, parseJsonLdRecipe, findJsonLdRecipe,
} from '@cookhoard/core';
import { readKitchen, updateKitchen, normalizeKitchen } from './store.mjs';
import { menuIngredients, addStockCoverage } from './menu-ingredients.mjs';
import { fetchRecipeFromUrl } from './import-url.mjs';

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (message) => { throw new Error(message); };
const pantry = (state) => state.shopping.filter((item) => item.checked).map((item) => item.ingredientId);
const recipes = (state) => [...state.recipes, ...SEED_RECIPES];
const nameOf = (id) => INGREDIENT_BY_ID[id]?.name || id;
const recipeSummary = (recipe) => ({ id: recipe.id, title: recipe.title, description: recipe.description,
  cuisine: recipe.cuisine, prepMin: recipe.prepMin, cookMin: recipe.cookMin,
  servings: recipe.servings, difficulty: recipe.difficulty, temperature: recipe.temperature,
  heaviness: recipe.heaviness, seasonAffinity: recipe.seasonAffinity,
  dietFlags: recipe.dietFlags, allergens: recipe.allergens, image: recipe.image,
  remixOf: recipe.remixOf, sourceUrl: recipe.sourceUrl,
  ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, name: nameOf(ingredient.ingredientId) })) });
const freshMenu = (state) => state.menu?.week === menuWeekKey() ? state.menu.plan : null;
const ingredientInput = z.union([z.string().trim().min(1).max(100), z.object({
  name: z.string().trim().min(1).max(100), quantity: z.number().positive().optional(),
  unit: z.string().trim().max(30).optional(), optional: z.boolean().optional(),
  isCore: z.boolean().optional(), note: z.string().max(200).optional(),
})]);
const stepInput = z.union([z.string().trim().min(1).max(1000), z.object({
  text: z.string().trim().min(1).max(1000), timerSec: z.number().int().min(1).max(86400).optional(),
})]);
const recipeFields = {
  title: z.string().trim().min(1).max(120), description: z.string().max(1000).default(''),
  ingredients: z.array(ingredientInput).min(1).max(50), steps: z.array(stepInput).min(1).max(50),
  cuisine: z.string().trim().max(80).optional(),
  season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
  temperature: z.enum(['hot', 'cold', 'room']).optional(), heaviness: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
  servings: z.number().int().positive().optional(), prepMin: z.number().int().min(0).optional(),
  cookMin: z.number().int().min(0).optional(), dietFlags: z.array(z.string()).max(20).optional(),
  allergens: z.array(z.string()).max(20).optional(), image: z.string().max(2000).optional(),
};
const mapIngredient = (value) => {
  const input = typeof value === 'string' ? { name: value } : value;
  return { ingredientId: resolveIngredient(input.name) || input.name.toLowerCase().replace(/\s+/g, '_'),
    quantity: input.quantity, unit: input.unit, optional: input.optional, isCore: input.isCore,
    note: input.note || input.name };
};
const mapStep = (value) => typeof value === 'string' ? { text: value } : value;
const recipeData = (input) => ({ title: input.title, description: input.description,
  ingredients: input.ingredients.map(mapIngredient), steps: input.steps.map(mapStep), cuisine: input.cuisine,
  seasonAffinity: input.season ? [input.season] : [], temperature: input.temperature,
  heaviness: input.heaviness, difficulty: input.difficulty, servings: input.servings,
  prepMin: input.prepMin, cookMin: input.cookMin, dietFlags: input.dietFlags,
  allergens: input.allergens, image: input.image });

export const INSTRUCTIONS = 'CookHoard is a local cooking assistant. The checked shopping items are ingredients already in the fridge; unchecked items are still to buy. A weekly menu is saved for the current local week. Search or recommend before planning. Never claim a recipe was saved, a day changed or an ingredient added unless the tool returned the updated state. All data stays on this computer.';

export const TOOLS = [
  { name: 'kitchen_state', description: 'Read the local fridge, shopping list and saved menu for this week. Sinónimos: nevera, compra, menú, cocina, estado',
    schema: z.object({}), readOnly: true, run: () => {
      const state = readKitchen();
      return { week: menuWeekKey(), menu: freshMenu(state), recipe_count: recipes(state).length,
        own_recipe_count: state.recipes.length, cooked_count: state.makes.length,
        saved_recipe_ids: state.savedIds,
        shopping: state.shopping.map((item) => ({ ...item, name: item.name || nameOf(item.ingredientId), expiresAt: state.pantryExpiry[item.ingredientId] || null })),
        pantry: pantry(state).map((id) => ({ id, name: nameOf(id), expiresAt: state.pantryExpiry[id] || null })) };
    } },
  { name: 'find_recipes', description: 'Search local recipes by title, description, cuisine or ingredient. Sinónimos: recetas, buscar plato, cocinar, ingredientes',
    schema: z.object({ query: z.string().default(''), limit: z.number().int().min(1).max(30).default(10) }), readOnly: true, run: ({ query, limit }) => {
      const needle = query.trim().toLocaleLowerCase();
      return { recipes: recipes(readKitchen()).filter((recipe) => !needle || [recipe.title, recipe.description || '', recipe.cuisine || '',
        ...recipe.ingredients.map((i) => nameOf(i.ingredientId))].some((part) => part.toLocaleLowerCase().includes(needle)))
        .slice(0, limit).map(recipeSummary) };
    } },
  { name: 'get_recipe', description: 'Read a local recipe with its ingredients and cooking steps. Sinónimos: receta completa, pasos, cómo cocinar',
    schema: z.object({ recipe_id: z.string().min(1) }), readOnly: true, run: ({ recipe_id }) => {
      const recipe = recipes(readKitchen()).find((r) => r.id === recipe_id) || fail('Receta no encontrada.');
      const state = readKitchen();
      return { ...recipeSummary(recipe), steps: recipe.steps, saved: state.savedIds.includes(recipe.id),
        nutrition_per_serving: estimateRecipeNutrition(recipe),
        cooking_history: state.makes.filter((make) => make.recipeId === recipe.id) };
    } },
  { name: 'save_recipe', description: 'Save a personal local recipe with ingredients and cooking steps for future recommendations and menus. Sinónimos: guardar receta, crear plato, receta propia',
    schema: z.object(recipeFields),
    run: (input) => {
      const state = updateKitchen((current) => {
        const recipe = { id: `local-${crypto.randomUUID()}`, authorId: 'local',
          ...recipeData(input), createdAt: new Date().toISOString() };
        current.recipes.push(recipe);
        return current;
      });
      return { recipe: recipeSummary(state.recipes.at(-1)), steps: state.recipes.at(-1).steps };
    } },
  { name: 'recommend_recipes', description: 'Rank local recipes for the current fridge and season. Sinónimos: qué puedo cocinar, recomendar recetas, aprovechar nevera',
    schema: z.object({ month: z.number().int().min(1).max(12).optional(), hemisphere: z.enum(['N', 'S']).default('N'), limit: z.number().int().min(1).max(20).default(8) }), readOnly: true,
    run: ({ month, hemisphere, limit }) => { const state = readKitchen(); return { recipes: recommend(recipes(state), { pantry: pantry(state), month, hemisphere, staples: DEFAULT_STAPLES })
      .slice(0, limit).map((item) => ({ recipe: recipeSummary(item.recipe), bucket: item.bucket, score: item.score,
        have: item.have.map(nameOf), missing: item.missing.map(nameOf), reasons: item.reasons })) }; } },
  { name: 'plan_week', description: 'Save a seven-day menu using local recipes, season and fridge. Replaces this week’s menu. Sinónimos: planificar menú, menú semanal',
    schema: z.object({ month: z.number().int().min(1).max(12).optional(), hemisphere: z.enum(['N', 'S']).default('N') }),
    run: ({ month, hemisphere }) => {
      const state = updateKitchen((current) => {
        current.menu = { week: menuWeekKey(), plan: planWeek(recipes(current), { month, hemisphere, pantry: pantry(current), staples: DEFAULT_STAPLES }) };
        return current;
      });
      return { week: state.menu.week, menu: state.menu.plan };
    } },
  { name: 'change_menu_day', description: 'Change one day’s recipe without altering the other six. Sinónimos: cambiar un día, sustituir receta, variar menú',
    schema: z.object({ day: z.number().int().min(1).max(7) }), run: ({ day }) => {
      const state = updateKitchen((current) => {
        const plan = freshMenu(current) || fail('No hay un menú guardado para esta semana.');
        const next = replaceMenuDay(plan, recipes(current), day - 1);
        if (next === plan) fail('No hay otra receta disponible para ese día.');
        current.menu = { week: menuWeekKey(), plan: next };
        return current;
      });
      return { week: state.menu.week, menu: state.menu.plan };
    } },
  { name: 'set_menu_day', description: 'Choose a recipe and target servings for one day of the saved current weekly menu. Day 1 is Monday. Omit servings to use the original recipe yield; an explicit target needs known recipe servings. Sinónimos: elegir plato, raciones, personas, corregir menú',
    schema: z.object({ day: z.number().int().min(1).max(7), recipe_id: z.string().min(1), servings: z.number().int().positive().optional() }),
    run: ({ day, recipe_id, servings }) => {
      const state = updateKitchen((current) => {
        const plan = freshMenu(current) || fail('No hay un menú guardado para esta semana. Usa plan_week primero.');
        const recipe = recipes(current).find((item) => item.id === recipe_id) || fail('Receta no encontrada.');
        if (!plan.days[day - 1]) fail('Ese día no existe en el menú guardado.');
        if (servings !== undefined && !(Number.isFinite(recipe.servings) && recipe.servings > 0)) {
          fail('La receta no tiene raciones base conocidas. Añade sus raciones con update_recipe antes de escalar.');
        }
        plan.days[day - 1] = { ...plan.days[day - 1], recipeId: recipe.id, title: recipe.title };
        delete plan.days[day - 1].servings;
        if (servings !== undefined) plan.days[day - 1].servings = servings;
        return current;
      });
      return { week: state.menu.week, menu: state.menu.plan };
    } },
  { name: 'menu_ingredients', description: 'Calculate menu quantities and exact shopping deficits from known pantry stock. Optional days selects Monday=1 through Sunday=7. Scales servings; converts g/kg and ml/L, and marks unknown or incompatible stock for checking. Read-only. Sinónimos: cantidades menú, cuánto falta comprar, raciones, calcular compra',
    schema: z.object({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional() }), readOnly: true,
    run: ({ days }) => {
      const state = readKitchen();
      const plan = freshMenu(state) || fail('No hay un menú guardado para esta semana.');
      if (days?.some((day) => !plan.days[day - 1])) fail('Ese día no existe en el menú guardado.');
      const result = menuIngredients(plan, recipes(state), pantry(state), days);
      for (const group of [...result.required, ...result.optional]) {
        group.name = nameOf(group.ingredient_id);
        const listed = state.shopping.some((item) => item.ingredientId === group.ingredient_id);
        group.shopping_status = group.pantry_present ? 'check_stock'
          : DEFAULT_STAPLES.has(group.ingredient_id) && !listed ? 'assumed_staple' : 'to_buy';
      }
      result.notes.push('shopping_status: to_buy falta (también si un básico se marca agotado); check_stock exige comprobar la cantidad; assumed_staple se supone disponible sin inventario confirmado.');
      addStockCoverage(result, state.shopping, DEFAULT_STAPLES);
      return { week: state.menu.week, ...result };
    } },
  { name: 'add_menu_missing', description: 'Add missing ingredients from this week’s menu to the shopping list, without duplicates. Sinónimos: comprar lo que falta, ingredientes del menú',
    schema: z.object({}), run: () => {
      const state = updateKitchen((current) => {
        const menu = freshMenu(current) || fail('No hay un menú guardado para esta semana.');
        const chosen = menu.days.map((day) => recipes(current).find((r) => r.id === day.recipeId)).filter(Boolean);
        current.shopping = mergeShopping(current.shopping, buildShoppingList(chosen, new Set([...pantry(current), ...DEFAULT_STAPLES])));
        return current;
      });
      return { shopping: state.shopping };
    } },
  { name: 'add_kitchen_item', description: 'Create an ingredient item in the shopping list or fridge. Use this when the item is missing. Checked means already have it. Sinónimos: añadir compra, meter en nevera, comprar ingrediente',
    schema: z.object({ name: z.string().trim().min(1).max(100), checked: z.boolean().default(false), qty: z.number().positive().optional(), unit: z.enum(['ud', 'L', 'kg']).optional() }),
    run: ({ name, checked, qty, unit }) => {
      const id = resolveIngredient(name) || fail('Ingrediente no reconocido.');
      const state = updateKitchen((current) => {
        current.shopping = mergeShopping(current.shopping, [manualShoppingItem(id, { name: INGREDIENT_BY_ID[id] ? undefined : name, checked, qty, unit })]);
        current.shopping = current.shopping.map((item) => item.ingredientId === id ? { ...item,
          checked: checked || !!item.checked, qty: qty ?? item.qty, unit: unit ?? item.unit,
          name: item.name || (INGREDIENT_BY_ID[id] ? undefined : name) } : item);
        return current;
      });
      return { item: state.shopping.find((item) => item.ingredientId === id), shopping: state.shopping };
    } },
  { name: 'set_kitchen_item', description: 'Update an existing ingredient: availability, known stock quantity or unit. For a new item use add_kitchen_item. Sinónimos: ya tengo, marcar comprado, corregir cantidad, existencias, se ha agotado',
    schema: z.object({ ingredient_id: z.string().min(1), checked: z.boolean().optional(),
      qty: z.number().positive().optional(), unit: z.enum(['ud', 'L', 'kg']).optional() })
      .refine((value) => value.checked !== undefined || value.qty !== undefined || value.unit !== undefined,
        'Indica al menos un cambio.'), run: ({ ingredient_id, checked, qty, unit }) => {
      const state = updateKitchen((current) => {
        if (!current.shopping.some((item) => item.ingredientId === ingredient_id)) fail('Ingrediente no encontrado.');
        current.shopping = current.shopping.map((item) => item.ingredientId === ingredient_id ? { ...item,
          checked: checked ?? item.checked, qty: qty ?? item.qty, unit: unit ?? item.unit } : item);
        if (checked === false) delete current.pantryExpiry[ingredient_id];
        return current;
      });
      return { item: state.shopping.find((item) => item.ingredientId === ingredient_id) };
    } },
  { name: 'remove_kitchen_item', description: 'Remove an ingredient from the local kitchen list. Sinónimos: quitar ingrediente, borrar de compra, vaciar nevera',
    schema: z.object({ ingredient_id: z.string().min(1) }), run: ({ ingredient_id }) => {
      const state = updateKitchen((current) => { current.shopping = current.shopping.filter((item) => item.ingredientId !== ingredient_id); delete current.pantryExpiry[ingredient_id]; return current; });
      return { removed: ingredient_id, shopping: state.shopping };
    } },
  { name: 'update_recipe', description: 'Edit a personal recipe, including quantities, servings, cooking steps and seasonal character. Sinónimos: modificar receta, corregir ingredientes',
    schema: z.object({ recipe_id: z.string().min(1), changes: z.object(recipeFields).partial() }),
    run: ({ recipe_id, changes }) => {
      const state = updateKitchen((current) => {
        const index = current.recipes.findIndex((recipe) => recipe.id === recipe_id);
        if (index < 0) fail('Solo se pueden editar recetas propias existentes.');
        const old = current.recipes[index];
        const patch = { ...changes };
        if (patch.ingredients) patch.ingredients = patch.ingredients.map(mapIngredient);
        if (patch.steps) patch.steps = patch.steps.map(mapStep);
        if (patch.season) { patch.seasonAffinity = [patch.season]; delete patch.season; }
        current.recipes[index] = { ...old, ...patch };
        return current;
      });
      return { recipe: recipeSummary(state.recipes.find((recipe) => recipe.id === recipe_id)) };
    } },
  { name: 'delete_recipe', description: 'Delete a personal local recipe. The cooking history stays in the local archive. Sinónimos: borrar receta propia',
    schema: z.object({ recipe_id: z.string().min(1) }), run: ({ recipe_id }) => {
      const state = updateKitchen((current) => {
        if (!current.recipes.some((recipe) => recipe.id === recipe_id)) fail('Solo se pueden borrar recetas propias.');
        current.recipes = current.recipes.filter((recipe) => recipe.id !== recipe_id);
        current.savedIds = current.savedIds.filter((id) => id !== recipe_id);
        if (current.menu?.plan?.days?.some((day) => day.recipeId === recipe_id)) current.menu = null;
        return current;
      });
      return { deleted: recipe_id, remaining_recipes: state.recipes.length };
    } },
  { name: 'record_cooking', description: 'Record that you cooked a recipe, with rating, notes, time and whether you would repeat it. Sinónimos: la he hecho, cocinar, valorar receta',
    schema: z.object({ recipe_id: z.string().min(1), rating: z.number().int().min(1).max(5).optional(),
      notes: z.string().max(2000).optional(), servings_made: z.number().int().positive().optional(),
      time_taken_min: z.number().int().min(0).optional(), would_repeat: z.boolean().optional() }),
    run: ({ recipe_id, rating, notes, servings_made, time_taken_min, would_repeat }) => {
      const state = updateKitchen((current) => {
        if (!recipes(current).some((recipe) => recipe.id === recipe_id)) fail('Receta no encontrada.');
        current.makes.push({ id: `make-${crypto.randomUUID()}`, recipeId: recipe_id, authorId: 'local',
          rating, notes, servingsMade: servings_made, timeTakenMin: time_taken_min,
          wouldRepeat: would_repeat, createdAt: new Date().toISOString() });
        return current;
      });
      return { cooking: state.makes.at(-1), cooked_count: state.makes.length,
        badges: computeBadges(state.recipes, state.makes) };
    } },
  { name: 'cooking_history', description: 'Read personal cooking history and badges. Sinónimos: qué he cocinado, valoraciones, actividad cocina',
    schema: z.object({ recipe_id: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }), readOnly: true,
    run: ({ recipe_id, limit }) => { const state = readKitchen(); return {
      cooking: state.makes.filter((make) => !recipe_id || make.recipeId === recipe_id).slice(-limit).reverse(),
      badges: computeBadges(state.recipes, state.makes),
    }; } },
  { name: 'set_recipe_saved', description: 'Add or remove a recipe from your personal cookbook. Sinónimos: guardar en recetario, favoritos',
    schema: z.object({ recipe_id: z.string().min(1), saved: z.boolean() }),
    run: ({ recipe_id, saved }) => { const state = updateKitchen((current) => {
      if (!recipes(current).some((recipe) => recipe.id === recipe_id)) fail('Receta no encontrada.');
      current.savedIds = saved ? [...new Set([...current.savedIds, recipe_id])] : current.savedIds.filter((id) => id !== recipe_id);
      return current;
    }); return { recipe_id, saved, saved_recipe_ids: state.savedIds }; } },
  { name: 'saved_recipes', description: 'List recipes in your local personal cookbook. Sinónimos: mis recetas guardadas, recetario, favoritos',
    schema: z.object({}), readOnly: true, run: () => { const state = readKitchen(); return {
      recipes: recipes(state).filter((recipe) => state.savedIds.includes(recipe.id)).map(recipeSummary),
    }; } },
  { name: 'set_expiry', description: 'Set or clear an expiry date for an ingredient in the fridge. Sinónimos: caducidad, vence el, se estropea',
    schema: z.object({ ingredient_id: z.string().min(1), expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
    run: ({ ingredient_id, expires_at }) => { const state = updateKitchen((current) => {
      if (!current.shopping.some((item) => item.ingredientId === ingredient_id && item.checked)) fail('Ese ingrediente no está en la nevera.');
      if (expires_at) current.pantryExpiry[ingredient_id] = expires_at;
      else delete current.pantryExpiry[ingredient_id];
      return current;
    }); return { ingredient_id, expires_at: state.pantryExpiry[ingredient_id] || null }; } },
  { name: 'use_expiring', description: 'Find fridge items expiring soon and recipes that use them. Sinónimos: aprovechar antes de caducar, qué cocinar antes de que se estropee',
    schema: z.object({ within_days: z.number().int().min(0).max(30).default(3), month: z.number().int().min(1).max(12).optional(),
      hemisphere: z.enum(['N', 'S']).default('N'), limit: z.number().int().min(1).max(20).default(8) }), readOnly: true,
    run: ({ within_days, month, hemisphere, limit }) => { const state = readKitchen();
      const expiring = expiringSoon(pantry(state).map((ingredientId) => ({ ingredientId, expiresAt: state.pantryExpiry[ingredientId] })), within_days);
      return { expiring: expiring.map((item) => ({ ...item, name: nameOf(item.ingredientId) })),
        recipes: useItUp(recipes(state), expiring.map((item) => item.ingredientId),
          { pantry: pantry(state), month, hemisphere, staples: DEFAULT_STAPLES })
          .slice(0, limit).map((item) => ({ recipe: recipeSummary(item.recipe), score: item.score,
            have: item.have.map(nameOf), missing: item.missing.map(nameOf) })) }; } },
  { name: 'import_recipe_jsonld', description: 'Import one schema.org Recipe JSON-LD object into the local cookbook. Paste the JSON-LD; no web server is needed. Sinónimos: importar receta de web',
    schema: z.object({ json_ld: z.string().min(2).max(100000) }), run: ({ json_ld }) => {
      let parsed;
      try { parsed = JSON.parse(json_ld); } catch { fail('JSON-LD no válido.'); }
      const raw = findJsonLdRecipe(parsed) || (parsed?.name ? parsed : null);
      if (!raw || typeof raw !== 'object') fail('No se encontró una receta en el JSON-LD.');
      const recipe = parseJsonLdRecipe(raw, `local-${crypto.randomUUID()}`, 'local') || fail('No se encontró una receta en el JSON-LD.');
      const state = updateKitchen((current) => { current.recipes.push(recipe); return current; });
      return { recipe: recipeSummary(state.recipes.at(-1)), steps: state.recipes.at(-1).steps };
    } },
  { name: 'import_recipe_url', description: 'Open a recipe page, read its schema.org Recipe JSON-LD, and save it in the local cookbook. Repeating the URL reuses the saved recipe. Sinónimos: importa esta receta, guardar receta de enlace',
    schema: z.object({ url: z.url().refine((value) => /^https?:\/\//i.test(value), 'Usa un enlace HTTP o HTTPS.') }),
    run: async ({ url }) => {
      const { recipe: raw, sourceUrl } = await fetchRecipeFromUrl(url);
      const existing = readKitchen().recipes.find((item) => item.sourceUrl === sourceUrl);
      if (existing) return { recipe: recipeSummary(existing), steps: existing.steps, already_imported: true };
      const recipe = parseJsonLdRecipe(raw, `local-${crypto.randomUUID()}`, 'local') || fail('La página no contiene una receta válida.');
      if (!recipe.ingredients.length || !recipe.steps.length) fail('La página no publica ingredientes y pasos completos para importar.');
      recipe.sourceUrl = sourceUrl;
      const state = updateKitchen((current) => { current.recipes.push(recipe); return current; });
      return { recipe: recipeSummary(state.recipes.at(-1)), steps: state.recipes.at(-1).steps, already_imported: false };
    } },
  { name: 'export_kitchen', description: 'Export the complete local kitchen as JSON for a personal backup. Sinónimos: copia de seguridad, exportar cocina',
    schema: z.object({}), readOnly: true, run: () => ({ kitchen: readKitchen() }) },
  { name: 'import_kitchen', description: 'Merge a previously exported CookHoard kitchen JSON into the local kitchen without duplicating recipes or cooking records. Sinónimos: restaurar copia, importar cocina',
    schema: z.object({ snapshot_json: z.string().min(2).max(5_000_000) }), run: ({ snapshot_json }) => {
      let imported;
      try { imported = normalizeKitchen(JSON.parse(snapshot_json)); }
      catch { fail('La copia de cocina no tiene un formato válido.'); }
      const state = updateKitchen((current) => {
        const recipeMap = new Map(current.recipes.map((recipe) => [recipe.id, recipe]));
        for (const recipe of imported.recipes) recipeMap.set(recipe.id, recipe);
        current.recipes = [...recipeMap.values()];
        const makeMap = new Map(current.makes.map((make) => [make.id, make]));
        for (const make of imported.makes) makeMap.set(make.id, make);
        current.makes = [...makeMap.values()];
        current.shopping = mergeShopping(current.shopping, imported.shopping);
        current.savedIds = [...new Set([...current.savedIds, ...imported.savedIds])];
        current.pantryExpiry = { ...current.pantryExpiry, ...imported.pantryExpiry };
        if (imported.menu?.week === menuWeekKey()) current.menu = imported.menu;
        return current;
      });
      return { recipes: state.recipes.length, cooking: state.makes.length,
        shopping: state.shopping.length, saved: state.savedIds.length,
        menu_restored: !!freshMenu(state) };
    } },
];

export async function callTool(name, args = {}) {
  const tool = TOOLS.find((item) => item.name === name) || fail('Herramienta desconocida.');
  return tool.run(tool.schema.parse(args));
}

export function mcpResult(value) { return text(value); }
