// TheMealDB fetch wrapper (free; key "1" works). Seeds a browsable catalogue and lets you
// filter by ingredient. Degrades to [] on any error/offline. Pure mapping lives in core.
import { mealToRecipe, type TheMealDBMeal, type Recipe } from '@cookhoard/core';

const KEY = process.env.EXPO_PUBLIC_THEMEALDB_KEY || '1';
const BASE = `https://www.themealdb.com/api/json/v1/${KEY}`;

export async function searchMeals(q: string): Promise<Recipe[]> {
  try {
    const res = await fetch(`${BASE}/search.php?s=${encodeURIComponent(q)}`);
    const json = await res.json();
    return ((json.meals ?? []) as TheMealDBMeal[]).map(mealToRecipe);
  } catch {
    return [];
  }
}

export async function randomMeals(n = 10): Promise<Recipe[]> {
  const out: Recipe[] = [];
  try {
    const batch = await Promise.all(
      Array.from({ length: n }, () => fetch(`${BASE}/random.php`).then((r) => r.json()).catch(() => null)),
    );
    for (const j of batch) {
      const m = j?.meals?.[0] as TheMealDBMeal | undefined;
      if (m) out.push(mealToRecipe(m));
    }
  } catch {
    /* ignore */
  }
  return [...new Map(out.map((r) => [r.id, r])).values()];
}

export async function byIngredient(name: string): Promise<Recipe[]> {
  try {
    const res = await fetch(`${BASE}/filter.php?i=${encodeURIComponent(name)}`);
    const json = await res.json();
    const ids: string[] = (json.meals ?? []).slice(0, 8).map((m: { idMeal: string }) => m.idMeal);
    const full = await Promise.all(
      ids.map((id) => fetch(`${BASE}/lookup.php?i=${id}`).then((r) => r.json()).then((j) => j.meals?.[0]).catch(() => null)),
    );
    return (full.filter(Boolean) as TheMealDBMeal[]).map(mealToRecipe);
  } catch {
    return [];
  }
}
