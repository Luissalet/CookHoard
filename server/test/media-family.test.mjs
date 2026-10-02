// Video links through the family: Links reads them (media_info, media_subtitles, media_audio_for_asr, media_download), Funes transcribes
// (transcribe_file), and this machine's yt-dlp is the fallback and the choice of anyone who configured one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { callTool } from '../tools/index.mjs';
import { scratch, fakeHub, fixedClock, FAKE_YTDLP } from './helpers.mjs';
import { resetDetection, explainYtdlp, routesFor, detectTools } from '../media.mjs';
import { RECIPE_CAPTION } from '../../packages/core/test/fixtures.ts';

const URL = 'https://www.instagram.com/reel/abc123/';
const INFO = (extra = {}) => ({ ok: true, url: URL, platform: 'Instagram', title: 'Tortitas rápidas', description: RECIPE_CAPTION, uploader: 'cocina_ejemplo', duration: 42, thumbnail: '',
  subtitle_langs: [], id: 'abc123', extractor: 'Instagram', ...extra });
const VTT = `WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nHoy vamos a hacer una masa de tortitas\n\n00:00:04.000 --> 00:00:08.000\nnecesitas 200 gramos de harina, dos huevos y 300 mililitros de leche\n\n00:00:08.000 --> 00:00:12.000\nmezcla todo en un bol y cocina dos minutos por cada lado\n`;
const SOCIAL = 'Ya sabes: sígueme para más recetas 🙌';

function setup(t, hub = {}) {
  const s = scratch(); fixedClock();
  const h = fakeHub(hub);
  process.env.HOARD_HOME = s.dir;                       // no program of the machine leaks into the test
  t.after(() => { delete process.env.HOARD_HOME; s.done(); });
  return { s, h };
}
const tools = (h) => h.log.calls.map((c) => `${c.app}.${c.tool}`);

test('Links reads the link: metadata and subtitles come through the hub and no program of this machine runs', async (t) => {
  const { h } = setup(t, { calls: {
    'links.media_info': () => INFO({ description: SOCIAL, subtitle_langs: ['es'] }),
    'links.media_subtitles': () => ({ ok: true, text: 'Hoy vamos a hacer una masa de tortitas\nnecesitas 200 gramos de harina, dos huevos y 300 mililitros de leche\nmezcla todo en un bol y cocina dos minutos por cada lado', lang: 'es', source: 'manual', cues: [] }) } });
  const result = await callTool('import_recipe_video', { url: URL });
  assert.equal(result.status, 'draft');
  assert.equal(result.tools.links, true);
  assert.equal(result.draft.media.uploader, 'cocina_ejemplo');
  assert.equal(result.draft.media.duration, 42);
  assert.match(result.draft.status_notes.subtitles, /^ok \(es manual\)/);
  assert.equal(result.draft.status_notes.transcript, 'no hizo falta');
  assert.equal(result.draft.ingredients.find((i) => /harina/i.test(i.name)).quantity, 200);
  assert.deepEqual(tools(h), ['links.media_info', 'links.media_subtitles']);
  assert.deepEqual(h.log.calls[1].args, { url: URL, langs: ['es', 'en'] });
});

test('with no subtitles Links makes the audio, Funes transcribes it and the transcript becomes evidence', async (t) => {
  const transcript = 'Hola, hoy os traigo unas natillas. Necesitas un litro de leche, cuatro yemas y cien gramos de azúcar. Calienta la leche y cuece cinco minutos.';
  let funes;
  const { h } = setup(t, { calls: {
    'links.media_info': () => INFO({ description: 'Natillas 😋' }),
    'links.media_subtitles': () => ({ __error: 'no subtitles in es, en (available: none)', status: 404 }),
    'links.media_audio_for_asr': (args) => ({ id: 'm1', ok: true, status: 'done', url: args.url, files: [{ path: '/tmp/links/asr/natillas.wav', name: 'natillas.wav', size: 100 }] }),
    'funes.transcribe_file': (args) => { funes = args; return { job_id: 'j1', status: 'done', text: transcript, segments: [{ start: 0, end: 5, text: transcript }], model: 'small', language: 'es' }; } } });
  const result = await callTool('import_recipe_video', { url: URL });
  assert.equal(result.status, 'draft');
  assert.equal(result.draft.status_notes.subtitles, 'sin subtítulos');
  assert.equal(result.draft.status_notes.transcript, 'ok (small)');
  assert.equal(result.draft.sources.transcript, transcript);
  assert.deepEqual(funes, { path: path.resolve('/tmp/links/asr/natillas.wav'), language: 'auto', word_timestamps: true, vad: true, wait_s: 150 });
  assert.deepEqual(tools(h), ['links.media_info', 'links.media_subtitles', 'links.media_audio_for_asr', 'funes.transcribe_file']);
});

