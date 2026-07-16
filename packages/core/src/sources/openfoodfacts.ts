// Open Food Facts barcode lookup → a pantry ingredient guess. Free & open. Pure mapping only.
import { resolveIngredient } from '../tagging';

export interface OFFProduct {
  product_name?: string;
  product_name_es?: string;
  categories_tags?: string[];
  ingredients_tags?: string[];
}
export interface OFFResponse { status: number; product?: OFFProduct; }

export interface PantryGuess { ingredientId: string; label: string; }

/** Turn a scanned product (status 1 = found) into a pantry ingredient guess. */
export function productToPantry(res: OFFResponse): PantryGuess | null {
  if (!res || res.status !== 1 || !res.product) return null;
  const label = (res.product.product_name_es || res.product.product_name || '').trim();
  if (!label) return null;
  return { ingredientId: resolveIngredient(label), label };
}
