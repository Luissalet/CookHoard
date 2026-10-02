// Everything that touches video tools: finding yt-dlp and ffmpeg, reading a link's metadata, subtitles, audio, key frames and thumbnail.
// A configured yt-dlp may be a program, a .mjs/.js script (run with this Node) or a .py script (run with Python): tests use small scripts.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { subtitleText } from '@cookhoard/core';
import { dataDir } from './store.mjs';

const isWindows = process.platform === 'win32';

/** Resolve a command or script path into { file, args } ready for spawn. */
export function commandFor(program, args = []) {
  const lower = String(program).toLowerCase();
  if (/\.(mjs|cjs|js)$/.test(lower)) return { file: process.execPath, args: [program, ...args] };
  if (lower.endsWith('.py')) return { file: process.env.COOKHOARD_PYTHON || (isWindows ? 'python' : 'python3'), args: [program, ...args] };
  return { file: program, args };
}

export function run(program, args, { timeoutMs = 120000, cwd, env, maxBuffer = 50_000_000 } = {}) {
  return new Promise((resolve) => {
    const { file, args: argv } = commandFor(program, args);
    let child;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    try {
      child = spawn(file, argv, { cwd, env: { ...process.env, ...(env ?? {}) }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      return resolve({ code: -1, stdout, stderr: String(error.message), timedOut, missing: true });
    }
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (chunk) => { if (stdout.length < maxBuffer) stdout += chunk; });
    child.stderr.on('data', (chunk) => { if (stderr.length < 2_000_000) stderr += chunk; });
    child.once('error', (error) => { clearTimeout(timer); resolve({ code: -1, stdout, stderr: String(error.message), timedOut, missing: error.code === 'ENOENT' }); });
    child.once('close', (code) => { clearTimeout(timer); resolve({ code: code ?? -1, stdout, stderr, timedOut }); });
  });
}

// ───────────────────────────── detection ─────────────────────────────

let cache = { key: '', at: 0, value: null };
export const resetDetection = () => { cache = { key: '', at: 0, value: null }; };

async function probe(program, args) {
  const result = await run(program, args, { timeoutMs: 15000 });
  if (result.code !== 0) return null;
  return String(result.stdout || result.stderr).split('\n')[0].trim().slice(0, 120) || 'ok';
}

/** { ytdlp: {path, version}|null, ffmpeg: {path, version}|null }. Cached for a minute per configuration. */
export async function detectTools(settings = {}) {
  const configured = settings.media?.ytdlp || process.env.COOKHOARD_YTDLP || '';
  const ffmpegPath = process.env.COOKHOARD_FFMPEG || 'ffmpeg';
  const key = `${configured}|${ffmpegPath}`;
  if (cache.key === key && Date.now() - cache.at < 60000 && cache.value) return cache.value;
  let ytdlp = null;
  // A configured program first, then a yt-dlp on PATH, then the Python module (pip install yt-dlp) through the usual launchers.
  const candidates = [
    ...(configured ? [{ path: configured, pre: [] }] : []),
    { path: 'yt-dlp', pre: [] },
    ...(process.env.COOKHOARD_PYTHON ? [{ path: process.env.COOKHOARD_PYTHON, pre: ['-m', 'yt_dlp'] }] : []),
    ...(isWindows
      ? [{ path: 'py', pre: ['-3', '-m', 'yt_dlp'] }, { path: 'python', pre: ['-m', 'yt_dlp'] }]
      : [{ path: 'python3', pre: ['-m', 'yt_dlp'] }]),
  ];
  for (const candidate of candidates) {
    const version = await probe(candidate.path, [...candidate.pre, '--version']);
    if (version) { ytdlp = { path: candidate.path, pre: candidate.pre, version }; break; }
  }
  let ffmpeg = null;
  const ffVersion = await probe(ffmpegPath, ['-version']);
  if (ffVersion) ffmpeg = { path: ffmpegPath, version: ffVersion.replace(/^ffmpeg version\s+/i, '').split(' ')[0] };
  const value = { ytdlp, ffmpeg, configured: configured || null };
  cache = { key, at: Date.now(), value };
  return value;
}

export function cookieArgs(settings = {}) {
  const media = settings.media ?? {};
  if (media.cookies_file) return ['--cookies', media.cookies_file];
  if (media.cookies_from_browser && media.cookies_from_browser !== 'none') return ['--cookies-from-browser', media.cookies_from_browser];
  return [];
}

/** yt-dlp failure → a sentence that says what to do. */
export function explainYtdlp(stderr = '', platform = '') {
  const text = String(stderr);
  const login = /login|log in|sign in|cookies|authentication|age|private|not available|rate-limit|rate limit|empty media|restricted/i.test(text);
  if (/unsupported url/i.test(text)) return { code: 'unsupported', why: 'Ese enlace no es un vídeo que yt-dlp sepa leer.' };
  if (/video unavailable|has been removed|does not exist|404/i.test(text)) return { code: 'unavailable', why: 'El vídeo ya no está disponible.' };
  if (login) {
    return { code: 'needs_login', why: `${platform || 'La plataforma'} pide iniciar sesión o ha limitado la descarga. Elige en Ajustes el navegador del que tomar las cookies (Edge, Chrome o Firefox) o un archivo cookies.txt, y repite.` };
  }
  if (/network|timed out|temporary failure|getaddrinfo|connection/i.test(text)) return { code: 'network', why: 'No se pudo conectar para leer el vídeo.' };
  return { code: 'error', why: `yt-dlp no ha podido leer el vídeo: ${text.split('\n').filter(Boolean).slice(-1)[0]?.slice(0, 200) || 'error desconocido'}` };
}

const base = (settings) => ['--no-playlist', '--no-warnings', '--no-progress', '--ignore-config', ...cookieArgs(settings)];

export async function fetchInfo(ytdlp, url, settings) {
  const result = await run(ytdlp.path, [...(ytdlp.pre || []), ...base(settings), '--dump-single-json', '--skip-download', url], { timeoutMs: 90000 });
  if (result.code !== 0) return { ok: false, stderr: result.stderr, timedOut: result.timedOut };
  try {
    const info = JSON.parse(result.stdout.trim().split('\n').filter((line) => line.startsWith('{')).slice(-1)[0] ?? result.stdout);
    return { ok: true, info: {
      id: info.id, title: info.title ?? null, description: info.description ?? null, uploader: info.uploader ?? info.channel ?? null,
      duration: Number.isFinite(info.duration) ? info.duration : null, thumbnail: info.thumbnail ?? null,
      webpage_url: info.webpage_url ?? url, extractor: info.extractor_key ?? info.extractor ?? null,
      subtitle_langs: Object.keys(info.subtitles ?? {}), auto_caption_langs: Object.keys(info.automatic_captions ?? {}),
    } };
  } catch { return { ok: false, stderr: 'La respuesta de yt-dlp no es JSON válido.' }; }
}

/** Subtitles (es first, then en, then anything) as plain text, or '' when the video has none. */
export async function fetchSubtitles(ytdlp, url, settings, dir) {
  const out = path.join(dir, 'sub');
  const result = await run(ytdlp.path, [...(ytdlp.pre || []), ...base(settings), '--skip-download', '--write-subs', '--write-auto-subs', '--sub-langs', 'es.*,es,en.*,en', '--sub-format', 'vtt/srt/best',
    '-o', `${out}.%(ext)s`, url], { timeoutMs: 90000 });
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

/** Audio file ready for the transcriber. ffmpeg (when present) shrinks it to mono 16 kHz so long videos stay small. */
export async function fetchAudio(ytdlp, ffmpeg, url, settings, dir) {
  const target = path.join(dir, 'audio.%(ext)s');
  const result = await run(ytdlp.path, [...(ytdlp.pre || []), ...base(settings), '-f', 'bestaudio/best', '-o', target, url], { timeoutMs: 300000 });
  const file = fs.readdirSync(dir).find((name) => /^audio\./.test(name) && !/\.(part|ytdl)$/.test(name));
  if (result.code !== 0 || !file) return { ok: false, stderr: result.stderr };
  let finalPath = path.join(dir, file);
  if (ffmpeg) {
    const small = path.join(dir, 'audio-small.mp3');
    const converted = await run(ffmpeg.path, ['-y', '-i', finalPath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '32k', small], { timeoutMs: 300000 });
    if (converted.code === 0 && fs.existsSync(small) && fs.statSync(small).size > 0) finalPath = small;
  }
  return { ok: true, path: finalPath, bytes: fs.statSync(finalPath).size };
}

/** Up to `count` key frames spread over the video, as base64 JPEG strings. Needs yt-dlp and ffmpeg. */
export async function fetchFrames(ytdlp, ffmpeg, url, settings, dir, { duration = null, count = 6 } = {}) {
  const video = path.join(dir, 'video.%(ext)s');
  const downloaded = await run(ytdlp.path, [...(ytdlp.pre || []), ...base(settings), '-f', 'worst[ext=mp4]/worst', '-o', video, url], { timeoutMs: 300000 });
  const file = fs.readdirSync(dir).find((name) => /^video\./.test(name) && !/\.(part|ytdl)$/.test(name));
  if (downloaded.code !== 0 || !file) return { ok: false, stderr: downloaded.stderr, frames: [] };
  const rate = duration && duration > 0 ? Math.min(1, count / duration) : 1 / 4;
  const pattern = path.join(dir, 'frame-%02d.jpg');
  const result = await run(ffmpeg.path, ['-y', '-i', path.join(dir, file), '-vf', `fps=${rate.toFixed(5)},scale=720:-2`, '-frames:v', String(count), '-q:v', '4', pattern], { timeoutMs: 180000 });
  const frames = fs.readdirSync(dir).filter((name) => /^frame-\d+\.jpg$/.test(name)).sort().map((name) => fs.readFileSync(path.join(dir, name)).toString('base64'));
  return { ok: result.code === 0 && frames.length > 0, frames, stderr: result.stderr };
}

/** Save a remote thumbnail under <data>/media/. Returns the relative path (media/<file>) or null. Never throws. */
export async function saveThumbnail(url, id, { fetchImpl = fetch } = {}) {
  try {
    if (!/^https?:\/\//i.test(url || '')) return null;
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) return null;
    const type = response.headers.get('content-type') || '';
    if (!/^image\//i.test(type)) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 5_000_000) return null;
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
