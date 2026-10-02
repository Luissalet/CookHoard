// Reading a recipe out of speech (subtitles, a transcript). Speech is prose, not a list: it is never read line by line.
// Ingredients are the dictionary ingredients (and the user's own, and learned aliases) that are mentioned, with the amount
// said right before them when there is one; an announcement such as "los ingredientes que necesitaremos son…" has priority.
// Words that are not in the dictionary never become ingredients here. Steps are the actions, grouped at the words people
// use to move on ("cuando", "una vez", "luego"…). Evidence is always the sentence the line was read from.
import { BUILTIN_INGREDIENTS } from './dictionary';
import { fold } from './text';
import { canonicalUnit } from './units';
import { detectTimer } from './timers';
import type { Lexicon } from './ingredients';
import type { ParsedIngredient, ParsedStep } from './recipe-text';

export interface SpeechReading {
  ingredients: ParsedIngredient[];
  steps: ParsedStep[];
  /** An "these are the ingredients" announcement was found. */
  announced: boolean;
  servings: number | null;
}

// ───────────────────────────── sentences ─────────────────────────────

interface Unit { text: string; start: number; end: number }

const MARKER = String.raw`(?:cuando|una vez|despu[eé]s|luego|ahora|a continuaci[oó]n|por [uú]ltimo|primero|finalmente|entonces|then|after|next|once|now|finally|first)`;
const MARKER_SPLIT = new RegExp(String.raw`\s+(?=${MARKER}(?![\p{L}]))`, 'iu');
const MARKER_START = new RegExp(String.raw`^${MARKER}(?![\p{L}])`, 'iu');

/** Sentences of a text: a line break (a pause in the speech) or a full stop ends one. Very long ones are cut into clauses. */
function segment(text: string): Unit[] {
  const units: Unit[] = [];
  for (const line of text.matchAll(/[^\n]+/g)) {
    const lineStart = line.index!;
    let from = 0;
    const cuts = [...line[0].matchAll(/(?<=[.!?…])\s+/g)].map((m) => ({ at: m.index!, len: m[0].length }));
    const pieces: Array<[number, number]> = [];
    for (const cut of cuts) { pieces.push([from, cut.at]); from = cut.at + cut.len; }
    pieces.push([from, line[0].length]);
    for (const [a, b] of pieces) {
      const raw = line[0].slice(a, b);
      const lead = raw.length - raw.trimStart().length;
      const body = raw.trim();
      if (!body) continue;
      pushCapped(units, body, lineStart + a + lead);
    }
  }
  return units;
}

function pushCapped(units: Unit[], body: string, offset: number): void {
  const words = [...body.matchAll(/\S+/g)];
  if (body.length <= 230 || words.length < 30) { units.push({ text: body, start: offset, end: offset + body.length }); return; }
  let begin = 0;
  for (let i = 1; i < words.length; i++) {
    const count = i - begin;
    const word = fold(words[i]![0]);
    const natural = MARKER_START.test(word) || /^(?:y|luego|despues|entonces)$/.test(word);
    if ((count >= 22 && natural) || count >= 34) {
      const a = words[begin]!.index!; const b = words[i - 1]!.index! + words[i - 1]![0].length;
      units.push({ text: body.slice(a, b), start: offset + a, end: offset + b });
      begin = i;
    }
  }
  const a = words[begin]!.index!;
  units.push({ text: body.slice(a), start: offset + a, end: offset + body.length });
}

const unitAt = (units: Unit[], position: number): number => {
  for (let i = 0; i < units.length; i++) if (position < units[i]!.end) return i;
  return units.length - 1;
};

// ───────────────────────────── tokens and numbers ─────────────────────────────

interface Tok { raw: string; f: string; start: number; end: number }

function tokenise(text: string): Tok[] {
  const out: Tok[] = [];
  for (const m of text.matchAll(/\d+(?:[.,]\d+)?|[\p{L}]+/gu)) out.push({ raw: m[0], f: fold(m[0]), start: m.index!, end: m.index! + m[0].length });
  return out;
}

