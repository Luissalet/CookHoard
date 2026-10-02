// Speech (subtitles, transcripts) is prose: it is read for dictionary ingredients and actions, never line by line as a list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { subtitleText, readSpeech, spokenIngredients, spokenSteps, buildDraft, resolveName, hasUsableIngredientList, makeUserIngredient } from '../src/index.ts';
import * as F from './fixtures.ts';

const NOW = '2026-10-02';
const idOf = (name: string): string | null => resolveName(name).id;
const summary = (text: string, lex = {}) => spokenIngredients(text, lex).map((i) => [resolveName(i.name, lex).id, i.quantity, i.quantityMax ?? null, i.unit]);

test('subtitles become continuous speech: a line break only where the speaker stopped', () => {
  const vtt = F.vttOf(['hoy vamos a freír', 'las patatas', 'ya está.', 'luego batimos los huevos', 'con sal'], { 4: 2 });
  assert.equal(subtitleText(vtt), 'hoy vamos a freír las patatas ya está.\nluego batimos los huevos\ncon sal');
  assert.equal(subtitleText(F.vttOf(F.TORTILLA_CUES)).includes('\n'), false, 'no pauses and no full stops: one run of speech');
  assert.equal(subtitleText(F.vttOf(F.TORTILLA_CUES, { 14: 2, 18: 2 })).split('\n').length, 3);
});

test('a talked recipe gives its ingredients and a handful of steps, not one ingredient per caption line', () => {
  const text = subtitleText(F.vttOf(F.TORTILLA_CUES, { 3: 2, 14: 2, 18: 2 }));
  const read = readSpeech(text);
  assert.equal(read.announced, true);
  assert.deepEqual(read.ingredients.map((i) => [idOf(i.name), i.quantity, i.quantityMax ?? null, i.unit]), [
    ['potato', 3, null, null], ['onion', 1, null, null], ['egg', 4, 5, null], ['olive_oil', null, null, null], ['salt', 1, null, 'pizca'],
  ]);
  for (const i of read.ingredients) assert.ok(text.includes(i.raw), `evidence is a literal part of the speech: ${i.raw}`);
  assert.ok(read.ingredients[0]!.raw.includes('3 patatas'));
  assert.ok(read.steps.length >= 3 && read.steps.length <= 8, `steps: ${read.steps.length}`);
  assert.ok(!read.steps.some((s) => /ingredientes que necesitaremos/i.test(s.text)), 'the announcement is not a step');
  assert.match(read.steps[0]!.text, /^Comenzamos con las patatas/);
  assert.equal(read.steps.find((s) => /primera vuelta/.test(s.text))!.timerSec, 300);
  for (const s of read.steps) assert.ok(/[.!?]$/.test(s.text) && s.text[0] === s.text[0]!.toUpperCase());
});

test('amounts: digits, number words, ranges, halves, units, pinches and what is not an amount', () => {
  assert.deepEqual(summary('echamos dos huevos y medio kilo de harina'), [['egg', 2, null, null], ['harina', 0.5, null, 'kg']]);
  assert.deepEqual(summary('ponemos dos o tres dientes de ajo'), [['garlic', 2, 3, 'diente']]);
  assert.deepEqual(summary('añadimos un kilo y medio de patatas'), [['potato', 1.5, null, 'kg']]);
  assert.deepEqual(summary('un cuarto de kilo de tomates y 250 ml de aceite de oliva'), [['tomato', 0.25, null, 'kg'], ['olive_oil', 250, null, 'ml']]);
  assert.deepEqual(summary('freímos 15 minutos y añadimos patatas'), [['potato', null, null, null]], 'a duration is not a quantity');
  assert.deepEqual(summary('añadimos cuarenta y cinco huevos'), [['egg', null, null, null]], 'an absurd count is dropped, the ingredient stays');
  assert.deepEqual(summary('una pizca de sal y echamos un poco de aceite'), [['salt', 1, null, 'pizca'], ['olive_oil', null, null, null]]);
  assert.equal(spokenIngredients('echamos un poco de aceite')[0]!.note, 'un poco');
  assert.deepEqual(summary('first we need two eggs and a cup of flour'), [['egg', 2, null, null], ['harina', 1, null, 'taza']]);
});

