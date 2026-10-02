// Ingredient resolution: a name written by a person (recipe line, ticket line, chat) → one ingredient id.
// Order: exact name/alias → learned alias → fuzzy (accent-insensitive, plural/singular, abbreviations) → new user ingredient.
import { BUILTIN_BY_ID, BUILTIN_INGREDIENTS, type DictIngredient } from './dictionary';
import { CATEGORY_BY_ID, categoryOf, guessCategory, type Place } from './categories';
import { fold, slugify, stems, tokens } from './text';

export interface UserIngredient {
  id: string;
  name: string;
  nameEn?: string;
  aliases: string[];
  category: string;
  defaultUnit: string;
  /** Days it lasts per place, when the user knows better than the category table. */
  shelfLife?: Partial<Record<Place, number>>;
  unitWeightG?: number;
  allergens?: string[];
  createdAt?: string;
}

export interface Lexicon {
  userIngredients?: UserIngredient[];
  /** Folded text (a ticket abbreviation, a nickname) → ingredient id, taught by the user. */
  learnedAliases?: Record<string, string>;
}

export interface IngredientInfo {
  id: string;
  name: string;
  nameEn: string;
  category: string;
  defaultUnit: string;
  place: Place;
  unitWeightG?: number;
  allergens: string[];
  meat: boolean;
  builtin: boolean;
  known: boolean;
  shelfLife?: Partial<Record<Place, number>>;
}

export type Via = 'exact' | 'alias' | 'learned' | 'fuzzy' | 'id' | 'new' | 'none';
export interface Resolved { id: string | null; via: Via; score: number; name?: string }

const STOP = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'un', 'una', 'con', 'para', 'the', 'of', 'and']);

interface NameEntry { id: string; text: string; tokens: string[]; order: number; user: boolean }

function entryNames(ing: { id: string; name: string; nameEn?: string; aliases?: string[] }): string[] {
  return [ing.name, ing.nameEn ?? '', ...(ing.aliases ?? [])].filter(Boolean);
}

function buildEntries(list: Array<{ id: string; name: string; nameEn?: string; aliases?: string[] }>, user: boolean, base: number): NameEntry[] {
  const out: NameEntry[] = [];
  list.forEach((ing, index) => {
    for (const raw of entryNames(ing)) {
      const text = fold(raw);
      const toks = tokens(text).filter((t) => !STOP.has(t));
      if (toks.length) out.push({ id: ing.id, text, tokens: toks, order: base + index, user });
    }
  });
  return out;
}

const BUILTIN_ENTRIES = buildEntries(BUILTIN_INGREDIENTS, false, 0);
const BUILTIN_EXACT = new Map<string, string>();
for (const entry of BUILTIN_ENTRIES) if (!BUILTIN_EXACT.has(entry.text)) BUILTIN_EXACT.set(entry.text, entry.id);
// An ingredient's own name always wins over another's alias.
for (const ing of BUILTIN_INGREDIENTS) for (const raw of [ing.name, ing.nameEn]) BUILTIN_EXACT.set(fold(raw), ing.id);

const userCache = new WeakMap<object, { entries: NameEntry[]; exact: Map<string, string> }>();
function userIndex(list: UserIngredient[] | undefined): { entries: NameEntry[]; exact: Map<string, string> } {
  if (!list || !list.length) return { entries: [], exact: new Map() };
  let cached = userCache.get(list);
  if (!cached) {
    const entries = buildEntries(list, true, 10_000);
    const exact = new Map<string, string>();
    for (const entry of entries) if (!exact.has(entry.text)) exact.set(entry.text, entry.id);
    for (const ing of list) exact.set(fold(ing.name), ing.id);
    cached = { entries, exact };
    userCache.set(list, cached);
  }
  return cached;
}

function tokenMatches(entryToken: string, queryToken: string): boolean {
  if (entryToken === queryToken) return true;
  const a = stems(entryToken);
  const b = stems(queryToken);
  if (a.some((x) => b.includes(x))) return true;
  // A ticket abbreviation: "champ" for "champinones" (the query token is a prefix, at least 4 letters).
  return queryToken.length >= 4 && entryToken.startsWith(queryToken);
}

/** Does `id` exist (built-in or user)? */
export function knownId(id: string, lex: Lexicon = {}): boolean {
  return !!BUILTIN_BY_ID[id] || !!lex.userIngredients?.some((u) => u.id === id);
}

function prettyFromId(id: string): string {
  const text = id.replace(/^user-/, '').replace(/_+/g, ' ').trim();
  return text ? text[0]!.toUpperCase() + text.slice(1) : id;
}

/** Everything the app knows about an ingredient id; works for legacy free-text slugs too (known: false). */
export function ingredientInfo(id: string, lex: Lexicon = {}): IngredientInfo {
  const builtin = BUILTIN_BY_ID[id] as DictIngredient | undefined;
  if (builtin) {
    return { id, name: builtin.name, nameEn: builtin.nameEn, category: builtin.category, defaultUnit: builtin.defaultUnit,
      place: builtin.place ?? categoryOf(builtin.category).place, ...(builtin.unitWeightG ? { unitWeightG: builtin.unitWeightG } : {}),
      allergens: builtin.allergens, meat: !!builtin.meat, builtin: true, known: true };
  }
  const user = lex.userIngredients?.find((u) => u.id === id);
  if (user) {
    const category = CATEGORY_BY_ID[user.category] ? user.category : 'otros';
    return { id, name: user.name, nameEn: user.nameEn || user.name, category, defaultUnit: user.defaultUnit || 'ud',
      place: categoryOf(category).place, ...(user.unitWeightG ? { unitWeightG: user.unitWeightG } : {}),
      allergens: user.allergens ?? [], meat: false, builtin: false, known: true, ...(user.shelfLife ? { shelfLife: user.shelfLife } : {}) };
  }
  const category = guessCategory(id.replace(/_/g, ' '));
  return { id, name: prettyFromId(id), nameEn: prettyFromId(id), category, defaultUnit: 'ud', place: categoryOf(category).place,
    allergens: [], meat: false, builtin: false, known: false };
}

