import { z } from 'zod';
import crypto from 'node:crypto';
import {
  SEED_RECIPES, INGREDIENT_BY_ID, DEFAULT_STAPLES, recommend, planWeek,
  menuWeekKey, replaceMenuDay, buildShoppingList, mergeShopping,
  manualShoppingItem, resolveIngredient,
} from '@cookhoard/core';
import { readKitchen, updateKitchen } from './store.mjs';

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });
const fail = (message) => { throw new Error(message); };
const pantry = (state) => state.shopping.filter((item) => item.checked).map((item) => item.ingredientId);
const recipes = (state) => [...state.recipes, ...SEED_RECIPES];
const nameOf = (id) => INGREDIENT_BY_ID[id]?.name || id;
const recipeSummary = (recipe) => ({ id: recipe.id, title: recipe.title, description: recipe.description,
  cuisine: recipe.cuisine, prepMin: recipe.prepMin, cookMin: recipe.cookMin,
  ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, name: nameOf(ingredient.ingredientId) })) });
const freshMenu = (state) => state.menu?.week === menuWeekKey() ? state.menu.plan : null;

export const INSTRUCTIONS = 'CookHoard is a local cooking assistant. The checked shopping items are ingredients already in the fridge; unchecked items are still to buy. A weekly menu is saved for the current local week. Search or recommend before planning. Never claim a recipe was saved, a day changed or an ingredient added unless the tool returned the updated state. All data stays on this computer.';

export const TOOLS = [
  { name: 'kitchen_state', description: 'Read the local fridge, shopping list and saved menu for this week. Sinónimos: nevera, compra, menú, cocina, estado',
    schema: z.object({}), readOnly: true, run: () => {
      const state = readKitchen();
      return { week: menuWeekKey(), menu: freshMenu(state), recipe_count: recipes(state).length, shopping: state.shopping.map((item) => ({ ...item, name: item.name || nameOf(item.ingredientId) })), pantry: pantry(state).map((id) => ({ id, name: nameOf(id) })) };
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
      return { ...recipeSummary(recipe), steps: recipe.steps };
    } },
  { name: 'save_recipe', description: 'Save a personal local recipe with ingredients and cooking steps for future recommendations and menus. Sinónimos: guardar receta, crear plato, receta propia',
    schema: z.object({ title: z.string().trim().min(1).max(120), description: z.string().max(1000).default(''),
      ingredients: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
      steps: z.array(z.string().trim().min(1).max(1000)).min(1).max(50),
      cuisine: z.string().trim().max(80).optional(),
      season: z.enum(['spring', 'summer', 'autumn', 'winter']).optional(),
      temperature: z.enum(['hot', 'cold', 'room']).optional() }),
    run: ({ title, description, ingredients, steps, cuisine, season, temperature }) => {
      const state = updateKitchen((current) => {
        const recipe = { id: `local-${crypto.randomUUID()}`, authorId: 'local', title, description,
          ingredients: ingredients.map((name) => ({ ingredientId: resolveIngredient(name) || name.toLowerCase().replace(/\s+/g, '_'), note: name })),
          steps: steps.map((step) => ({ text: step })), cuisine,
          seasonAffinity: season ? [season] : [], temperature, createdAt: new Date().toISOString() };
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
  { name: 'set_kitchen_item', description: 'Update an existing ingredient as in the fridge or still to buy. For a new item use add_kitchen_item. Sinónimos: ya tengo, marcar comprado, se ha agotado, desmarcar',
    schema: z.object({ ingredient_id: z.string().min(1), checked: z.boolean() }), run: ({ ingredient_id, checked }) => {
      const state = updateKitchen((current) => {
        if (!current.shopping.some((item) => item.ingredientId === ingredient_id)) fail('Ingrediente no encontrado.');
        current.shopping = current.shopping.map((item) => item.ingredientId === ingredient_id ? { ...item, checked } : item);
        return current;
      });
      return { item: state.shopping.find((item) => item.ingredientId === ingredient_id) };
    } },
  { name: 'remove_kitchen_item', description: 'Remove an ingredient from the local kitchen list. Sinónimos: quitar ingrediente, borrar de compra, vaciar nevera',
    schema: z.object({ ingredient_id: z.string().min(1) }), run: ({ ingredient_id }) => {
      const state = updateKitchen((current) => { current.shopping = current.shopping.filter((item) => item.ingredientId !== ingredient_id); return current; });
      return { removed: ingredient_id, shopping: state.shopping };
    } },
];

export async function callTool(name, args = {}) {
  const tool = TOOLS.find((item) => item.name === name) || fail('Herramienta desconocida.');
  return tool.run(tool.schema.parse(args));
}

export function mcpResult(value) { return text(value); }
