// Import a recipe from schema.org/Recipe JSON-LD (what most recipe blogs embed) into our Recipe.
// The app fetches the page and extracts the JSON-LD; this module is the pure mapping + tagging.
import type { Recipe, RecipeIngredient } from './types';
import { inferTags, resolveIngredient } from './tagging';
import { detectTimer } from './timers';

export interface JsonLdRecipe {
  name?: string;
  description?: string;
  recipeCuisine?: string | string[];
  recipeYield?: string | number | (string | number)[];
  recipeIngredient?: string[];
  ingredients?: string[]; // legacy key
  recipeInstructions?: unknown;
  image?: unknown;
}

/** Find a Recipe node in a JSON-LD object, including common @graph and array wrappers. */
export function findJsonLdRecipe(value: unknown): JsonLdRecipe | null {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findJsonLdRecipe(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const node = value as Record<string, unknown>;
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  if (types.some((type) => typeof type === 'string' && (type === 'Recipe' || type.endsWith('/Recipe')))) {
    return node as JsonLdRecipe;
  }
  return findJsonLdRecipe(node['@graph']);
}

function parseInstructions(ri: unknown): string[] {
  if (!ri) return [];
  if (typeof ri === 'string') return ri.split(/\r?\n+/).map((s) => s.trim()).filter(Boolean);
  if (Array.isArray(ri)) {
    return ri
      .map((step) => {
        if (typeof step === 'string') return step;
        if (step && typeof step === 'object') {
          const o = step as Record<string, unknown>;
          return (o.text as string) ?? (o.name as string) ?? '';
        }
        return '';
      })
      .map((s) => String(s).trim())
      .filter(Boolean);
  }
  return [];
}

function parseServings(y: JsonLdRecipe['recipeYield']): number | undefined {
  const v = Array.isArray(y) ? y[0] : y;
  if (v == null) return undefined;
  if (typeof v === 'number') return v;
  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : undefined;
}

function stripQty(line: string): string {
  return line
    .replace(/^[\d\s/.,½¼¾–-]+\s*(kg|gr|g|ml|cl|l|tazas?|cups?|cdtas?|cdas?|tbsp|tsp|oz|lb|dientes?|unidad(es)?)?\.?\s*/i, '')
    .trim();
}

function parseAmount(line: string): Pick<RecipeIngredient, 'quantity' | 'unit'> {
  const match = line.trim().match(/^(\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾])\s*(kg|gr?|ml|cl|l|tazas?|cups?|cdas?|cdtas?|tbsp|tsp|oz|lb|dientes?|unidades?)?/i);
  if (!match) return {};
  const token = match[1]!;
  const quantity = token.includes('/') ? token.split('/').map(Number).reduce((a, b) => a / b)
    : ({ '½': 0.5, '¼': 0.25, '¾': 0.75 } as Record<string, number>)[token] ?? Number(token.replace(',', '.'));
  return Number.isFinite(quantity) && quantity > 0
    ? { quantity, ...(match[2] ? { unit: match[2].toLowerCase() } : {}) } : {};
}

function extractImage(img: unknown): string | undefined {
  if (!img) return undefined;
  if (typeof img === 'string') return img;
  if (Array.isArray(img)) {
    const first = img[0];
    return typeof first === 'string' ? first : (first as Record<string, string> | undefined)?.url;
  }
  if (typeof img === 'object') return (img as Record<string, string>).url;
  return undefined;
}

/** Parse a schema.org JSON-LD Recipe into our Recipe (with inferred Signal-B tags). */
export function parseJsonLdRecipe(json: JsonLdRecipe, id: string, authorId = 'import'): Recipe | null {
  const rawIngredients = json.recipeIngredient ?? json.ingredients ?? [];
  if (!json.name && rawIngredients.length === 0) return null;

  const ingredients: RecipeIngredient[] = rawIngredients.map((line) => ({
    ingredientId: resolveIngredient(stripQty(line)),
    ...parseAmount(line),
    note: line,
  }));
  const steps = parseInstructions(json.recipeInstructions).map((text) => ({ text, timerSec: detectTimer(text) }));
  const cuisine = Array.isArray(json.recipeCuisine) ? json.recipeCuisine[0] : json.recipeCuisine;
  const tags = inferTags([json.name ?? '', ...rawIngredients].join(' '));

  return {
    id,
    authorId,
    authorName: 'Importada',
    title: json.name?.trim() || 'Receta importada',
    description: json.description?.trim(),
    image: extractImage(json.image),
    cuisine: cuisine ? String(cuisine).toLowerCase() : undefined,
    servings: parseServings(json.recipeYield),
    temperature: tags.temperature,
    heaviness: tags.heaviness,
    seasonAffinity: tags.seasonAffinity,
    ingredients,
    steps,
    createdAt: new Date().toISOString(),
    makeCount: 0,
  };
}