export const ingredientName = (id: string, lex: Lexicon = {}): string => ingredientInfo(id, lex).name;

/** Remove quantities, pack sizes and decoration so only the product words remain. */
export function cleanIngredientText(text: string): string {
  return fold(text)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*)?(?:kg|g|gr|ml|cl|l|lt|ud|uds|u)\b\.?/g, ' ')
    .replace(/\b\d+\s*x\s*\d+(?:[.,]\d+)?\s*(?:kg|g|gr|ml|cl|l)?\b/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\b\d+(?:[.,]\d+)?\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a name against built-in + user ingredients and learned aliases. Never creates anything. */
export function resolveName(input: string, lex: Lexicon = {}): Resolved {
  const folded = fold(input);
  if (!folded) return { id: null, via: 'none', score: 0 };
  const user = userIndex(lex.userIngredients);
  const candidates = [folded, cleanIngredientText(input)].filter(Boolean);
  for (const text of candidates) {
    const direct = user.exact.get(text) ?? BUILTIN_EXACT.get(text);
    if (direct) return { id: direct, via: BUILTIN_BY_ID[direct]?.name && fold(BUILTIN_BY_ID[direct]!.name) === text ? 'exact' : 'alias', score: 1000 };
    if (!text.includes(' ')) {
      for (const stem of stems(text)) {
        const hit = user.exact.get(stem) ?? BUILTIN_EXACT.get(stem);
        if (hit) return { id: hit, via: 'alias', score: 900 };
      }
    }
  }
  for (const text of candidates) {
    const learned = lex.learnedAliases?.[text];
    if (learned) return { id: learned, via: 'learned', score: 950 };
  }
  const q = tokens(candidates[candidates.length - 1] ?? folded).filter((t) => !STOP.has(t));
  if (!q.length) return { id: null, via: 'none', score: 0 };
  let best: { entry: NameEntry; score: number; position: number } | null = null;
  for (const entry of [...user.entries, ...BUILTIN_ENTRIES]) {
    if (entry.tokens.some((t) => t.length < 3)) continue;
    let position = Infinity;
    let all = true;
    for (const et of entry.tokens) {
      const at = q.findIndex((qt) => tokenMatches(et, qt));
      if (at < 0) { all = false; break; }
      position = Math.min(position, at);
    }
    if (!all) continue;
    const score = entry.tokens.length * 100 + entry.tokens.reduce((n, t) => n + t.length, 0) + (entry.user ? 1 : 0);
    if (!best || score > best.score || (score === best.score && (position < best.position || (position === best.position && entry.order < best.entry.order)))) {
      best = { entry, score, position };
    }
  }
  if (best) return { id: best.entry.id, via: 'fuzzy', score: best.score };
  return { id: null, via: 'none', score: 0 };
}

/** A new user ingredient for a name nothing matched. The caller stores it. */
export function makeUserIngredient(input: { name: string; category?: string; aliases?: string[]; defaultUnit?: string; shelfLife?: UserIngredient['shelfLife'] }, lex: Lexicon = {}, now?: string): UserIngredient {
  const name = String(input.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new Error('Falta el nombre del ingrediente.');
  const taken = (id: string): boolean => knownId(id, lex);
  const base = slugify(name) || 'ingrediente';
  let id = base;
  for (let n = 2; taken(id); n++) id = `${base}_${n}`;
  const category = input.category && CATEGORY_BY_ID[input.category] ? input.category : guessCategory(name);
  const unit = input.defaultUnit || (['carne', 'picada', 'ave', 'pescado', 'marisco', 'embutido', 'fiambre', 'queso', 'quesofresco', 'harina', 'seco', 'frutoseco', 'especia', 'dulce'].includes(category) ? 'g'
    : ['leche', 'aceite', 'bebida'].includes(category) ? 'L' : 'ud');
  return { id, name: name[0]!.toUpperCase() + name.slice(1), aliases: (input.aliases ?? []).map((a) => a.trim()).filter(Boolean),
    category, defaultUnit: unit, ...(input.shelfLife ? { shelfLife: input.shelfLife } : {}), ...(now ? { createdAt: now } : {}) };
}

/** Resolve a name; when `create` is set and nothing matches, return the user ingredient to add. */
export function resolveOrCreate(input: string, lex: Lexicon = {}, options: { create?: boolean; category?: string; now?: string } = {}): Resolved & { created?: UserIngredient } {
  const found = resolveName(input, lex);
  if (found.id) return { ...found, name: ingredientName(found.id, lex) };
  if (!options.create) return found;
  const cleaned = cleanIngredientText(input) || fold(input);
  const created = makeUserIngredient({ name: cleaned, ...(options.category ? { category: options.category } : {}) }, lex, options.now);
  return { id: created.id, via: 'new', score: 0, name: created.name, created };
}

/** All ingredients (built-in then user) for pickers. */
export function allIngredients(lex: Lexicon = {}): IngredientInfo[] {
  return [...BUILTIN_INGREDIENTS.map((b) => ingredientInfo(b.id, lex)), ...(lex.userIngredients ?? []).map((u) => ingredientInfo(u.id, lex))];
}

/** The learned-alias key of a ticket text: what the user's "this means that" is remembered by. */
export const aliasKey = (text: string): string => cleanIngredientText(text) || fold(text);
