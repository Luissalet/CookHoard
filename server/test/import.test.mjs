import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { callTool } from '../tools/index.mjs';
import { readKitchen } from '../store.mjs';
import { scratch, fakeHub, fixedClock, FAKE_YTDLP } from './helpers.mjs';
import { resetDetection } from '../media.mjs';
import { RECIPE_BULLETS, RECIPE_CAPTION, RECIPE_NUMBERED_NO_HEADERS, TORTILLA_CUES, vttOf } from '../../packages/core/test/fixtures.ts';

const INFO = (extra = {}) => JSON.stringify({ id: 'abc123', title: 'Tortitas rápidas', description: RECIPE_CAPTION, uploader: 'cocina_ejemplo', duration: 42,
  webpage_url: 'https://www.instagram.com/reel/abc123/', extractor_key: 'Instagram', subtitles: {}, automatic_captions: {}, ...extra });
const VTT = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hoy vamos a hacer una masa de tortitas

00:00:04.000 --> 00:00:08.000
necesitas 200 gramos de harina, dos huevos y 300 mililitros de leche

00:00:08.000 --> 00:00:12.000
mezcla todo en un bol y cocina dos minutos por cada lado
`;

function setup(t, { info = INFO(), subs, video, fail, hub } = {}) {
  const s = scratch();
  fixedClock();
  const files = {};
  files.info = path.join(s.dir, 'info.json'); fs.writeFileSync(files.info, info);
  process.env.FAKE_YTDLP_INFO = files.info;
  files.log = path.join(s.dir, 'ytdlp.log'); process.env.FAKE_YTDLP_LOG = files.log;
  if (subs) { files.subs = path.join(s.dir, 'subs.vtt'); fs.writeFileSync(files.subs, subs); process.env.FAKE_YTDLP_SUBS = files.subs; }
  if (video) process.env.FAKE_YTDLP_VIDEO = video;
  if (fail) process.env.FAKE_YTDLP_FAIL = fail;
  const h = fakeHub(hub ?? {});
  t.after(() => { for (const k of ['FAKE_YTDLP_INFO', 'FAKE_YTDLP_LOG', 'FAKE_YTDLP_SUBS', 'FAKE_YTDLP_VIDEO', 'FAKE_YTDLP_FAIL']) delete process.env[k]; s.done(); });
  return { s, h, files };
}
const useYtdlp = () => callTool('settings_set', { settings: { media: { ytdlp: FAKE_YTDLP } } });

test('a reel whose caption holds the recipe becomes a draft with evidence, thumbnail and credit', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'image/png'); res.end(png); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const { s } = setup(t, { info: INFO({ thumbnail: `http://127.0.0.1:${server.address().port}/thumb.png` }) });
  await useYtdlp();
  const result = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(result.status, 'draft');
  const draft = result.draft;
  assert.equal(draft.kind, 'video');
  assert.equal(draft.media.platform, 'instagram');
  assert.equal(draft.media.uploader, 'cocina_ejemplo');
  assert.match(draft.media.thumbnail, /^media\/draft-[a-z0-9]+\.png$/);
  assert.ok(fs.existsSync(path.join(s.dir, draft.media.thumbnail)));
  const flour = draft.ingredients.find((i) => i.name.toLowerCase().includes('harina'));
  assert.equal(flour.quantity, 200);
  assert.equal(flour.unit, 'g');
  assert.equal(flour.evidence.source, 'caption');
  assert.match(flour.evidence.line, /200 g de harina/);
  assert.ok(draft.steps.length >= 1);
  assert.equal(draft.status_notes.transcript, 'no hizo falta');
  assert.equal(readKitchen().drafts.length, 1, 'the draft is stored, no recipe yet');
  assert.equal(readKitchen().recipes.length, 0);
  // repeating the same link returns the pending draft instead of a second one
  const again = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(again.already_pending, true);
  assert.equal(readKitchen().drafts.length, 1);
});

