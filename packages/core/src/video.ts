// Reading recipes out of videos: subtitle files → text, spoken text → ingredients and steps, platform names.
declare const URL: { new (url: string): { hostname: string; pathname: string } };
import { canonicalUnit, unitSpellings } from './units';
import { fold, parseNumber } from './text';
import { detectTimer } from './timers';
import type { ParsedIngredient, ParsedStep } from './recipe-text';

export function platformOf(url: string): string {
  const host = (() => { try { return new URL(url).hostname.toLowerCase(); } catch { return ''; } })();
  if (/instagram\.com$/.test(host)) return 'instagram';
  if (/tiktok\.com$/.test(host)) return 'tiktok';
  if (/(youtube\.com|youtu\.be)$/.test(host)) return 'youtube';
  if (/(facebook\.com|fb\.watch|fb\.com)$/.test(host)) return 'facebook';
  if (/(twitter\.com|x\.com)$/.test(host)) return 'x';
  if (/vimeo\.com$/.test(host)) return 'vimeo';
  return host.replace(/^www\./, '') || 'web';
}

/** Does the link look like a video or reel page (rather than a recipe article)? */
export function looksLikeVideoUrl(url: string): boolean {
  let parsed: { hostname: string; pathname: string };
  try { parsed = new URL(url); } catch { return false; }
  const host = parsed.hostname.toLowerCase();
  const path = parsed.pathname.toLowerCase();
  if (/instagram\.com$/.test(host)) return /\/(reel|reels|p|tv)\//.test(path);
  if (/tiktok\.com$/.test(host)) return /\/video\/|^\/t\//.test(path) || host.startsWith('vm.') || host.startsWith('vt.');
  if (/youtu\.be$/.test(host)) return true;
  if (/youtube\.com$/.test(host)) return /^\/(watch|shorts|live|embed)/.test(path);
  if (/(facebook\.com|fb\.watch)$/.test(host)) return /\/(reel|reels|watch|videos|share\/[rv])/.test(path) || host === 'fb.watch';
  if (/vimeo\.com$/.test(host)) return true;
  return false;
}

const decode = (text: string): string => text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');

/** Plain text of a subtitle file (WebVTT, SRT or json3), with the repeats of rolling auto-captions removed. */
export function subtitleText(content: string): string {
  const trimmed = content.trim();
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      const parts = (data.events ?? []).map((e) => (e.segs ?? []).map((s) => s.utf8 ?? '').join('')).map((t) => t.replace(/\s+/g, ' ').trim()).filter(Boolean);
      return dedupe(parts).join('\n');
    } catch { return ''; }
  }
  const lines: string[] = [];
  for (const block of content.replace(/\r/g, '').split(/\n{2,}/)) {
    for (const raw of block.split('\n')) {
      const line = raw.trim();
      if (!line || /^WEBVTT/.test(line) || /^(NOTE|STYLE|Kind:|Language:)/.test(line) || /^\d+$/.test(line) || /-->/.test(line)) continue;
      const clean = decode(line.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
      if (clean) lines.push(clean);
    }
  }
  return dedupe(lines).join('\n');
}

/** Drop repeated lines: auto-captions show every line twice (rolling), and cues often repeat the previous one. */
function dedupe(lines: string[]): string[] {
  const out: string[] = [];
  for (const line of lines) {
    if (out.slice(-3).includes(line)) continue;
    const prev = out[out.length - 1];
    if (prev !== undefined && line.startsWith(prev + ' ')) { out[out.length - 1] = line; continue; }
    out.push(line);
  }
  return out;
}

