// Recipe from a web page: schema.org Recipe JSON-LD when the page has it; otherwise the page text goes through the draft pipeline.
import crypto from 'node:crypto';
import { findJsonLdRecipe, parseJsonLdRecipe, htmlToText, parseRecipeText, looksLikeVideoUrl } from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { nowIso } from '../clock.mjs';
import { recipeSummary } from '../tools/common.mjs';
import { createDraft } from './drafts.mjs';
import { importVideo } from './video.mjs';
import { recipeSummaryByUrl } from './shared.mjs';

export function recipeFromHtml(html) {
  const scripts = html.matchAll(/<script\b(?=[^>]*\btype\s*=\s*["']application\/ld\+json["'])[^>]*>([\s\S]*?)<\/script\s*>/gi);
  for (const [, body] of scripts) {
    try {
      const recipe = findJsonLdRecipe(JSON.parse(body.trim()));
      if (recipe) return recipe;
    } catch {
      // Some sites include non-JSON scripts; continue to the next JSON-LD block.
    }
  }
  return null;
}

async function fetchPage(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: { Accept: 'text/html,application/ld+json;q=0.9' } });
  } catch {
    throw new Error('No se pudo abrir la página de la receta.');
  }
  if (!response.ok) throw new Error(`La página respondió con ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|application\/ld\+json|application\/json/i.test(type)) throw new Error('El enlace no devuelve una página o JSON-LD de receta.');
  const size = Number(response.headers.get('content-length') || 0);
  if (size > 2_000_000) throw new Error('La página es demasiado grande para importar.');
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('La página es demasiado grande para importar.');
  return { body, type, finalUrl: response.url || url };
}

const withSource = (recipe, url) => ({ ...recipe, sourceUrl: url, source: { kind: 'url', url, importedAt: nowIso() } });

/** Save a recipe from a link. Video links are handled by the video importer; pages without structured data become a draft to review. */
export async function importRecipeUrl(url, { use_model = true } = {}) {
  if (looksLikeVideoUrl(url)) return importVideo({ url, use_model });
  const known = recipeSummaryByUrl(readKitchen(), url);
  if (known) return { recipe: known, steps: known.steps, already_imported: true };
  const { body, type, finalUrl } = await fetchPage(url);
  const existing = recipeSummaryByUrl(readKitchen(), finalUrl);
  if (existing) return { recipe: existing, steps: existing.steps, already_imported: true };
  let raw = null;
  if (/application\/(ld\+json|json)/i.test(type)) {
    try { raw = findJsonLdRecipe(JSON.parse(body)); } catch { /* explained below */ }
  } else raw = recipeFromHtml(body);
  const recipe = raw ? parseJsonLdRecipe(raw, `local-${crypto.randomUUID()}`, 'local') : null;
  if (recipe && recipe.ingredients.length && recipe.steps.length) {
    const state = updateKitchen((current) => { current.recipes.push(withSource(recipe, finalUrl)); return current; });
    const saved = state.recipes.at(-1);
    return { recipe: recipeSummary(saved, state), steps: saved.steps, already_imported: false };
  }
  const text = /application\/(ld\+json|json)/i.test(type) ? '' : htmlToText(body).slice(0, 60000);
  if (text && parseRecipeText(text).plausible) {
    const draft = await createDraft({ kind: 'web', url, canonicalUrl: finalUrl, sources: { web: text }, notes: { web: 'sin datos estructurados: leído del texto de la página' }, useModel: use_model });
    return { status: 'draft', draft, already_imported: false };
  }
  throw new Error('No se encontró una receta en la página (ni datos estructurados ni una lista de ingredientes legible).');
}