const WORD_NUMBERS: Record<string, number> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15,
  dieciseis: 16, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90, cien: 100, ciento: 100, doscientos: 200, trescientos: 300, quinientos: 500,
  medio: 0.5, media: 0.5, cuarto: 0.25, docena: 12,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, half: 0.5,
};

const numberOf = (t: string): number | null => {
  if (/^\d+(?:[.,]\d+)?$/.test(t)) return Number(t.replace(',', '.'));
  return WORD_NUMBERS[t] ?? null;
};

const SKIP = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'unos', 'unas', 'aproximadamente', 'casi', 'otros', 'otras', 'of', 'the']);
const RANGE = new Set(['o', 'u', 'a', 'to', 'or']);
const LOCAL_UNITS: Record<string, string> = { pizquita: 'pizca', pizquitas: 'pizca', chorrito: 'chorrito', chorrillo: 'chorrito' };
const unitOf = (t: string): string | null => LOCAL_UNITS[t] ?? canonicalUnit(t);
/** A quantity of something that is not an ingredient. */
const NOT_AMOUNT = new Set(['minuto', 'minutos', 'segundo', 'segundos', 'hora', 'horas', 'grado', 'grados', 'veces', 'vez', 'persona', 'personas', 'euros', 'dias', 'dia', 'min']);

interface Amount { quantity: number | null; quantityMax: number | null; unit: string | null; note?: string; from: number }

/** The amount said right before a mention that starts at token `i`: "3", "una", "4 ó 5", "200 gramos de", "medio kilo de", "una pizca de". */
function amountBefore(toks: Tok[], i: number, floor: number): Amount | null {
  let k = i - 1;
  const lowest = Math.max(floor, i - 7);
  const skip = (): void => { while (k >= lowest && SKIP.has(toks[k]!.f)) k--; };
  skip();
  let unit: string | null = null;
  if (k >= lowest) {
    const u = unitOf(toks[k]!.f);
    // "kilo y medio de", "una hora y media" shape: unit, "y", half
    if (!u && toks[k]!.f === 'medio' && k - 2 >= lowest && toks[k - 1]!.f === 'y' && unitOf(toks[k - 2]!.f) && numberOf(toks[k - 3]?.f ?? '') !== null && k - 3 >= lowest) {
      const base = numberOf(toks[k - 3]!.f)!;
      return { quantity: base + 0.5, quantityMax: null, unit: unitOf(toks[k - 2]!.f), from: k - 3 };
    }
    if (u && !NOT_AMOUNT.has(toks[k]!.f)) { unit = u; k--; skip(); }
    else if (toks[k]!.f === 'poco' || toks[k]!.f === 'pocos') {
      return { quantity: null, quantityMax: null, unit: null, note: 'un poco', from: toks[k - 1]?.f === 'un' ? k - 1 : k };
    }
  }
  if (k < lowest) return null;
  const t = toks[k]!.f;
  if (NOT_AMOUNT.has(t)) return null;
  let value = numberOf(t) ?? ((t === 'a' || t === 'an') && unit ? 1 : null); // "a cup of flour"
  if (value === null) return null;
  let from = k;
  // "cuarenta y cinco"
  if (value >= 1 && value <= 9 && toks[k - 1]?.f === 'y' && k - 2 >= lowest) {
    const tens = numberOf(toks[k - 2]!.f);
    if (tens !== null && tens >= 20 && tens <= 90 && tens % 10 === 0) { value += tens; from = k - 2; }
  }
  if (t === 'cuarto' && toks[k - 1]?.f === 'un') from = k - 1; // "un cuarto de kilo"
  if (t === 'cuarto' && !unit) return null;
  // "1 y medio", "uno y medio"
  if (t === 'medio' || t === 'media') {
    if (toks[k - 1]?.f === 'y' && k - 2 >= lowest) { const base = numberOf(toks[k - 2]!.f); if (base !== null && base >= 1) { value = base + 0.5; from = k - 2; } }
  }
  // a range: "4 ó 5", "dos o tres", "2 a 3"
  let max: number | null = null;
  if (k - 2 >= lowest && RANGE.has(toks[k - 1]!.f)) {
    const low = numberOf(toks[k - 2]!.f);
    if (low !== null && low < value && low >= 1) { max = value; value = low; from = k - 2; }
  }
  if (!unit && (max ?? value) > 20) return { quantity: null, quantityMax: null, unit: null, from };
  if (value <= 0) return null;
  return { quantity: value, quantityMax: max, unit, from };
}

