// A recipe draft: what was read from a link, a video or pasted text, with the evidence of each line, a confidence and what is missing.
// The draft is reviewed by a person before it becomes a recipe (draftToRecipe).
import type { Draft, DraftIngredient, DraftStep } from './kitchen';
import type { Recipe } from './types';
import { parseRecipeText, type ParsedIngredient, type ParsedRecipeText } from './recipe-text';
import { resolveName, resolveOrCreate, type Lexicon, type UserIngredient } from './ingredients';
import { readSpeech, type SpeechReading } from './speech';
import { inferTags } from './tagging';
import { detectTimer } from './timers';
import { fold } from './text';
import { canonicalUnit } from './units';

export type SourceName = 'caption' | 'subtitles' | 'transcript' | 'frames' | 'web' | 'text';
export type Sources = Partial<Record<SourceName, string>>;

const PRIORITY: SourceName[] = ['text', 'web', 'caption', 'subtitles', 'transcript', 'frames'];
/** Sources that are somebody talking: prose, never read as a list. */
export const SPEECH_SOURCES: SourceName[] = ['subtitles', 'transcript'];
const isSpeech = (name: string | undefined): boolean => name === 'subtitles' || name === 'transcript';
const CAP = 20_000;

export interface BuildInput {
  kind: Draft['kind'];
  id: string;
  now: string;
  url?: string;
  canonicalUrl?: string;
  title?: string | null;
  description?: string | null;
  sources: Sources;
  media?: Draft['media'];
  notes?: Record<string, string>;
  lex?: Lexicon;
}

const usable = (p: ParsedRecipeText): boolean => p.ingredients.length >= 3 && p.ingredients.filter((i) => i.quantity !== null).length >= 2 || p.ingredients.length >= 5;

/** Does this text hold an ingredient list a recipe can be built from (caption/subtitles/etc.)? */
export function hasUsableIngredientList(text: string): boolean {
  if (!text.trim()) return false;
  return usable(parseRecipeText(text));
}

function toDraftIngredient(i: ParsedIngredient, source: SourceName, lex: Lexicon): DraftIngredient {
  const found = resolveName(i.name, lex);
  return { raw: i.raw, name: i.name, ingredientId: found.id, quantity: i.quantity, unit: i.unit, optional: i.optional,
    ...(i.note || i.quantityMax ? { note: i.quantityMax && i.quantity && !i.note?.startsWith('entre') ? `entre ${i.quantity} y ${i.quantityMax}${i.note ? `; ${i.note}` : ''}` : i.note } : {}), evidence: { source, line: i.raw, verified: true } };
}

