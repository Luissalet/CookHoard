// TheMealDB → Recipe. Free API used to seed a browsable catalogue. Pure mapping only (the app
// does the fetch). A meal carries strIngredient1..20 + strMeasure1..20.
import type { Recipe, RecipeIngredient } from '../types';
import { inferTags, resolveIngredient } from '../tagging';
import { detectTimer } from '../timers';

export interface TheMealDBMeal {
  idMeal: string;
  strMeal: string;
  strArea?: string;
  strCategory?: string;
  strInstructions?: string;
  strMealThumb?: string;
  [key: string]: string | undefined;
}

export function mealToRecipe(meal: TheMealDBMeal): Recipe {
  const ingredients: RecipeIngredient[] = [];
  for (let i = 1; i <= 20; i++) {
    const name = (meal[`strIngredient${i}`] ?? '').trim();
    if (!name) continue;
    const measure = (meal[`strMeasure${i}`] ?? '').trim();
    ingredients.push({ ingredientId: resolveIngredient(name), note: measure || undefined });
  }
  const steps = (meal.strInstructions ?? '')
    .split(/\r?\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .map((text) => ({ text, timerSec: detectTimer(text) }));
  const tags = inferTags([meal.strMeal, meal.strCategory ?? '', meal.strInstructions ?? ''].join(' '));

  return {
    id: `themealdb:${meal.idMeal}`,
    authorId: 'themealdb',
    authorName: 'TheMealDB',
    title: meal.strMeal,
    image: meal.strMealThumb,
    cuisine: meal.strArea?.toLowerCase(),
    temperature: tags.temperature,
    heaviness: tags.heaviness,
    seasonAffinity: tags.seasonAffinity,
    ingredients,
    ste