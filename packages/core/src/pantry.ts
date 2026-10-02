// Pantry operations over a kitchen state: places, quantities, expiry (exact or estimated), purchases from tickets and leftovers.
// Every function mutates the state it is given (callers pass a clone) and takes `today` explicitly so tests control time.
import type { KitchenV2, PantryRecord, PricePoint, TicketLine } from './kitchen';
import type { ShoppingItem, ShopUnit } from './shopping';
import { categoryOf, sectionLabel, type Place } from './categories';
import { ingredientInfo, ingredientName } from './ingredients';
import { daysLeft, estimateExpiry, expiryLevel, type ExpiryKind, type ExpiryLevel } from './shelf';
import { addQuantities, canonicalUnit, normalisePrice, round2, round3, toBase, unitInfo } from './units';

const lexOf = (state: KitchenV2) => ({ userIngredients: state.userIngredients, learnedAliases: state.learnedAliases });

export interface PantryView {
  ingredientId: string;
  name: string;
  category: string;
  section: string;
  location: Place;
  qty: number | null;
  unit: string | null;
  expiresAt: string | null;
  expiry_kind: ExpiryKind | null;
  expiry_basis: string | null;
  days_left: number | null;
  level: ExpiryLevel;
  openedAt: string | null;
  addedAt: string | null;
  leftover: PantryRecord['leftover'] | null;
}

export function pantryView(state: KitchenV2, today: string): PantryView[] {
  const lex = lexOf(state);
  return state.shopping.filter((item) => item.checked).map((item): PantryView => {
    const record = state.pantry[item.ingredientId] ?? { location: ingredientInfo(item.ingredientId, lex).place };
    const info = ingredientInfo(item.ingredientId, lex);
    const expiresAt = record.expiresAt ?? null;
    return {
      ingredientId: item.ingredientId, name: item.name || info.name, category: info.category, section: categoryOf(info.category).section,
      location: record.location, qty: item.qty ?? null, unit: item.unit ?? null, expiresAt,
      expiry_kind: expiresAt ? (record.expiry_kind ?? 'exact') : null, expiry_basis: expiresAt ? (record.expiry_basis ?? null) : null,
      days_left: daysLeft(expiresAt, today), level: expiryLevel(expiresAt, today), openedAt: record.openedAt ?? null, addedAt: record.addedAt ?? null,
      leftover: record.leftover ?? null,
    };
  }).sort((a, b) => (a.days_left ?? 9999) - (b.days_left ?? 9999) || a.name.localeCompare(b.name, 'es'));
}

function findItem(state: KitchenV2, id: string): ShoppingItem | undefined {
  return state.shopping.find((item) => item.ingredientId === id);
}

export interface PantrySetInput {
  ingredientId: string;
  location?: Place;
  qty?: number | null;
  unit?: string | null;
  /** YYYY-MM-DD typed by the person: exact. */
  expiresAt?: string | null;
  /** Ask for the estimate of the shelf-life table (instead of typing a date). */
  estimateExpiry?: boolean;
  openedAt?: string | null;
  /** Explicitly remove the expiry date. */
  clearExpiry?: boolean;
  note?: string;
}

