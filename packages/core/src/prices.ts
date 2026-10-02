// The learned price book and cost estimates. Prices come from tickets and manual entries; costs say which prices are missing.
import type { KitchenV2, PricePoint } from './kitchen';
import type { Recipe } from './types';
import { ingredientInfo, ingredientName } from './ingredients';
import { addDays } from './text';
import { round2, unitInfo, type PriceUnit } from './units';

export interface PriceStat {
  ingredientId: string;
  name: string;
  price_unit: PriceUnit;
  last: { unit_price: number; store: string; date: string };
  median90: number | null;
  count: number;
  cheapest: { unit_price: number; store: string; date: string } | null;
  stores: Array<{ store: string; unit_price: number; date: string }>;
  history: Array<{ date: string; store: string; unit_price: number }>;
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Points of one ingredient in its dominant price unit, newest first. */
function pointsOf(book: PricePoint[], id: string): PricePoint[] {
  const all = book.filter((p) => p.ingredientId === id && p.unit_price > 0);
  if (!all.length) return [];
  const counts = new Map<string, number>();
  for (const p of all) counts.set(p.price_unit, (counts.get(p.price_unit) ?? 0) + 1);
  const unit = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] === 'kg' ? -1 : 1))[0]![0];
  return all.filter((p) => p.price_unit === unit).sort((a, b) => b.date.localeCompare(a.date));
}

