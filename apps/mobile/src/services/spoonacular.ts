// Spoonacular "find by ingredients" — augments the fridge with online matches when a key is set.
// No key → hasSpoonacular=false and calls return [] (the app just uses community + TheMealDB).
import { findToRecipe, type SpoonacularFind, type Recipe } from '@cookhoard/core';

const KEY = process.env.EXPO_PUBLIC_SPOONACULAR_KEY;
export const hasSpoonacular = !!KEY;

export async function findByIngredients(names: string[]): Promise<Recipe[]> {
  if (!KEY || names.length === 0) return [];
  try {
    const url = `https://api.spoonacular.com/recipes/findByIngredients?ingredients=${encodeURIComponent(names.join(','))}&number=10&ranking=2&ignorePantry=true&apiKey=${KEY}`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = (await res.json()) as SpoonacularFind[];
    return json.map(findToRecipe);
  } catch {
    return [];
  }
}