test('words that are not in the dictionary never become ingredients; the user\'s own and learned ones do', () => {
  const text = 'necesitamos zumbaflor, 200 gramos de grumbleberry y tres huevos. Mezclamos todo y servimos.';
  assert.deepEqual(summary(text), [['egg', 3, null, null]]);
  const own = makeUserIngredient({ name: 'Zumbaflor' });
  assert.deepEqual(summary(text, { userIngredients: [own] }), [[own.id, null, null, null], ['egg', 3, null, null]]);
  assert.deepEqual(summary('echamos 200 gramos de grumbleberry', { learnedAliases: { grumbleberry: 'harina' } }), [['harina', 200, null, 'g']]);
});

test('ingredients said outside the announcement need an amount or a second mention', () => {
  const text = 'los ingredientes son tres huevos y sal. Batimos los huevos. Servimos con perejil y con un poco de limón.';
  const read = readSpeech(text);
  assert.equal(read.announced, true);
  assert.deepEqual(read.ingredients.map((i) => idOf(i.name)), ['egg', 'salt']);
});

test('steps: markers start a new step and the timer is read from spoken numbers', () => {
  const steps = spokenSteps('Pelamos las patatas. Las cortamos en láminas. Una vez fritas las escurrimos, luego batimos los huevos y después cuajamos la tortilla unos cinco minutos por cada lado.');
  assert.equal(steps.length, 3);
  assert.match(steps[1]!.text, /^Una vez fritas/);
  assert.match(steps[2]!.text, /^Después cuajamos/i);
  assert.equal(steps[2]!.timerSec, 300);
});

test('a draft from subtitles: the title is the video title, never a line of the speech, and the confidence says it was heard', () => {
  const text = subtitleText(F.vttOf(F.TORTILLA_CUES, { 3: 2, 14: 2, 18: 2 }));
  const d = buildDraft({ kind: 'video', id: 'd1', now: NOW, title: 'Tortilla de patatas - Receta de cocina española', sources: { subtitles: text }, media: { platform: 'youtube', uploader: 'Canal de ejemplo' } });
  assert.equal(d.title, 'Tortilla de patatas - Receta de cocina española');
  assert.equal(d.ingredients.length, 5);
  assert.ok(d.ingredients.every((i) => i.ingredientId && i.evidence?.source === 'subtitles'), 'nothing new for the dictionary');
  assert.ok(d.steps.length >= 3 && d.steps.length <= 8);
  assert.notEqual(d.confidence.level, 'alta');
  assert.ok(d.confidence.score <= 0.6);
  assert.ok(d.confidence.notes.some((n) => /leído de lo que se dice en el vídeo: revisa cantidades/i.test(n)));
  assert.ok(d.confidence.missing.includes('raciones'));

  const untitled = buildDraft({ kind: 'video', id: 'd2', now: NOW, sources: { subtitles: text }, media: { platform: 'youtube' } });
  assert.equal(untitled.title, 'Receta sin título', 'the first line of speech is not a title');
  const channel = buildDraft({ kind: 'video', id: 'd3', now: NOW, title: 'Canal de ejemplo', sources: { subtitles: text }, media: { platform: 'youtube', uploader: 'canal de ejemplo' } });
  assert.equal(channel.title, 'Receta sin título', 'a title that is only the channel name says nothing');
});

test('a written list stays the main source; speech only completes it', () => {
  const caption = 'Tortilla de patatas\nIngredientes:\n- 3 patatas\n- 1 cebolla\n- Huevos\nPreparación:\n1. Fríe las patatas.\n2. Cuaja la tortilla.';
  const speech = 'echamos cuatro huevos y una pizca de sal y un poco de pimentón';
  const d = buildDraft({ kind: 'video', id: 'd4', now: NOW, title: 'Tortilla', sources: { caption, subtitles: speech }, media: { platform: 'instagram' } });
  assert.equal(d.ingredients.length, 4, 'patatas, cebolla, huevos, and the salt that was said with an amount');
  const eggs = d.ingredients.find((i) => i.ingredientId === 'egg')!;
  assert.equal(eggs.quantity, 4);
  assert.equal(eggs.evidence!.source, 'caption');
  assert.equal(d.steps.length, 2);
  assert.equal(d.ingredients.find((i) => i.ingredientId === 'salt')!.evidence!.source, 'subtitles');
  assert.ok(d.confidence.score > 0.6, 'the written list carries the draft, so the confidence is not capped');
});

test('speech is not a list: prose is never counted as one', () => {
  const text = subtitleText(F.vttOf(F.TORTILLA_CUES));
  assert.equal(hasUsableIngredientList('Qué rica estaba esta tarta'), false);
  // The list reader would see many "lines"; the speech reader sees five ingredients.
  assert.equal(readSpeech(text).ingredients.length, 5);
});
