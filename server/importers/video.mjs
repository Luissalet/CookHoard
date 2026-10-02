// Recipe from a video or reel link: yt-dlp for caption, subtitles, audio and thumbnail; Funes for the spoken text;
// key frames + the vision model for text on screen. Every step that cannot run says why in the draft's status_notes.
import { platformOf, hasUsableIngredientList, readSpeech } from '@cookhoard/core';
import { readKitchen } from '../store.mjs';
import { callApp, ask, modelStatus, whyFailed } from '../hub.mjs';
import { createDraft, newDraftId } from './drafts.mjs';
import { lexOf } from '../tools/common.mjs';
import { detectTools, routesFor, fetchInfo, fetchSubtitles, fetchAudio, fetchFrames, saveThumbnail, tempDir, cleanup } from '../media.mjs';
import { transcribe as transcribeWithFunes } from '../hoard-commons/fam-services.js';
import { pageMeta } from '../hoard-commons/web.js';
import { getPage } from '../net-policy.mjs';
import { getSettings, recipeSummaryByUrl } from './shared.mjs';

const clean = (value) => String(value ?? '').replace(/\r/g, '').trim();

/** Page-level fallback when no program can read the link: the Open Graph title/description of the page, if the site serves them. */
async function pageCaption(url) {
  try {
    const res = await getPage(url, { accept: 'html', timeoutMs: 12000, maxBytes: 1_500_000 });
    if (!res.ok || !res.text) return null;
    const meta = pageMeta(res.text, res.final_url || url);
    const title = clean(meta.og.title || meta.twitter.title);   // not the bare <title>: video sites answer a generic one to a program
    const description = clean(meta.og.description || meta.description);
    return title || description ? { title, description, image: meta.image || null } : null;
  } catch { return null; }
}

/** The spoken text of an audio file: Funes through the hub (transcribe_file), or the older scribe_import_file of a Funes that has not got it yet. */
async function transcribe(audio, title) {
  const done = await transcribeWithFunes(audio.path, { language: 'auto', timeoutS: 600 });
  if (done.ok) {
    const text = clean(done.text);
    return text ? { text, note: `ok${done.model ? ` (${done.model})` : ''}` } : { text: '', note: 'Funes no ha detectado voz en el vídeo.' };
  }
  if (done.kind === 'timeout') return { text: '', note: `Funes sigue transcribiendo (trabajo ${done.job_id ?? '?'}); repite la importación más tarde.` };
  if (done.kind !== 'tool_missing') return { text: '', note: whyFailed('funes', 'transcribe_file', done) };
  const response = await callApp('funes', 'scribe_import_file', { path: audio.path, title: `CookHoard: ${title}`.slice(0, 120), kind: 'other', language: 'auto', wait_s: 600 }, { timeoutMs: 630000 });
  if (!response.ok) return { text: '', note: response.why };
  const result = response.result ?? {};
  const text = clean(result.transcript_text ?? result.transcript ?? '');
  const session = result.session?.id ?? result.session_id ?? result.session ?? null;
  if (text) return { text, note: `ok${typeof session === 'string' ? ` (sesión ${session})` : ''}` };
  const status = result.status ?? 'unknown';
  if (status === 'no_speech') return { text: '', note: 'Funes no ha detectado voz en el vídeo.' };
  return { text: '', note: `Funes no ha devuelto texto (estado: ${status}${typeof session === 'string' ? `, sesión ${session}` : ''}); puede seguir transcribiendo: repite la importación más tarde.` };
}

async function readFrames(frames) {
  const parts = [];
  let failure = '';
  for (let i = 0; i < frames.length; i += 3) {
    const batch = frames.slice(i, i + 3);
    const answer = await ask({ capability: 'vision', images: batch, effort: 'off', maxTokens: 1500, timeoutMs: 240000, messages: [
      { role: 'system', content: 'Lees el texto que aparece escrito en imágenes de un vídeo de cocina (lista de ingredientes con cantidades, pasos, títulos). Transcríbelo tal cual, una línea por elemento. No describas la imagen ni inventes nada. Si no hay texto de receta, responde únicamente NINGUNO.' },
      { role: 'user', content: 'Transcribe el texto de receta visible en estas imágenes.' }] });
    if (!answer.ok) { failure = answer.why; break; }
    const text = clean(answer.text);
    if (text && !/^ninguno\.?$/i.test(text)) parts.push(text);
  }
  return { text: parts.join('\n'), failure };
}

/**
 * Import a recipe from a video link. Returns { status: 'draft', draft } or { status: 'already_imported' | 'needs_ytdlp' | 'failed', ... }.
 * `caption` / `transcript_text` let a person (or the assistant) provide what yt-dlp cannot reach.
 */
