// Supermarket ticket parser: pasted or OCR text → lines {raw, name, qty, unit, unit_price, total}, store, date and total.
// Handles the usual Spanish layouts: quantity first ("2 YOGUR 0,45 0,90"), quantity last, weighed lines on a second line
// ("0,456 kg x 2,99 €/kg 1,36"), multiplier lines ("2 x 1,05"), discounts, totals, IVA blocks and card lines.
// Matching to ingredients is separate (matchTicketLines): rules and learned aliases only; anything else goes to review.
import { aliasKey, ingredientInfo, resolveName, type Lexicon } from './ingredients';
import { categoryOf, guessCategory } from './categories';
import { fold, parseMoney } from './text';
import { round2 } from './units';

export interface ParsedTicketLine {
  raw: string;
  name: string;
  qty: number | null;
  unit: string | null;
  unit_price: number | null;
  total: number | null;
  pack?: { qty: number; unit: string; count: number } | null;
  frozen?: boolean;
  kind: 'item' | 'discount';
}
export interface ParsedTicket {
  store: string | null;
  date: string | null;
  total: number | null;
  computed_total: number;
  lines: ParsedTicketLine[];
  warnings: string[];
}

const STORE_NAMES: Array<[string, string]> = [
  ['mercadona', 'Mercadona'], ['lidl', 'Lidl'], ['carrefour', 'Carrefour'], ['alcampo', 'Alcampo'], ['eroski', 'Eroski'],
  ['consum', 'Consum'], ['aldi', 'Aldi'], ['hipercor', 'Hipercor'], ['supercor', 'Supercor'], ['el corte ingles', 'El Corte Inglés'],
  ['ahorramas', 'Ahorramás'], ['bonpreu', 'Bonpreu'], ['esclat', 'Esclat'], ['gadis', 'Gadis'], ['froiz', 'Froiz'], ['spar', 'Spar'],
  ['condis', 'Condis'], ['caprabo', 'Caprabo'], ['dia', 'Dia'], ['bm supermercados', 'BM'], ['bm', 'BM'], ['family cash', 'Family Cash'],
  ['masymas', 'Masymas'], ['coviran', 'Covirán'], ['simply', 'Simply'], ['upper', 'Upper'], ['vegalsa', 'Vegalsa'], ['plenus', 'Plenus'],
];

const SUMMARY = /^(?:sub\s*total|total\b|importe\s+total|a\s+pagar|entregado|efectivo|cambio|tarjeta|visa|mastercard|maestro|contactless|forma\s+de\s+pago|pago\b|iva\b|i\.v\.a|base\b|cuota\b|bi\b|n[ºo°]\s*op|num\.?\s*op|aut\b|autoriz|terminal|comercio|tpv|factura|ticket|simplificada|caja\b|cajero|le\s+atendi|gracias|vuelva|dev(?:olucion(?:es)?)?\b|puntos|saldo|ahorro\s+total|total\s+ahorro|importe\s+pagado|resumen|tel[ée]fono|tel\b|cif|nif|n\.i\.f|c\.i\.f|www\.|http|c\/|calle|avda|avenida|plaza|pol[ií]gono|c\.p\.|cp\b|fecha|hora|op\b|ref\b|\*+|-{3,}|={3,})/i;
const HEADER = /\b(descripci[oó]n|p\.?\s*unit|importe|cant(?:idad)?\.?|precio|art[ií]culo)\b.*\b(importe|precio|total|unit|p\.?\s*unit)\b/i;
const DISCOUNT = /\b(descuento|dto\.?|desc\.?|oferta|promo(?:ci[oó]n)?|cup[oó]n|bonificaci[oó]n|ahorro|2\s*[ªa]\s*unidad|segunda unidad|3x2|2x1|rebaja|vale)\b/i;
const FROZEN = /\b(congelad[oa]s?|cong\.?|ultracong\w*|helad[oa]s?)\b/i;
const MONEY = String.raw`-?\d{1,4}(?:[.,]\d{2})`;

