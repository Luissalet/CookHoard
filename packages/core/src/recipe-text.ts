// Deterministic recipe parser for pasted text (Spanish and English): a WhatsApp message, a note, a video caption, a web page's text.
// It finds sections, ingredient lines (quantities, units, notes), numbered steps with their timers and temperatures,
// and servings/times. It never invents anything: what it cannot read stays empty and is reported in `missing`.
import { detectTimer } from './timers';
import { canonicalUnit, unitSpellings } from './units';
import { fold, parseNumber } from './text';

export interface ParsedIngredient {
  raw: string;
  name: string;
  quantity: number | null;
  quantityMax?: number | null;
  unit: string | null;
  optional: boolean;
  note?: string;
  /** Sub-heading the line sat under ("Para la masa"). */
  group?: string;
  line: number;
}
export interface ParsedStep { text: string; timerSec?: number; temperatureC?: number; line: number }
export interface ParsedRecipeText {
  title: string | null;
  servings: number | null;
  prepMin: number | null;
  cookMin: number | null;
  totalMin: number | null;
  description: string | null;
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
  /** True when the text reads like a recipe (an ingredient list and something to do with it). */
  plausible: boolean;
  missing: string[];
  notes: string[];
}

const EMOJI = /[\p{Extended_Pictographic}‍️⃣]/gu;
const PROMO = /(s[ií]gueme|s[ií]guenos|s[ií]gueme|suscr[ií]be|follow me|link en (?:la )?bio|comparte (?:esta|este|con)|guarda (?:esta|este)|dale (?:a )?like|etiqu[eé]ta|comenta|no olvides|ya sabes|hasta la pr[oó]xima|nos vemos|gracias por|puedes encontrar|m[aá]s recetas|mi libro|c[oó]digo de descuento|colaboraci[oó]n|publi\b|#ad\b)/i;

const ING_HEAD = /^(ingredientes?|ingredients?|necesitas|vas a necesitar|lo que necesitas|que necesitas|you(?:'ll| will)? need|for the recipe|lista de la compra|ingredientes necesarios)\b/;
const STEP_HEAD = /^(preparaci[oó]n|preparacion|elaboraci[oó]n|elaboracion|pasos?|paso a paso|instrucciones|procedimiento|c[oó]mo se hace|como se hace|modo de preparaci[oó]n|modo de preparacion|manera de hacerlo|method|directions?|steps?|instructions?|preparation|how to make it|how to|receta)\b/;
const NOTES_HEAD = /^(notas?|consejos?|tips?|trucos?|apuntes?|observaciones|nota del chef|ojo|importante|nutrici[oó]n|informaci[oó]n nutricional)\b/;

const UNIT_RE = unitSpellings().map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const FRACTION = String.raw`\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?(?:\s*(?:y\s*)?\d+\s*\/\s*\d+|\s*[½¼¾⅓⅔⅛])?|[½¼¾⅓⅔⅛]`;
const WORDNUM = String.raw`un cuarto|tres cuartos|una docena|media docena|un|una|uno|medio|media|dos|tres|cuatro|cinco|seis|an|one|half|a`;
const QTY_START = new RegExp(String.raw`^(?:(${FRACTION})(?:\s*(?:-|–|—|a|to|o)\s*(${FRACTION}))?|(${WORDNUM})(?=\s))\s*`, 'i');
const UNIT_AFTER = new RegExp(String.raw`^(${UNIT_RE})\b\.?(?:\s+(?:de|del|of)\b)?\s*`, 'i');
const VAGUE = /^(un poco de|poco de|unas? gotas? de|unos? chorr(?:o|ito)s? de|un chorr(?:o|ito) de|chorr(?:o|ito) de|unas? hojas? de|unas? ramitas? de|al gusto de|a gusto de|un toque de|un golpe de|unas? pinceladas? de|un buen chorro de|un hilo de|un hilito de|some|a little|a splash of|a drizzle of|a dash of)\s+/i;
const TASTE = /\b(al gusto|a gusto|to taste|c\/n|cantidad necesaria|las necesarias|necesaria)\b/i;
const OPTIONAL = /\b(opcional|optional|si quieres|si te gusta|si se desea)\b/i;

export const stripEmoji = (line: string): string => line.replace(/(\d)️?⃣/g, '$1.').replace(EMOJI, '').replace(/\s+/g, ' ').trim();

/** Minutes in text like "1 h 30", "45 minutos", "20'" — null when there is none. */
export function parseMinutes(text: string): number | null {
  const sec = detectTimer(text);
  if (sec) return Math.round(sec / 60);
  const quote = text.match(/\b(\d{1,3})\s*['’′]/);
  if (quote) return Number(quote[1]);
  return null;
}

const bulletRe = /^(?:[-•·*▪▫●○◦‣⁃►▶→✔✓✅☑☐❖➤➔➜✦♦◆■□]+|\d+\s*[.)\-:]\s+(?=\D))\s*/;

function cleanLine(line: string): string {
  return stripEmoji(line.replace(/\t/g, ' ')).replace(/^[\s"'“”«»]+|[\s"'“”«»]+$/g, '').trim();
}

function isHeader(folded: string, re: RegExp): boolean {
  const text = folded.replace(/[^a-z0-9\s/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!re.test(text)) return false;
  // A header is short: "Ingredientes", "Ingredientes (4 personas):", not "Ingredientes frescos de la huerta que ..."
  return text.split(' ').length <= 8;
}

export function parseServings(text: string): number | null {
  const f = fold(text);
  const patterns: RegExp[] = [
    /\bpara\s+(\d{1,2})\s*(?:-\s*\d{1,2}\s*)?(?:personas?|raciones|porciones|comensales|pax|pers\.?)\b/,
    /\b(\d{1,2})\s*(?:-\s*\d{1,2}\s*)?(?:raciones|porciones|comensales|servings?|portions?|personas)\b/,
    /\b(?:raciones|porciones|rinde|rendimiento|sirve(?:\s+a)?|serves|yield|makes|para|personas|comensales|servings)\s*[:=]?\s*(\d{1,2})\b/,
  ];
  for (const re of patterns) {
    const m = f.match(re);
    if (m) {
      const n = Number(m[1]);
      if (n >= 1 && n <= 60) return n;
    }
  }
  return null;
}

function grabTime(line: string): { kind: 'prep' | 'cook' | 'total'; min: number } | null {
  const f = fold(line);
  const m = f.match(/^(tiempo(?: de)?\s+)?(preparacion|prep(?:aracion)?|prep time|coccion|cocinado|horno|cook(?:ing)? time|cooking|total|tiempo total|total time|tiempo)\s*[:\-–=]?\s*(.+)$/);
  if (!m) return null;
  const minutes = parseMinutes(m[3]!);
  if (!minutes) return null;
  const word = m[2]!;
  const kind = /total/.test(word) ? 'total' : /coccion|cocinado|horno|cook/.test(word) ? 'cook' : /prep/.test(word) ? 'prep' : 'total';
  return { kind, min: minutes };
}

function numberFrom(raw: string | undefined): number | null {
  if (!raw) return null;
  return parseNumber(raw.trim());
}

/** Parse one ingredient line. Returns null for lines that are headings or empty. */
export function parseIngredientLine(rawLine: string, line = 0): ParsedIngredient | null {
  let text = cleanLine(rawLine).replace(bulletRe, '').trim();
  if (!text) return null;
  const raw = text;
  const optional = OPTIONAL.test(text);
  text = text.replace(/\((?:opcional|optional)\)/gi, '').replace(OPTIONAL, '').replace(/\s+/g, ' ').trim();

  const notes: string[] = [];
  const paren = [...text.matchAll(/\(([^)]*)\)/g)].map((m) => m[1]!.trim()).filter(Boolean);
  let working = text.replace(/\([^)]*\)/g, ' ').replace(/\s+/g, ' ').trim();

  let quantity: number | null = null;
  let quantityMax: number | null = null;
  let unit: string | null = null;
  let vague = false;

  const v = working.match(VAGUE);
  if (v) { vague = true; notes.push(v[1]!.replace(/\s+de$/i, '').trim().toLowerCase()); working = working.slice(v[0].length); }

  if (!vague) {
    const q = working.match(QTY_START);
    if (q && (q[1] || q[3])) {
      const word = (q[3] ?? '').toLowerCase();
      const wordValue: Record<string, number> = { un: 1, una: 1, uno: 1, medio: 0.5, media: 0.5, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
        'un cuarto': 0.25, 'tres cuartos': 0.75, 'una docena': 12, 'media docena': 6, a: 1, an: 1, one: 1, half: 0.5 };
      const num = q[1] ? numberFrom(q[1]) : wordValue[word] ?? null;
      if (num !== null) {
        quantity = num;
        if (q[2]) quantityMax = numberFrom(q[2]);
        working = working.slice(q[0].length);
      }
    }
    if (quantity !== null || /^[a-z]/i.test(working)) {
      const u = working.match(UNIT_AFTER);
      if (u && (quantity !== null || /^(pizca|puñado|punado)/i.test(u[1]!))) {
        const canonical = canonicalUnit(u[1]!);
        // "2 l de agua" is a unit; a bare "u"/"l" followed by a word is not.
        const rest = working.slice(u[0].length);
        if (canonical && rest.trim()) { unit = canonical; working = rest; }
        else if (canonical && !rest.trim() && quantity !== null) { unit = canonical; working = rest; }
      }
    }
    // A leading "una docena de huevos" has no unit: it is a count.
    if (quantity !== null && !unit) {
      const doz = raw.match(/^(una|media) docena/i);
      if (doz) unit = 'ud';
    }
  }

  // Quantity at the end: "Tomate - 2", "Harina: 200 g", "Aceite, 3 cucharadas".
  if (quantity === null && !vague) {
    const tail = working.match(/^(.*?)\s*(?:[:\-–—,]|\s)\s*(\d+(?:[.,]\d+)?|\d+\/\d+|[½¼¾])\s*(?:(\w+)\.?)?\s*$/);
    if (tail && tail[1] && tail[1].length >= 2) {
      const n = numberFrom(tail[2]);
      const u = tail[3] ? canonicalUnit(tail[3]) : null;
      if (n !== null && (u || !tail[3])) { quantity = n; unit = u; working = tail[1]; }
    }
  }
  if (quantity === null && paren.length) {
    for (const p of paren) {
      const m = p.match(new RegExp(String.raw`^(${FRACTION})\s*(${UNIT_RE})?\b`, 'i'));
      if (m) {
        const n = numberFrom(m[1]);
        if (n !== null) { quantity = n; unit = m[2] ? canonicalUnit(m[2]) : null; break; }
      }
    }
  }
  const taste = TASTE.test(text);
  if (taste) notes.push('al gusto');
  working = working.replace(TASTE, ' ');

  // Preparation words after a comma become the note: "cebolla, picada".
  let name = working;
  const comma = name.indexOf(',');
  if (comma > 1) { notes.push(name.slice(comma + 1).trim()); name = name.slice(0, comma); }
  for (const p of paren) if (!/^\d/.test(p) || /[a-z]{3}/i.test(p)) notes.push(p);
  name = name.replace(/^(?:de|del|of|the)\s+/i, '').replace(/[\s:;.\-–—]+$/g, '').replace(/^[\s:;.\-–—]+/g, '').replace(/\s+/g, ' ').trim();
  if (!name || name.length < 2 || /^\d+$/.test(name)) return null;
  const quantityOut = quantity !== null && quantity > 0 ? quantity : null;
  return { raw, name, quantity: quantityOut, ...(quantityMax && quantityOut ? { quantityMax } : { quantityMax: null }), unit: quantityOut === null ? null : unit,
    optional, ...(notes.length ? { note: notes.join('; ') } : {}), line };
}

const IMPERATIVE = /^(?:mezcl|a[nñ]ad|agreg|corta|cort|cuec|cocin|hornea|pon\b|pone|remuev|bate|sofr|fr[ií]e|fre[ií]r|hierv|pela|trocea|calienta|incorpor|deja|sirv|tritur|amasa|extiend|rellen|saltea|tapa|coloca|precalienta|introduc|retira|lleva|reserva|lava|seca|escurre|sazona|salpimienta|unta|forra|enharina|monta|vierte|echa|cubre|pincela|empan|reboza|haz\b|hazlo|prepara|lamin|pica|ralla|exprim|bat[eé]|mix|add|stir|cook|bake|heat|chop|slice|pour|combine|whisk|simmer|boil|fry|serve|preheat|season|place|let\b|remove|drain|cut|peel|blend|knead|roll|spread|top\b|transfer|set\b|put\b|cover)/i;

function isStepLike(line: string): boolean {
  const f = fold(line);
  if (/^\d+\s*[.)\-:]\s*\S/.test(f) || /^paso\s*\d+/.test(f) || /^step\s*\d+/.test(f)) return true;
  const words = f.split(' ').length;
  if (IMPERATIVE.test(f) && words >= 3) return true;
  return words >= 9 && /[a-z]{3,}\s/.test(f) && !QTY_START.test(f);
}

function isIngredientLike(line: string): boolean {
  const text = line.replace(bulletRe, '').trim();
  if (!text || text.split(' ').length > 9) return false;
  const f = fold(text);
  if (/^\d+\s*[.)]\s+\S{3,}.*\s\S+\s\S+\s\S+/.test(f) && IMPERATIVE.test(f.replace(/^\d+\s*[.)]\s*/, ''))) return false;
  if (QTY_START.test(text) && !/^\d+\s*[.)]\s/.test(text)) return true;
  if (/\b(?:al gusto|a gusto|to taste)\b/i.test(text) && text.split(' ').length <= 5) return true;
  if (VAGUE.test(text)) return true;
  if (/^(sal|pimienta|aceite|agua|az[uú]car|vinagre|harina|salt|pepper|oil|water|sugar)\b/i.test(text) && text.split(' ').length <= 4) return true;
  return false;
}

/** Split a paragraph into steps at sentence ends, merging very short pieces into the previous one. */
function splitSentences(paragraph: string): string[] {
  const parts = paragraph.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¡¿])/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  for (const part of parts) {
    if (out.length && (part.length < 24 || out[out.length - 1]!.length < 24)) out[out.length - 1] += ' ' + part;
    else out.push(part);
  }
  return out;
}

