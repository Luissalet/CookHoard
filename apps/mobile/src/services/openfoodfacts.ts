// Open Food Facts barcode lookup — free & open, no key. Fill the fridge by scanning/typing a code.
import { productToPantry, type OFFResponse, type PantryGuess } from '@cookhoard/core';

export async function lookupBarcode(code: string): Promise<PantryGuess | null> {
  try {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`);
    const json = (await res.json()) as OFFResponse;
    return productToPantry(json);
  } catch {
    return null;
  }
}
