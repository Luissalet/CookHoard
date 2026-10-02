// Everything that touches video tools. A link is read by the Links media service through the hub when it is there (one yt-dlp and one updater
// for the whole family: media_info, media_subtitles, media_audio_for_asr, media_download) and by a local yt-dlp otherwise. A yt-dlp (or cookies)
// configured in CookHoard's own settings is the person's explicit choice and is tried first, because the family tools cannot receive it.
// Finding the programs, running them, the argument builders, the subtitle parser and the failure sentences are hoard-commons/media.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  resolveTool, resetToolsCache, runProcess, buildProbeArgs, ytdlpBaseArgs, cookieArgs, explainFailure, classifyFailure, subtitleText, setLanguage,
} from './hoard-commons/media.js';
import { mediaInfo, mediaSubtitles, mediaAudioForAsr, mediaDownload, isUnavailable } from './hoard-commons/fam-services.js';
import { dataDir } from './store.mjs';
import { getPage } from './net-policy.mjs';

setLanguage('es');

// ───────────────────────────── detection ─────────────────────────────

let cache = { key: '', at: 0, value: null };
export const resetDetection = () => { cache = { key: '', at: 0, value: null }; resetToolsCache(); };

/** The cookies the person chose in Settings as one yt-dlp cookie attempt (a file wins over a browser), or null. */
export function cookieOf(settings = {}) {
  const media = settings.media ?? {};
  if (media.cookies_file) return { type: 'file', path: media.cookies_file };
  if (media.cookies_from_browser && media.cookies_from_browser !== 'none') return { type: 'browser', name: media.cookies_from_browser };
  return null;
}

/** Did the person set a yt-dlp or cookies of their own? Then this machine's yt-dlp goes first and Links is the fallback. */
export const prefersLocal = (settings = {}) => Boolean(settings.media?.ytdlp || process.env.COOKHOARD_YTDLP || cookieOf(settings));

/** { ytdlp: {path, version, command}|null, ffmpeg: {path, version, command}|null }. Cached for a minute per configuration. */
export async function detectTools(settings = {}) {
  const configured = settings.media?.ytdlp || process.env.COOKHOARD_YTDLP || '';
  const key = `${configured}|${process.env.COOKHOARD_FFMPEG || ''}|${process.env.COOKHOARD_PYTHON || ''}|${process.env.PATH ?? ''}|${process.env.HOARD_HOME ?? ''}`;
  if (cache.key === key && Date.now() - cache.at < 60000 && cache.value) return cache.value;
  // COOKHOARD_PYTHON is the interpreter that runs `python -m yt_dlp` (the commons read it as PYTHON); a program set in Settings overrides HOARD_YTDLP.
  const env = { ...process.env, ...(process.env.COOKHOARD_PYTHON ? { PYTHON: process.env.COOKHOARD_PYTHON } : {}), ...(configured ? { HOARD_YTDLP: configured } : {}) };
  const [yt, ff] = await Promise.all([resolveTool('ytdlp', { env }), resolveTool('ffmpeg', { env })]);
  const pick = (tool) => (tool.found ? { path: tool.path, version: tool.version, command: tool.command, how: tool.how } : null);
  const value = { ytdlp: pick(yt), ffmpeg: pick(ff), configured: configured || null };
  cache = { key, at: Date.now(), value };
  return value;
}

// ───────────────────────────── failures ─────────────────────────────

const CODES = { login: 'needs_login', forbidden: 'forbidden', outdated: 'outdated', unavailable: 'unavailable', unsupported: 'unsupported', network: 'network',
  no_video: 'no_video', no_ffmpeg: 'no_ffmpeg' };
export const codeOfKind = (kind) => CODES[kind] ?? 'error';

/** yt-dlp's stderr → { code, why }: a sentence that says what to do. */
export function explainYtdlp(stderr = '') {
  const failure = explainFailure('yt-dlp', stderr);
  return { code: codeOfKind(failure.kind), why: failure.message };
}

/** The sentence Links gave for a failed link, with the same code vocabulary (Links answers the explained message, not yt-dlp's stderr). */
const explainFamily = (result) => ({ code: codeOfKind(classifyFailure('yt-dlp', `${result.error} ${result.detail ?? ''}`)), why: String(result.error) });

// ───────────────────────────── running yt-dlp locally ─────────────────────────────

/** Run a program and never reject: { code, stdout, stderr, missing }. Stdout is the whole of it (one JSON line can be larger than the tail runProcess keeps). */
async function run(command, args, { timeoutMs = 120000 } = {}) {
  const lines = [];
  try {
    const done = await runProcess(command, args, { timeoutMs, lowPriority: false, onStdoutLine: (line) => lines.push(line) });
    return { code: done.code ?? -1, stdout: lines.join('\n'), stderr: done.stderr };
  } catch (error) { return { code: -1, stdout: '', stderr: String(error.message), missing: true }; }
}

