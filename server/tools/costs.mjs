// Prices learned from tickets, what a recipe or the menu costs, spending against the weekly budget, and "¿qué ceno?".
import { priceStats, priceFor, recipeCost, whatToCook, getSettings, round2, addDays, menuWeekKey, fold } from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { now, today } from '../clock.mjs';
import { callApp } from '../hub.mjs';
import { z, fail, tool, nameOf, recipesOf, ingredientRef, costSummary, freshWeek } from './common.mjs';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa AAAA-MM-DD.');

export function priceBookView(state, query = '') {
  const needle = fold(query);
  const stats = priceStats(state, today()).filter((s) => !needle || fold(s.name).includes(needle));
  return { count: stats.length, items: stats };
}

export function menuCost(state, options = {}) {
  const plan = freshWeek(state, menuWeekKey(now()));
  if (!plan) return null;
  const days = plan.days.map((entry, index) => {
    const recipe = recipesOf(state).find((r) => r.id === entry.recipeId);
    const cost = recipe ? recipeCost(state, recipe, today(), { servings: entry.servings ?? options.servings, store: options.store }) : null;
    return { day: index + 1, recipe_id: entry.recipeId, title: entry.title ?? recipe?.title, servings: entry.servings ?? recipe?.servings ?? null,
      cost: cost ? { total: cost.total, per_serving: cost.per_serving, complete: cost.complete, missing_prices: cost.missing_prices } : null };
  });
  const total = round2(days.reduce((sum, d) => sum + (d.cost?.total ?? 0), 0));
  const missing = [...new Set(days.flatMap((d) => d.cost?.missing_prices ?? []))];
  const budget = getSettings(state).weeklyBudget;
  return { week: state.menu.week, days, total, complete: days.every((d) => d.cost?.complete), missing_prices: missing,
    budget: budget ?? null, vs_budget: budget ? { remaining: round2(budget - total), over: total > budget } : null };
}

const monthOf = (date) => date.slice(0, 7);
function weekBounds(date) {
  const d = new Date(`${date}T12:00:00`);
  const dow = (d.getDay() + 6) % 7;
  const from = addDays(date, -dow);
  return { from, to: addDays(from, 6) };
}

/** Food spending: tickets imported here, the weekly budget, and (when Ledger answers) what Ledger has under food categories. Degrades silently. */
export async function foodSpending(state, month) {
  const settings = getSettings(state);
  const current = month || monthOf(today());
  const tickets = state.tickets.filter((t) => t.date && t.total != null);
  const week = weekBounds(today());
  const weekSpent = round2(tickets.filter((t) => t.date >= week.from && t.date <= week.to).reduce((s, t) => s + t.total, 0));
  const monthTickets = tickets.filter((t) => monthOf(t.date) === current);
  const result = { month: current,
    tickets: { count: monthTickets.length, total: round2(monthTickets.reduce((s, t) => s + t.total, 0)), by_store: Object.entries(monthTickets.reduce((acc, t) => { const k = t.store ?? 'sin tienda'; acc[k] = round2((acc[k] ?? 0) + t.total); return acc; }, {})).map(([store, total]) => ({ store, total })) },
    week: { from: week.from, to: week.to, spent: weekSpent, budget: settings.weeklyBudget, remaining: settings.weeklyBudget != null ? round2(settings.weeklyBudget - weekSpent) : null },
    ledger: { available: false } };
  const ledger = await callApp('ledger', 'summary', { month: current }, { timeoutMs: 8000 });
  if (ledger.ok && Array.isArray(ledger.result?.categories)) {
    const food = ledger.result.categories.filter((c) => c.kind !== 'income' && /supermerc|aliment|comida|compra|mercado|super/i.test(c.name ?? ''));
    result.ledger = { available: true, categories: food.map((c) => ({ name: c.name, spent: round2((c.spent ?? 0) / 100), budget: c.budget != null ? round2(c.budget / 100) : null })),
      spent: round2(food.reduce((sum, c) => sum + (c.spent ?? 0), 0) / 100) };
  }
  return result;
}