export function priceStats(state: KitchenV2, today: string): PriceStat[] {
  const lex = { userIngredients: state.userIngredients };
  const ids = [...new Set(state.priceBook.map((p) => p.ingredientId))];
  const since = addDays(today, -90);
  return ids.map((id): PriceStat | null => {
    const points = pointsOf(state.priceBook, id);
    if (!points.length) return null;
    const recent = points.filter((p) => p.date >= since);
    const byStore = new Map<string, PricePoint>();
    for (const p of points) if (!byStore.has(p.store)) byStore.set(p.store, p);
    const stores = [...byStore.values()].map((p) => ({ store: p.store, unit_price: p.unit_price, date: p.date }));
    const cheapest = [...stores].sort((a, b) => a.unit_price - b.unit_price)[0] ?? null;
    return { ingredientId: id, name: ingredientName(id, lex), price_unit: points[0]!.price_unit,
      last: { unit_price: points[0]!.unit_price, store: points[0]!.store, date: points[0]!.date },
      median90: recent.length ? round2(median(recent.map((p) => p.unit_price))) : null, count: points.length, cheapest, stores,
      history: points.slice(0, 30).map((p) => ({ date: p.date, store: p.store, unit_price: p.unit_price })) };
  }).filter((s): s is PriceStat => !!s).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export interface PriceChoice { unit_price: number; price_unit: PriceUnit; basis: 'median90' | 'last' | 'store_last'; store?: string; date: string; count: number }

/** The price used for costing: last price at the given store, else the median of the last 90 days, else the latest known. */
export function priceFor(state: KitchenV2, id: string, today: string, options: { store?: string; mode?: 'median90' | 'last' } = {}): PriceChoice | null {
  const points = pointsOf(state.priceBook, id);
  if (!points.length) return null;
  if (options.store) {
    const wanted = options.store.toLowerCase();
    const at = points.find((p) => p.store.toLowerCase() === wanted);
    if (at) return { unit_price: at.unit_price, price_unit: at.price_unit, basis: 'store_last', store: at.store, date: at.date, count: points.length };
  }
  if ((options.mode ?? 'median90') === 'median90') {
    const since = addDays(today, -90);
    const recent = points.filter((p) => p.date >= since);
    if (recent.length) return { unit_price: round2(median(recent.map((p) => p.unit_price))), price_unit: points[0]!.price_unit, basis: 'median90', date: recent[0]!.date, count: recent.length };
  }
  return { unit_price: points[0]!.unit_price, price_unit: points[0]!.price_unit, basis: 'last', store: points[0]!.store, date: points[0]!.date, count: points.length };
}

export interface CostLine {
  ingredientId: string;
  name: string;
  quantity: number | null;
  unit: string | null;
  cost: number | null;
  price?: PriceChoice;
  approx?: boolean;
  reason?: 'sin_precio' | 'sin_cantidad' | 'unidad_incompatible' | 'basico';
}
export interface RecipeCost {
  recipe_id: string;
  title: string;
  servings: number | null;
  total: number;
  per_serving: number | null;
  complete: boolean;
  lines: CostLine[];
  missing_prices: string[];
  uncosted: string[];
  notes: string[];
}

/** Cost of one ingredient quantity at a price. null when the units cannot be related. */
export function lineCost(quantity: number, unit: string | null | undefined, price: PriceChoice, unitWeightG?: number): { cost: number; approx: boolean } | null {
  const info = unit ? unitInfo(unit) : { family: 'count' as const, factor: 1, approx: false, key: 'count' };
  if (!info) return null;
  if (price.price_unit === 'kg') {
    if (info.family === 'mass') return { cost: (quantity * info.factor / 1000) * price.unit_price, approx: info.approx };
    if ((info.family === 'count' || unit === 'diente') && unitWeightG) return { cost: (quantity * unitWeightG / 1000) * price.unit_price, approx: true };
    return null;
  }
  if (price.price_unit === 'L') {
    if (info.family === 'volume') return { cost: (quantity * info.factor / 1000) * price.unit_price, approx: info.approx };
    return null;
  }
  if (info.family === 'count' || info.family === 'exact') return { cost: quantity * price.unit_price, approx: info.family === 'exact' };
  if (info.family === 'mass' && unitWeightG) return { cost: (quantity * info.factor / unitWeightG) * price.unit_price, approx: true };
  return null;
}

export function recipeCost(state: KitchenV2, recipe: Recipe, today: string, options: { servings?: number | null; store?: string; mode?: 'median90' | 'last' } = {}): RecipeCost {
  const lex = { userIngredients: state.userIngredients };
  const base = Number.isFinite(recipe.servings) && recipe.servings! > 0 ? recipe.servings! : null;
  const servings = options.servings ?? base;
  const factor = options.servings && base ? options.servings / base : 1;
  const notes: string[] = [];
  if (options.servings && !base) notes.push('La receta no tiene raciones base: el coste es el de la receta completa.');
  const lines: CostLine[] = [];
  const missing: string[] = [];
  const uncosted: string[] = [];
  let total = 0;
  for (const ing of recipe.ingredients) {
    if (ing.optional) continue;
    const info = ingredientInfo(ing.ingredientId, lex);
    const quantity = ing.quantity && ing.quantity > 0 ? ing.quantity * factor : null;
    const price = priceFor(state, ing.ingredientId, today, options);
    const line: CostLine = { ingredientId: ing.ingredientId, name: info.name, quantity, unit: ing.unit ?? null, cost: null };
    if (quantity === null) {
      line.reason = info.category === 'basico' || info.category === 'aceite' || info.category === 'especia' ? 'basico' : 'sin_cantidad';
      uncosted.push(info.name);
    } else if (!price) {
      line.reason = 'sin_precio';
      missing.push(info.name);
    } else {
      line.price = price;
      const cost = lineCost(quantity, ing.unit, price, info.unitWeightG);
      if (!cost) { line.reason = 'unidad_incompatible'; uncosted.push(info.name); }
      else { line.cost = round2(cost.cost); line.approx = cost.approx; total += cost.cost; }
    }
    lines.push(line);
  }
  const complete = missing.length === 0 && !lines.some((l) => l.reason === 'unidad_incompatible' || l.reason === 'sin_cantidad');
  return { recipe_id: recipe.id, title: recipe.title, servings: servings ?? null, total: round2(total),
    per_serving: servings ? round2(total / servings) : null, complete, lines, missing_prices: [...new Set(missing)], uncosted: [...new Set(uncosted)], notes };
}
