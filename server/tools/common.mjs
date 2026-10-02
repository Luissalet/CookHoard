// Shared pieces of the tool modules: the tool() constructor, state helpers and the checks every tool description must pass.
import { z } from 'zod';
import {
  SEED_RECIPES, ingredientInfo, ingredientName, resolveName, resolveOrCreate, knownId, recipeTraits, recipeCost, reconcilePantry,
} from '@cookhoard/core';
import { today } from '../clock.mjs';

export { z };
export const fail = (message, extra = {}) => { throw Object.assign(new Error(message), { status: 400, ...extra }); };

/** description: first line ≤110 chars (English + Spanish keywords), details, then "Sinónimos: …". */
export function tool({ name, description, schema, readOnly = false, idempotent, openWorld = false, destructive = false, run }) {
  return { name, description, schema, readOnly, openWorld, destructive, idempotent: idempotent ?? readOnly, run };
}
export const annotationsOf = (t) => ({ readOnlyHint: !!t.readOnly, destructiveHint: !!t.destructive, idempotentHint: !!t.idempotent, openWorldHint: !!t.openWorld });

export const lexOf = (state) => ({ userIngredients: state.userIngredients, learnedAliases: state.learnedAliases });
export const nameOf = (state, id) => ingredientName(id, lexOf(state));
export const recipesOf = (state) => [...state.recipes, ...SEED_RECIPES];
export const pantryIds = (state) => state.shopping.filter((item) => item.checked).map((item) => item.ingredientId);
export const freshWeek = (state, week) => (state.menu?.week === week ? state.menu.plan : null);

/** Id for a name or id typed by a person or an assistant. Creates a user ingredient (added to `state`) when asked and nothing matches. */
export function ingredientRef(state, value, { create = false } = {}) {
  const text = String(value ?? '').trim();
  if (!text) fail('Falta el ingrediente.');
  const lex = lexOf(state);
  if (knownId(text, lex) || state.shopping.some((item) => item.ingredientId === text)) return text;
  const found = resolveOrCreate(text, lex, { create, now: today() });
  if (found.created) { state.userIngredients.push(found.created); return found.created.id; }
  if (found.id) return found.id;
  fail(`Ingrediente no reconocido: "${text}". Créalo con ingredient_add o repite con create: true.`, { code: 'unknown_ingredient' });
  return null;
}

/** Recipe line input (name or object) → stored ingredient line; new names become user ingredients. */
export function mapIngredientLine(state, value) {
  const input = typeof value === 'string' ? { name: value } : value;
  const id = ingredientRef(state, input.name, { create: true });
  return { ingredientId: id, quantity: input.quantity, unit: input.unit, optional: input.optional, isCore: input.isCore, note: input.note || input.name };
}

export function recipeSummary(recipe, state) {
  const lex = lexOf(state);
  const traits = recipeTraits(recipe, lex);
  const ratings = state.makes.filter((m) => m.recipeId === recipe.id && m.rating);
  const cooked = state.makes.filter((m) => m.recipeId === recipe.id);
  return {
    id: recipe.id, title: recipe.title, description: recipe.description, cuisine: recipe.cuisine, prepMin: recipe.prepMin, cookMin: recipe.cookMin,
    totalMin: (recipe.prepMin ?? 0) + (recipe.cookMin ?? 0) || null,
    servings: recipe.servings, difficulty: recipe.difficulty, temperature: recipe.temperature, heaviness: recipe.heaviness, seasonAffinity: recipe.seasonAffinity,
    dietFlags: recipe.dietFlags, allergens: recipe.allergens, image: recipe.image, remixOf: recipe.remixOf, sourceUrl: recipe.sourceUrl,
    ...(recipe.source ? { source: recipe.source } : {}),
    diet: traits.diet, allergens_detected: traits.allergens, traits_complete: traits.complete,
    rating: ratings.length ? Math.round((ratings.reduce((s, m) => s + m.rating, 0) / ratings.length) * 100) / 100 : null,
    cooked_count: cooked.length, last_cooked: cooked.map((m) => m.createdAt).sort().at(-1)?.slice(0, 10) ?? null,
    own: !String(recipe.authorId).startsWith('seed') && recipe.authorId !== 'seed',
    ingredients: recipe.ingredients.map((ingredient) => ({ ...ingredient, name: nameOf(state, ingredient.ingredientId) })),
  };
}

export function costSummary(state, recipe, options = {}) {
  const cost = recipeCost(state, recipe, today(), options);
  return { per_serving: cost.per_serving, total: cost.total, complete: cost.complete, missing_prices: cost.missing_prices };
}

export { reconcilePantry, ingredientInfo, resolveName, today };