export async function importVideo({ url, caption, transcript_text, use_model = true, force = false, transcript, keyframes } = {}) {
  const state = readKitchen();
  const settings = getSettings(state);
  const platform = platformOf(url);
  if (!force) {
    const known = recipeSummaryByUrl(state, url);
    if (known) return { status: 'already_imported', recipe: known };
    const pending = state.drafts.find((d) => d.url === url || d.canonicalUrl === url);
    if (pending) return { status: 'draft', draft: pending, already_pending: true };
  }
  const tools = await detectTools(settings);
  const routes = routesFor(settings, tools);
  const notes = {};
  const sources = {};
  const media = { platform };
  let title = null;
  let canonicalUrl = url;
  let info = null;
  let route = null;
  if (clean(caption)) sources.caption = clean(caption);
  if (clean(transcript_text)) sources.transcript = clean(transcript_text);
  const draftId = newDraftId();
  const work = tempDir('cookhoard-video-');
  try {
    const read = await fetchInfo(routes, tools, url, settings);
    if (read.unavailable) {
      notes.ytdlp = 'missing';
      const page = await pageCaption(url);
      if (page) {
        title = page.title || null;
        if (!sources.caption) sources.caption = [page.title, page.description].filter(Boolean).join('\n');
        if (page.image) media.thumbnail = page.image;
        notes.caption = 'leído de la página (sin yt-dlp: sin subtítulos ni audio)';
      } else if (!sources.caption && !sources.transcript) {
        return { status: 'needs_ytdlp', platform, why: 'Hace falta yt-dlp para leer vídeos. Instálalo (por ejemplo con winget install yt-dlp), indica su ruta en Ajustes o abre Links Hoard, que lo trae. También puedes pegar la descripción del vídeo con import_recipe_text.',
          tools: { ytdlp: false, links: false, ffmpeg: !!tools.ffmpeg } };
      }
    } else {
      route = read.route;
      if (read.ok) {
        info = read.info;
        title = info.title;
        canonicalUrl = info.webpage_url || url;
        media.uploader = info.uploader ?? undefined; media.duration = info.duration; if (info.thumbnail) media.thumbnail = info.thumbnail;
        if (!sources.caption) sources.caption = [info.title, info.description].filter(Boolean).join('\n');
        notes.caption = info.description ? 'ok' : 'el vídeo no tiene descripción';
      } else {
        const why = read;
        notes.ytdlp = `${why.code}: ${why.why}`;
        if (!sources.caption && !sources.transcript) {
          const page = await pageCaption(url);
          if (page?.description) { sources.caption = [page.title, page.description].filter(Boolean).join('\n'); title = page.title || null; notes.caption = 'leído de la página'; }
          else return { status: 'failed', code: why.code, platform, why: why.why, hint: why.code === 'needs_login' ? 'settings.media.cookies_from_browser' : undefined };
        }
      }
      if (info || notes.ytdlp === undefined) {
        const subs = await fetchSubtitles(routes, tools, url, settings, work);
        if (subs.text) { sources.subtitles = subs.text; notes.subtitles = `ok (${subs.file})`; } else notes.subtitles = 'sin subtítulos';
      }
      const wantTranscript = (transcript ?? settings.media.transcript) !== false && !sources.transcript;
      // Speech is prose: it is never run through the list reader, only through the speech reader.
      const lex = lexOf(readKitchen());
      const spokenCount = (text) => (text ? readSpeech(text, lex).ingredients.length : 0);
      const enough = hasUsableIngredientList(sources.caption ?? '') || spokenCount(sources.subtitles) >= 3;
      if (wantTranscript && info && (!enough && !sources.subtitles)) {
        const audio = await fetchAudio(routes, tools, url, settings, work);
        if (!audio.ok) notes.transcript = `no se pudo bajar el audio: ${audio.why}`;
        else {
          const spoken = await transcribe(audio, title ?? platform);
          if (spoken.text) sources.transcript = spoken.text;
          notes.transcript = spoken.note;
        }
      } else if (!wantTranscript) notes.transcript = 'desactivado';
      else notes.transcript = sources.subtitles || enough ? 'no hizo falta' : 'sin información';
      const anyList = ['caption', 'text', 'frames'].some((key) => hasUsableIngredientList(sources[key] ?? '')) || spokenCount(sources.subtitles) >= 3 || spokenCount(sources.transcript) >= 3;
      const wantFrames = (keyframes ?? settings.media.keyframes) !== false && info && !anyList;
      if (wantFrames) {
        if (!tools.ffmpeg) notes.frames = 'sin ffmpeg: no se miran fotogramas';
        else {
          const vision = (await modelStatus()).vision;
          if (!vision?.available) notes.frames = `sin modelo de visión (${vision?.reason ?? 'no disponible'})`;
          else {
            const got = await fetchFrames(routes, tools, url, settings, work, { duration: info.duration });
            if (!got.ok) notes.frames = 'no se pudieron extraer fotogramas';
            else {
              const read = await readFrames(got.frames);
              if (read.text) { sources.frames = read.text; notes.frames = `ok (${got.frames.length} fotogramas)`; }
              else notes.frames = read.failure || 'sin texto legible en pantalla';
            }
          }
        }
      } else notes.frames = anyList ? 'no hizo falta' : 'desactivado';
    }
    if (media.thumbnail) {
      const saved = await saveThumbnail(media.thumbnail, draftId);
      notes.thumbnail = saved ? 'ok' : 'no se pudo guardar';
      if (saved) media.thumbnail = saved;
      else delete media.thumbnail;
    }
  } finally { cleanup(work); }
  const draft = await createDraft({ id: draftId, kind: 'video', url, canonicalUrl, title, description: null, sources, media, notes, useModel: use_model });
  return { status: 'draft', draft, tools: { ytdlp: !!tools.ytdlp, links: route === 'links', ffmpeg: !!tools.ffmpeg } };
}