const UNIT_RE = unitSpellings().map((u) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const NUM_WORDS = 'un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|medio|media|un cuarto|doce|one|two|three|four|five|six|half';
const SPOKEN_ING = new RegExp(String.raw`\b(\d+(?:[.,]\d+)?(?:\s*(?:y\s*)?(?:\d+\/\d+|medio|media))?|${NUM_WORDS})\s+(?:(${UNIT_RE})\b\.?\s+(?:de\s+|del\s+|of\s+)?)?([a-záéíóúñü]+(?:\s+(?:de|del)\s+[a-záéíóúñü]+)?(?:\s+(?!(?:y|e|o|con|en|a|al|un|una|uno|dos|tres|cuatro|cinco|seis|medio|media|luego|para|que|se|por|como|hasta)\b)[a-záéíóúñü]+)?)`, 'gi');
const FILLER = new Set(['veces', 'vez', 'minutos', 'minuto', 'segundos', 'segundo', 'horas', 'hora', 'grados', 'personas', 'raciones', 'cosas', 'cosa', 'euros', 'años', 'dias', 'dia', 'poco', 'pocos', 'más', 'mas', 'menos', 'rato', 'momento', 'lado', 'lados', 'partes', 'parte', 'paso', 'pasos', 'trozos', 'trozo', 'minutes', 'minute', 'seconds', 'hours', 'times', 'degrees', 'people', 'servings']);
const COOK_VERBS = /\b(echamos|echa|a[nñ]adimos|a[nñ]ade|mezclamos|mezcla|batimos|bate|cortamos|corta|picamos|pica|pelamos|pela|cocemos|cuece|cocinamos|cocina|horneamos|hornea|freimos|fríe|fr[ií]e|sofreimos|sofríe|salteamos|saltea|hervimos|hierve|ponemos|pon|dejamos|deja|removemos|remueve|trituramos|tritura|amasamos|amasa|extendemos|extiende|rellenamos|rellena|servimos|sirve|calentamos|calienta|agregamos|agrega|incorporamos|incorpora|tapamos|tapa|escurrimos|escurre|vertemos|vierte|mix|add|stir|bake|cook|chop|slice|pour|whisk|simmer|boil|fry|serve|preheat|season)\b/i;

const NAME_STOP = new Set(['y', 'e', 'o', 'con', 'en', 'a', 'al', 'que', 'se', 'para', 'hasta', 'por', 'como', 'un', 'una', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'medio', 'media', 'luego', 'despues', 'ahora', 'and', 'then', 'with']);
function cutName(raw: string): string {
  const words = raw.trim().split(/\s+/);
  const out: string[] = [];
  for (const [i, word] of words.entries()) {
    const f = fold(word);
    if (i > 0 && (NAME_STOP.has(f) || /^\d/.test(f))) break;
    out.push(word);
  }
  while (out.length && ['de', 'del', 'la', 'el', 'los', 'las'].includes(fold(out[out.length - 1]!))) out.pop();
  return out.join(' ').trim();
}

/** Ingredients named in spoken or free narrative text ("200 gramos de harina", "dos huevos"). Evidence is the sentence they came from. */
export function spokenIngredients(text: string): ParsedIngredient[] {
  const out: ParsedIngredient[] = [];
  const seen = new Set<string>();
  const sentences = text.split(/(?<=[.!?\n])\s+|\n/).map((s) => s.trim()).filter(Boolean);
  sentences.forEach((sentence, line) => {
    for (const m of sentence.matchAll(SPOKEN_ING)) {
      const qty = parseNumber(m[1]!.toLowerCase().replace(/^doce$/, '12').replace(/^siete$/, '7').replace(/^ocho$/, '8').replace(/^nueve$/, '9').replace(/^diez$/, '10')
        .replace(/^six$/, '6').replace(/^two$/, '2').replace(/^three$/, '3').replace(/^four$/, '4').replace(/^five$/, '5').replace(/^one$/, '1').replace(/^half$/, '0.5').replace(/^seis$/, '6'));
      let unit = m[2] ? canonicalUnit(m[2]) : null;
      let name = cutName(m[3]!);
      if (!name) continue;
      const first = fold(name).split(' ')[0]!;
      if (FILLER.has(first) || canonicalUnit(first) && !unit && first !== 'diente' && first !== 'lata') {
        if (canonicalUnit(first) && !unit) { unit = canonicalUnit(first); name = name.split(' ').slice(1).join(' ').replace(/^(?:de|del)\s+/, ''); if (!name) continue; }
        else continue;
      }
      if (qty === null || qty <= 0) continue;
      if (/^\d+$/.test(m[1]!) && Number(m[1]) >= 50 && !unit) continue; // "180 grados" style leftovers
      const key = fold(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ raw: sentence, name, quantity: qty, unit, optional: false, line });
    }
  });
  return out;
}

/** Sentences of a narration that describe an action: the steps of a spoken recipe. */
export function spokenSteps(text: string, limit = 24): ParsedStep[] {
  const sentences = text.split(/(?<=[.!?])\s+|\n/).map((s) => s.trim()).filter((s) => s.length > 12);
  const steps: ParsedStep[] = [];
  sentences.forEach((sentence, line) => {
    if (steps.length >= limit) return;
    if (!COOK_VERBS.test(sentence)) return;
    const timer = detectTimer(sentence);
    steps.push({ text: sentence.replace(/\s+/g, ' '), ...(timer ? { timerSec: timer } : {}), line });
  });
  return steps;
}