/** Put an ingredient in the pantry (or update it). A change of place or an opening restarts the estimated shelf clock. */
export function setPantryItem(state: KitchenV2, input: PantrySetInput, today: string): { item: ShoppingItem; record: PantryRecord } {
  const lex = lexOf(state);
  const id = input.ingredientId;
  let item = findItem(state, id);
  const wasHave = !!item?.checked;
  if (!item) {
    item = { ingredientId: id, fromRecipes: [], checked: true };
    state.shopping.push(item);
  }
  item.checked = true;
  if (input.qty !== undefined) item.qty = input.qty === null ? undefined : input.qty;
  if (input.unit !== undefined) item.unit = (input.unit ? (canonicalUnit(input.unit) ?? input.unit) : undefined) as ShopUnit | undefined;
  const previous = state.pantry[id];
  const record: PantryRecord = { ...(previous ?? { location: ingredientInfo(id, lex).place }) };
  const placeChanged = input.location !== undefined && input.location !== record.location;
  if (input.location) record.location = input.location;
  if (!wasHave) record.addedAt = record.addedAt ?? today;
  if (input.openedAt !== undefined) record.openedAt = input.openedAt;
  if (input.note !== undefined) record.note = input.note;
  if (input.clearExpiry) {
    delete record.expiresAt; delete record.expiry_kind; delete record.expiry_basis;
  } else if (input.expiresAt) {
    record.expiresAt = input.expiresAt; record.expiry_kind = 'exact'; delete record.expiry_basis;
  } else if (input.estimateExpiry || (placeChanged && record.expiry_kind !== 'exact') || (input.openedAt && record.expiry_kind !== 'exact')) {
    const estimate = estimateExpiry({ ingredientId: id, place: record.location, from: placeChanged ? today : (record.addedAt ?? today), openedAt: record.openedAt ?? null }, lex);
    if (estimate.date) { record.expiresAt = estimate.date; record.expiry_kind = 'estimated'; record.expiry_basis = estimate.basis; }
    else { delete record.expiresAt; delete record.expiry_kind; delete record.expiry_basis; }
  } else if (!wasHave && !record.expiresAt) {
    const estimate = estimateExpiry({ ingredientId: id, place: record.location, from: today }, lex);
    if (estimate.date) { record.expiresAt = estimate.date; record.expiry_kind = 'estimated'; record.expiry_basis = estimate.basis; }
  }
  state.pantry[id] = record;
  return { item, record };
}

/** Mark an ingredient as used up: it leaves the pantry and goes back to the shopping list (v1 semantics: unchecked). */
export function useUp(state: KitchenV2, id: string): void {
  const item = findItem(state, id);
  if (!item) return;
  item.checked = false;
  item.qty = undefined;
  delete state.pantry[id];
}

// ───────────────────────── purchases (tickets) ─────────────────────────

export interface PurchaseInput {
  ingredientId: string;
  /** What the shop sold: count of packs, or kg when weighed. */
  qty: number | null;
  unit: string | null;
  total: number | null;
  unit_price?: number | null;
  pack?: { qty: number; unit: string; count: number } | null;
  frozen?: boolean;
  store: string | null;
  date: string;
  raw?: string;
  ticketId?: string;
}

/** Quantity that ends up in the pantry (kg, L or ud) and the price normalised to €/kg, €/L or €/ud. */
export function purchaseAmounts(p: Pick<PurchaseInput, 'qty' | 'unit' | 'total' | 'pack'>): { qty: number; unit: 'kg' | 'L' | 'ud'; price: { unit_price: number; price_unit: 'kg' | 'L' | 'ud' } | null } {
  const count = p.qty && p.qty > 0 ? p.qty : 1;
  if (p.unit === 'kg') {
    return { qty: round3(count), unit: 'kg', price: p.total ? normalisePrice(p.total, count, 'kg') : null };
  }
  if (p.pack) {
    const base = toBase(p.pack.qty * p.pack.count * count, p.pack.unit);
    if (base && base.family === 'mass') return { qty: round3(base.quantity / 1000), unit: 'kg', price: p.total ? normalisePrice(p.total, base.quantity, 'g') : null };
    if (base && base.family === 'volume') return { qty: round3(base.quantity / 1000), unit: 'L', price: p.total ? normalisePrice(p.total, base.quantity, 'ml') : null };
  }
  return { qty: round3(count), unit: 'ud', price: p.total ? normalisePrice(p.total, count, 'ud') : null };
}

