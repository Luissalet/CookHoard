// The kitchen data model (version 2) and its normaliser. Version 1 files (shopping list + expiry map + recipes + makes)
// are read as they are and migrated in memory; the first write stores version 2.
import type { Make, Recipe } from './types';
import type { MenuPlan } from './menu';
import type { ShoppingItem } from './shopping';
import { categoryOf, SECTION_IDS, type Place } from './categories';
import { ingredientInfo, type UserIngredient } from './ingredients';
import type { ExpiryKind } from './shelf';
import type { PriceUnit } from './units';

export interface PantryRecord {
  location: Place;
  expiresAt?: string | null;
  expiry_kind?: ExpiryKind;
  expiry_basis?: string;
  openedAt?: string | null;
  addedAt?: string | null;
  leftover?: { recipeId: string; servings: number; makeId?: string };
  note?: string;
}

export interface PricePoint {
  id: string;
  ingredientId: string;
  store: string;
  date: string;
  unit_price: number;
  price_unit: PriceUnit;
  source: 'ticket' | 'manual';
  ticketId?: string;
  raw?: string;
}

export interface TicketLine {
  id: string;
  raw: string;
  name: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  pack?: { qty: number; unit: string; count: number } | null;
  frozen?: boolean;
  ingredientId?: string | null;
  via?: string | null;
  status: 'applied' | 'queued' | 'ignored' | 'discount';
  suggestion?: { ingredient_id?: string | null; name?: string | null; food?: boolean; via: string } | null;
}

export interface TicketRecord {
  id: string;
  source: 'text' | 'file' | 'mail';
  store: string | null;
  date: string | null;
  total: number | null;
  docId?: string;
  fileName?: string;
  hash: string;
  importedAt: string;
  lines: TicketLine[];
  warnings: string[];
}

export interface DraftIngredient {
  raw: string;
  name: string;
  ingredientId?: string | null;
  quantity?: number | null;
  unit?: string | null;
  optional?: boolean;
  note?: string;
  evidence?: { source: string; line: string; verified?: boolean } | null;
}
export interface DraftStep { text: string; timerSec?: number; evidence?: { source: string; line: string; verified?: boolean } | null }

export interface Draft {
  id: string;
  kind: 'video' | 'text' | 'web';
  status: 'pending';
  createdAt: string;
  url?: string;
  canonicalUrl?: string;
  title: string;
  description?: string;
  servings?: number | null;
  prepMin?: number | null;
  cookMin?: number | null;
  ingredients: DraftIngredient[];
  steps: DraftStep[];
  /** The text each part was read from, so a person can check it. */
  sources: Record<string, string>;
  media?: { platform?: string; uploader?: string; thumbnail?: string; duration?: number | null };
  confidence: { score: number; level: 'alta' | 'media' | 'baja'; missing: string[]; notes: string[] };
  status_notes: Record<string, string>;
}

export interface KitchenSettings {
  lang: 'es' | 'en';
  sections: string[];
  weeklyBudget: number | null;
  defaultServings: number;
  /** Supermarkets for the Kafka mail import (issuer names, lowercase). */
  supermarkets: string[];
  media: { ytdlp: string; cookies_from_browser: 'none' | 'edge' | 'chrome' | 'firefox'; cookies_file: string; keyframes: boolean; transcript: boolean };
  hub: { tantalus_watcher?: string };
}

export const DEFAULT_SUPERMARKETS = ['mercadona', 'lidl', 'carrefour', 'dia', 'alcampo', 'eroski', 'consum', 'aldi', 'hipercor', 'bm', 'ahorramas', 'bonpreu', 'gadis', 'froiz', 'spar', 'supercor', 'condis', 'caprabo', 'el corte ingles'];

export const DEFAULT_SETTINGS: KitchenSettings = {
  lang: 'es',
  sections: [...SECTION_IDS],
  weeklyBudget: null,
  defaultServings: 2,
  supermarkets: DEFAULT_SUPERMARKETS,
  media: { ytdlp: '', cookies_from_browser: 'none', cookies_file: '', keyframes: true, transcript: true },
  hub: {},
};

export interface KitchenV2 {
  version: 2;
  shopping: ShoppingItem[];
  menu: { week: string; plan: MenuPlan } | null;
  recipes: Recipe[];
  makes: Make[];
  savedIds: string[];
  pantry: Record<string, PantryRecord>;
  userIngredients: UserIngredient[];
  learnedAliases: Record<string, string>;
  /** Folded ticket texts the user said to ignore always. */
  ignoredTerms: string[];
  priceBook: PricePoint[];
  tickets: TicketRecord[];
  drafts: Draft[];
  settings: Partial<KitchenSettings>;
}