test('a Funes without transcribe_file is still used through scribe_import_file; other Funes failures are explained', async (t) => {
  const calls = { 'links.media_info': () => INFO({ description: 'Natillas 😋' }), 'links.media_subtitles': () => ({ __error: 'no subtitles', status: 404 }),
    'links.media_audio_for_asr': () => ({ ok: true, status: 'done', files: [{ path: '/tmp/a.wav' }] }),
    'funes.scribe_import_file': () => ({ session: { id: 's_9' }, status: 'ready', transcript_text: 'Necesitas un litro de leche y cuatro yemas de huevo para las natillas.' }) };
  const { h } = setup(t, { calls });
  const legacy = await callTool('import_recipe_video', { url: URL });
  assert.equal(legacy.draft.status_notes.transcript, 'ok (sesión s_9)');
  assert.deepEqual(tools(h).slice(-2), ['funes.transcribe_file', 'funes.scribe_import_file']);
  fakeHub({ calls: { ...calls, 'funes.transcribe_file': () => ({ __error: 'no_model', status: 503 }) } });
  const refused = await callTool('import_recipe_video', { url: URL, force: true });
  assert.match(refused.draft.status_notes.transcript, /funes no ha podido responder: no_model/);
  fakeHub({ calls: { ...calls, 'funes.transcribe_file': () => ({ job_id: 'j7', status: 'done', text: '', segments: [] }) } });
  const silent = await callTool('import_recipe_video', { url: URL, force: true });
  assert.equal(silent.draft.status_notes.transcript, 'Funes no ha detectado voz en el vídeo.');
});

test('a link Links cannot read is explained with the same codes as a local failure, and the local yt-dlp is not tried after it', async (t) => {
  const { h } = setup(t, { calls: { 'links.media_info': () => ({ __error: 'Este contenido necesita iniciar sesión (cuenta privada, restricción de edad). Indica un archivo de cookies en Ajustes.', status: 400 }) } });
  process.env.HOARD_YTDLP = `node:${FAKE_YTDLP}`;
  t.after(() => { delete process.env.HOARD_YTDLP; });
  resetDetection();
  const failed = await callTool('import_recipe_video', { url: URL });
  assert.equal(failed.status, 'failed');
  assert.equal(failed.code, 'needs_login');
  assert.equal(failed.hint, 'settings.media.cookies_from_browser');
  assert.match(failed.why, /iniciar sesión/);
  assert.deepEqual(tools(h), ['links.media_info']);
});

test('without Links (hub down, or an old Links) this machine\'s yt-dlp reads the link', async (t) => {
  const { s } = setup(t, { down: true });
  const info = path.join(s.dir, 'info.json');
  fs.writeFileSync(info, JSON.stringify({ id: 'abc123', title: 'Tortitas rápidas', description: RECIPE_CAPTION, uploader: 'cocina_ejemplo', duration: 42, webpage_url: URL, extractor_key: 'Instagram' }));
  process.env.FAKE_YTDLP_INFO = info;
  process.env.HOARD_YTDLP = `node:${FAKE_YTDLP}`;
  t.after(() => { delete process.env.FAKE_YTDLP_INFO; delete process.env.HOARD_YTDLP; });
  resetDetection();
  const result = await callTool('import_recipe_video', { url: URL });
  assert.equal(result.status, 'draft');
  assert.equal(result.tools.links, false);
  assert.equal(result.tools.ytdlp, true);
  assert.equal(result.draft.media.uploader, 'cocina_ejemplo');
  fakeHub({ calls: {} });                                // a hub that answers but whose Links has no media_info: the same
  assert.equal((await callTool('import_recipe_video', { url: URL, force: true })).tools.links, false);
});

test('a yt-dlp or cookies set in Settings go first; Links is the fallback for them', async (t) => {
  const { s, h } = setup(t, { calls: { 'links.media_info': () => INFO({ description: SOCIAL }), 'links.media_subtitles': () => ({ ok: true, text: VTT.replace(/[\s\S]*\n\n(?=00:00:04)/, ''), lang: 'es', source: 'auto', cues: [] }) } });
  const info = path.join(s.dir, 'info.json');
  fs.writeFileSync(info, JSON.stringify({ id: 'x', title: 'T', description: RECIPE_CAPTION, webpage_url: URL }));
  process.env.FAKE_YTDLP_INFO = info;
  t.after(() => { delete process.env.FAKE_YTDLP_INFO; });
  await callTool('settings_set', { settings: { media: { ytdlp: FAKE_YTDLP } } });
  assert.equal((await callTool('import_recipe_video', { url: URL })).tools.links, false);
  assert.deepEqual(tools(h), [], 'the person\'s own yt-dlp answered; Links was not asked');
  // cookies set but nothing local to use them with: Links is asked
  await callTool('settings_set', { settings: { media: { ytdlp: '', cookies_from_browser: 'edge' } } });
  const oldPath = process.env.PATH;
  process.env.PATH = '';
  t.after(() => { process.env.PATH = oldPath; });
  resetDetection();
  assert.equal((await callTool('import_recipe_video', { url: URL, force: true })).tools.links, true);
  assert.equal(tools(h)[0], 'links.media_info');
  assert.deepEqual(routesFor({ media: { cookies_from_browser: 'edge' } }, { ytdlp: { path: 'x' } }), ['local', 'links']);
  assert.deepEqual(routesFor({ media: {} }, { ytdlp: { path: 'x' } }), ['links', 'local']);
  assert.deepEqual(routesFor({ media: {} }, { ytdlp: null }), ['links']);
});

