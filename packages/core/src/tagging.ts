// Heuristics shared by the external sources + importer: infer Signal-B tags from free text,
// and resolve a free-text ingredient name to a canonical dictionary id (so fridge matching works).
import type { Season, Temperature, Heaviness } from './types';
import { INGREDIENTS } from './seed';

export interface InferredTags {
  temperature: Temperature;
  heaviness: Heaviness;
  seasonAffinity: Season[];
}

const COLD_LIGHT = ['ensalada', 'salad', 'gazpacho', 'ceviche', 'carpaccio', 'helad', 'ice cream', 'sorbet', 'smoothie', 'batido', 'frío', 'frio', 'cold', 'tartar', 'poke', 'salpicón'];
const HOT_HEARTY = ['sopa', 'soup', 'guiso', 'stew', 'estofad', 'caldo', 'cocido', 'lentej', 'potaje', 'asad', 'roast', 'horno', 'bake', 'curry', 'chili', 'braise', 'ragú', 'ragout', 'fabada'];
const HEAVY_WORDS = ['frito', 'fried', 'fritura', 'queso', 'cheese', 'nata', 'cream', 'bacon', 'panceta', 'chocolate', 'mantequilla', 'butter', 'crema'];

/** Infer temperature/heaviness/season from a title + ingredient/instruction text. */
export function inferTags(text: string): InferredTags {
  const s = text.toLowerCase();
  const hit = (arr: string[]) => arr.some((w) => s.includes(w));
  let temperature: Temperature = 'room';
  let heaviness: Heaviness = 2;
  let seasonAffinity: Season[] = [];
  if (hit(COLD_LIGHT)) {
    temperature = 'cold'; heaviness = 1; seasonAffinity = ['summer'];
  } else if (hit(HOT_HEARTY)) {
    temperature = 'hot'; heaviness = 3; seasonAffinity = ['autumn', 'winter'];
  }
  if (hit(HEAVY_WORDS) && heaviness < 3) heaviness = (heaviness + 1) as Heaviness;
  return { temperature, heaviness, seasonAffinity };
}

/** Resolve a free-text ingredient name to a canonical id (exact → alias → contains → slug). */
export function resolveIngredient(name: string): string {
  const q = name.trim().toLowerCase();
  if (!q) return '';
  for (const ing of INGREDIENTS) {
    if (ing.name.toLowerCase() === q || ing.nameEn.toLowerCase() === q) return ing.id;
    if (ing.aliases?.some((a) => a.toLowerCase() === q)) return ing.id;
  }
  for (const ing of INGREDIENTS) {
    if (q.includes(ing.name.toLowerCase()) || q.includes(ing.nameEn.toLowerCase())) return ing.id;
  }
  return q.replace(/[^a-z0-9áéíóúñ]+/gi, '_').replace(/^_+|_+$/g, '');
}
