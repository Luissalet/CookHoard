// Shelf life: how long food keeps by category and place. Everything returned here is an ESTIMATE and says so.
import { CATEGORY_BY_ID, categoryOf, type Place, type ShelfEstimate } from './categories';
import { ingredientInfo, type Lexicon } from './ingredients';
import { addDays, daysBetween, isoDay } from './text';

export type ExpiryKind = 'exact' | 'estimated';
export type ExpiryLevel = 'expired' | 'today' | 'soon' | 'ok' | 'none';

export interface ShelfInput {
  ingredientId: string;
  place: Place;
  /** Day the food entered that place (purchase, cooking or move). */
  from: string;
  /** The package was opened on this day. */
  openedAt?: string | null;
}

/** Estimated expiry day for an ingredient kept in a place. date is null for foods without a meaningful expiry. */
export function estimateExpiry(input: ShelfInput, lex: Lexicon = {}): ShelfEstimate & { place: Place } {
  const info = ingredientInfo(input.ingredientId, lex);
  const cat = CATEGORY_BY_ID[info.category] ?? categoryOf('otros');
  const own = info.shelfLife?.[input.place];
  let days: number | null | undefined = own ?? cat.shelf[input.place];
  let basis = own != null ? `Duración indicada para ${info.name}: ${own} días en ${input.place}` : cat.basis;
  if (days === undefined) {
    // Not advisable in that place: fall back to the usual place, but say so.
    days = cat.shelf[cat.place];
    basis = `${cat.basis} (no es lo habitual en ${input.place}; se usa la estimación de ${cat.place})`;
  }
  if (days == null) return { date: null, days: null, kind: 'estimated', basis: cat.basis, place: input.place };
  let start = input.from;
  if (input.openedAt && cat.opened && input.place !== 'congelador') {
    if (cat.opened < days) {
      days = cat.opened;
      start = input.openedAt;
      basis = `Una vez abierto dura unos ${cat.opened} días en nevera`;
    }
  }
  return { date: addDays(start, days), days, kind: 'estimated', basis, place: input.place };
}

/** Days from `today` to an expiry day; negative = already past. null without a date. */
export function daysLeft(expiresAt: string | null | undefined, today: string = isoDay(new Date())): number | null {
  if (!expiresAt) return null;
  return daysBetween(today, expiresAt);
}

export function expiryLevel(expiresAt: string | null | undefined, today: string = isoDay(new Date()), soonDays = 2): ExpiryLevel {
  const left = daysLeft(expiresAt, today);
  if (left === null) return 'none';
  if (left < 0) return 'expired';
  if (left === 0) return 'today';
  return left <= soonDays ? 'soon' : 'ok';
}

/** Moving food to another place: the shelf clock restarts from `on` with the new place's estimate. */
export function moveEstimate(ingredientId: string, to: Place, on: string, lex: Lexicon = {}): ReturnType<typeof estimateExpiry> {
  return estimateExpiry({ ingredientId, place: to, from: on }, lex);
}