test('key frames come from a small Links download and the local ffmpeg', async (t) => {
  if (spawnSync('ffmpeg', ['-version']).status !== 0) return t.skip('ffmpeg not installed');
  const dir = fs.mkdtempSync(path.join(process.env.TMPDIR || '/tmp', 'cookhoard-vid-'));
  const video = path.join(dir, 'v.mp4');
  assert.equal(spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=320x240:rate=5', '-pix_fmt', 'yuv420p', video]).status, 0);
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  let download;
  const { h } = setup(t, { vision: true, chat: (o) => (o.capability === 'vision' ? { ok: true, text: 'Ingredientes:\n300 g de arroz\n1 cebolla\n2 tomates', json: null } : null), calls: {
    'links.media_info': () => INFO({ description: '🔥', duration: 6 }),
    'links.media_subtitles': () => ({ __error: 'no subtitles', status: 404 }),
    'links.media_audio_for_asr': () => ({ __error: 'no audio', status: 400 }),
    'links.media_download': (args) => { download = args; const file = path.join(args.dest_dir, 'clip.mp4'); fs.copyFileSync(video, file); return { id: 'm2', ok: true, status: 'done', kind: 'video', files: [{ path: file, name: 'clip.mp4', size: 1 }] }; } } });
  const result = await callTool('import_recipe_video', { url: URL });
  assert.match(result.draft.status_notes.frames, /^ok/);
  assert.match(result.draft.status_notes.transcript, /no se pudo bajar el audio: no audio/);
  assert.ok(result.draft.sources.frames.includes('300 g de arroz'));
  assert.equal(download.format, 'video');
  assert.equal(download.quality, '360');
  assert.equal(download.save_link, false);
  assert.ok(h.log.chats.some((c) => c.capability === 'vision'));
});

test('a thumbnail is saved only from an address the policy allows', async (t) => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const server = http.createServer((req, res) => { res.setHeader('content-type', 'image/png'); res.end(png); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  setup(t, { calls: { 'links.media_info': () => INFO({ thumbnail: `http://127.0.0.1:${server.address().port}/t.png` }) } });
  delete process.env.COOKHOARD_ALLOW_PRIVATE_URLS;
  const refused = await callTool('import_recipe_video', { url: URL });
  assert.equal(refused.draft.status_notes.thumbnail, 'no se pudo guardar', 'a thumbnail address that points inside the machine is not fetched');
  process.env.COOKHOARD_ALLOW_PRIVATE_URLS = '1';
  const saved = await callTool('import_recipe_video', { url: URL, force: true });
  assert.equal(saved.draft.status_notes.thumbnail, 'ok');
});

test('failure sentences: "age" inside "webpage" is no sign-in problem, and the real ones keep their codes', () => {
  assert.equal(explainYtdlp('ERROR: [generic] Unable to download webpage: <urlopen error [Errno -2] Name or service not known>').code, 'network');
  assert.equal(explainYtdlp('ERROR: Unable to download webpage: HTTP Error 500: Internal Server Error').code, 'network');
  assert.equal(explainYtdlp('ERROR: [Instagram] x: login required. Use --cookies-from-browser').code, 'needs_login');
  assert.equal(explainYtdlp('ERROR: Unsupported URL: https://example.com/').code, 'unsupported');
  assert.equal(explainYtdlp('ERROR: Video unavailable').code, 'unavailable');
  assert.equal(explainYtdlp('ERROR: Sign in to confirm your age. This video may be inappropriate').code, 'needs_login');
  const generic = explainYtdlp('ERROR: algo raro');
  assert.equal(generic.code, 'error');
  assert.match(generic.why, /yt-dlp falló: algo raro/);
});

test('detectTools honours the program set in Settings, the COOKHOARD_YTDLP variable and the family variable', async (t) => {
  const { s } = setup(t);
  resetDetection();
  const viaSettings = await detectTools({ media: { ytdlp: FAKE_YTDLP } });
  assert.equal(viaSettings.ytdlp.version, '2099.01.01-test');
  assert.equal(viaSettings.configured, FAKE_YTDLP);
  resetDetection();
  process.env.COOKHOARD_YTDLP = FAKE_YTDLP;
  t.after(() => { delete process.env.COOKHOARD_YTDLP; });
  assert.equal((await detectTools({ media: {} })).ytdlp.version, '2099.01.01-test');
  delete process.env.COOKHOARD_YTDLP;
  resetDetection();
  const oldPath = process.env.PATH;
  process.env.PATH = '';
  t.after(() => { process.env.PATH = oldPath; });
  assert.equal((await detectTools({ media: {} })).ytdlp, null);
  assert.ok(s.dir);
});
