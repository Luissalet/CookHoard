// Diet flags and allergens of a recipe: the ones its author wrote, plus what can be read from its known ingredients.
import type { Recipe } from './types';
import { ingredientInfo, type Lexicon } from './ingredients';

const MEAT = new Set(['carne', 'picada', 'ave', 'pescado', 'marisco', 'embutido', 'fiambre']);
const ANIMAL = new Set(['lacteo', 'queso', 'quesofresco', 'yogur', 'leche', 'huevo']);
const ANIMAL_IDS = new Set(['miel', 'gelatina']);

export interface RecipeTraits {
  diet: string[];
  allergens: string[];
  /** Every ingredient was recognised, so the inferred flags are reliable. */
  complete: boolean;
  inferred: boolean;
}

export function recipeTraits(recipe: Recipe, lex: Lexicon = {}): RecipeTraits {
  const infos = recipe.ingredients.filter((i) => !i.optional).map((i) => ingredientInfo(i.ingredientId, lex));
  const complete = infos.length > 0 && infos.every((i) => i.known);
  const allergens = new Set<string>(recipe.allergens ?? []);
  for (const i of infos) for (const a of i.allergens) allergens.add(a);
  const diet = new Set<string>((recipe.dietFlags ?? []).map((d) => d.replace(/_opcional$/, '')));
  let inferred = false;
  if (complete) {
    const meat = infos.some((i) => MEAT.has(i.category) || i.meat);
    const animal = infos.some((i) => ANIMAL.has(i.category) || ANIMAL_IDS.has(i.id));
    if (!meat && !diet.has('vegetariano')) { diet.add('vegetariano'); inferred = true; }
    if (!meat && !animal && !diet.has('vegano')) { diet.add('vegano'); inferred = true; }
    if (!allergens.has('gluten') && !diet.has('sin_gluten')) { diet.add('sin_gluten'); inferred = true; }
    if (!allergens.has('lactosa') && !infos.some((i) => ['leche', 'queso', 'quesofresco', 'yogur', 'lacteo'].includes(i.category)) && !diet.has('sin_lactosa')) { diet.add('sin_lactosa'); inferred = true; }
  }
  return { diet: [...diet], allergens: [...allergens], complete, inferred };
}

export const normaliseDiet = (value: string): string => {
  const v = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_');
  if (v === 'vegetarian') return 'vegetariano';
  if (v === 'vegan') return 'vegano';
  if (v === 'gluten_free' || v === 'celiaco' || v === 'sin_tacc') return 'sin_gluten';
  if (v === 'lactose_free') return 'sin_lactosa';
  return v;
};
export const normaliseAllergen = (value: string): string => {
  const v = value.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[\s-]+/g, '_');
  const map: Record<string, string> = { lacteos: 'lactosa', leche: 'lactosa', lactose: 'lactosa', dairy: 'lactosa', nuts: 'frutos_secos', frutos_secos: 'frutos_secos', egg: 'huevo', eggs: 'huevo', huevos: 'huevo',
    fish: 'pescado', shellfish: 'marisco', crustaceos: 'marisco', peanut: 'cacahuete', peanuts: 'cacahuete', cacahuetes: 'cacahuete', soy: 'soja', sesame: 'sesamo', celery: 'apio', mustard: 'mostaza' };
  return map[v] ?? v;
};