test('accepting a draft saves the recipe with its source, adds new ingredients and emits the event', async (t) => {
  const { h } = setup(t);
  await useYtdlp();
  const { draft } = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  const accepted = await callTool('recipe_draft_accept', { draft_id: draft.id, edits: { title: 'Tortitas de la casa', servings: 3 } });
  assert.equal(accepted.recipe.title, 'Tortitas de la casa');
  assert.equal(accepted.recipe.servings, 3);
  assert.equal(accepted.recipe.source.kind, 'video');
  assert.equal(accepted.recipe.source.platform, 'instagram');
  assert.equal(accepted.recipe.source.uploader, 'cocina_ejemplo');
  assert.equal(accepted.drafts_left, 0);
  assert.deepEqual(h.log.events.find((e) => e.type === 'cookhoard.recipe.imported').data, { recipe_id: accepted.recipe.id, title: 'Tortitas de la casa', source: 'video' });
  const found = await callTool('find_recipes', { query: 'tortitas', source: 'video' });
  assert.equal(found.recipes[0].id, accepted.recipe.id);
  const again = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(again.status, 'already_imported');
  await assert.rejects(callTool('recipe_draft_accept', { draft_id: draft.id }), /Borrador no encontrado/);
});

test('without a written list the subtitles are used, and the audio goes to Funes only when nothing else is there', async (t) => {
  const { files } = setup(t, { info: INFO({ description: 'Ya sabes: sígueme para más recetas 🙌', subtitles: { es: [{}] } }), subs: VTT });
  await useYtdlp();
  const withSubs = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(withSubs.status, 'draft');
  assert.match(withSubs.draft.status_notes.subtitles, /^ok/);
  assert.equal(withSubs.draft.status_notes.transcript, 'no hizo falta');
  assert.ok(withSubs.draft.sources.subtitles.includes('200 gramos de harina'));
  const eggs = withSubs.draft.ingredients.find((i) => /huevo/i.test(i.name));
  assert.equal(eggs.quantity, 2);
  assert.equal(eggs.evidence.source, 'subtitles');
  assert.ok(!fs.readFileSync(files.log, 'utf8').includes('bestaudio'), 'the audio was not downloaded');
});

test('subtitles are read as speech: the video title wins, cues never become ingredients and unknown words never reach the dictionary', async (t) => {
  const title = 'Tortilla de patatas - Receta de cocina española';
  setup(t, { info: INFO({ title, description: 'Suscríbete y dale a me gusta', subtitles: { es: [{}] } }), subs: vttOf(TORTILLA_CUES, { 5: 1.6, 12: 1.4 }) });
  await useYtdlp();
  const { draft } = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(draft.title, title);
  assert.ok(draft.ingredients.length >= 4 && draft.ingredients.length <= 8, `a handful of ingredients, not one per cue (${draft.ingredients.length})`);
  const by = (re) => draft.ingredients.find((i) => re.test(i.name));
  assert.equal(by(/patata/i).quantity, 3);
  assert.equal(by(/cebolla/i).quantity, 1);
  const eggs = by(/huevo/i);
  assert.equal(eggs.quantity, 4);
  assert.match(eggs.note, /entre 4 y 5/, 'the range is kept');
  assert.equal(eggs.evidence.source, 'subtitles');
  assert.ok(draft.steps.some((st) => st.timerSec === 300), 'a spoken "unos cinco minutos" becomes a timer');
  assert.ok(draft.confidence.score <= 0.6);
  assert.ok(draft.confidence.notes.some((n) => /lo que se dice en el vídeo: revisa cantidades/i.test(n)));
  assert.equal(draft.status_notes.transcript, 'no hizo falta');
  assert.ok(draft.ingredients.every((i) => i.ingredientId), 'nothing new is proposed for the dictionary from speech');
});