export function buildDraft(input: BuildInput): Draft {
  const lex = input.lex ?? {};
  const sources: Sources = {};
  for (const [key, value] of Object.entries(input.sources)) if (value && value.trim()) sources[key as SourceName] = value.slice(0, CAP);
  const parsed = new Map<SourceName, ParsedRecipeText>();
  const speech = new Map<SourceName, SpeechReading>();
  for (const name of PRIORITY) {
    const text = sources[name];
    if (!text) continue;
    if (isSpeech(name)) speech.set(name, readSpeech(text, lex));
    else parsed.set(name, parseRecipeText(text));
  }
  // Primary: the first source that holds an ingredient list on its own; spoken narration is read separately.
  let primary: SourceName | null = null;
  for (const name of PRIORITY) {
    const p = parsed.get(name);
    if (p && usable(p)) { primary = name; break; }
  }
  if (!primary) {
    for (const name of PRIORITY) { const p = parsed.get(name); if (p && p.ingredients.length) { primary = name; break; } }
  }
  const ingredients: DraftIngredient[] = [];
  const steps: DraftStep[] = [];
  const used = new Set<SourceName>();
  const keyOf = (name: string): string => { const r = resolveName(name, lex); return r.id ?? fold(name); };
  const index = new Map<string, DraftIngredient>();
  const push = (i: DraftIngredient): void => { ingredients.push(i); index.set(keyOf(i.name), i); };

  const uploader = fold(input.media?.uploader ?? '');
  let title = input.title?.trim() || null;
  // A title that is only the channel name says nothing about the recipe.
  if (title && uploader && fold(title) === uploader) title = null;
  const metadataTitle = input.kind === 'video' ? title : null;
  let servings: number | null = null;
  let prepMin: number | null = null;
  let cookMin: number | null = null;
  let description = input.description?.trim() || null;
  const stepsFrom = (items: Array<{ text: string; timerSec?: number; evidence?: string }>, source: SourceName): void => {
    for (const s of items) steps.push({ text: s.text, ...(s.timerSec ? { timerSec: s.timerSec } : {}), evidence: { source, line: s.evidence ?? s.text } });
  };
  if (primary) {
    const p = parsed.get(primary)!;
    used.add(primary);
    for (const i of p.ingredients) push(toDraftIngredient(i, primary, lex));
    // Steps written as running prose (a channel's description) wait until the spoken ones have had their turn.
    if (p.structure.steps) stepsFrom(p.steps, primary);
    title = metadataTitle || p.title || title;
    servings = p.servings; prepMin = p.prepMin; cookMin = p.cookMin ?? (p.totalMin && !p.prepMin ? p.totalMin : null);
    description = p.description ?? description;
  }
  // Complement from every other source: ingredients not seen yet, quantities missing, servings, steps.
  // Speech and written lists go first; text that is only prose (a video description) comes after and never beats what was said.
  const complement = (name: SourceName, take: { ingredients: boolean; steps: boolean; rest: boolean }): void => {
    const p = parsed.get(name);
    const said = speech.get(name);
    const candidates = said ? said.ingredients : (p?.ingredients ?? []);
    let contributed = false;
    if (take.ingredients) for (const i of candidates) {
      const existing = index.get(keyOf(i.name));
      if (existing) {
        if (existing.quantity == null && i.quantity != null) {
          existing.quantity = i.quantity; existing.unit = i.unit;
          existing.note = [existing.note, i.quantityMax ? i.note : null, `cantidad leída en ${name}: "${i.raw.slice(0, 80)}"`].filter(Boolean).join('; ');
          contributed = true;
        }
      } else if (primary === null || i.quantity !== null || (!said && p && p.ingredients.length >= 3)) {
        push(toDraftIngredient(i, name, lex));
        contributed = true;
      }
    }
    if (take.steps && !steps.length) {
      const fromText = said ? said.steps : (p?.steps ?? []);
      stepsFrom(fromText, name);
      if (fromText.length) contributed = true;
    }
    if (take.rest) {
      if (said) servings ??= said.servings;
      if (p) { servings ??= p.servings; prepMin ??= p.prepMin; cookMin ??= p.cookMin; title ??= p.title; }
    }
    if (contributed) used.add(name);
  };
  for (const name of PRIORITY) {
    if (!sources[name] || name === primary) continue;
    const p = parsed.get(name);
    complement(name, p ? { ingredients: p.structure.ingredients, steps: p.structure.steps, rest: true } : { ingredients: true, steps: true, rest: true });
  }
  for (const name of PRIORITY) {
    if (!sources[name]) continue;
    const p = parsed.get(name);
    if (!p) continue;
    complement(name, { ingredients: name !== primary && !p.structure.ingredients, steps: !p.structure.steps, rest: false });
  }
  const draft: Draft = {
    id: input.id, kind: input.kind, status: 'pending', createdAt: input.now,
    ...(input.url ? { url: input.url } : {}), ...(input.canonicalUrl ? { canonicalUrl: input.canonicalUrl } : {}),
    title: title ?? 'Receta sin título', ...(description ? { description: description.slice(0, 600) } : {}),
    servings, prepMin, cookMin, ingredients, steps, sources,
    ...(input.media ? { media: input.media } : {}),
    confidence: { score: 0, level: 'baja', missing: [], notes: [] }, status_notes: input.notes ?? {},
  };
  draft.status_notes.evidence_sources = [...used].join(',');
  scoreDraft(draft);
  return draft;
}

/** Fill `confidence` from what the draft holds. Unverified model output weighs less. */
export function scoreDraft(draft: Draft): void {
  const ing = draft.ingredients;
  const withQty = ing.filter((i) => i.quantity != null).length;
  const verified = [...ing, ...draft.steps].filter((x) => x.evidence?.verified !== false).length;
  const all = ing.length + draft.steps.length;
  let score = 0;
  if (ing.length >= 3) score += 0.3; else if (ing.length) score += 0.12;
  if (ing.length) score += 0.25 * (withQty / ing.length);
  if (draft.steps.length >= 2) score += 0.25; else if (draft.steps.length) score += 0.1;
  if (draft.servings) score += 0.05;
  if (draft.title && draft.title !== 'Receta sin título') score += 0.05;
  if (all) score += 0.1 * (verified / all);
  const missing: string[] = [];
  if (!ing.length) missing.push('ingredientes');
  else if (withQty < ing.length / 2) missing.push('cantidades');
  if (!draft.steps.length) missing.push('pasos');
  if (!draft.servings) missing.push('raciones');
  const notes: string[] = [];
  // What was only heard in the video is less reliable than a written list: amounts are often missing or misheard.
  const heard = ing.filter((i) => isSpeech(i.evidence?.source));
  if (heard.length || draft.steps.some((x) => isSpeech(x.evidence?.source))) {
    notes.push('Leído de lo que se dice en el vídeo: revisa cantidades, ingredientes y pasos antes de guardar.');
    score *= 0.8;
    if (ing.length && heard.length === ing.length) score = Math.min(score, 0.6);
  }
  const unverified = [...ing, ...draft.steps].filter((x) => x.evidence?.verified === false).length;
  if (unverified) notes.push(`${unverified} línea(s) propuestas por el modelo no se encuentran literalmente en el texto: compruébalas.`);
  const unknown = ing.filter((i) => !i.ingredientId).length;
  if (unknown) notes.push(`${unknown} ingrediente(s) nuevos para tu diccionario: se crearán al guardar.`);
  draft.confidence = { score: Math.round(score * 100) / 100, level: score >= 0.75 ? 'alta' : score >= 0.45 ? 'media' : 'baja', missing, notes };
}

