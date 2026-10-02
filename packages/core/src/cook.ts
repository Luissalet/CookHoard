// "¿Qué ceno?": rank recipes for tonight from what you have, what expires, what you cooked lately and what you rated well.
import type { KitchenV2 } from './kitchen';
import type { Hemisphere, Recipe } from './types';
import { DEFAULT_STAPLES } from './seed';
import { scoreRecipe } from './recommend';
import { ingredientName, type Lexicon } from './ingredients';
import { recipeTraits, normaliseAllergen, normaliseDiet } from './diet';
import { pantryView } from './pantry';
import { daysBetween } from './text';
import { dishSeasonFit, seasonForMonth } from './season';
import { round2 } from './units';
import type { Season } from './types';

export interface CookQuery {
  max_minutes?: number;
  servings?: number;
  diet?: string[];
  avoid_allergens?: string[];
  only_have?: boolean;
  allow_missing?: number;
  use_expiring?: boolean;
  avoid_days?: number;
  prefer_rated?: boolean;
  month?: number;
  hemisphere?: Hemisphere;
  season?: Season;
  limit?: number;
  expiring_within_days?: number;
}

export interface CookOption {
  type: 'recipe' | 'leftover';
  recipe_id: string;
  title: string;
  minutes: number | null;
  score: number;
  reasons: string[];
  have: string[];
  missing: string[];
  uses_expiring: string[];
  last_cooked: string | null;
  rating: number | null;
  servings: number | null;
  leftover_servings?: number;
  expires?: string | null;
}

const plural = (n: number, one: string, many: string): string => (n === 1 ? one : many);
const dayWord = (days: number): string => (days < 0 ? `caducó hace ${-days} d` : days === 0 ? 'caduca hoy' : days === 1 ? 'caduca mañana' : `caduca en ${days} d`);

