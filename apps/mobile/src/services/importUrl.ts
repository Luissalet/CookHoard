// Import a recipe from a blog URL (best-effort; CORS may block on web → use a device, or paste
// the JSON) or from pasted schema.org JSON-LD. Extraction here, mapping in core.
import { parseJsonLdRecipe, type Recipe } from '@cookhoard/core';
import { uid } from '../store';

function findRecipeNode(data: unknown): Record<string, unknown> | null {
  const list: unknown[] = Array.isArray(data)
    ? data
    : ((data as Record<string, unknown>)?.['@graph'] as unknown[]) ?? [data];
  for (const node of list) {
    const type = (node as Record<string, unknown> | null)?.['@type'];
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
      return node as Record<string, unknown>;
    }
  }
  return null;
}

export function extractJsonLd(html: string): Recipe | null {
  const blocks = html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi);
  for (const b of blocks) {
    try {
      const data = JSON.parse((b[1] ?? '').trim());
      const node = findRecipeNode(data);
      if (node) {
        const r = parseJsonLdRecipe(node, uid(), 'me');
        if (r) return r;
      }
    } catch {
      /* try next block */
    }
  }
  return null;
}

export async function importFromUrl(url: string): Promise<Recipe | null> {
  try {
    const res = await fetch(url);
    const html = await res.text();
    return extractJsonLd(html);
  } catch {
    return null;
  }
}

export function importFromJsonText(text: string): Recipe | null {
  try {
    const data = JSON.parse(text);
    const node = findRecipeNode(data) ?? data;
    return parseJsonLdRecipe(node as Record<string, unknown>, uid(), 'me');
  } catch {
    return null;
  }
}