// ───────────────────────────── the dictionary as a phrase index ─────────────────────────────

const IGNORE_KEYS = new Set(['barra', 'rama', 'cola', 'ron', 'cava', 'hogaza']);
const STOP = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'en', 'y', 'a', 'al', 'un', 'una', 'con', 'para']);
const MAX_WORDS = 4;

type Index = Map<string, string>;
const builtinIndex: Index = new Map();
const addPhrases = (index: Index, entries: Array<{ id: string; name: string; nameEn?: string; aliases?: string[] }>): void => {
  const own: Array<[string, string]> = [];
  for (const ing of entries) {
    for (const raw of [ing.name, ing.nameEn ?? '', ...(ing.aliases ?? [])]) {
      const key = fold(raw).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      if (!key || key.split(' ').length > MAX_WORDS) continue;
      if (key.split(' ').filter((w) => !STOP.has(w)).some((w) => w.length < 3)) continue;
      if (IGNORE_KEYS.has(key)) continue;
      if (!index.has(key)) index.set(key, ing.id);
    }
    own.push([fold(ing.name), ing.id], [fold(ing.nameEn ?? ''), ing.id]);
  }
  for (const [key, id] of own) if (key && !IGNORE_KEYS.has(key) && key.split(' ').length <= MAX_WORDS) index.set(key, id);
};
addPhrases(builtinIndex, BUILTIN_INGREDIENTS);

const userCache = new WeakMap<object, Index>();
function indexFor(lex: Lexicon): Index {
  const list = lex.userIngredients;
  const learned = lex.learnedAliases;
  if (!list?.length && !learned) return builtinIndex;
  const key = (list ?? learned) as object;
  let cached = userCache.get(key);
  if (!cached || learned) {
    cached = new Map(builtinIndex);
    if (list?.length) addPhrases(cached, list);
    for (const [alias, id] of Object.entries(learned ?? {})) {
      const phrase = fold(alias);
      if (phrase && phrase.split(' ').length <= MAX_WORDS && !phrase.split(' ').some((w) => w.length < 3 && !STOP.has(w))) cached.set(phrase, id);
    }
    if (!learned) userCache.set(key, cached);
  }
  return cached;
}

/** Spellings of one folded word that may be in the dictionary: itself and its singular. */
function variants(word: string): string[] {
  const out = [word];
  if (word.length > 3 && word.endsWith('s')) out.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) out.push(word.slice(0, -2));
  if (word.length > 4 && word.endsWith('ces')) out.push(`${word.slice(0, -3)}z`);
  return out;
}

interface Mention { id: string; from: number; to: number }

function findMentions(toks: Tok[], index: Index): Mention[] {
  const out: Mention[] = [];
  for (let i = 0; i < toks.length;) {
    let hit: Mention | null = null;
    for (let len = Math.min(MAX_WORDS, toks.length - i); len >= 1 && !hit; len--) {
      const slice = toks.slice(i, i + len).map((t) => t.f);
      if (slice.some((w) => /^\d/.test(w))) continue;
      const first = variants(slice[0]!);
      const last = len > 1 ? variants(slice[len - 1]!) : [''];
      const middle = slice.slice(1, len - 1).join(' ');
      for (const a of first) {
        for (const b of last) {
          const phrase = len === 1 ? a : [a, middle, b].filter(Boolean).join(' ');
          const id = index.get(phrase);
          if (id) { hit = { id, from: i, to: i + len - 1 }; break; }
        }
        if (hit) break;
      }
    }
    if (hit) { out.push(hit); i = hit.to + 1; } else i++;
  }
  return out;
}

// ───────────────────────────── actions ─────────────────────────────