/** Add a bought item to the pantry (with an estimated expiry) and to the price book. */
export function applyPurchase(state: KitchenV2, p: PurchaseInput, today: string): { added: { qty: number; unit: string }; price: PricePoint | null; unit_replaced: boolean } {
  const lex = lexOf(state);
  const amounts = purchaseAmounts(p);
  const info = ingredientInfo(p.ingredientId, lex);
  let item = findItem(state, p.ingredientId);
  let unitReplaced = false;
  const had = !!item?.checked;
  if (!item) { item = { ingredientId: p.ingredientId, fromRecipes: [], checked: true }; state.shopping.push(item); }
  if (had && item.qty && item.unit) {
    const sum = addQuantities({ quantity: item.qty, unit: item.unit }, { quantity: amounts.qty, unit: amounts.unit });
    if (sum) { item.qty = round3(sum.quantity); item.unit = (sum.unit ?? amounts.unit) as ShopUnit; }
    else { item.qty = amounts.qty; item.unit = amounts.unit; unitReplaced = true; }
  } else {
    item.qty = amounts.qty; item.unit = amounts.unit;
  }
  item.checked = true;
  const previous = state.pantry[p.ingredientId];
  const location: Place = p.frozen ? 'congelador' : (previous?.location ?? info.place);
  const record: PantryRecord = { ...(previous ?? {}), location, addedAt: p.date, openedAt: null };
  const keepExact = previous?.expiry_kind === 'exact' && previous.expiresAt && previous.expiresAt >= today;
  if (!keepExact) {
    const estimate = estimateExpiry({ ingredientId: p.ingredientId, place: location, from: p.date }, lex);
    if (estimate.date) { record.expiresAt = estimate.date; record.expiry_kind = 'estimated'; record.expiry_basis = estimate.basis; }
    else { delete record.expiresAt; delete record.expiry_kind; delete record.expiry_basis; }
  }
  state.pantry[p.ingredientId] = record;
  let point: PricePoint | null = null;
  if (amounts.price && p.store !== undefined) {
    const id = `price-${p.ticketId ?? 'x'}-${state.priceBook.length}-${p.ingredientId}`;
    point = { id, ingredientId: p.ingredientId, store: p.store ?? 'sin tienda', date: p.date, unit_price: amounts.price.unit_price,
      price_unit: amounts.price.price_unit, source: 'ticket', ...(p.ticketId ? { ticketId: p.ticketId } : {}), ...(p.raw ? { raw: p.raw } : {}) };
    state.priceBook.push(point);
  }
  return { added: { qty: amounts.qty, unit: amounts.unit }, price: point, unit_replaced: unitReplaced };
}

/** Apply one ticket line already matched to an ingredient (status becomes "applied"). */
export function applyTicketLine(state: KitchenV2, ticket: { id: string; store: string | null; date: string | null }, line: TicketLine, ingredientId: string, today: string): ReturnType<typeof applyPurchase> {
  const result = applyPurchase(state, {
    ingredientId, qty: line.qty, unit: line.unit, total: line.total, pack: line.pack ?? null, frozen: !!line.frozen,
    store: ticket.store, date: ticket.date ?? today, raw: line.raw, ticketId: ticket.id,
  }, today);
  line.ingredientId = ingredientId;
  line.status = 'applied';
  return result;
}

// ───────────────────────────── leftovers ─────────────────────────────

/** Leftover portions of a cooked recipe: a pantry item "Sobras: <recipe>" with an estimated 3-day expiry. */
export function addLeftovers(state: KitchenV2, input: { recipeId: string; title: string; servings: number; makeId?: string }, today: string): { ingredientId: string; expiresAt: string | null } {
  const slug = `sobras_${input.recipeId.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`;
  if (!state.userIngredients.some((u) => u.id === slug)) {
    state.userIngredients.push({ id: slug, name: `Sobras: ${input.title}`, aliases: [], category: 'sobras', defaultUnit: 'ración', createdAt: today });
  }
  const existing = findItem(state, slug);
  const have = existing?.checked ? (existing.qty ?? 0) : 0;
  setPantryItem(state, { ingredientId: slug, location: 'nevera', qty: round2(have + input.servings), unit: 'ración', estimateExpiry: true }, today);
  const record = state.pantry[slug]!;
  record.leftover = { recipeId: input.recipeId, servings: round2(have + input.servings), ...(input.makeId ? { makeId: input.makeId } : {}) };
  record.addedAt = today;
  const estimate = estimateExpiry({ ingredientId: slug, place: 'nevera', from: today }, lexOf(state));
  if (estimate.date) { record.expiresAt = estimate.date; record.expiry_kind = 'estimated'; record.expiry_basis = estimate.basis; }
  return { ingredientId: slug, expiresAt: record.expiresAt ?? null };
}

export const nameOfIngredient = (state: KitchenV2, id: string): string => ingredientName(id, lexOf(state));
export { sectionLabel, unitInfo };
