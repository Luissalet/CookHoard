// CloudSource — the Supabase adapter mirroring the local store's operations. Used when isCloud.
// Recipes carry nested ingredients/steps; makes/pantry/saved/reviews/feed map 1:1 to the schema.
import { supabase } from './client';
import type { Recipe, RecipeIngredient, RecipeStep, Make } from '@cookhoard/core';

type Row = Record<string, any>;
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9áéíóúñ]+/gi, '_').replace(/^_+|_+$/g, '');

function toRecipe(r: Row): Recipe {
  const ings: RecipeIngredient[] = (r.recipe_ingredient ?? [])
    .slice().sort((a: Row, b: Row) => (a.ord ?? 0) - (b.ord ?? 0))
    .map((i: Row) => ({
      ingredientId: i.ingredient_id ?? (i.free_text ? slug(i.free_text) : ''),
      quantity: i.quantity ?? undefined, unit: i.unit ?? undefined,
      isCore: i.is_core, optional: i.is_optional, note: i.free_text ?? undefined,
    }));
  const steps: RecipeStep[] = (r.recipe_step ?? [])
    .slice().sort((a: Row, b: Row) => (a.ord ?? 0) - (b.ord ?? 0))
    .map((s: Row) => ({ text: s.text, timerSec: s.timer_sec ?? undefined }));
  return {
    id: r.id, authorId: r.author_id, title: r.title, remixOf: r.remix_of ?? undefined,
    description: r.description ?? undefined, image: r.image ?? undefined,
    servings: r.servings ?? undefined, prepMin: r.prep_min ?? undefined, cookMin: r.cook_min ?? undefined,
    difficulty: r.difficulty ?? undefined, cuisine: r.cuisine ?? undefined,
    seasonAffinity: r.season_affinity ?? [], temperature: r.temperature ?? undefined, heaviness: r.heaviness ?? undefined,
    dietFlags: r.diet_flags ?? [], allergens: r.allergens ?? [],
    ingredients: ings, steps,
    createdAt: r.created_at, ratingAvg: r.rating_avg ?? undefined, makeCount: r.make_count ?? 0,
  };
}

function toMake(m: Row): Make {
  return {
    id: m.id, recipeId: m.recipe_id, authorId: m.author_id, rating: m.rating ?? undefined,
    notes: m.notes ?? undefined, images: m.images ?? [], servingsMade: m.servings_made ?? undefined,
    timeTakenMin: m.time_taken_min ?? undefined, wouldRepeat: m.would_repeat ?? undefined, createdAt: m.created_at,
  };
}

export const CloudSource = {
  async listRecipes(): Promise<Recipe[]> {
    if (!supabase) return [];
    const { data } = await supabase
      .from('recipe')
      .select('*, recipe_ingredient(*), recipe_step(*)')
      .order('created_at', { ascending: false });
    return (data ?? []).map(toRecipe);
  },

  async createRecipe(r: Recipe, authorId: string): Promise<string | null> {
    if (!supabase) return null;
    const { data, error } = await supabase.from('recipe').insert({
      author_id: authorId, title: r.title, description: r.description, image: r.image,
      remix_of: r.remixOf ?? null,
      servings: r.servings, prep_min: r.prepMin, cook_min: r.cookMin, difficulty: r.difficulty,
      cuisine: r.cuisine, season_affinity: r.seasonAffinity ?? [], temperature: r.temperature, heaviness: r.heaviness,
      diet_flags: r.dietFlags ?? [], allergens: r.allergens ?? [], source_url: (r as Row).source_url,
    }).select('id').single();
    if (error || !data) return null;
    const rid = data.id as string;
    if (r.ingredients.length) {
      await supabase.from('recipe_ingredient').insert(r.ingredients.map((i, ord) => ({
        recipe_id: rid, ingredient_id: i.ingredientId || null, free_text: i.note ?? null,
        quantity: i.quantity ?? null, unit: i.unit ?? null, is_core: i.isCore !== false, is_optional: !!i.optional, ord,
      })));
    }
    if (r.steps.length) {
      await supabase.from('recipe_step').insert(r.steps.map((s, ord) => ({ recipe_id: rid, ord, text: s.text, timer_sec: s.timerSec ?? null })));
    }
    return rid;
  },

  async makesFor(recipeId: string): Promise<Make[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('recipe_make').select('*').eq('recipe_id', recipeId).order('created_at', { ascending: false });
    return (data ?? []).map(toMake);
  },

  async addMake(m: Make, authorId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('recipe_make').insert({
      recipe_id: m.recipeId, author_id: authorId, rating: m.rating ?? null, notes: m.notes ?? null,
      images: m.images ?? [], servings_made: m.servingsMade ?? null, time_taken_min: m.timeTakenMin ?? null,
      would_repeat: m.wouldRepeat ?? null,
    });
  },

  async getPantry(): Promise<string[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('pantry_item').select('ingredient_id');
    return (data ?? []).map((p: Row) => p.ingredient_id).filter(Boolean);
  },
  async addPantry(ingredientId: string, profileId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('pantry_item').insert({ profile_id: profileId, ingredient_id: ingredientId });
  },
  async removePantry(ingredientId: string, profileId: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('pantry_item').delete().eq('profile_id', profileId).eq('ingredient_id', ingredientId);
  },

  async getSaved(): Promise<string[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('saved_recipe').select('recipe_id');
    return (data ?? []).map((s: Row) => s.recipe_id);
  },
  async setSaved(recipeId: string, on: boolean, profileId: string): Promise<void> {
    if (!supabase) return;
    if (on) await supabase.from('saved_recipe').insert({ profile_id: profileId, recipe_id: recipeId });
    else await supabase.from('saved_recipe').delete().eq('profile_id', profileId).eq('recipe_id', recipeId);
  },

  async feed(): Promise<Make[]> {
    if (!supabase) return [];
    const { data } = await supabase.rpc('following_feed', { limit_n: 50 });
    return (data ?? []).map(toMake);
  },

  async listReviews(recipeId: string): Promise<Row[]> {
    if (!supabase) return [];
    const { data } = await supabase.from('content_reviews').select('*').eq('entity_type', 'recipe').eq('entity_key', recipeId).order('created_at', { ascending: false });
    return data ?? [];
  },
  async upsertReview(recipeId: string, authorId: string, rating: number | null, body: string): Promise<void> {
    if (!supabase) return;
    await supabase.from('content_reviews').upsert({ author_id: authorId, entity_type: 'recipe', entity_key: recipeId, rating, body }, { onConflict: 'author_id,entity_type,entity_key' });
  },
};