function money(raw: string | undefined): number | null {
  return raw ? parseMoney(raw) : null;
}

function detectStore(lines: string[], extra: string[] = []): string | null {
  const head = fold(lines.slice(0, 14).join(' '));
  const whole = fold(lines.join(' '));
  const names: Array<[string, string]> = [...STORE_NAMES, ...extra.map((e): [string, string] => [fold(e), e.replace(/\b\w/g, (c) => c.toUpperCase())])];
  for (const [text, label] of names) {
    const re = new RegExp(`(?:^|[^a-z0-9])${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:$|[^a-z0-9])`);
    if (re.test(head)) return label;
  }
  for (const [text, label] of names) {
    if (text.length < 4) continue;
    const re = new RegExp(`(?:^|[^a-z0-9])${text}(?:$|[^a-z0-9])`);
    if (re.test(whole)) return label;
  }
  return null;
}

function detectDate(lines: string[]): string | null {
  for (const line of lines) {
    const iso = line.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
    const m = line.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4}|\d{2})\b/);
    if (m) {
      const day = Number(m[1]);
      const month = Number(m[2]);
      let year = Number(m[3]);
      if (year < 100) year += 2000;
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000 && year <= 2100) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }
  return null;
}

function detectTotal(lines: string[]): number | null {
  let found: number | null = null;
  for (const line of lines) {
    const f = fold(line);
    if (/^(?:total\b(?!\s*(?:ahorro|descuento|desc|iva|base|cuota))|importe\s+total|total\s+a\s+pagar|a\s+pagar|total\s+compra|total\s+factura|total\s*\(?\s*(?:€|eur))/.test(f) && !/ahorro/.test(f)) {
      const nums = [...line.matchAll(new RegExp(MONEY, 'g'))].map((m) => money(m[0])).filter((n): n is number => n !== null);
      if (nums.length) found = nums[nums.length - 1]!;
    }
  }
  return found;
}

/** Pack size in a name: "6x1,5L", "1L", "500 g", "3 x 80 g". Returns the size per pack, the count and the name without it. */
export function extractPack(name: string): { name: string; pack: { qty: number; unit: string; count: number } | null } {
  let text = name;
  let pack: { qty: number; unit: string; count: number } | null = null;
  const multi = text.match(/(?:^|\s)(\d{1,2})\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/i);
  const single = text.match(/(?:^|\s)(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/i);
  const normaliseUnit = (u: string): string => ({ gr: 'g', lt: 'L', l: 'L', kg: 'kg', g: 'g', ml: 'ml', cl: 'cl' } as Record<string, string>)[u.toLowerCase()] ?? u;
  if (multi) {
    pack = { count: Number(multi[1]), qty: Number(multi[2]!.replace(',', '.')), unit: normaliseUnit(multi[3]!) };
    text = text.replace(multi[0], ' ');
  } else if (single) {
    pack = { count: 1, qty: Number(single[1]!.replace(',', '.')), unit: normaliseUnit(single[2]!) };
    text = text.replace(single[0], ' ');
  }
  if (pack && pack.unit === 'cl') pack = { ...pack, qty: pack.qty * 10, unit: 'ml' };
  return { name: text.replace(/\s+/g, ' ').trim(), pack };
}

const TAXTAIL = /\s+(?:[A-E]|\d{1,2}(?:[.,]\d)?\s*%)\s*$/;

interface Draft { name: string; qty: number | null; unit: string | null; unit_price: number | null; total: number | null; raw: string }

function makeLine(d: Draft): ParsedTicketLine {
  const { name, pack } = extractPack(d.name.replace(/^\d+\s*(?=\D)/, '').trim() || d.name);
  const cleanName = name.replace(/[*#]+/g, ' ').replace(/\s+/g, ' ').trim();
  let qty = d.qty;
  let unit = d.unit;
  let unitPrice = d.unit_price;
  if (unit !== 'kg') {
    qty = qty ?? 1;
    unit = 'ud';
    if (unitPrice === null && d.total !== null && qty > 0) unitPrice = round2(d.total / qty);
  }
  return { raw: d.raw, name: cleanName || d.name, qty, unit, unit_price: unitPrice, total: d.total, pack: pack ?? null,
    ...(FROZEN.test(d.name) ? { frozen: true } : {}), kind: 'item' };
}

export function parseTicket(text: string, options: { stores?: string[] } = {}): ParsedTicket {
  const lines = String(text ?? '').replace(/\r/g, '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const warnings: string[] = [];
  const store = detectStore(lines, options.stores);
  const date = detectDate(lines);
  const total = detectTotal(lines);
  const out: ParsedTicketLine[] = [];
  let pending: string | null = null;
  let pendingHadCount = false;
  let started = false;
  let ended = false;

  const attachDiscount = (amount: number, raw: string): void => {
    const last = [...out].reverse().find((l) => l.kind === 'item');
    if (last && last.total !== null && last.total + amount >= -0.001) {
      last.total = round2(last.total + amount);
      last.raw += ` | ${raw}`;
      if (last.unit === 'ud' && last.qty) last.unit_price = round2(last.total / last.qty);
    } else {
      out.push({ raw, name: 'Descuento', qty: null, unit: null, unit_price: null, total: round2(amount), kind: 'discount' });
    }
  };

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]!;
    if (ended) break;
    const folded = fold(line);
    if (HEADER.test(folded)) { started = true; pending = null; continue; }
    if (!started && !out.length && detectDate([line]) && !/\d+[.,]\d{2}$/.test(line)) { started = true; continue; }
    if (/^(?:total\b|importe\s+total|total\s+a\s+pagar|a\s+pagar|total\s+compra|total\s+factura|total\s*\(?\s*(?:€|eur)|sub\s*total|entregado|forma\s+de\s+pago)/.test(folded) && out.length) { ended = true; break; }
    if (/^(?:iva|i\.v\.a|base\b|cuota\b|\d{1,2}\s*%)/.test(folded)) { pending = null; continue; }
    if (SUMMARY.test(folded) && !DISCOUNT.test(folded)) { pending = null; continue; }
    line = line.replace(/[€]/g, ' € ').replace(/\s+/g, ' ').trim();

    // Weighed detail: "0,456 kg x 2,99 €/kg 1,36" with or without a name and a total.
    const weigh = line.match(new RegExp(String.raw`^(.*?)\s*(\d+[.,]\d{1,3})\s*kg\.?\s*(?:[x×*]\s*)?(\d+[.,]\d{2})\s*(?:€|eur(?:os)?)?\s*\/?\s*(?:kg)?\s*(?:(${MONEY})\s*)?[A-E]?$`, 'i'));
    if (weigh && (weigh[4] || weigh[1] || pending || out.length)) {
      const qty = Number(weigh[2]!.replace(',', '.'));
      const unitPrice = money(weigh[3]);
      let totalLine = money(weigh[4]);
      const name = weigh[1]?.trim() || pending;
      if (name) {
        totalLine = totalLine ?? (unitPrice !== null ? round2(qty * unitPrice) : null);
        out.push(makeLine({ name, qty, unit: 'kg', unit_price: unitPrice, total: totalLine, raw: [pending, line].filter(Boolean).join(' | ') }));
        pending = null;
        continue;
      }
      const last = out[out.length - 1];
      if (last && last.kind === 'item' && last.unit !== 'kg') {
        last.qty = qty; last.unit = 'kg'; last.unit_price = unitPrice; last.raw += ` | ${line}`;
        if (last.total === null && unitPrice !== null) last.total = round2(qty * unitPrice);
        continue;
      }
    }
    // Multiplier line: "2 x 1,05" (belongs to the previous item).
    const mult = line.match(new RegExp(String.raw`^(\d{1,3})\s*[x×*]\s*(${MONEY})\s*(?:€|eur)?\s*(?:=?\s*(${MONEY}))?\s*[A-E]?$`, 'i'));
    if (mult) {
      const qty = Number(mult[1]);
      const unitPrice = money(mult[2]);
      const last = out[out.length - 1];
      if (pending) {
        out.push(makeLine({ name: pending, qty, unit: 'ud', unit_price: unitPrice, total: money(mult[3]) ?? (unitPrice !== null ? round2(qty * unitPrice) : null), raw: `${pending} | ${line}` }));
        pending = null;
      } else if (last && last.kind === 'item') {
        last.qty = qty; last.unit = 'ud'; last.unit_price = unitPrice; last.raw += ` | ${line}`;
        if (mult[3]) last.total = money(mult[3]);
        else if (unitPrice !== null && (last.total === null || (qty > 1 && Math.abs(last.total - unitPrice) < 0.005))) last.total = round2(qty * unitPrice);
      }
      continue;
    }
    // Discount lines.
    if (DISCOUNT.test(folded)) {
      const nums = [...line.matchAll(new RegExp(MONEY + '-?', 'g'))].map((m) => m[0]);
      const last = nums[nums.length - 1];
      if (last) {
        let amount = parseMoney(last.replace(/-$/, ''));
        if (amount !== null) {
          if (amount > 0 && (last.endsWith('-') || /-\s*\d/.test(line) || /descuento|dto|ahorro|cup[oó]n|bonificaci|rebaja/.test(folded))) amount = -Math.abs(amount);
          if (amount < 0) { attachDiscount(amount, line); pending = null; continue; }
        }
      }
    }
    const body = line.replace(TAXTAIL, '').trim();
    // Name + unit price + total, optionally a leading count: "2 YOGUR NATURAL 0,45 0,90".
    const three = body.match(new RegExp(String.raw`^(?:(\d{1,3})\s+)?(.*?[A-Za-zÁÉÍÓÚÑáéíóúñ].*?)\s+(${MONEY})\s+(${MONEY})$`));
    if (three) {
      const count = three[1] ? Number(three[1]) : null;
      const unitPrice = money(three[3]);
      const tot = money(three[4]);
      if (tot !== null && unitPrice !== null) {
        const ratio = unitPrice > 0 ? tot / unitPrice : 1;
        const qty = count ?? (Math.abs(ratio - Math.round(ratio)) < 0.02 && Math.round(ratio) >= 1 ? Math.round(ratio) : 1);
        out.push(makeLine({ name: pending ? `${pending} ${three[2]}` : three[2]!, qty, unit: 'ud', unit_price: unitPrice, total: tot, raw: [pending, line].filter(Boolean).join(' | ') }));
        pending = null;
        started = true;
        continue;
      }
    }
    const one = body.match(new RegExp(String.raw`^(?:(\d{1,3})\s+)?(.*?[A-Za-zÁÉÍÓÚÑáéíóúñ].*?)\s+(${MONEY})$`));
    if (one && !/^\d+[.,]\d{2}$/.test(one[2]!)) {
      const count = one[1] ? Number(one[1]) : null;
      const tot = money(one[3]);
      if (tot !== null) {
        const wrapped = !!pending && !pendingHadCount && !/:$/.test(pending);
        out.push(makeLine({ name: wrapped ? `${pending} ${one[2]}` : one[2]!, qty: count, unit: 'ud', unit_price: null, total: tot, raw: [wrapped ? pending : null, line].filter(Boolean).join(' | ') }));
        if (pending && !wrapped) warnings.push(`Línea sin precio ignorada: ${pending}`);
        pending = null;
        started = true;
        continue;
      }
    }
    // Price alone: belongs to the pending name (multi-line item).
    const priceOnly = body.match(new RegExp(String.raw`^(?:(\d{1,3})\s*[x×]?\s*)?(${MONEY})$`));
    if (priceOnly && pending) {
      const tot = money(priceOnly[2]);
      out.push(makeLine({ name: pending, qty: priceOnly[1] ? Number(priceOnly[1]) : null, unit: 'ud', unit_price: null, total: tot, raw: `${pending} | ${line}` }));
      pending = null;
      continue;
    }
    // Name only: held for the next line (weighed detail, price or continuation).
    if (/[A-Za-zÁÉÍÓÚÑáéíóúñ]{3}/.test(line) && !/\d{2}[:.]\d{2}/.test(line) && !/^\d+[.,]\d{2}$/.test(line) && line.length <= 60) {
      const candidate = line.replace(/^\d{1,3}\s+(?=\D)/, '').trim();
      if (started || out.length || /^\d{1,3}\s/.test(line)) {
        if (pending) warnings.push(`Línea sin precio ignorada: ${pending}`);
        pending = candidate;
        pendingHadCount = /^\d{1,3}\s/.test(line);
      }
    }
  }
  if (pending) warnings.push(`Línea sin precio ignorada: ${pending}`);
  const computed = round2(out.reduce((sum, l) => sum + (l.total ?? 0), 0));
  if (total !== null && Math.abs(computed - total) > 0.05) {
    warnings.push(`La suma de las líneas (${computed.toFixed(2).replace('.', ',')} €) no coincide con el total del ticket (${total.toFixed(2).replace('.', ',')} €): revisa las líneas.`);
  }
  if (!out.length) warnings.push('No se ha reconocido ninguna línea de compra en el texto.');
  return { store, date, total, computed_total: computed, lines: out, warnings };
}

// ───────────────────────────── matching ─────────────────────────────

/** Words that identify non-food lines when no ingredient matches. */
const NON_FOOD = /\b(bolsa(?:\s+(?:plastico|reutilizable|papel|basura|congelar))?|detergente|suavizante|lavavajillas|lejia|limpiador|fregasuelos|papel\s+(?:higienico|cocina|aluminio|horno)|servilletas?|panuelos?|champu|gel\b|jabon|desodorante|dentifrico|pasta\s+dientes|cepillo|compresas?|tampones|panales|esponja|estropajo|bayeta|insecticida|ambientador|pilas|bombilla|velas?|film|aluminio|rollo\s+cocina|toallitas|maquinilla|colonia|crema\s+(?:manos|corporal|facial)|protector\s+solar|bolsas?\s+basura|tarjeta|recarga|cargador|mascarilla)\b/;

export type MatchStatus = 'applied' | 'queued' | 'ignored' | 'discount';
export interface MatchedLine extends ParsedTicketLine {
  ingredientId: string | null;
  via: string | null;
  status: MatchStatus;
  ignoreReason?: 'non_food' | 'ignored_always';
}

export function matchTicketLines(lines: ParsedTicketLine[], lex: Lexicon, ignoredTerms: string[] = []): MatchedLine[] {
  const ignored = new Set(ignoredTerms);
  return lines.map((line): MatchedLine => {
    if (line.kind === 'discount') return { ...line, ingredientId: null, via: null, status: 'discount' };
    const key = aliasKey(line.name);
    if (ignored.has(key)) return { ...line, ingredientId: null, via: null, status: 'ignored', ignoreReason: 'ignored_always' };
    const found = resolveName(line.name, lex);
    if (found.id) {
      const id = found.id === 'water' ? 'agua_envasada' : found.id;
      const info = ingredientInfo(id, lex);
      if (categoryOf(info.category).id === 'limpieza') return { ...line, ingredientId: null, via: found.via, status: 'ignored', ignoreReason: 'non_food' };
      return { ...line, ingredientId: id, via: found.via, status: 'applied' };
    }
    if (NON_FOOD.test(fold(line.name)) || guessCategory(line.name) === 'limpieza') {
      return { ...line, ingredientId: null, via: null, status: 'ignored', ignoreReason: 'non_food' };
    }
    return { ...line, ingredientId: null, via: null, status: 'queued' };
  });
}
