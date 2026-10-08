// The original 25 tools (recipes, fridge/shopping list, weekly menu, history, import/export), unchanged in name, arguments and behaviour,
// now on top of the version 2 kitchen: places, estimated expiry, user ingredients, leftovers.
import crypto from 'node:crypto';
import {
  DEFAULT_STAPLES, recommend, planWeek, menuWeekKey, replaceMenuDay, buildShoppingList, mergeShopping, manualShoppingItem, estimateRecipeNutrition,
  expiringSoon, useItUp, computeBadges, parseJsonLdRecipe, findJsonLdRecipe, setPantryItem, addLeftovers, pantryView, recipeTraits, normaliseDiet, normaliseAllergen,
  dishSeasonFit, seasonForMonth, round2, normalizeKitchen, reconcilePantry,
} from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { menuIngredients, addStockCoverage } from '../menu-ingredients.mjs';
import { recipeCheck } from '../recipe-check.mjs';
import { now, nowIso, today } from '../clock.mjs';
import { emit } from '../hub.mjs';
import { z, fail, tool, lexOf, nameOf, recipesOf, pantryIds, freshWeek, ingredientRef, mapIngredientLine, recipeSummary, costSummary } from './common.mjs';
import { importRecipeUrl } from '../importers/url.mjs';

