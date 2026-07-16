// Spoonacular "find recipes by ingredients" → light Recipe stub, used to augment the fridge
// results when a key is present. Pure mapping only. (Their ToS: don't store their catalogue —
// treat these as live augmentation, not durable content.)
import type { Recipe, RecipeIngredient } from '../types';
import { resolveIngredient } from '../tagging';

export interface SpoonacularFind {
  id: number;
  title: string;
  image?: string;
  usedIngredients?: { name: string }[];
  missedIngredients?: { name: string }[];
}

export function findToRecipe(hit: SpoonacularFind): Recipe {
  const used: RecipeIngredient[] = (hit.usedIngredients ?? []).map((u) => ({ ingredientId: resolveIngredient(u.name), note: u.name }));
  const missed: RecipeIngredient[] = (hit.missedIngredients ?? []).map((u) => ({ ingredientId: resolveIngredient(u.name), note: u.name }));
  return {
    id: `spoonacular:${hit.id}`,
    authorId: 'spoonacular',
    authorName: 'Spoonacular',
    title: hit.title,
    image: hit.image,
    ingredients: [...used, ...missed],
    steps: [],
    createdAt: new Date().toISOString(),
    makeCount: 0,
  };
}