function temperatureOf(text: string): number | undefined {
  const m = text.match(/\b(\d{2,3})\s*(?:º\s*c?|°\s*c?|grados(?:\s+(?:centigrados|celsius))?|ºc|°c|degrees|c\b)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 40 && n <= 320 ? n : undefined;
}

export function parseRecipeText(input: string): ParsedRecipeText {
  const rawLines = String(input ?? '').replace(/\r/g, '').split('\n');
  const lines = rawLines.map((raw, index) => ({ raw, text: cleanLine(raw), index }));
  const ingredients: ParsedIngredient[] = [];
  const steps: ParsedStep[] = [];
  const notes: string[] = [];
  let servings: number | null = null;
  let prepMin: number | null = null;
  let cookMin: number | null = null;
  let totalMin: number | null = null;
  let title: string | null = null;
  let description: string | null = null;

  type Mode = 'head' | 'ing' | 'steps' | 'notes';
  let mode: Mode = 'head';
  let group: string | undefined;
  let sawIngHeader = false;
  let sawStepHeader = false;
  const headLines: string[] = [];

  // Pass 1: sections, servings, times.
  const classified: Array<{ mode: Mode; text: string; index: number; group?: string }> = [];
  for (const entry of lines) {
    const text = entry.text;
    if (!text) continue;
    const folded = fold(text);
    if (/^(?:#[\p{L}\p{N}_]+\s*)+$/u.test(text) || /^@\w+$/.test(text) || /^https?:\/\/\S+$/i.test(text)) continue;
    if (PROMO.test(text) && text.length < 160) continue;
    const timeLine = grabTime(text);
    if (timeLine && mode !== 'steps') {
      if (timeLine.kind === 'prep') prepMin ??= timeLine.min;
      else if (timeLine.kind === 'cook') cookMin ??= timeLine.min;
      else totalMin ??= timeLine.min;
      continue;
    }
    const noBullet = text.replace(bulletRe, '').replace(/[:：]\s*$/, '').trim();
    const foldedNoBullet = fold(noBullet);
    if (isHeader(foldedNoBullet, ING_HEAD) && !/\d\s*(?:g|kg|ml)\b/.test(foldedNoBullet)) {
      mode = 'ing'; sawIngHeader = true; group = undefined;
      servings ??= parseServings(text);
      continue;
    }
    if (isHeader(foldedNoBullet, STEP_HEAD) && !/^receta\s+de\b/.test(foldedNoBullet)) {
      mode = 'steps'; sawStepHeader = true; group = undefined;
      servings ??= parseServings(text);
      continue;
    }
    if (isHeader(foldedNoBullet, NOTES_HEAD)) { mode = 'notes'; continue; }
    const s = parseServings(text);
    const bareServings = /^\d{1,2}(?:\s*-\s*\d{1,2})?\s*(?:personas?|raciones|porciones|comensales|servings?|portions?|people)\s*[.!]?$/.test(foldedNoBullet);
    if (s && (bareServings || (text.split(' ').length <= 8 && !QTY_START.test(text))) && mode !== 'steps') { servings ??= s; continue; }
    if (mode === 'ing') {
      const isGroup = (/[:：]\s*$/.test(text) && text.split(' ').length <= 6) || (/^(?:para|for)\s+(?:la|el|los|las|the)\b/i.test(foldedNoBullet) && !/\d/.test(text) && text.split(' ').length <= 6);
      if (isGroup) { group = noBullet.replace(/[:：]\s*$/, ''); continue; }
    }
    classified.push({ mode, text, index: entry.index, ...(group ? { group } : {}) });
    if (mode === 'head') headLines.push(text);
  }

  // Pass 2: when there were no explicit sections, decide line by line.
  const useHeuristic = !sawIngHeader && !sawStepHeader;
  const ordered: Array<{ mode: Mode; text: string; index: number; group?: string }> = [];
  if (useHeuristic) {
    let seenIngredient = false;
    for (const entry of classified) {
      const stepLike = isStepLike(entry.text);
      const ingLike = isIngredientLike(entry.text);
      let target: Mode;
      if (ingLike && !(stepLike && !QTY_START.test(entry.text))) target = 'ing';
      else if (stepLike) target = 'steps';
      else target = seenIngredient ? 'steps' : 'head';
      if (target === 'ing') seenIngredient = true;
      ordered.push({ ...entry, mode: target });
    }
  } else {
    // A steps header but no ingredients header (common on web pages): quantity lines above it are the ingredients.
    for (const entry of classified) {
      const bare = entry.text.replace(bulletRe, '').trim();
      if (entry.mode === 'head' && !sawIngHeader && QTY_START.test(bare) && isIngredientLike(bare)) ordered.push({ ...entry, mode: 'ing' });
      else ordered.push(entry);
    }
  }

  for (const entry of ordered) {
    if (entry.mode === 'ing') {
      const ing = parseIngredientLine(entry.text, entry.index);
      if (ing) ingredients.push({ ...ing, ...(entry.group ? { group: entry.group } : {}) });
    } else if (entry.mode === 'steps') {
      const stripped = entry.text.replace(/^(?:paso|step)\s*\d+\s*[:.\-)]?\s*/i, '').replace(bulletRe, '').trim();
      if (!stripped) continue;
      const pieces = stripped.length > 220 && !/^\d/.test(entry.text) ? splitSentences(stripped) : [stripped];
      for (const piece of pieces) {
        const timer = detectTimer(piece);
        const temperature = temperatureOf(piece);
        steps.push({ text: piece, ...(timer ? { timerSec: timer } : {}), ...(temperature ? { temperatureC: temperature } : {}), line: entry.index });
      }
    } else if (entry.mode === 'notes') {
      notes.push(entry.text.replace(bulletRe, '').trim());
    }
  }

  // Header lines: the title is the first short line that is not a sentence about the recipe.
  for (const text of headLines) {
    const f = fold(text);
    if (!title && text.length <= 100 && !/[.!?]$/.test(text) && !QTY_START.test(text) && !PROMO.test(text) && !/^(hola|buenas|os dejo|te dejo|aqui|mira|hoy|estos?|esta|este)\b/.test(f)) {
      title = text.replace(/^(?:receta\s+de|receta:|recipe:)\s*/i, '').replace(/[:：]\s*$/, '').trim() || null;
    } else if (!description && text.length > 20) description = text;
    servings ??= parseServings(text);
  }
  if (!description && headLines.length > 1) description = headLines.slice(title ? 1 : 0).join(' ').slice(0, 400) || null;

  const missing: string[] = [];
  if (!ingredients.length) missing.push('ingredientes');
  else if (ingredients.filter((i) => i.quantity !== null).length < Math.ceil(ingredients.length / 2)) missing.push('cantidades');
  if (!steps.length) missing.push('pasos');
  if (!servings) missing.push('raciones');
  const plausible = ingredients.length >= 2 && (steps.length >= 1 || sawIngHeader || ingredients.filter((i) => i.quantity !== null).length >= 3);
  return { title, servings, prepMin, cookMin, totalMin, description, ingredients, steps, plausible, missing, notes };
}

/** Readable text of an HTML page: scripts and styles dropped, block elements as lines, list items as bullets. */
export function htmlToText(html: string): string {
  let text = String(html ?? '')
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(nav|header|footer|aside|form|svg|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<li\b[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|section|article|ul|ol|tr|table|blockquote)\s*>/gi, '\n')
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<h[1-6]\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  const entities: Record<string, string> = { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&ordm;': 'º', '&deg;': '°', '&frac12;': '½', '&frac14;': '¼', '&frac34;': '¾' };
  text = text.replace(/&(?:nbsp|amp|lt|gt|quot|apos|ordm|deg|frac12|frac14|frac34|#39);/g, (m) => entities[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
  return text.split('\n').map((l) => l.replace(/[ \t]+/g, ' ').trim()).filter(Boolean).join('\n');
}