const base = (ytdlp, settings) => [...ytdlpBaseArgs({ version: ytdlp.version }), '--no-playlist', '--no-warnings', ...cookieArgs(cookieOf(settings))];

async function localInfo(ytdlp, url, settings) {
  const result = await run(ytdlp.command, buildProbeArgs({ url, cookie: cookieOf(settings), ytdlpVersion: ytdlp.version }), { timeoutMs: 90000 });
  if (result.code !== 0) return { ok: false, stderr: result.stderr };
  try {
    const info = JSON.parse(result.stdout.split('\n').filter((line) => line.startsWith('{')).slice(-1)[0] ?? result.stdout);
    return { ok: true, info: {
      id: info.id, title: info.title ?? null, description: info.description ?? null, uploader: info.uploader ?? info.channel ?? null,
      duration: Number.isFinite(info.duration) ? info.duration : null, thumbnail: info.thumbnail ?? null,
      webpage_url: info.webpage_url ?? url, extractor: info.extractor_key ?? info.extractor ?? null,
      subtitle_langs: Object.keys(info.subtitles ?? {}), auto_caption_langs: Object.keys(info.automatic_captions ?? {}),
    } };
  } catch { return { ok: false, stderr: 'La respuesta de yt-dlp no es JSON válido.' }; }
}

const fromLinks = (r, url) => ({ ok: true, info: {
  id: r.id ?? null, title: r.title || null, description: r.description || null, uploader: r.uploader || null,
  duration: Number.isFinite(r.duration) ? r.duration : null, thumbnail: r.thumbnail || null, webpage_url: r.webpage_url || r.url || url,
  extractor: r.extractor || r.platform || null, subtitle_langs: Array.isArray(r.subtitle_langs) ? r.subtitle_langs : [], auto_caption_langs: [],
} });

