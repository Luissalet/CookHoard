// Recipe from a web page: schema.org Recipe JSON-LD when the page has it; otherwise the page text goes through the draft pipeline.
import crypto from 'node:crypto';
import { jsonldBlocks, jsonldNodes, loadJsonld } from '../hoard-commons/web.js';
import { getPage, pageProblem } from '../net-policy.mjs';
import { findJsonLdRecipe, parseJsonLdRecipe, htmlToText, parseRecipeText, looksLikeVideoUrl } from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { nowIso } from '../clock.mjs';
import { recipeSummary } from '../tools/common.mjs';
import { createDraft } from './drafts.mjs';
import { importVideo } from './video.mjs';
import { recipeSummaryByUrl } from './shared.mjs';

/** The first schema.org Recipe of a page, from its JSON-LD blocks (trailing commas, CDATA wrappers and HTML-escaped quotes are tolerated). */
export function recipeFromHtml(html) {
  const [blocks] = jsonldBlocks(html);
  for (const node of jsonldNodes(blocks, ['Recipe'])) {
    const recipe = findJsonLdRecipe(node);
    if (recipe) return recipe;
  }
  return null;
}

/** The page at `url` as { body, type, finalUrl }; a page that cannot be read throws a sentence for the person. */
async function fetchPage(url) {
  const res = await getPage(url, { accept: 'html', timeoutMs: 10000, maxBytes: 2_000_000 });
  if (!res.ok) throw new Error(pageProblem(res));
  if (res.truncated || res.text_truncated) throw new Error('La página es demasiado grande para importar.');
  return { body: String(res.text ?? ''), type: String(res.content_type || res.headers?.['content-type'] || ''), finalUrl: res.final_url || res.url || url };
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
    const [value] = loadJsonld(body);
    raw = findJsonLdRecipe(value);
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
