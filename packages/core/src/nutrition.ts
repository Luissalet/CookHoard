// Friendly (approximate) nutrition estimate per serving. Not medical advice — a ballpark from a
// small per-100g table over the canonical ingredients we know.
import type { Recipe } from './types';

export interface Nutrition { kcal: number; protein: number; carbs: number; fat: number; }

const PER_100G: Record<string, Nutrition> = {
  tomato: { kcal: 18, protein: 0.9, carbs: 3.9, fat: 0.2 },
  cucumber: { kcal: 15, protein: 0.7, carbs: 3.6, fat: 0.1 },
  green_pepper: { kcal: 20, protein: 0.9, carbs: 4.6, fat: 0.2 },
  onion: { kcal: 40, protein: 1.1, carbs: 9.3, fat: 0.1 },
  garlic: { kcal: 149, protein: 6.4, carbs: 33, fat: 0.5 },
  bread: { kcal: 265, protein: 9, carbs: 49, fat: 3.2 },
  egg: { kcal: 143, protein: 13, carbs: 1.1, fat: 9.5 },
  potato: { kcal: 77, protein: 2, carbs: 17, fat: 0.1 },
  lentil: { kcal: 116, protein: 9, carbs: 20, fat: 0.4 },
  carrot: { kcal: 41, protein: 0.9, carbs: 10, fat: 0.2 },
  chorizo: { kcal: 455, protein: 24, carbs: 1.9, fat: 38 },
  pumpkin: { kcal: 26, protein: 1, carbs: 6.5, fat: 0.1 },
  pasta: { kcal: 158, protein: 6, carbs: 31, fat: 0.9 },
  basil: { kcal: 23, protein: 3.2, carbs: 2.7, fat: 0.6 },
  parmesan: { kcal: 431, protein: 38, carbs: 4.1, fat: 29 },
  pine_nuts: { kcal: 673, protein: 14, carbs: 13, fat: 68 },
  chicken: { kcal: 165, protein: 31, carbs: 0, fat: 3.6 },
  lemon: { kcal: 29, protein: 1.1, carbs: 9.3, fat: 0.3 },
  apple: { kcal: 52, protein: 0.3, carbs: 14, fat: 0.2 },
  banana: { kcal: 89, protein: 1.1, carbs: 23, fat: 0.3 },
  orange: { kcal: 47, protein: 0.9, carbs: 12, fat: 0.1 },
  olive_oil: { kcal: 884, protein: 0, carbs: 0, fat: 100 },
  sugar: { kcal: 387, protein: 0, carbs: 100, fat: 0 },
};

/** Approximate grams for an ingredient line. */
function grams(unit: string | undefined, qty: number | undefined): number {
  const q = qty ?? 1;
  if (!unit) return q * 100; // "1 tomato" ≈ 100 g
  const u = unit.toLowerCase();
  if (u === 'g' || u === 'gr') return q;
  if (u === 'kg') return q * 1000;
  if (u.startsWith('diente')) return q * 5;
  if (u === 'manojo') return q * 30;
  return q * 100;
}

/** Per-serving nutrition estimate, or null if none of the ingredients are known. */
export function estimateRecipeNutrition(recipe: Recipe): Nutrition | null {
  let known = 0;
  const total: Nutrition = { kcal: 0, protein: 0, carbs: 0, fat: 0 };
  for (const ri of recipe.ingredients) {
    const n = PER_100G[ri.ingredientId];
    if (!n) continue;
    known++;
    const g = grams(ri.unit, ri.quantity) / 100;
    total.kcal += n.kcal * g;
    total.protein += n.protein * g;
    total.carbs += n.carbs * g;
    total.fat += n.fat * g;
  }
  if (known === 0) return null;
  const s = recipe.servings && recipe.servings > 0 ? recipe.servings : 1;
  return {
    kcal: Math.round(total.kcal / s),
    protein: Math.round(total.protein / s),
    carbs: Math.round(total.carbs / s),
    fat: Math.round(total.fat / s),
  };
}
