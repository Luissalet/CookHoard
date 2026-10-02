// Units used in recipes, pantry and tickets: canonical names, families and conversions.
import { fold } from './text';

export type UnitFamily = 'mass' | 'volume' | 'count' | 'exact';

/** Folded spelling → canonical unit. Canonical units: g, kg, ml, L, ud, cda, cdta, taza, vaso, pizca, diente, lata, sobre, puñado, rama, hoja, loncha, rebanada, paquete, bote, ración. */
const ALIASES: Record<string, string> = {
  g: 'g', gr: 'g', grs: 'g', gramo: 'g', gramos: 'g', gram: 'g', grams: 'g',
  kg: 'kg', kgs: 'kg', kilo: 'kg', kilos: 'kg', kilogramo: 'kg', kilogramos: 'kg', kilogram: 'kg',
  ml: 'ml', mililitro: 'ml', mililitros: 'ml',
  cl: 'cl', centilitro: 'cl', centilitros: 'cl',
  dl: 'dl', decilitro: 'dl', decilitros: 'dl',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', litros: 'L', liter: 'L', liters: 'L', litre: 'L',
  ud: 'ud', uds: 'ud', u: 'ud', unidad: 'ud', unidades: 'ud', pieza: 'ud', piezas: 'ud', pza: 'ud', unit: 'ud', units: 'ud',
  cda: 'cda', cdas: 'cda', cucharada: 'cda', cucharadas: 'cda', tbsp: 'cda', tablespoon: 'cda', tablespoons: 'cda',
  cdta: 'cdta', cdtas: 'cdta', cucharadita: 'cdta', cucharaditas: 'cdta', tsp: 'cdta', teaspoon: 'cdta', teaspoons: 'cdta',
  taza: 'taza', tazas: 'taza', cup: 'taza', cups: 'taza',
  vaso: 'vaso', vasos: 'vaso',
  pizca: 'pizca', pizcas: 'pizca', pinch: 'pizca',
  diente: 'diente', dientes: 'diente', clove: 'diente', cloves: 'diente',
  lata: 'lata', latas: 'lata', can: 'lata', cans: 'lata',
  sobre: 'sobre', sobres: 'sobre',
  punado: 'puñado', punados: 'puñado', handful: 'puñado',
  rama: 'rama', ramas: 'rama', ramita: 'rama', ramitas: 'rama', sprig: 'rama', sprigs: 'rama',
  hoja: 'hoja', hojas: 'hoja', leaf: 'hoja', leaves: 'hoja',
  loncha: 'loncha', lonchas: 'loncha', lonchita: 'loncha', slice: 'loncha', slices: 'loncha',
  rebanada: 'rebanada', rebanadas: 'rebanada',
  paquete: 'paquete', paquetes: 'paquete', pack: 'paquete',
  bote: 'bote', botes: 'bote', tarro: 'bote', tarros: 'bote', jar: 'bote',
  racion: 'ración', raciones: 'ración', porcion: 'ración', porciones: 'ración', serving: 'ración', servings: 'ración',
  oz: 'oz', lb: 'lb',
};

export function canonicalUnit(token: string): string | null {
  const key = fold(token).replace(/\.$/, '');
  return ALIASES[key] ?? null;
}

/** Every spelling accepted as a unit, longest first (for regex building). */
export function unitSpellings(): string[] {
  return Object.keys(ALIASES).sort((a, b) => b.length - a.length);
}

const TO_BASE: Record<string, { family: UnitFamily; factor: number }> = {
  g: { family: 'mass', factor: 1 }, kg: { family: 'mass', factor: 1000 },
  oz: { family: 'mass', factor: 28.35 }, lb: { family: 'mass', factor: 453.6 },
  ml: { family: 'volume', factor: 1 }, cl: { family: 'volume', factor: 10 }, dl: { family: 'volume', factor: 100 },
  L: { family: 'volume', factor: 1000 },
  cda: { family: 'volume', factor: 15 }, cdta: { family: 'volume', factor: 5 },
  taza: { family: 'volume', factor: 240 }, vaso: { family: 'volume', factor: 200 },
  ud: { family: 'count', factor: 1 },
};

