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

test('a word followed by "de <ingredient>" is a preparation, not an ingredient', () => {
  assert.deepEqual(summary('hacemos un batido de dos huevos'), [['egg', 2, null, null]]);
  assert.deepEqual(summary('echamos el batido de 4 huevos con 3 patatas'), [['egg', 4, null, null], ['potato', 3, null, null]]);
  assert.deepEqual(summary('añadimos el rallado de un limón y dos huevos').map((r) => r[0]), ['lemon', 'egg']);
  assert.deepEqual(spokenIngredients('servimos dos helados de vainilla').map((i) => i.name), ['helados de vainilla'], 'a real food stays');
  assert.deepEqual(spokenIngredients('añadimos el batido').map((i) => i.name), ['batido'], 'alone it stays: nothing says it is made of something else');
});

test('"45 huevos" in auto-subtitles is "4 ó 5 huevos"', () => {
  const [eggs] = spokenIngredients('batimos 45 huevos en un bol');
  assert.deepEqual([eggs!.quantity, eggs!.quantityMax], [4, 5]);
  assert.equal(eggs!.note, 'entre 4 y 5 (subtítulos: «45»)');
  assert.deepEqual(summary('añadimos 34 huevos').map((r) => [r[1], r[2]]), [[3, 4]]);
  assert.deepEqual(summary('añadimos 23 cebollas').map((r) => [r[1], r[2]]), [[2, 3]]);
  assert.deepEqual(summary('añadimos 12 huevos').map((r) => [r[1], r[2]]), [[12, null]], 'a dozen is plausible');
  assert.deepEqual(summary('añadimos 48 huevos').map((r) => [r[1], r[2]]), [[null, null]], 'not consecutive: dropped, not guessed');
  assert.deepEqual(summary('añadimos 45 gramos de harina').map((r) => [r[1], r[3]]), [[45, 'g']], 'with a unit it is a plain number');
  const d = buildDraft({ kind: 'video', id: 'r1', now: NOW, title: 'Tortilla', sources: { subtitles: 'batimos 45 huevos y una pizca de sal' } });
  assert.match(d.ingredients.find((i) => i.ingredientId === 'egg')!.note!, /entre 4 y 5 \(subtítulos: «45»\)/);
});

test('description prose never beats speech; a description with list structure still does', () => {
  const prose = 'En este vídeo vamos a aprender cómo hacer una auténtica tortilla de patatas con cebolla.\nEsta receta es muy fácil de hacer, aunque difícil de perfeccionar. Añade sal al gusto y fríe las patatas.\nSuscríbete para más recetas.';
  const speech = subtitleText(F.vttOf(F.TORTILLA_CUES));
  const d = buildDraft({ kind: 'video', id: 'p1', now: NOW, title: 'Tortilla de patatas - Receta', sources: { caption: `Tortilla de patatas\n${prose}`, subtitles: speech }, media: { platform: 'youtube' } });
  assert.ok(d.steps.length >= 3 && d.steps.every((s) => s.evidence!.source === 'subtitles'), 'steps are the spoken ones');
  assert.ok(!d.steps.some((s) => /En este vídeo|muy fácil/.test(s.text)));
  assert.ok(d.ingredients.every((i) => i.evidence!.source === 'subtitles'));
  assert.equal(d.title, 'Tortilla de patatas - Receta');
  // Prose alone, with nothing said, is still better than nothing.
  const only = buildDraft({ kind: 'video', id: 'p2', now: NOW, title: 'Tortilla', sources: { caption: prose } });
  assert.ok(only.steps.length >= 1);
  // A real list in the description wins over the speech.
  const list = 'Tortilla de patatas\nIngredientes:\n- 3 patatas\n- 1 cebolla\n- 4 huevos\nElaboración:\n1. Fríe las patatas con la cebolla.\n2. Cuaja los huevos batidos.';
  const w = buildDraft({ kind: 'video', id: 'p3', now: NOW, title: 'Tortilla', sources: { caption: list, subtitles: speech } });
  assert.deepEqual(w.steps.map((s) => s.evidence!.source), ['caption', 'caption']);
  const numbered = buildDraft({ kind: 'video', id: 'p4', now: NOW, title: 'Tortilla', sources: { caption: 'Tortilla rápida\n1. Pela y corta las patatas.\n2. Fríelas con la cebolla.\n3. Añade los huevos batidos.', subtitles: speech } });
  assert.equal(numbered.steps[0]!.evidence!.source, 'caption', 'numbered lines count as list structure');
});