export const COST_TOOLS = [
  tool({ name: 'price_book', readOnly: true, schema: z.object({ query: z.string().max(100).default('') }),
    description: 'Prices learned from tickets: last, 90-day median and cheapest store per ingredient. Libro de precios.\nPrices are normalised to €/kg, €/L or €/ud. Ingredients never bought have none.\nSinónimos: precios, cuánto cuesta, dónde es más barato, histórico de precios, precio del aceite',
    run: ({ query }) => priceBookView(readKitchen(), query) }),

  tool({ name: 'price_add', schema: z.object({ ingredient: z.string().trim().min(1).max(100), unit_price: z.number().positive().max(10000), price_unit: z.enum(['kg', 'L', 'ud']), store: z.string().trim().min(1).max(60), date: day.optional() }),
    description: 'Record a price by hand (€/kg, €/L or €/ud) in the price book. Apuntar un precio.\nSinónimos: apunta el precio, el aceite cuesta, precio manual, he visto a',
    run: ({ ingredient, unit_price, price_unit, store, date }) => {
      let id;
      const state = updateKitchen((current) => {
        id = ingredientRef(current, ingredient, { create: true });
        const when = date ?? today();
        current.priceBook.push({ id: `price-manual-${current.priceBook.length}-${id}-${when}`, ingredientId: id, store, date: when, unit_price, price_unit, source: 'manual' });
        return current;
      });
      return { ingredient_id: id, name: nameOf(state, id), price: priceFor(state, id, today()), prices: state.priceBook.filter((p) => p.ingredientId === id).length };
    } }),

  tool({ name: 'recipe_cost', readOnly: true, schema: z.object({ recipe_id: z.string().min(1), servings: z.number().positive().optional(), store: z.string().max(60).optional(), mode: z.enum(['median90', 'last']).default('median90') }),
    description: 'Cost of a recipe from your price book: total, per serving, missing prices. Cuánto cuesta una receta.\nUses the median of the last 90 days (or the last price, or the price at one store). Never guesses a price: missing ones are listed.\nSinónimos: coste de la receta, cuánto cuesta cocinar, precio por ración, receta barata',
    run: ({ recipe_id, servings, store, mode }) => {
      const state = readKitchen();
      const recipe = recipesOf(state).find((r) => r.id === recipe_id) || fail('Receta no encontrada.');
      return recipeCost(state, recipe, today(), { servings, store, mode });
    } }),

  tool({ name: 'menu_cost', readOnly: true, schema: z.object({ store: z.string().max(60).optional() }),
    description: 'Cost of this week’s menu by day, and against the weekly budget. Cuánto cuesta el menú.\nSinónimos: coste del menú, presupuesto de la semana, cuánto gasto comiendo, menú barato',
    run: ({ store }) => menuCost(readKitchen(), { store }) ?? fail('No hay un menú guardado para esta semana.') }),

  tool({ name: 'food_spending', readOnly: true, openWorld: true, schema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() }),
    description: 'Food spending from tickets against the weekly budget, plus Ledger food categories. Gasto en comida.\nIf the finance app is not reachable only tickets are used (it says so).\nSinónimos: cuánto gasto en comida, presupuesto de la compra, gasto del súper, cuánto llevo esta semana',
    run: ({ month }) => foodSpending(readKitchen(), month) }),

  tool({ name: 'what_to_cook', readOnly: true,
    schema: z.object({ max_minutes: z.number().int().min(1).optional(), servings: z.number().int().positive().optional(), diet: z.array(z.string()).max(5).optional(), avoid_allergens: z.array(z.string()).max(8).optional(),
      only_have: z.boolean().optional(), allow_missing: z.number().int().min(0).max(20).optional(), use_expiring: z.boolean().optional(), avoid_days: z.number().int().min(0).max(60).optional(),
      expiring_within_days: z.number().int().min(0).max(30).optional(), month: z.number().int().min(1).max(12).optional(), hemisphere: z.enum(['N', 'S']).optional(), limit: z.number().int().min(1).max(20).default(6) }),
    description: 'What to cook tonight from what you have, what expires, recent meals and ratings, plus leftovers. ¿Qué ceno?\nFilters: max_minutes, diet, avoid_allergens, only_have, allow_missing, avoid_days (default 3: nothing cooked in the last days). Each option says why, what you have and what is missing, with its cost per serving when prices are known.\nSinónimos: qué ceno, qué cocino hoy, qué hago de cenar, qué puedo cocinar rápido, sin gluten, gasta lo que caduca, sobras',
    run: (query) => {
      const state = readKitchen();
      const result = whatToCook(state, recipesOf(state), query, today());
      const withCost = (option) => { const recipe = recipesOf(state).find((r) => r.id === option.recipe_id); const cost = option.type === 'recipe' && recipe ? costSummary(state, recipe) : null;
        return { ...option, ...(cost ? { cost } : {}), ...(recipe ? { image: recipe.image ?? null } : {}) }; };
      return { ...result, options: result.options.map(withCost) };
    } }),
];