/** Subtitles (es first, then en, then anything) as plain text, or '' when the video has none. */
async function localSubtitles(ytdlp, url, settings, dir) {
  const out = path.join(dir, 'sub');
  const result = await run(ytdlp.command, [...base(ytdlp, settings), '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'es.*,es,en.*,en', '--sub-format', 'vtt/srt/best',
    '-o', `${out}.%(ext)s`, '--', url], { timeoutMs: 90000 });
  const files = fs.readdirSync(dir).filter((name) => /^sub\..*\.(vtt|srt|json3|ttml)$/i.test(name) || /^sub\.(vtt|srt|json3)$/i.test(name));
  if (!files.length) return { text: '', stderr: result.code === 0 ? '' : result.stderr };
  const rank = (name) => (/\.es[.-]/i.test(name) ? 0 : /\.en[.-]/i.test(name) ? 1 : 2);
  files.sort((a, b) => rank(a) - rank(b));
  for (const name of files) {
    const text = subtitleText(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (text.trim()) return { text, file: name };
  }
  return { text: '' };
}

/** Shrink an audio file for the transcriber: mono 16 kHz at 32 kbit/s keeps long videos small. Returns the new path, or the old one when ffmpeg cannot. */
async function shrinkAudio(ffmpeg, file, dir) {
  if (!ffmpeg) return file;
  const small = path.join(dir, 'audio-small.mp3');
  const converted = await run(ffmpeg.command, ['-y', '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', small], { timeoutMs: 300000 });
  return converted.code === 0 && fs.existsSync(small) && fs.statSync(small).size > 0 ? small : file;
}

async function localAudio(ytdlp, ffmpeg, url, settings, dir) {
  const result = await run(ytdlp.command, [...base(ytdlp, settings), '-f', 'bestaudio/best', '-o', path.join(dir, 'audio.%(ext)s'), '--', url], { timeoutMs: 300000 });
  const file = fs.readdirSync(dir).find((name) => /^audio\./.test(name) && !/\.(part|ytdl)$/.test(name));
  if (result.code !== 0 || !file) return { ok: false, stderr: result.stderr };
  const finalPath = await shrinkAudio(ffmpeg, path.join(dir, file), dir);
  return { ok: true, path: finalPath, bytes: fs.statSync(finalPath).size };
}

// ───────────────────────────── the two routes ─────────────────────────────

/** The routes to try, in order: 'links' (the family media service) and 'local' (this machine's yt-dlp, when there is one). */
export function routesFor(settings, tools) {
  const local = tools.ytdlp ? ['local'] : [];
  return prefersLocal(settings) ? [...local, 'links'] : ['links', ...local];
}

/** Try each route until one answers (a route that is not there, or has no such tool, is skipped; one that ran and failed is final). */
async function through(routes, steps) {
  for (const route of routes) {
    const got = await steps[route]();
    if (!got.unavailable) return { ...got, route };
  }
  return { unavailable: true, route: null };
}

/** { ok: true, info, route } | { ok: false, code, why, route } | { unavailable: true } when no route can read links at all. */
export async function fetchInfo(routes, tools, url, settings) {
  return through(routes, {
    links: async () => {
      const got = await mediaInfo(url);
      if (got.ok) return fromLinks(got, url);
      return isUnavailable(got) ? { unavailable: true } : { ok: false, ...explainFamily(got) };
    },
    local: async () => {
      const got = await localInfo(tools.ytdlp, url, settings);
      return got.ok ? got : { ok: false, ...explainYtdlp(got.stderr) };
    },
  });
}

/** { text, note?, file?, route } — '' when the video has no subtitles. */
export async function fetchSubtitles(routes, tools, url, settings, dir) {
  const got = await through(routes, {
    links: async () => {
      const r = await mediaSubtitles(url, { langs: ['es', 'en'] });
      if (r.ok) return { text: String(r.text ?? ''), file: r.lang ? `${r.lang}${r.source ? ` ${r.source}` : ''}` : undefined };
      return isUnavailable(r) ? { unavailable: true } : { text: '' };
    },
    local: () => localSubtitles(tools.ytdlp, url, settings, dir),
  });
  return got.unavailable ? { text: '' } : got;
}

/** { ok: true, path } | { ok: false, why }. Links answers a mono 16 kHz WAV under its own folder; a local run answers a small mp3 under `dir`. */
export async function fetchAudio(routes, tools, url, settings, dir) {
  const got = await through(routes, {
    links: async () => {
      const r = await mediaAudioForAsr(url, { timeoutS: 300 });
      if (r.ok) return { ok: true, path: r.path };
      return isUnavailable(r) ? { unavailable: true } : { ok: false, why: explainFamily(r).why };
    },
    local: async () => {
      const r = await localAudio(tools.ytdlp, tools.ffmpeg, url, settings, dir);
      return r.ok ? r : { ok: false, why: explainYtdlp(r.stderr).why };
    },
  });
  return got.unavailable ? { ok: false, why: 'No hay forma de descargar el audio (ni Links ni yt-dlp).' } : got;
}

/** Up to `count` key frames spread over the video, as base64 JPEG strings. The video is a small download (Links or yt-dlp); ffmpeg is always local. */
export async function fetchFrames(routes, tools, url, settings, dir, { duration = null, count = 6 } = {}) {
  const downloaded = await through(routes, {
    links: async () => {
      const r = await mediaDownload(url, { format: 'video', quality: '360', destDir: dir, saveLink: false, timeoutS: 300 });
      if (r.ok) return { ok: true, file: r.path };
      return isUnavailable(r) ? { unavailable: true } : { ok: false, stderr: r.error };
    },
    local: async () => {
      const r = await run(tools.ytdlp.command, [...base(tools.ytdlp, settings), '-f', 'worst[ext=mp4]/worst', '-o', path.join(dir, 'video.%(ext)s'), '--', url], { timeoutMs: 300000 });
      const file = fs.readdirSync(dir).find((name) => /^video\./.test(name) && !/\.(part|ytdl)$/.test(name));
      return r.code === 0 && file ? { ok: true, file: path.join(dir, file) } : { ok: false, stderr: r.stderr };
    },
  });
  if (!downloaded.ok) return { ok: false, stderr: downloaded.stderr ?? '', frames: [] };
  const rate = duration && duration > 0 ? Math.min(1, count / duration) : 1 / 4;
  const result = await run(tools.ffmpeg.command, ['-y', '-i', downloaded.file, '-vf', `fps=${rate.toFixed(5)},scale=720:-2`, '-frames:v', String(count), '-q:v', '4', path.join(dir, 'frame-%02d.jpg')], { timeoutMs: 180000 });
  const frames = fs.readdirSync(dir).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort().map((name) => fs.readFileSync(path.join(dir, name)).toString('base64'));
  return { ok: result.code === 0 && frames.length > 0, frames, stderr: result.stderr };
}

/** Save a remote thumbnail under <data>/media/. Returns the relative path (media/<file>) or null. Never throws. The address policy of net-policy.mjs applies. */
export async function saveThumbnail(url, id) {
  try {
    if (!/^https?:\/\//i.test(url || '')) return null;
    const res = await getPage(url, { accept: 'any', timeoutMs: 15000, maxBytes: 5_000_000 });
    const type = String(res.content_type || res.headers?.['content-type'] || '');
    const bytes = res.ok && Buffer.isBuffer(res.body) ? res.body : null;
    if (!bytes || !bytes.length || bytes.length > 5_000_000 || res.truncated || !/^image\//i.test(type)) return null;
    const ext = /png/i.test(type) ? 'png' : /webp/i.test(type) ? 'webp' : 'jpg';
    const directory = path.join(dataDir(), 'media');
    fs.mkdirSync(directory, { recursive: true });
    const name = `${String(id).replace(/[^a-zA-Z0-9_-]/g, '')}.${ext}`;
    fs.writeFileSync(path.join(directory, name), bytes);
    return `media/${name}`;
  } catch { return null; }
}

export function tempDir(prefix = 'cookhoard-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
export function cleanup(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* best effort: it is a temp folder */ }
}