const ACTION = /(?<![\p{L}])(?:ech[aeo]\w*|a[nñ]ad\w*|agreg\w*|mezcl\w*|bat[eio]\w*|cort\w*|pel[aeo]\w*|fr[ií]e\w*|frei\w*|freí\w*|frit\w*|sofr\w*|salt[ea]\w*|herv\w*|pon[eg]\w*|dej[aeo]\w*|remuev\w*|removem\w*|tritur\w*|amas\w*|extiend\w*|rell\w*|serv\w*|calent\w*|incorpor\w*|tap[aeo]\w*|escurr\w*|viert\w*|cuaj\w*|cuec\w*|cocin\w*|cocem\w*|horne\w*|dor[aeo]\w*|volte\w*|vuelta|retir\w*|baj[aeo]\w*|sazon\w*|pic[aeo]\w*|lamin\w*|reserv\w*|hac(?:e|emos|er|iendo)(?![\p{L}])|coc(?:er|iendo|ido)\w*|comenz\w*|empez\w*|add|stir|bake|cook|chop|slice|pour|whisk|simmer|boil|fry|serve|preheat|season|mix|peel|heat|flip|turn|drain)(?![\p{L}])/iu;

const NUMBER_WORD = String.raw`(?:un|uno|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce|quince|veinte|treinta|cuarenta|cincuenta|sesenta|one|two|three|four|five|six|seven|eight|nine|ten|\d+)`;
const WORDS_TO_DIGITS: Record<string, string> = { un: '1', uno: '1', una: '1', dos: '2', tres: '3', cuatro: '4', cinco: '5', seis: '6', siete: '7', ocho: '8', nueve: '9', diez: '10', once: '11', doce: '12', quince: '15', veinte: '20', treinta: '30', cuarenta: '40', cincuenta: '50', sesenta: '60',
  one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8', nine: '9', ten: '10' };

/** "unos cinco minutos" → "5 minutos", "cuatro ó cinco minutos" → "4 o 5 minutos": digits for the timer reader. */
function spokenToDigits(text: string): string {
  const toDigit = (w: string): string => WORDS_TO_DIGITS[fold(w)] ?? w;
  return text
    .replace(new RegExp(String.raw`(?<![\p{L}\d])(${NUMBER_WORD})(?:\s*(?:ó|o|a|to|or)\s*(${NUMBER_WORD}))?\s+(minutos?|horas?|segundos?|minutes?|hours?|seconds?|mins?)(?![\p{L}])`, 'giu'),
      (_all, a: string, b: string | undefined, unit: string) => `${toDigit(a)}${b ? ` o ${toDigit(b)}` : ''} ${unit}`);
}

/** The sentences that start after `char`; the one that straddles it is cut. */
function afterChar(units: Unit[], char: number): Unit[] {
  const out: Unit[] = [];
  for (const u of units) {
    if (u.end <= char) continue;
    if (u.start < char) { const cut = u.text.slice(char - u.start).trim(); if (cut) out.push({ text: cut, start: char, end: u.end }); } else out.push(u);
  }
  return out;
}

const DANGLING = /^(?:(?:y|e|que|pues|bueno|entonces)\s+)+|(?:\s+(?:y|e|o|que|de|a|la|las|el|los|en|un|una|con|lo|le|se|me|nos|por|para))+$/gi;
const sentenceCase = (text: string): string => {
  const t = text.replace(/\s+/g, ' ').trim().replace(DANGLING, '').trim();
  const body = t ? t[0]!.toUpperCase() + t.slice(1) : t;
  return /[.!?…]$/.test(body) ? body : `${body}.`;
};

interface Group { text: string; unit: number }
const MAX_STEP = 120;
const MIN_PIECE = 35;

function groupSteps(units: Unit[], limit: number): ParsedStep[] {
  const groups: Group[] = [];
  for (let u = 0; u < units.length; u++) {
    const pieces = units[u]!.text.split(MARKER_SPLIT).map((p) => p.trim()).filter(Boolean);
    pieces.forEach((piece, n) => {
      const starts = MARKER_START.test(piece);
      const last = groups[groups.length - 1];
      if (!last || starts || (n === 0 && last.text.length > 180)) groups.push({ text: piece, unit: u });
      else last.text = `${last.text} ${piece}`;
    });
  }
  // A group that runs on is cut at the action word nearest its middle, so a handful of steps stay readable.
  const cut = (text: string): string[] => {
    if (text.length <= MAX_STEP) return [text];
    const hits = [...text.matchAll(new RegExp(ACTION.source, 'giu'))].filter((m) => m.index! >= MIN_PIECE && text.length - m.index! >= MIN_PIECE);
    if (!hits.length) return [text];
    const middle = text.length / 2;
    const best = hits.reduce((x, y) => (Math.abs(y.index! - middle) < Math.abs(x.index! - middle) ? y : x));
    let at = best.index!;
    // "lo bajaremos": the pronoun goes with its verb.
    for (let n = 0; n < 2; n++) {
      const before = text.slice(0, at).trimEnd();
      const clitic = before.match(/(?:^|\s)(lo|la|le|les|los|las|se|me|nos|te)$/i);
      if (!clitic || before.length - clitic[1]!.length < MIN_PIECE) break;
      at = before.length - clitic[1]!.length;
    }
    return [...cut(text.slice(0, at).trim()), ...cut(text.slice(at).trim())];
  };
  for (let i = groups.length - 1; i >= 0; i--) {
    const parts = cut(groups[i]!.text);
    if (parts.length > 1) groups.splice(i, 1, ...parts.map((text) => ({ text, unit: groups[i]!.unit })));
  }
  // Only what describes an action; very short groups join the previous one.
  const actions: Group[] = [];
  for (const g of groups) {
    if (!ACTION.test(g.text)) { const prev = actions[actions.length - 1]; if (prev && g.text.length < 60) prev.text = `${prev.text} ${g.text}`; continue; }
    const prev = actions[actions.length - 1];
    if (prev && g.text.length < 30) prev.text = `${prev.text} ${g.text}`; else actions.push({ ...g });
  }
  while (actions.length > limit) {
    let best = 1; let bestLength = Infinity;
    for (let i = 1; i < actions.length; i++) { const l = actions[i]!.text.length + actions[i - 1]!.text.length; if (l < bestLength) { bestLength = l; best = i; } }
    actions[best - 1]!.text = `${actions[best - 1]!.text} ${actions[best]!.text}`;
    actions.splice(best, 1);
  }
  return actions.map((g) => {
    const timer = detectTimer(spokenToDigits(g.text));
    return { text: sentenceCase(g.text), evidence: g.text, ...(timer ? { timerSec: timer } : {}), line: g.unit };
  });
}

// ───────────────────────────── reading ─────────────────────────────

const ANNOUNCE = new Set(['ingredientes', 'ingredients']);

const ADDING = /^(necesit|anad|ech|pon|agreg|incorpor|sazon|espolvore|salpiment|rall|verte|vert)/;

/** Read ingredients and steps from speech. `lex` adds the user's own ingredients and learned aliases to the dictionary. */
export function readSpeech(text: string, lex: Lexicon = {}): SpeechReading {
  const clean = text.replace(/\r/g, '');
  const units = segment(clean);
  const toks = tokenise(clean);
  const index = indexFor(lex);
  const mentions = findMentions(toks, index);

  // The announcement window: from the word "ingredientes" to the first action.
  let windowFrom = -1; let windowTo = -1;
  const at = toks.findIndex((t) => ANNOUNCE.has(t.f));
  if (at >= 0) {
    windowFrom = at;
    windowTo = Math.min(toks.length - 1, at + 90);
    for (let i = at + 1; i <= windowTo; i++) { if (ACTION.test(toks[i]!.raw) && !index.has(toks[i]!.f)) { windowTo = i - 1; break; } }
  }
  const inWindow = (m: Mention): boolean => windowFrom >= 0 && m.from > windowFrom && m.to <= windowTo;

  interface Candidate { m: Mention; amount: Amount | null; win: boolean }
  const candidates: Candidate[] = mentions.map((m, n) => {
    const floor = n > 0 ? mentions[n - 1]!.to + 1 : 0;
    return { m, amount: amountBefore(toks, m.from, floor), win: inWindow(m) };
  });

  const byId = new Map<string, Candidate[]>();
  for (const c of candidates) byId.set(c.m.id, [...(byId.get(c.m.id) ?? []), c]);
  const ingredients: ParsedIngredient[] = [];
  const taken = new Set<string>();
  const ordered = [...candidates.filter((c) => c.win), ...candidates.filter((c) => !c.win)];
  for (const c of ordered) {
    if (taken.has(c.m.id)) continue;
    taken.add(c.m.id);
    const all = byId.get(c.m.id)!;
    const best = all.find((x) => x.win && x.amount?.quantity != null) ?? all.find((x) => x.amount?.quantity != null) ?? all.find((x) => x.win) ?? all[0]!;
    // Outside the announcement only what has an amount or is said more than once counts as an ingredient.
    // A single bare mention counts only right after an "add" verb ("añadimos sal"), never as a dish name ("hacemos unas tortitas").
    const added = (x: Candidate): boolean => toks.slice(Math.max(0, (x.amount ? x.amount.from : x.m.from) - 3), x.m.from).some((t) => ADDING.test(t.f));
    if (!all.some((x) => x.win) && best.amount?.quantity == null && all.length < 2 && !added(best)) continue;
    const first = toks[best.m.from]!; const lastTok = toks[best.m.to]!;
    let nameFrom = best.m.from;
    let unit = best.amount?.unit ?? null;
    // "dientes de ajo" is "ajo" counted in cloves.
    const lead = unitOf(first.f);
    if (best.m.to > best.m.from && lead && !NOT_AMOUNT.has(first.f) && lead !== 'ud') {
      const rest = toks.slice(best.m.from + 1, best.m.to + 1).filter((t) => !SKIP.has(t.f));
      if (rest.length) { unit = unit ?? lead; nameFrom = best.m.from + 1 + toks.slice(best.m.from + 1, best.m.to + 1).findIndex((t) => !SKIP.has(t.f)); }
    }
    const name = clean.slice(toks[nameFrom]!.start, lastTok.end);
    const unitIndex = unitAt(units, first.start);
    const u = units[unitIndex]!;
    // The words around the mention, inside its sentence: enough to check the amount against.
    let a = best.amount ? best.amount.from : best.m.from;
    let b = best.m.to;
    a = Math.max(a - 3, 0); b = Math.min(b + 4, toks.length - 1);
    while (a < best.m.from && toks[a]!.start < u.start) a++;
    while (b > best.m.to && toks[b]!.end > u.end) b--;
    const evidence = clean.slice(toks[a]!.start, toks[b]!.end);
    ingredients.push({
      raw: evidence, name, quantity: best.amount?.quantity ?? null, ...(best.amount?.quantityMax ? { quantityMax: best.amount.quantityMax } : {}),
      unit: best.amount?.quantity != null ? unit : null, optional: false, ...(best.amount?.note ? { note: best.amount.note } : {}), line: unitIndex,
    });
  }

    // Steps start right after the announcement (or at the first action when there is none).
  const steps = groupSteps(afterChar(units, windowFrom >= 0 ? toks[Math.min(toks.length - 1, windowTo)]!.end : 0), 12);

  const servings = (() => {
    const m = fold(clean).match(/\bpara\s+(\d{1,2}|dos|tres|cuatro|cinco|seis|ocho|diez)\s+(?:personas|raciones|comensales)\b/);
    if (!m) return null;
    const n = numberOf(m[1]!);
    return n && n >= 1 ? n : null;
  })();
  return { ingredients, steps, announced: windowFrom >= 0 && candidates.some((c) => c.win), servings };
}

/** Ingredients named in speech or narration ("200 gramos de harina", "dos huevos"). Evidence (`raw`) is the sentence they came from. */
export function spokenIngredients(text: string, lex: Lexicon = {}): ParsedIngredient[] {
  return readSpeech(text, lex).ingredients;
}

/** The actions of a narration, grouped into steps. */
export function spokenSteps(text: string, limit = 12): ParsedStep[] {
  const clean = text.replace(/\r/g, '');
  const units = segment(clean);
  const toks = tokenise(clean);
  const at = toks.findIndex((t) => ANNOUNCE.has(t.f));
  let from = 0;
  if (at >= 0) {
    let end = Math.min(toks.length - 1, at + 90);
    for (let i = at + 1; i <= end; i++) if (ACTION.test(toks[i]!.raw)) { end = i - 1; break; }
    from = toks[end]!.end;
  }
  return groupSteps(afterChar(units, from), limit);
}
