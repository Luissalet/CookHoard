// CookHoard — shared domain types. UI-agnostic: no React / React Native here so the same
// types + engine run in the app, in the (future) importer, and in Node tests.

export type Hemisphere = 'N' | 'S';
export type Season = 'spring' | 'summer' | 'autumn' | 'winter';

/** Serving temperature of the finished dish — a core input to Signal B. */
export type Temperature = 'hot' | 'cold' | 'room';

/** 1 = light (salad), 2 = medium, 3 = hearty (stew). Core input to Signal B. */
export type Heaviness = 1 | 2 | 3;
export type Difficulty = 1 | 2 | 3;

/** Canonical ingredient in the dictionary. Names carried in ES + EN so the app stays i18n. */
export interface Ingredient {
  id: string;
  name: string;        // Spanish (default data language)
  nameEn: string;
  aliases?: string[];
  category?: string;   // verdura, legumbre, lácteo, especia…
  isStaple?: boolean;  // assumed on-hand (salt, oil, water) → never counts as "missing"
  defaultUnit?: string;
}

/** One line of a recipe's ingredient list. */
export interface RecipeIngredient {
  ingredientId: string;   // → Ingredient.id (or a free-text slug until resolved)
  quantity?: number;
  unit?: string;
  isCore?: boolean;       // default true. Non-core doesn't block "you can cook it now".
  optional?: boolean;
  note?: string;
}

export interface RecipeStep {
  text: string;
  timerSec?: number;
  /** Oven or pan temperature named in the step, in °C. */
  temperatureC?: number;
}

/** Where an imported recipe came from. Absent on recipes typed in by hand. */
export interface RecipeSource {
  kind: 'manual' | 'url' | 'video' | 'text' | 'web';
  url?: string;
  /** Platform name of a video link (instagram, tiktok, youtube, facebook…). */
  platform?: string;
  /** Account or channel that published it: shown as credit. */
  uploader?: string;
  /** Local path (relative to the data folder, served under /media) of the saved thumbnail. */
  thumbnail?: string;
  importedAt?: string;
  /** What the recipe was read from: caption, subtitles, transcript, frames, web, text. */
  evidence?: string[];
}

export interface Recipe {
  id: string;
  authorId: string;
  authorName?: string;
  /** Lineage: id of the recipe this one was remixed from. */
  remixOf?: string;
  title: string;
  description?: string;
  image?: string;
  sourceUrl?: string;
  source?: RecipeSource;
  servings?: number;
  prepMin?: number;
  cookMin?: number;
  difficulty?: Difficulty;
  cuisine?: string;
  /** [] or undefined = good all year. Otherwise the seasons the author says it fits. */
  seasonAffinity?: Season[];
  temperature?: Temperature;
  heaviness?: Heaviness;
  dietFlags?: string[];   // vegano, vegetariano, sin_gluten…
  allergens?: string[];   // gluten, lactosa, frutos_secos…
  ingredients: RecipeIngredient[];
  steps: RecipeStep[];
  createdAt: string;
  ratingAvg?: number;     // derived from makes + reviews (1..5)
  makeCount?: number;
  saved?: boolean;        // local UI flag: is it in my cookbook
}

/** A "make": a record that you cooked a recipe. */
export interface Make {
  id: string;
  recipeId: string;
  authorId: string;
  authorName?: string;
  rating?: number;        // 1..5
  notes?: string;
  images?: string[];
  servingsMade?: number;
  /** Portions eaten at the table; the rest becomes leftovers. */
  servingsEaten?: number;
  timeTakenMin?: number;
  wouldRepeat?: boolean;
  createdAt: string;
}

/** What the user has in the fridge/pantry right now. Feeds the recommender. */
export interface PantryItem {
  ingredientId: string;
  quantity?: number;
  unit?: string;
  expiresAt?: string;
}
