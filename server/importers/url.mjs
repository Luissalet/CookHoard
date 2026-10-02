import { findJsonLdRecipe } from '@cookhoard/core';

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

export async function fetchRecipeFromUrl(url) {
  let response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(10000),
      headers: { Accept: 'text/html,application/ld+json;q=0.9' } });
  } catch {
    throw new Error('No se pudo abrir la página de la receta.');
  }
  if (!response.ok) throw new Error(`La página respondió con ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/text\/html|application\/ld\+json|application\/json/i.test(type)) {
    throw new Error('El enlace no devuelve una página o JSON-LD de receta.');
  }
  const size = Number(response.headers.get('content-length') || 0);
  if (size > 2_000_000) throw new Error('La página es demasiado grande para importar.');
  const body = await response.text();
  if (body.length > 2_000_000) throw new Error('La página es demasiado grande para importar.');
  let recipe = null;
  if (/application\/(ld\+json|json)/i.test(type)) {
    try { recipe = findJsonLdRecipe(JSON.parse(body)); } catch { /* explain below */ }
  } else {
    recipe = recipeFromHtml(body);
  }
  if (!recipe) throw new Error('No se encontró una receta JSON-LD en la página.');
  return { recipe, sourceUrl: response.url };
}
