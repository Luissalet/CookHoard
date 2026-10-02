// Small text helpers shared by the ingredient resolver, the recipe text parser and the ticket parser.

/** Lowercase, accent-insensitive, single spaces. "Limón  " → "limon". */
export function fold(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Tokens of a folded text: letters and digits only. */
export function tokens(value: string): string[] {
  return fold(value).replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
}

/** Candidate singular/plural stems of one folded token ("tomates" → tomates, tomate; "limones" → limon). */
export function stems(token: string): string[] {
  const out = new Set<string>([token]);
  if (token.length > 3 && token.endsWith('s')) out.add(token.slice(0, -1));
  if (token.length > 4 && token.endsWith('es')) out.add(token.slice(0, -2));
  if (token.length > 4 && token.endsWith('ces')) out.add(token.slice(0, -3) + 'z');
  return [...out];
}

export function slugify(value: string): string {
  return fold(value).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** "Sopa de lentejas" → "Sopa de lentejas"; "TOMATE FRITO" → "Tomate frito". */
export function sentenceCase(value: string): string {
  const text = String(value ?? '').trim().toLowerCase();
  return text ? text[0]!.toUpperCase() + text.slice(1) : '';
}

/** Parse "1,5", "1.5", "½", "1/2", "1 1/2", "1 y 1/2", "un cuarto". Returns null when it is not a number. */
export function parseNumber(raw: string): number | null {
  let text = String(raw ?? '').trim().toLowerCase();
  if (!text) return null;
  const glyphs: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
  let total = 0;
  let found = false;
  for (const [glyph, value] of Object.entries(glyphs)) {
    if (text.includes(glyph)) {
      total += value;
      text = text.replace(glyph, ' ');
      found = true;
    }
  }
  text = text.replace(/\bun cuarto\b/g, '0.25').replace(/\btres cuartos\b/g, '0.75').replace(/\bmedia docena\b/g, '6').replace(/\buna docena\b/g, '12').replace(/\s+y\s+/g, ' ').trim();
  const parts = text.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    if (/^\d+\/\d+$/.test(part)) {
      const [a, b] = part.split('/').map(Number) as [number, number];
      if (!b) return null;
      total += a / b;
      found = true;
    } else if (/^\d+(?:[.,]\d+)?$/.test(part)) {
      total += Number(part.replace(',', '.'));
      found = true;
    } else if (part === 'un' || part === 'una' || part === 'uno') {
      total += 1;
      found = true;
    } else if (part === 'medio' || part === 'media') {
      total += 0.5;
      found = true;
    } else if (part === 'cuarto') {
      total += 0.25;
      found = true;
    } else if (part === 'dos') { total += 2; found = true; }
    else if (part === 'tres') { total += 3; found = true; }
    else if (part === 'cuatro') { total += 4; found = true; }
    else if (part === 'cinco') { total += 5; found = true; }
    else return null;
  }
  return found ? total : null;
}

/** Parse a Spanish or English money amount: "1,36", "1.234,56", "2.99", "-0,20". */
export function parseMoney(raw: string): number | null {
  const text = String(raw ?? '').replace(/[€\s]/g, '').replace(/EUR/gi, '');
  if (!/^-?\d[\d.,]*$/.test(text)) return null;
  const negative = text.startsWith('-');
  const body = negative ? text.slice(1) : text;
  const lastComma = body.lastIndexOf(',');
  const lastDot = body.lastIndexOf('.');
  let normalised: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalised = lastComma > lastDot ? body.replace(/\./g, '').replace(',', '.') : body.replace(/,/g, '');
  } else if (lastComma >= 0) {
    normalised = body.replace(/,/g, '.');
    if ((body.match(/,/g) || []).length > 1) normalised = body.replace(/,/g, '');
  } else if (lastDot >= 0 && (body.match(/\./g) || []).length > 1) {
    normalised = body.replace(/\./g, '');
  } else normalised = body;
  const value = Number(normalised);
  return Number.isFinite(value) ? (negative ? -value : value) : null;
}

/** Local date as YYYY-MM-DD (never UTC: the kitchen lives in the user's day). */
export function isoDay(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function addDays(day: string | Date, days: number): string {
  const base = typeof day === 'string' ? new Date(`${day}T12:00:00`) : new Date(day);
  base.setHours(12, 0, 0, 0);
  base.setDate(base.getDate() + Math.round(days));
  return isoDay(base);
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T12:00:00`).getTime();
  const b = new Date(`${to}T12:00:00`).getTime();
  return Math.round((b - a) / 86_400_000);
}