/** Family and factor of a unit into g / ml / ud. Spoons and cups count as volume (approximate). Others are "exact" (only comparable with themselves). */
export function unitInfo(unit: string | null | undefined): { family: UnitFamily; factor: number; approx: boolean; key: string } | null {
  if (!unit) return null;
  const canonical = canonicalUnit(unit) ?? unit;
  const base = TO_BASE[canonical];
  if (base) return { ...base, approx: ['cda', 'cdta', 'taza', 'vaso', 'oz', 'lb'].includes(canonical), key: base.family };
  return { family: 'exact', factor: 1, approx: false, key: `exact:${canonical}` };
}

/** Quantity in its base unit (g, ml or ud) with its family; null for non-convertible units. */
export function toBase(quantity: number, unit: string | null | undefined): { quantity: number; family: UnitFamily; approx: boolean } | null {
  const info = unitInfo(unit);
  if (!info || !Number.isFinite(quantity)) return null;
  return { quantity: quantity * info.factor, family: info.family, approx: info.approx };
}

/** Same family (mass/volume/count, or the same exact unit). */
export function compatible(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = unitInfo(a);
  const y = unitInfo(b);
  return !!x && !!y && x.key === y.key;
}

/** Add two quantities of compatible units; the result uses the unit of the first. Null when not compatible. */
export function addQuantities(a: { quantity: number; unit?: string | null }, b: { quantity: number; unit?: string | null }): { quantity: number; unit: string | null } | null {
  if (!a.unit && !b.unit) return { quantity: a.quantity + b.quantity, unit: null };
  const x = unitInfo(a.unit);
  const y = unitInfo(b.unit);
  if (!x || !y || x.key !== y.key) return null;
  return { quantity: a.quantity + (b.quantity * y.factor) / x.factor, unit: canonicalUnit(a.unit!) ?? a.unit! };
}

/** Human text for a quantity: 0.5 kg → "500 g", 1500 ml → "1,5 L", 3 ud → "3 ud". */
export function formatQuantity(quantity: number | null | undefined, unit?: string | null): string {
  if (quantity == null || !Number.isFinite(quantity)) return unit ? String(unit) : '';
  let q = quantity;
  let u = unit ? (canonicalUnit(unit) ?? unit) : '';
  if (u === 'kg' && q < 1) { q *= 1000; u = 'g'; }
  else if (u === 'L' && q < 1) { q *= 1000; u = 'ml'; }
  else if (u === 'g' && q >= 1000) { q /= 1000; u = 'kg'; }
  else if (u === 'ml' && q >= 1000) { q /= 1000; u = 'L'; }
  const rounded = Math.abs(q - Math.round(q)) < 0.005 ? String(Math.round(q)) : String(Math.round(q * 100) / 100).replace('.', ',');
  return u === 'ud' && !unit ? rounded : `${rounded}${u ? ' ' + u : ''}`;
}

export type PriceUnit = 'kg' | 'L' | 'ud';

/**
 * Price per kg, per litre or per unit from a paid total and what was bought.
 * qty/unit describe the purchase ("0,456 kg", "6 x 1,5 L" already multiplied, "3 ud").
 */
export function normalisePrice(total: number, quantity: number, unit: string | null | undefined): { unit_price: number; price_unit: PriceUnit } | null {
  if (!(total > 0) || !(quantity > 0)) return null;
  const base = toBase(quantity, unit ?? 'ud');
  if (!base) return null;
  if (base.family === 'mass') return { unit_price: round2((total / base.quantity) * 1000), price_unit: 'kg' };
  if (base.family === 'volume') return { unit_price: round2((total / base.quantity) * 1000), price_unit: 'L' };
  if (base.family === 'count') return { unit_price: round2(total / base.quantity), price_unit: 'ud' };
  return null;
}

export const round2 = (value: number): number => Math.round(value * 100) / 100;
export const round3 = (value: number): number => Math.round(value * 1000) / 1000;