test('the spoken audio is transcribed by Funes and structured by the local model with verified evidence', async (t) => {
  const transcript = 'Hola, hoy os traigo unas natillas. Necesitas un litro de leche, cuatro yemas y cien gramos de azúcar. Calienta la leche, mezcla las yemas con el azúcar y cuece cinco minutos removiendo.';
  let funesArgs;
  const { h } = setup(t, { info: INFO({ description: 'Natillas 😋' }), hub: {
    calls: { 'funes.scribe_import_file': (args) => { funesArgs = args; return { session: { id: 's_1' }, status: 'ready', transcript_text: transcript }; } },
    chat: () => ({ ok: true, text: '', model: 'test', json: { title: 'Natillas caseras', servings: 4, ingredients: [
      { name: 'leche', quantity: 1, unit: 'L', evidence: 'un litro de leche' },
      { name: 'yemas', quantity: 4, unit: 'ud', evidence: 'cuatro yemas' },
      { name: 'azúcar', quantity: 100, unit: 'g', evidence: 'cien gramos de azúcar' },
      { name: 'canela', quantity: 2, unit: 'g', evidence: 'una pizca de canela' }],
    steps: [{ text: 'Calienta la leche, mezcla las yemas con el azúcar y cuece cinco minutos removiendo.', evidence: 'Calienta la leche, mezcla las yemas con el azúcar y cuece cinco minutos removiendo.' }] } }) } });
  await useYtdlp();
  const result = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(result.status, 'draft');
  assert.equal(funesArgs.kind, 'other');
  assert.equal(funesArgs.language, 'auto');
  assert.equal(funesArgs.wait_s, 600);
  assert.ok(path.isAbsolute(funesArgs.path));
  assert.match(result.draft.status_notes.transcript, /^ok/);
  assert.equal(result.draft.sources.transcript, transcript);
  assert.equal(h.log.chats.length, 1, 'the model is asked once');
  assert.equal(h.log.chats[0].json.type, 'object', 'a JSON schema is sent');
  const cinnamon = result.draft.ingredients.find((i) => /canela/i.test(i.name));
  assert.equal(cinnamon.evidence.verified, false, 'invented evidence is flagged');
  assert.equal(cinnamon.quantity, null, 'a quantity without evidence is dropped');
  const milk = result.draft.ingredients.find((i) => /leche/i.test(i.name));
  assert.equal(milk.evidence.verified, true);
  assert.match(result.draft.status_notes.model, /^used/);
  assert.ok(result.draft.confidence.notes.some((n) => /modelo/.test(n)));
});

test('with Funes or the model missing the draft says so instead of inventing', async (t) => {
  setup(t, { info: INFO({ description: 'Natillas 😋' }), hub: { calls: { 'funes.scribe_import_file': () => ({ __error: 'down', status: 503 }) } } });
  await useYtdlp();
  const result = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.equal(result.status, 'draft');
  assert.match(result.draft.status_notes.transcript, /Funes no ha podido responder|no ha podido/);
  assert.match(result.draft.status_notes.model, /^no_model/);
  assert.equal(result.draft.ingredients.length, 0);
  assert.ok(result.draft.confidence.missing.includes('ingredientes'));
});

test('a login wall is explained and points to the cookies setting; cookies options reach yt-dlp', async (t) => {
  const { files } = setup(t, { fail: 'login' });
  await useYtdlp();
  const failed = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/zzz/' });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.code, 'needs_login');
  assert.equal(failed.hint, 'settings.media.cookies_from_browser');
  assert.match(failed.why, /cookies/);
  delete process.env.FAKE_YTDLP_FAIL;
  await callTool('settings_set', { settings: { media: { cookies_from_browser: 'edge' } } });
  await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  const log = fs.readFileSync(files.log, 'utf8');
  assert.match(log, /"--cookies-from-browser","edge"/);
  await callTool('settings_set', { settings: { media: { cookies_from_browser: 'none', cookies_file: '/tmp/cookies.txt' } } });
  await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/', force: true });
  assert.match(fs.readFileSync(files.log, 'utf8'), /"--cookies","\/tmp\/cookies.txt"/);
});

test('without yt-dlp the answer says what to install, and pasted caption text still works', async (t) => {
  const { s } = setup(t, { hub: { web: () => ({ ok: false, status: 404, error: 'HTTP 404', error_kind: 'http' }) } });   // no Links, no program, and the page says nothing
  const oldPath = process.env.PATH;
  process.env.PATH = '';
  process.env.HOARD_HOME = s.dir;
  delete process.env.COOKHOARD_ALLOW_PRIVATE_URLS;
  t.after(() => { process.env.PATH = oldPath; delete process.env.HOARD_HOME; });
  resetDetection();
  const missing = await callTool('import_recipe_video', { url: 'https://vm.tiktok.com/ZZ123/', caption: '' });
  assert.equal(missing.status, 'needs_ytdlp');
  assert.match(missing.why, /yt-dlp/);
  const manual = await callTool('import_recipe_video', { url: 'https://vm.tiktok.com/ZZ123/', caption: RECIPE_CAPTION });
  assert.equal(manual.status, 'draft');
  assert.equal(manual.draft.status_notes.ytdlp, 'missing');
  assert.ok(manual.draft.ingredients.length >= 4);
});