const freshMenu = (state) => freshWeek(state, menuWeekKey(now()));
const ingredientInput = z.union([z.string().trim().min(1).max(100), z.object({
  name: z.string().trim().min(1).max(100), quantity: z.number().positive().optional(),
  unit: z.string().trim().max(30).optional(), optional: z.boolean().optional(),
  isCore: z.boolean().optional(), note: z.string().max(200).optional(),
})]);
const stepInput = z.union([z.string().trim().min(1).max(1000), z.object({
  text: z.string().trim().min(1).max(1000), timerSec: z.number().int().min(1).max(86400).optional(),
  temperatureC: z.number().int().min(40).max(320).optional(),
})]);
export const recipeFields = {
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
const mapStep = (value) => typeof value === 'string' ? { text: value } : value;
const recipeData = (state, input) => ({ title: input.title, description: input.description,
  ingredients: input.ingredients.map((line) => mapIngredientLine(state, line)), steps: input.steps.map(mapStep), cuisine: input.cuisine,
  seasonAffinity: input.season ? [input.season] : [], temperature: input.temperature,
  heaviness: input.heaviness, difficulty: input.difficulty, servings: input.servings,
  prepMin: input.prepMin, cookMin: input.cookMin, dietFlags: input.dietFlags,
  allergens: input.allergens, image: input.image });
const unitEnum = z.enum(['ud', 'L', 'kg', 'g', 'ml', 'ración']);

const withSource = (recipe, kind, url) => ({ ...recipe, ...(url ? { sourceUrl: url } : {}), source: { kind, ...(url ? { url } : {}), importedAt: nowIso() } });

export const KITCHEN_TOOLS = [
  tool({ name: 'kitchen_state', readOnly: true, schema: z.object({}),
    description: 'Read the local fridge, pantry, shopping list and this week’s menu. Estado de la cocina.\nShopping items with checked: true are in the pantry (location, quantity, expiry exact or estimated); unchecked ones are still to buy.\nSinónimos: nevera, compra, menú, cocina, estado, qué tengo',
    run: () => {
      const state = readKitchen();
      const view = pantryView(state, today());
      const byId = new Map(view.map((item) => [item.ingredientId, item]));
      return { week: menuWeekKey(now()), menu: freshMenu(state), recipe_count: recipesOf(state).length,
        own_recipe_count: state.recipes.length, cooked_count: state.makes.length,
        saved_recipe_ids: state.savedIds,
        shopping: state.shopping.map((item) => { const p = byId.get(item.ingredientId); return { ...item, name: item.name || nameOf(state, item.ingredientId),
          expiresAt: p?.expiresAt ?? null, ...(p ? { location: p.location, expiry_kind: p.expiry_kind, days_left: p.days_left } : {}) }; }),
        pantry: view.map((p) => ({ id: p.ingredientId, name: p.name, expiresAt: p.expiresAt, location: p.location, qty: p.qty, unit: p.unit, expiry_kind: p.expiry_kind, days_left: p.days_left })),
        drafts_pending: state.drafts.length };
    } }),

  tool({ name: 'find_recipes', readOnly: true,
    schema: z.object({ query: z.string().default(''), limit: z.number().int().min(1).max(100).default(10),
      max_minutes: z.number().int().min(1).optional(), diet: z.array(z.string()).max(5).optional(), exclude_allergens: z.array(z.string()).max(8).optional(),
      season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(), source: z.enum(['own', 'seed', 'url', 'video', 'text', 'web']).optional(), saved_only: z.boolean().optional() }),
    description: 'Search recipes by title, ingredient, time, diet, allergens, season or source. Buscar recetas.\nOptional filters: max_minutes (prep + cook), diet (vegetariano, vegano, sin_gluten), exclude_allergens (gluten, lactosa, huevo…), season, source (own, seed, url, video, text) and saved_only. Diet and allergens come from the author or from the recognised ingredients.\nSinónimos: recetas, buscar plato, cocinar, ingredientes, recetas rápidas, recetas sin gluten',
    run: ({ query, limit, max_minutes, diet, exclude_allergens, season, source, saved_only }) => {
      const state = readKitchen();
      const needle = query.trim().toLocaleLowerCase();
      const lex = lexOf(state);
      const wantDiet = (diet ?? []).map(normaliseDiet);
      const avoid = (exclude_allergens ?? []).map(normaliseAllergen);
      const rows = recipesOf(state).filter((recipe) => {
        if (needle && ![recipe.title, recipe.description || '', recipe.cuisine || '', ...recipe.ingredients.map((i) => nameOf(state, i.ingredientId))].some((part) => part.toLocaleLowerCase().includes(needle))) return false;
        const minutes = (recipe.prepMin ?? 0) + (recipe.cookMin ?? 0);
        if (max_minutes && minutes && minutes > max_minutes) return false;
        const traits = (wantDiet.length || avoid.length) ? recipeTraits(recipe, lex) : null;
        if (wantDiet.length && !wantDiet.every((d) => traits.diet.includes(d))) return false;
        if (avoid.length && avoid.some((a) => traits.allergens.includes(a))) return false;
        if (season && !(recipe.seasonAffinity?.includes(season) || (!recipe.seasonAffinity?.length && dishSeasonFit(recipe, season) > 0))) return false;
        if (saved_only && !state.savedIds.includes(recipe.id)) return false;
        if (source) {
          const own = recipe.authorId === 'local';
          const kind = recipe.source?.kind ?? (recipe.sourceUrl ? 'url' : 'manual');
          if (source === 'seed' ? own : source === 'own' ? !own : kind !== source) return false;
        }
        return true;
      });
      return { total: rows.length, recipes: rows.slice(0, limit).map((r) => recipeSummary(r, state)) };
    } }),

  tool({ name: 'get_recipe', readOnly: true, schema: z.object({ recipe_id: z.string().min(1) }),
    description: 'Read a recipe with ingredients, steps, source, history and cost per serving. Receta completa.\nIncludes nutrition per serving (approximate), the cooking history of this recipe and a cost estimate from the learned price book (says which prices are missing).\nSinónimos: receta completa, pasos, cómo cocinar, cuánto cuesta',
    run: ({ recipe_id }) => {
      const state = readKitchen();
      const recipe = recipesOf(state).find((r) => r.id === recipe_id) || fail('Receta no encontrada.');
      return { ...recipeSummary(recipe, state), steps: recipe.steps, saved: state.savedIds.includes(recipe.id),
        nutrition_per_serving: estimateRecipeNutrition(recipe),
        cooking_history: state.makes.filter((make) => make.recipeId === recipe.id), cost: costSummary(state, recipe) };
    } }),

  tool({ name: 'recipe_check', readOnly: true,
    schema: z.object({ recipe_id: z.string().min(1), servings: z.number().int().positive().optional() }),
    description: 'Check scaled ingredients and pantry deficits for one recipe. Raciones y existencias de una receta.\nNo weekly menu needed. Optional servings requires a known recipe yield. Keeps authored units; converts g/kg and ml/L. stock_sufficient is true for confirmed required quantities, false for known deficits, null for unknown amounts, incompatible units or assumed staples. Optional ingredients are separate; expiry is not checked. Nothing is saved or consumed.\nSinónimos: receta para cuatro, escalar receta, cuánto necesito, alcanza la despensa, cantidades receta, qué falta comprar',
    run: ({ recipe_id, servings }) => {
      const state = readKitchen();
      const recipe = recipesOf(state).find((r) => r.id === recipe_id) || fail('Receta no encontrada.');
      return recipeCheck(state, recipe, servings);
    } }),

  tool({ name: 'save_recipe', schema: z.object(recipeFields),
    description: 'Save a personal recipe with ingredients and steps. Guardar receta propia.\nIngredient names not in the dictionary become user ingredients automatically. Steps may carry timerSec and temperatureC.\nSinónimos: guardar receta, crear plato, receta propia, apunta esta receta',
    run: (input) => {
      const state = updateKitchen((current) => {
        const recipe = { id: `local-${crypto.randomUUID()}`, authorId: 'local', ...recipeData(current, input), source: { kind: 'manual', importedAt: nowIso() }, createdAt: nowIso() };
        current.recipes.push(recipe);
        return current;
      });
      const saved = state.recipes.at(-1);
      return { recipe: recipeSummary(saved, state), steps: saved.steps };
    } }),

  tool({ name: 'recommend_recipes', readOnly: true,
    schema: z.object({ month: z.number().int().min(1).max(12).optional(), hemisphere: z.enum(['N', 'S']).default('N'), limit: z.number().int().min(1).max(20).default(8) }),
    description: 'Rank recipes for the current pantry and season. Qué puedo cocinar con lo que tengo.\nFor a full dinner plan with filters, expiring food and leftovers use what_to_cook.\nSinónimos: qué puedo cocinar, recomendar recetas, aprovechar nevera, ideas de comida',
    run: ({ month, hemisphere, limit }) => {
      const state = readKitchen();
      return { recipes: recommend(recipesOf(state), { pantry: pantryIds(state), month, hemisphere, staples: DEFAULT_STAPLES })
        .slice(0, limit).map((item) => ({ recipe: recipeSummary(item.recipe, state), bucket: item.bucket, score: item.score,
          have: item.have.map((id) => nameOf(state, id)), missing: item.missing.map((id) => nameOf(state, id)), reasons: item.reasons })) };
    } }),

  tool({ name: 'plan_week', schema: z.object({ month: z.number().int().min(1).max(12).optional(), hemisphere: z.enum(['N', 'S']).default('N') }),
    description: 'Save a seven-day menu from recipes, season and pantry; replaces this week’s menu. Planificar la semana.\nSinónimos: planificar menú, menú semanal, qué comemos esta semana',
    run: ({ month, hemisphere }) => {
      const state = updateKitchen((current) => {
        current.menu = { week: menuWeekKey(now()), plan: planWeek(recipesOf(current), { month, hemisphere, pantry: pantryIds(current), staples: DEFAULT_STAPLES }) };
        return current;
      });
      emit('cookhoard.menu.planned', { week: state.menu.week });
      return { week: state.menu.week, menu: state.menu.plan };
    } }),

  tool({ name: 'change_menu_day', schema: z.object({ day: z.number().int().min(1).max(7) }),
    description: 'Change one day’s recipe without touching the other six. Cambiar un día del menú.\nSinónimos: cambiar un día, sustituir receta, variar menú, otro plato para el martes',
    run: ({ day }) => {
      const state = updateKitchen((current) => {
        const plan = freshMenu(current) || fail('No hay un menú guardado para esta semana.');
        const next = replaceMenuDay(plan, recipesOf(current), day - 1);
        if (next === plan) fail('No hay otra receta disponible para ese día.');
        current.menu = { week: menuWeekKey(now()), plan: next };
        return current;
      });
      emit('cookhoard.menu.planned', { week: state.menu.week });
      return { week: state.menu.week, menu: state.menu.plan };
    } }),

  tool({ name: 'set_menu_day', idempotent: true,
    schema: z.object({ day: z.number().int().min(1).max(7), recipe_id: z.string().min(1), servings: z.number().int().positive().optional() }),
    description: 'Choose a recipe and servings for one day of this week’s menu (day 1 = Monday). Elegir plato y raciones.\nOmit servings to use the recipe’s own yield; an explicit target needs known recipe servings.\nSinónimos: elegir plato, raciones, personas, corregir menú, pon la tortilla el lunes',
    run: ({ day, recipe_id, servings }) => {
      const state = updateKitchen((current) => {
        const plan = freshMenu(current) || fail('No hay un menú guardado para esta semana. Usa plan_week primero.');
        const recipe = recipesOf(current).find((item) => item.id === recipe_id) || fail('Receta no encontrada.');
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
    } }),

  tool({ name: 'menu_ingredients', readOnly: true, schema: z.object({ days: z.array(z.number().int().min(1).max(7)).min(1).max(7).optional() }),
    description: 'Menu quantities and exact shopping deficits from known pantry stock. Cantidades del menú y lo que falta.\nOptional days selects Monday=1 … Sunday=7. Scales servings; converts g/kg and ml/L; marks unknown or incompatible stock for checking. Never changes anything.\nSinónimos: cantidades menú, cuánto falta comprar, raciones, calcular compra',
    run: ({ days }) => {
      const state = readKitchen();
      const plan = freshMenu(state) || fail('No hay un menú guardado para esta semana.');
      if (days?.some((day) => !plan.days[day - 1])) fail('Ese día no existe en el menú guardado.');
      const result = menuIngredients(plan, recipesOf(state), pantryIds(state), days);
      for (const group of [...result.required, ...result.optional]) {
        group.name = nameOf(state, group.ingredient_id);
        const listed = state.shopping.some((item) => item.ingredientId === group.ingredient_id);
        group.shopping_status = group.pantry_present ? 'check_stock'
          : DEFAULT_STAPLES.has(group.ingredient_id) && !listed ? 'assumed_staple' : 'to_buy';
      }
      result.notes.push('shopping_status: to_buy falta (también si un básico se marca agotado); check_stock exige comprobar la cantidad; assumed_staple se supone disponible sin inventario confirmado.');
      addStockCoverage(result, state.shopping, DEFAULT_STAPLES);
      return { week: state.menu.week, ...result };
    } }),

  tool({ name: 'add_menu_missing', idempotent: true, schema: z.object({}),
    description: 'Add the menu’s missing ingredients to the shopping list without duplicates. Apuntar lo que falta del menú.\nSinónimos: comprar lo que falta, ingredientes del menú, lista de la compra del menú',
    run: () => {
      const state = updateKitchen((current) => {
        const menu = freshMenu(current) || fail('No hay un menú guardado para esta semana.');
        const chosen = menu.days.map((day) => recipesOf(current).find((r) => r.id === day.recipeId)).filter(Boolean);
        current.shopping = mergeShopping(current.shopping, buildShoppingList(chosen, new Set([...pantryIds(current), ...DEFAULT_STAPLES])));
        reconcilePantry(current);
        return current;
      });
      return { shopping: state.shopping };
    } }),

  tool({ name: 'add_kitchen_item', schema: z.object({ name: z.string().trim().min(1).max(100), checked: z.boolean().default(false), qty: z.number().positive().optional(), unit: unitEnum.optional() }),
    description: 'Add an ingredient to the shopping list or pantry; unknown names are created. Añadir a la compra.\nchecked: true means you already have it (goes to the pantry with an estimated expiry); false means still to buy.\nSinónimos: añadir compra, meter en nevera, comprar ingrediente, apunta leche',
    run: ({ name, checked, qty, unit }) => {
      let id;
      const state = updateKitchen((current) => {
        id = ingredientRef(current, name, { create: true });
        current.shopping = mergeShopping(current.shopping, [manualShoppingItem(id, { checked, qty, unit })]);
        const before = current.shopping.find((item) => item.ingredientId === id);
        const wasHave = !!current.pantry[id];
        current.shopping = current.shopping.map((item) => item.ingredientId === id ? { ...item, checked: checked || !!item.checked, qty: qty ?? item.qty, unit: unit ?? item.unit } : item);
        if ((checked || before?.checked) && !wasHave) setPantryItem(current, { ingredientId: id }, today());
        reconcilePantry(current);
        return current;
      });
      return { item: state.shopping.find((item) => item.ingredientId === id), shopping: state.shopping };
    } }),

  tool({ name: 'set_kitchen_item', idempotent: true,
    schema: z.object({ ingredient_id: z.string().min(1), checked: z.boolean().optional(), qty: z.number().positive().optional(), unit: unitEnum.optional() })
      .refine((value) => value.checked !== undefined || value.qty !== undefined || value.unit !== undefined, 'Indica al menos un cambio.'),
    description: 'Update an existing item: have it or not, known quantity or unit. Cambiar existencias.\nFor a new item use add_kitchen_item; for place or expiry use pantry_set.\nSinónimos: ya tengo, marcar comprado, corregir cantidad, existencias, se ha agotado',
    run: ({ ingredient_id, checked, qty, unit }) => {
      const state = updateKitchen((current) => {
        const existing = current.shopping.find((item) => item.ingredientId === ingredient_id) || fail('Ingrediente no encontrado.');
        const becameHave = checked === true && !existing.checked;
        current.shopping = current.shopping.map((item) => item.ingredientId === ingredient_id ? { ...item,
          checked: checked ?? item.checked, qty: qty ?? item.qty, unit: unit ?? item.unit } : item);
        if (checked === false) delete current.pantry[ingredient_id];
        if (becameHave) setPantryItem(current, { ingredientId: ingredient_id }, today());
        reconcilePantry(current);
        return current;
      });
      return { item: state.shopping.find((item) => item.ingredientId === ingredient_id) };
    } }),

  tool({ name: 'remove_kitchen_item', idempotent: true, schema: z.object({ ingredient_id: z.string().min(1) }),
    description: 'Remove an ingredient from the shopping list and pantry. Quitar un ingrediente.\nSinónimos: quitar ingrediente, borrar de compra, vaciar nevera',
    run: ({ ingredient_id }) => {
      const state = updateKitchen((current) => { current.shopping = current.shopping.filter((item) => item.ingredientId !== ingredient_id); delete current.pantry[ingredient_id]; return current; });
      return { removed: ingredient_id, shopping: state.shopping };
    } }),

  tool({ name: 'update_recipe', schema: z.object({ recipe_id: z.string().min(1), changes: z.object(recipeFields).partial() }),
    description: 'Edit a personal recipe: quantities, servings, steps, season. Modificar una receta propia.\nSinónimos: modificar receta, corregir ingredientes, cambiar raciones',
    run: ({ recipe_id, changes }) => {
      const state = updateKitchen((current) => {
        const index = current.recipes.findIndex((recipe) => recipe.id === recipe_id);
        if (index < 0) fail('Solo se pueden editar recetas propias existentes.');
        const old = current.recipes[index];
        const patch = { ...changes };
        if (patch.ingredients) patch.ingredients = patch.ingredients.map((line) => mapIngredientLine(current, line));
        if (patch.steps) patch.steps = patch.steps.map(mapStep);
        if (patch.season) { patch.seasonAffinity = [patch.season]; delete patch.season; }
        current.recipes[index] = { ...old, ...patch };
        return current;
      });
      return { recipe: recipeSummary(state.recipes.find((recipe) => recipe.id === recipe_id), state) };
    } }),

  tool({ name: 'delete_recipe', destructive: true, schema: z.object({ recipe_id: z.string().min(1) }),
    description: 'Delete a personal recipe; the cooking history stays. Borrar una receta propia.\nSinónimos: borrar receta propia, eliminar receta',
    run: ({ recipe_id }) => {
      const state = updateKitchen((current) => {
        if (!current.recipes.some((recipe) => recipe.id === recipe_id)) fail('Solo se pueden borrar recetas propias.');
        current.recipes = current.recipes.filter((recipe) => recipe.id !== recipe_id);
        current.savedIds = current.savedIds.filter((id) => id !== recipe_id);
        if (current.menu?.plan?.days?.some((day) => day.recipeId === recipe_id)) current.menu = null;
        return current;
      });
      return { deleted: recipe_id, remaining_recipes: state.recipes.length };
    } }),

  tool({ name: 'record_cooking',
    schema: z.object({ recipe_id: z.string().min(1), rating: z.number().int().min(1).max(5).optional(),
      notes: z.string().max(2000).optional(), servings_made: z.number().int().positive().optional(), servings_eaten: z.number().min(0).optional(),
      time_taken_min: z.number().int().min(0).optional(), would_repeat: z.boolean().optional() }),
    description: 'Record that you cooked a recipe: rating, notes, time, portions eaten. La he hecho.\nWhen servings_made is greater than servings_eaten the difference is added to the pantry as "Sobras: <recipe>" with an estimated 3-day expiry. The result returns the leftover item.\nSinónimos: la he hecho, cocinar, valorar receta, hemos comido, sobras',
    run: ({ recipe_id, rating, notes, servings_made, servings_eaten, time_taken_min, would_repeat }) => {
      let leftover = null;
      const state = updateKitchen((current) => {
        const recipe = recipesOf(current).find((item) => item.id === recipe_id) || fail('Receta no encontrada.');
        if (servings_eaten !== undefined && servings_made === undefined) fail('Indica también servings_made (raciones cocinadas) para calcular las sobras.');
        if (servings_eaten !== undefined && servings_eaten > servings_made) fail('servings_eaten no puede superar servings_made.');
        const make = { id: `make-${crypto.randomUUID()}`, recipeId: recipe_id, authorId: 'local', rating, notes, servingsMade: servings_made,
          ...(servings_eaten !== undefined ? { servingsEaten: servings_eaten } : {}), timeTakenMin: time_taken_min, wouldRepeat: would_repeat, createdAt: nowIso() };
        current.makes.push(make);
        if (servings_made && servings_eaten !== undefined && servings_made > servings_eaten) {
          leftover = addLeftovers(current, { recipeId: recipe_id, title: recipe.title, servings: servings_made - servings_eaten, makeId: make.id }, today());
        }
        return current;
      });
      const view = leftover ? pantryView(state, today()).find((p) => p.ingredientId === leftover.ingredientId) : null;
      return { cooking: state.makes.at(-1), cooked_count: state.makes.length, badges: computeBadges(state.recipes, state.makes),
        ...(view ? { leftovers: { ingredient_id: view.ingredientId, name: view.name, servings: view.qty, expiresAt: view.expiresAt, expiry_kind: view.expiry_kind, expiry_basis: view.expiry_basis } } : {}) };
    } }),

  tool({ name: 'cooking_history', readOnly: true, schema: z.object({ recipe_id: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }),
    description: 'Read the cooking history and badges. Historial de cocina.\nSinónimos: qué he cocinado, valoraciones, actividad cocina, lo último que hice',
    run: ({ recipe_id, limit }) => {
      const state = readKitchen();
      return { cooking: state.makes.filter((make) => !recipe_id || make.recipeId === recipe_id).slice(-limit).reverse(), badges: computeBadges(state.recipes, state.makes) };
    } }),

  tool({ name: 'set_recipe_saved', idempotent: true, schema: z.object({ recipe_id: z.string().min(1), saved: z.boolean() }),
    description: 'Add or remove a recipe from your personal cookbook. Guardar en el recetario.\nSinónimos: guardar en recetario, favoritos, marcar como favorita',
    run: ({ recipe_id, saved }) => {
      const state = updateKitchen((current) => {
        if (!recipesOf(current).some((recipe) => recipe.id === recipe_id)) fail('Receta no encontrada.');
        current.savedIds = saved ? [...new Set([...current.savedIds, recipe_id])] : current.savedIds.filter((id) => id !== recipe_id);
        return current;
      });
      return { recipe_id, saved, saved_recipe_ids: state.savedIds };
    } }),

  tool({ name: 'saved_recipes', readOnly: true, schema: z.object({}),
    description: 'List the recipes in your personal cookbook. Mi recetario.\nSinónimos: mis recetas guardadas, recetario, favoritos',
    run: () => { const state = readKitchen(); return { recipes: recipesOf(state).filter((recipe) => state.savedIds.includes(recipe.id)).map((r) => recipeSummary(r, state)) }; } }),

  tool({ name: 'set_expiry', idempotent: true, schema: z.object({ ingredient_id: z.string().min(1), expires_at: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable() }),
    description: 'Set or clear the exact expiry date of an ingredient in the pantry. Fijar caducidad.\nA date typed here is marked exact; pantry_set can also ask for an estimate.\nSinónimos: caducidad, vence el, se estropea, caduca el',
    run: ({ ingredient_id, expires_at }) => {
      const state = updateKitchen((current) => {
        if (!current.shopping.some((item) => item.ingredientId === ingredient_id && item.checked)) fail('Ese ingrediente no está en la nevera.');
        const record = current.pantry[ingredient_id] ?? { location: 'nevera' };
        if (expires_at) { record.expiresAt = expires_at; record.expiry_kind = 'exact'; delete record.expiry_basis; }
        else { delete record.expiresAt; delete record.expiry_kind; delete record.expiry_basis; }
        current.pantry[ingredient_id] = record;
        return current;
      });
      return { ingredient_id, expires_at: state.pantry[ingredient_id]?.expiresAt || null };
    } }),

  tool({ name: 'use_expiring', readOnly: true,
    schema: z.object({ within_days: z.number().int().min(0).max(30).default(3), month: z.number().int().min(1).max(12).optional(),
      hemisphere: z.enum(['N', 'S']).default('N'), limit: z.number().int().min(1).max(20).default(8) }),
    description: 'Pantry items expiring soon and the recipes that use them up. Aprovechar lo que caduca.\nSinónimos: aprovechar antes de caducar, qué cocinar antes de que se estropee, caducidades',
    run: ({ within_days, month, hemisphere, limit }) => {
      const state = readKitchen();
      const view = pantryView(state, today()).filter((p) => p.expiresAt && !p.leftover);
      const expiring = expiringSoon(view.map((p) => ({ ingredientId: p.ingredientId, expiresAt: p.expiresAt })), within_days, now());
      const byId = new Map(view.map((p) => [p.ingredientId, p]));
      return { expiring: expiring.map((item) => ({ ...item, name: nameOf(state, item.ingredientId), expiry_kind: byId.get(item.ingredientId)?.expiry_kind, days_left: byId.get(item.ingredientId)?.days_left })),
        recipes: useItUp(recipesOf(state), expiring.map((item) => item.ingredientId), { pantry: pantryIds(state), month, hemisphere, staples: DEFAULT_STAPLES })
          .slice(0, limit).map((item) => ({ recipe: recipeSummary(item.recipe, state), score: item.score,
            have: item.have.map((id) => nameOf(state, id)), missing: item.missing.map((id) => nameOf(state, id)) })) };
    } }),

  tool({ name: 'import_recipe_jsonld', schema: z.object({ json_ld: z.string().min(2).max(100000) }),
    description: 'Import one schema.org Recipe JSON-LD object into the cookbook. Importar receta de JSON-LD.\nPaste the JSON-LD; no web access is needed.\nSinónimos: importar receta de web, pegar receta estructurada',
    run: ({ json_ld }) => {
      let parsed;
      try { parsed = JSON.parse(json_ld); } catch { fail('JSON-LD no válido.'); }
      const raw = findJsonLdRecipe(parsed) || (parsed?.name ? parsed : null);
      if (!raw || typeof raw !== 'object') fail('No se encontró una receta en el JSON-LD.');
      const recipe = parseJsonLdRecipe(raw, `local-${crypto.randomUUID()}`, 'local') || fail('No se encontró una receta en el JSON-LD.');
      const state = updateKitchen((current) => { current.recipes.push(withSource(recipe, 'manual')); return current; });
      return { recipe: recipeSummary(state.recipes.at(-1), state), steps: state.recipes.at(-1).steps };
    } }),

  tool({ name: 'import_recipe_url', openWorld: true, schema: z.object({ url: z.url().refine((value) => /^https?:\/\//i.test(value), 'Usa un enlace HTTP o HTTPS.') }),
    description: 'Save a recipe from a web page or video link; without structured data, a draft. Receta de un enlace.\nRepeating the URL reuses the saved recipe. For Instagram, TikTok, YouTube or Facebook videos use import_recipe_video.\nSinónimos: importa esta receta, guardar receta de enlace, receta de esta página',
    run: ({ url }) => importRecipeUrl(url) }),

  tool({ name: 'export_kitchen', readOnly: true, schema: z.object({}),
    description: 'Export the whole kitchen as JSON for a personal backup. Copia de seguridad.\nSinónimos: copia de seguridad, exportar cocina, backup',
    run: () => ({ kitchen: readKitchen() }) }),

  tool({ name: 'import_kitchen', schema: z.object({ snapshot_json: z.string().min(2).max(5_000_000) }),
    description: 'Merge an exported kitchen JSON (v1 or v2) without duplicating anything. Restaurar copia.\nSinónimos: restaurar copia, importar cocina, recuperar backup',
    run: ({ snapshot_json }) => {
      let imported;
      try { imported = normalizeKitchen(JSON.parse(snapshot_json)); }
      catch { fail('La copia de cocina no tiene un formato válido.'); }
      const state = updateKitchen((current) => {
        const byId = (list) => new Map(list.map((x) => [x.id, x]));
        const merge = (a, b) => [...new Map([...byId(a), ...byId(b)]).values()];
        current.recipes = merge(current.recipes, imported.recipes);
        current.makes = merge(current.makes, imported.makes);
        current.userIngredients = merge(current.userIngredients, imported.userIngredients);
        current.priceBook = merge(current.priceBook, imported.priceBook);
        current.tickets = merge(current.tickets, imported.tickets);
        current.drafts = merge(current.drafts, imported.drafts);
        current.shopping = mergeShopping(current.shopping, imported.shopping);
        current.savedIds = [...new Set([...current.savedIds, ...imported.savedIds])];
        current.learnedAliases = { ...current.learnedAliases, ...imported.learnedAliases };
        current.ignoredTerms = [...new Set([...current.ignoredTerms, ...imported.ignoredTerms])];
        current.pantry = { ...current.pantry, ...imported.pantry };
        if (imported.menu?.week === menuWeekKey(now())) current.menu = imported.menu;
        reconcilePantry(current);
        return current;
      });
      return { recipes: state.recipes.length, cooking: state.makes.length, shopping: state.shopping.length, saved: state.savedIds.length,
        menu_restored: !!freshMenu(state), user_ingredients: state.userIngredients.length, prices: state.priceBook.length, tickets: state.tickets.length };
    } }),
];