// ───────────────────────────── model structuring ─────────────────────────────

export const RECIPE_JSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: ['string', 'null'] },
    servings: { type: ['integer', 'null'] },
    prep_min: { type: ['integer', 'null'] },
    cook_min: { type: ['integer', 'null'] },
    ingredients: { type: 'array', items: { type: 'object', properties: {
      name: { type: 'string' }, quantity: { type: ['number', 'null'] }, unit: { type: ['string', 'null'] }, optional: { type: 'boolean' },
      evidence: { type: 'string', description: 'The exact words of the text this line was read from.' } }, required: ['name', 'evidence'] } },
    steps: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, evidence: { type: 'string' } }, required: ['text'] } },
  },
  required: ['ingredients', 'steps'],
} as const;

export function llmMessages(draft: Draft): Array<{ role: 'system' | 'user'; content: string }> {
  const parts = Object.entries(draft.sources).map(([name, text]) => `### ${name}\n${text.slice(0, 6000)}`).join('\n\n');
  return [
    { role: 'system', content: 'Eres un asistente que ordena recetas de cocina a partir de texto (descripción de un vídeo, subtítulos, transcripción, texto de una página). Responde SOLO con JSON. Usa únicamente lo que aparece en el texto: no inventes ingredientes, cantidades ni pasos. Si una cantidad no aparece, pon null. En "evidence" copia literalmente las palabras del texto de las que sale cada línea. Escribe en castellano.' },
    { role: 'user', content: `Título: ${draft.title}\nYa se ha leído (puede estar incompleto): ${draft.ingredients.length} ingredientes y ${draft.steps.length} pasos.\nCompleta lo que falte: lista de ingredientes con cantidades y unidades (g, kg, ml, L, ud, cda, cdta, taza…), pasos en orden, raciones y tiempos.\n\n${parts}` },
  ];
}

interface LlmRecipe {
  title?: string | null; servings?: number | null; prep_min?: number | null; cook_min?: number | null;
  ingredients?: Array<{ name?: string; quantity?: number | null; unit?: string | null; optional?: boolean; evidence?: string }>;
  steps?: Array<{ text?: string; evidence?: string }>;
}