export function emptyKitchen(): KitchenV2 {
  return { version: 2, shopping: [], menu: null, recipes: [], makes: [], savedIds: [], pantry: {}, userIngredients: [],
    learnedAliases: {}, ignoredTerms: [], priceBook: [], tickets: [], drafts: [], settings: {} };
}

export function getSettings(state: Pick<KitchenV2, 'settings'>): KitchenSettings {
  const s = state.settings ?? {};
  return {
    ...DEFAULT_SETTINGS, ...s,
    sections: normaliseSections(s.sections),
    media: { ...DEFAULT_SETTINGS.media, ...(s.media ?? {}) },
    hub: { ...(s.hub ?? {}) },
  };
}

/** A saved section order, completed with any section it lacks (so a new section never disappears). */
export function normaliseSections(order: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...(order ?? []), ...SECTION_IDS]) if (SECTION_IDS.includes(id) && !seen.has(id)) { seen.add(id); out.push(id); }
  return out;
}

const BAD = 'Los datos de cocina tienen un formato desconocido; no se sobrescribieron.';
const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** Accepts version 1 or 2; returns version 2. Throws the original "formato desconocido" error for anything else. */
export function normalizeKitchen(parsed: any): KitchenV2 {
  if (!isObject(parsed) || (parsed.version !== 1 && parsed.version !== 2) || !Array.isArray(parsed.shopping)
    || !(parsed.menu === null || (isObject(parsed.menu) && Array.isArray((parsed.menu as any).plan?.days)))
    || (parsed.recipes !== undefined && !Array.isArray(parsed.recipes))
    || (parsed.makes !== undefined && !Array.isArray(parsed.makes))
    || (parsed.savedIds !== undefined && !Array.isArray(parsed.savedIds))
    || (parsed.pantryExpiry !== undefined && !isObject(parsed.pantryExpiry))
    || (parsed.pantry !== undefined && !isObject(parsed.pantry))
    || (parsed.userIngredients !== undefined && !Array.isArray(parsed.userIngredients))
    || (parsed.learnedAliases !== undefined && !isObject(parsed.learnedAliases))
    || (parsed.priceBook !== undefined && !Array.isArray(parsed.priceBook))
    || (parsed.tickets !== undefined && !Array.isArray(parsed.tickets))
    || (parsed.drafts !== undefined && !Array.isArray(parsed.drafts))
    || (parsed.ignoredTerms !== undefined && !Array.isArray(parsed.ignoredTerms))
    || (parsed.settings !== undefined && !isObject(parsed.settings))) {
    throw new Error(BAD);
  }
  const state: KitchenV2 = {
    version: 2,
    shopping: parsed.shopping as ShoppingItem[],
    menu: (parsed.menu as KitchenV2['menu']) ?? null,
    recipes: (parsed.recipes as Recipe[]) ?? [],
    makes: (parsed.makes as Make[]) ?? [],
    savedIds: (parsed.savedIds as string[]) ?? [],
    pantry: { ...((parsed.pantry as Record<string, PantryRecord>) ?? {}) },
    userIngredients: (parsed.userIngredients as UserIngredient[]) ?? [],
    learnedAliases: (parsed.learnedAliases as Record<string, string>) ?? {},
    ignoredTerms: (parsed.ignoredTerms as string[]) ?? [],
    priceBook: (parsed.priceBook as PricePoint[]) ?? [],
    tickets: (parsed.tickets as TicketRecord[]) ?? [],
    drafts: (parsed.drafts as Draft[]) ?? [],
    settings: (parsed.settings as Partial<KitchenSettings>) ?? {},
  };
  // Version 1 kept expiry dates in a separate map; they were exact dates typed by the person.
  const legacy = (parsed.pantryExpiry as Record<string, string> | undefined) ?? {};
  for (const [id, date] of Object.entries(legacy)) {
    if (typeof date === 'string' && !state.pantry[id]) state.pantry[id] = { location: 'nevera', expiresAt: date, expiry_kind: 'exact' };
  }
  reconcilePantry(state);
  return state;
}

/** Keep the one invariant between the list and the pantry: a pantry record exists exactly for checked items. */
export function reconcilePantry(state: Pick<KitchenV2, 'shopping' | 'pantry' | 'userIngredients'>): void {
  const lex = { userIngredients: state.userIngredients };
  const checked = new Set(state.shopping.filter((item) => item.checked).map((item) => item.ingredientId));
  for (const id of Object.keys(state.pantry)) if (!checked.has(id)) delete state.pantry[id];
  for (const id of checked) {
    const current = state.pantry[id];
    if (!current) {
      state.pantry[id] = { location: ingredientInfo(id, lex).place };
    } else if (!current.location) {
      current.location = ingredientInfo(id, lex).place;
    }
  }
}

export const sectionOfIngredient = (id: string, lex: { userIngredients?: UserIngredient[] } = {}): string => categoryOf(ingredientInfo(id, lex).category).section;