export function whatToCook(state: KitchenV2, recipes: Recipe[], query: CookQuery, today: string): { options: CookOption[]; leftovers: CookOption[]; filters: string[]; excluded: Record<string, number> } {
  const lex: Lexicon = { userIngredients: state.userIngredients, learnedAliases: state.learnedAliases };
  const pantry = pantryView(state, today);
  const leftovers = pantry.filter((p) => p.leftover);
  const real = pantry.filter((p) => !p.leftover);
  const have = real.map((p) => p.ingredientId);
  const within = query.expiring_within_days ?? 3;
  const expiring = real.filter((p) => p.days_left !== null && p.days_left <= within);
  const expiringIds = new Map(expiring.map((p) => [p.ingredientId, p]));
  const month = query.month ?? Number(today.slice(5, 7));
  const hemisphere = query.hemisphere ?? 'N';
  const season = query.season ?? seasonForMonth(month, hemisphere);
  const avoidDays = query.avoid_days ?? 3;
  const allowMissing = query.only_have ? 0 : query.allow_missing ?? 99;
  const wantDiet = (query.diet ?? []).map(normaliseDiet);
  const avoidAllergens = (query.avoid_allergens ?? []).map(normaliseAllergen);
  const filters: string[] = [];
  if (query.max_minutes) filters.push(`máximo ${query.max_minutes} min`);
  if (wantDiet.length) filters.push(`dieta: ${wantDiet.join(', ')}`);
  if (avoidAllergens.length) filters.push(`sin: ${avoidAllergens.join(', ')}`);
  if (query.only_have) filters.push('solo con lo que tienes');
  else if (query.allow_missing !== undefined) filters.push(`como mucho ${query.allow_missing} ingrediente(s) que falten`);
  if (avoidDays > 0) filters.push(`sin repetir lo cocinado en los últimos ${avoidDays} días`);
  const excluded: Record<string, number> = { tiempo: 0, dieta: 0, alergenos: 0, faltan: 0, reciente: 0 };

  const options: CookOption[] = [];
  for (const recipe of recipes) {
    const minutes = (recipe.prepMin ?? 0) + (recipe.cookMin ?? 0) || null;
    if (query.max_minutes && minutes !== null && minutes > query.max_minutes) { excluded.tiempo!++; continue; }
    const traits = recipeTraits(recipe, lex);
    if (wantDiet.length && !wantDiet.every((d) => traits.diet.includes(d))) { excluded.dieta!++; continue; }
    if (avoidAllergens.length && avoidAllergens.some((a) => traits.allergens.includes(a))) { excluded.alergenos!++; continue; }
    const makes = state.makes.filter((m) => m.recipeId === recipe.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const lastCooked = makes[0]?.createdAt.slice(0, 10) ?? null;
    const since = lastCooked ? daysBetween(lastCooked, today) : null;
    if (avoidDays > 0 && since !== null && since < avoidDays) { excluded.reciente!++; continue; }
    const scored = scoreRecipe(recipe, { pantry: have, month, hemisphere, staples: DEFAULT_STAPLES });
    if (scored.missing.length > allowMissing) { excluded.faltan!++; continue; }
    const rated = makes.filter((m) => m.rating);
    const rating = rated.length ? round2(rated.reduce((s, m) => s + (m.rating ?? 0), 0) / rated.length) : null;
    const uses = recipe.ingredients.filter((i) => expiringIds.has(i.ingredientId)).map((i) => expiringIds.get(i.ingredientId)!);
    let score = scored.score;
    const reasons: string[] = [];
    if (scored.missing.length === 0) reasons.push('Tienes todos los ingredientes.');
    else reasons.push(`Te ${plural(scored.missing.length, 'falta', 'faltan')} ${scored.missing.length}: ${scored.missing.slice(0, 4).map((id) => ingredientName(id, lex)).join(', ')}${scored.missing.length > 4 ? '…' : ''}.`);
    if (uses.length) {
      score += (query.use_expiring === false ? 0 : 1.5) * uses.length;
      reasons.push(`Gasta lo que caduca: ${uses.slice(0, 3).map((u) => `${u.name} (${dayWord(u.days_left!)})`).join(', ')}.`);
    }
    if (query.prefer_rated !== false && rating !== null) {
      score += (rating - 3) * 0.4;
      if (rating >= 4) reasons.push(`Valoración media ${String(rating).replace('.', ',')} de 5.`);
    }
    if (since === null) reasons.push('Aún no la has cocinado.');
    else if (since >= 14) { score += 0.3; reasons.push(`No la cocinas desde hace ${since} días.`); }
    const fit = dishSeasonFit(recipe, season);
    if (fit >= 0.34) reasons.push('Encaja con la temporada.');
    if (minutes !== null) reasons.push(`${minutes} min.`);
    else if (query.max_minutes) reasons.push('Tiempo no indicado en la receta.');
    options.push({ type: 'recipe', recipe_id: recipe.id, title: recipe.title, minutes, score: round2(score), reasons, have: scored.have.map((id) => ingredientName(id, lex)),
      missing: scored.missing.map((id) => ingredientName(id, lex)), uses_expiring: uses.map((u) => u.name), last_cooked: lastCooked, rating, servings: recipe.servings ?? null });
  }
  options.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'es'));
  const leftoverOptions: CookOption[] = leftovers.map((l) => {
    const recipe = recipes.find((r) => r.id === l.leftover!.recipeId);
    return { type: 'leftover' as const, recipe_id: l.leftover!.recipeId, title: l.name, minutes: 5, score: 100, reasons: [`Sobras de ${recipe?.title ?? 'una receta'}: ${l.qty ?? l.leftover!.servings} ración(es), ${l.days_left !== null ? dayWord(l.days_left) : 'sin fecha'} (estimado).`],
      have: [], missing: [], uses_expiring: [], last_cooked: null, rating: null, servings: l.leftover!.servings, leftover_servings: l.leftover!.servings, expires: l.expiresAt };
  });
  const limit = query.limit ?? 6;
  return { options: options.slice(0, limit), leftovers: leftoverOptions, filters, excluded };
}