function locate(evidence: string | undefined, sources: Sources): { source: string; line: string } | null {
  const needle = fold(evidence ?? '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (needle.length < 4) return null;
  for (const [name, text] of Object.entries(sources)) {
    const hay = fold(text).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ');
    const at = hay.indexOf(needle);
    if (at >= 0) return { source: name, line: (evidence ?? '').slice(0, 200) };
  }
  return null;
}

/** Merge what the model returned: only the gaps are filled, each line says whether its evidence was found in the text. */
export function mergeLlm(draft: Draft, llm: LlmRecipe, lex: Lexicon = {}): Draft {
  const index = new Map<string, DraftIngredient>();
  for (const i of draft.ingredients) index.set(resolveName(i.name, lex).id ?? fold(i.name), i);
  let added = 0;
  let filled = 0;
  for (const raw of llm.ingredients ?? []) {
    const name = String(raw.name ?? '').trim();
    if (!name) continue;
    const found = locate(raw.evidence, draft.sources);
    const key = resolveName(name, lex).id ?? fold(name);
    const quantity = typeof raw.quantity === 'number' && raw.quantity > 0 ? raw.quantity : null;
    const unit = raw.unit ? (canonicalUnit(raw.unit) ?? raw.unit) : null;
    const existing = index.get(key);
    if (existing) {
      // A quantity from the model is accepted only when the evidence it quotes really contains that number.
      if (existing.quantity == null && quantity !== null && found && new RegExp(`(^|[^\\d])${String(quantity).replace('.', '[.,]')}([^\\d]|$)`).test(found.line)) {
        existing.quantity = quantity; existing.unit = unit;
        existing.note = [existing.note, `cantidad propuesta por el modelo: "${found.line.slice(0, 80)}"`].filter(Boolean).join('; ');
        filled++;
      }
      continue;
    }
    const entry: DraftIngredient = { raw: raw.evidence?.slice(0, 200) || name, name, ingredientId: resolveName(name, lex).id, quantity: found ? quantity : null,
      unit: found ? unit : null, optional: !!raw.optional, evidence: found ? { ...found, verified: true } : { source: 'modelo', line: raw.evidence?.slice(0, 200) ?? '', verified: false } };
    draft.ingredients.push(entry);
    index.set(key, entry);
    added++;
  }
  if (!draft.steps.length) {
    for (const s of llm.steps ?? []) {
      const text = String(s.text ?? '').trim();
      if (!text) continue;
      const found = locate(s.evidence, draft.sources);
      const timer = detectTimer(text);
      draft.steps.push({ text, ...(timer ? { timerSec: timer } : {}), evidence: found ? { ...found, verified: true } : { source: 'modelo', line: s.evidence?.slice(0, 200) ?? '', verified: false } });
    }
  }
  draft.servings ??= llm.servings ?? null;
  draft.prepMin ??= llm.prep_min ?? null;
  draft.cookMin ??= llm.cook_min ?? null;
  if (draft.title === 'Receta sin título' && llm.title) draft.title = llm.title;
  draft.status_notes.model = `used (+${added} ingredientes, ${filled} cantidades)`;
  scoreDraft(draft);
  return draft;
}

// ───────────────────────────── accepting ─────────────────────────────

export interface DraftEdits {
  title?: string;
  servings?: number | null;
  description?: string;
  prepMin?: number | null;
  cookMin?: number | null;
  ingredients?: Array<{ name: string; quantity?: number | null; unit?: string | null; optional?: boolean; note?: string }>;
  steps?: Array<string | { text: string; timerSec?: number }>;
}

/** Turn a reviewed draft into a recipe. New ingredient names become user ingredients (returned so the caller can store them). */
export function draftToRecipe(draft: Draft, edits: DraftEdits, id: string, now: string, lex: Lexicon): { recipe: Recipe; newIngredients: UserIngredient[] } {
  const newIngredients: UserIngredient[] = [];
  const working: Lexicon = { userIngredients: [...(lex.userIngredients ?? [])], learnedAliases: lex.learnedAliases };
  const lines = edits.ingredients ?? draft.ingredients.map((i) => ({ name: i.name, quantity: i.quantity ?? null, unit: i.unit ?? null, optional: i.optional, note: i.note }));
  const ingredients = lines.map((line) => {
    const resolved = resolveOrCreate(line.name, working, { create: true, now });
    if (resolved.created) { newIngredients.push(resolved.created); working.userIngredients!.push(resolved.created); }
    return { ingredientId: resolved.id!, ...(line.quantity != null && line.quantity > 0 ? { quantity: line.quantity } : {}),
      ...(line.quantity != null && line.quantity > 0 && line.unit ? { unit: canonicalUnit(line.unit) ?? line.unit } : {}),
      ...(line.optional ? { optional: true } : {}), note: line.note ? `${line.name} (${line.note})` : line.name };
  });
  const stepSource = edits.steps ?? draft.steps.map((s) => ({ text: s.text, ...(s.timerSec ? { timerSec: s.timerSec } : {}) }));
  const steps = stepSource.map((s) => {
    const text = typeof s === 'string' ? s : s.text;
    const timerSec = typeof s === 'string' ? detectTimer(text) : (s.timerSec ?? detectTimer(text));
    const temperature = text.match(/\b(\d{2,3})\s*(?:º|°|grados)/i);
    return { text, ...(timerSec ? { timerSec } : {}), ...(temperature && Number(temperature[1]) >= 40 && Number(temperature[1]) <= 320 ? { temperatureC: Number(temperature[1]) } : {}) };
  });
  const title = (edits.title ?? draft.title).trim() || 'Receta importada';
  const tags = inferTags([title, ...ingredients.map((i) => i.note)].join(' '));
  const recipe: Recipe = {
    id, authorId: 'local', title, ...(edits.description ?? draft.description ? { description: edits.description ?? draft.description } : {}),
    ingredients, steps, createdAt: now, makeCount: 0,
    temperature: tags.temperature, heaviness: tags.heaviness, seasonAffinity: tags.seasonAffinity,
    ...((edits.servings ?? draft.servings) ? { servings: (edits.servings ?? draft.servings)! } : {}),
    ...((edits.prepMin ?? draft.prepMin) ? { prepMin: (edits.prepMin ?? draft.prepMin)! } : {}),
    ...((edits.cookMin ?? draft.cookMin) ? { cookMin: (edits.cookMin ?? draft.cookMin)! } : {}),
  };
  return { recipe, newIngredients };
}