test('key frames are read by the vision model when nothing else holds a list; no vision model is reported', async (t) => {
  const ffmpeg = spawnSync('ffmpeg', ['-version']);
  if (ffmpeg.status !== 0) return t.skip('ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-vid-'));
  const video = path.join(dir, 'v.mp4');
  const made = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x240:rate=5', '-pix_fmt', 'yuv420p', video]);
  assert.equal(made.status, 0);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const info = INFO({ description: '🔥', duration: 6 });
  const first = setup(t, { info, video, hub: { calls: { 'funes.scribe_import_file': () => ({ status: 'no_speech' }) } } });
  await useYtdlp();
  const noVision = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  assert.match(noVision.draft.status_notes.frames, /sin modelo de visión/);
  assert.equal(noVision.draft.status_notes.transcript, 'Funes no ha detectado voz en el vídeo.');
  first.s.done();
  const second = setup(t, { info, video, hub: { calls: { 'funes.scribe_import_file': () => ({ status: 'no_speech' }) }, vision: true,
    chat: (options) => (options.capability === 'vision' ? { ok: true, text: 'Ingredientes:\n300 g de arroz\n1 cebolla\n2 tomates', json: null } : null) } });
  await useYtdlp();
  const seen = await callTool('import_recipe_video', { url: 'https://www.instagram.com/reel/abc123/' });
  const visionCall = second.h.log.chats.find((c) => c.capability === 'vision');
  assert.ok(visionCall.images.length >= 1 && visionCall.images.every((img) => typeof img === 'string' && img.length > 100), 'frames are sent as base64');
  assert.match(seen.draft.status_notes.frames, /^ok/);
  assert.ok(seen.draft.sources.frames.includes('300 g de arroz'));
  assert.equal(seen.draft.ingredients.find((i) => /arroz/i.test(i.name)).evidence.source, 'frames');
});

test('pasted text becomes a draft (Spanish and English), and weak text is refused', async (t) => {
  setup(t);
  const draft = (await callTool('import_recipe_text', { text: RECIPE_BULLETS })).draft;
  assert.equal(draft.title, 'Tortilla de patatas');
  assert.equal(draft.servings, 4);
  assert.equal(draft.ingredients.find((i) => /huevo/.test(i.name)).quantity, 5);
  assert.ok(draft.steps.some((s) => s.timerSec));
  assert.equal(draft.status_notes.model.startsWith('no_model') || draft.status_notes.model === 'not_needed', true);
  const noHeaders = (await callTool('import_recipe_text', { text: RECIPE_NUMBERED_NO_HEADERS, use_model: false })).draft;
  assert.equal(noHeaders.ingredients.length, 4);
  assert.equal(noHeaders.status_notes.model, 'skipped');
  await assert.rejects(callTool('import_recipe_text', { text: 'Hola qué tal, ¿quedamos mañana para comer?', use_model: false }), /No he reconocido/);
  const listed = await callTool('recipe_drafts_list', {});
  assert.equal(listed.drafts.length, 2);
  const one = await callTool('recipe_draft_get', { draft_id: listed.drafts[0].id });
  assert.ok(one.draft.sources.text);
  const accepted = await callTool('recipe_draft_accept', { draft_id: draft.id });
  assert.ok((await callTool('get_recipe', { recipe_id: accepted.recipe.id })).cost, 'cost is part of get_recipe');
});

test('a page without structured data becomes a draft; an invalid page keeps the old error', async (t) => {
  setup(t);
  const page = `<html><body><h1>Crema de calabacín</h1><ul><li>2 calabacines</li><li>1 cebolla</li><li>1 patata</li><li>750 ml de caldo</li></ul><p>Preparación</p><ol><li>Pica la cebolla y sofríela 5 minutos.</li><li>Cubre con el caldo y cuece 25 minutos.</li></ol></body></html>`;
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'text/html'); res.end(req.url === '/receta' ? page : '<html><body>nada</body></html>'); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const result = await callTool('import_recipe_url', { url: `${base}/receta` });
  assert.equal(result.status, 'draft');
  assert.equal(result.draft.kind, 'web');
  assert.ok(result.draft.ingredients.length >= 4);
  await assert.rejects(callTool('import_recipe_url', { url: `${base}/otra` }), /No se encontró una receta/);
  const discarded = await callTool('recipe_draft_discard', { draft_id: result.draft.id });
  assert.equal(discarded.drafts_left, 0);
});
