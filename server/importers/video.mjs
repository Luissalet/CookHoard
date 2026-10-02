// Recipe from a video or reel link: yt-dlp for caption, subtitles, audio and thumbnail; Funes for the spoken text;
// key frames + the vision model for text on screen. Every step that cannot run says why in the draft's status_notes.
import { platformOf, hasUsableIngredientList, htmlToText } from '@cookhoard/core';
import { readKitchen } from '../store.mjs';
import { callApp, ask, modelStatus } from '../hub.mjs';
import { createDraft, newDraftId } from './drafts.mjs';
import { detectTools, fetchInfo, fetchSubtitles, fetchAudio, fetchFrames, saveThumbnail, explainYtdlp, tempDir, cleanup } from '../media.mjs';
import { getSettings, recipeSummaryByUrl } from './shared.mjs';

const clean = (value) => String(value ?? '').replace(/\r/g, '').trim();

/** Page-level fallback when yt-dlp is not installed: Open Graph title/description of the page, if the site serves them. */
async function pageCaption(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { 'User-Agent': 'Mozilla/5.0 (compatible; CookHoard)', Accept: 'text/html' } });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 1_500_000);
    const meta = (name) => (html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]+content=["']([^"']*)["']`, 'i')) ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${name}["']`, 'i')))?.[1];
    const decode = (text) => htmlToText(String(text ?? '').replace(/&#x0*a;|&#10;/gi, '\n'));
    const title = decode(meta('og:title') ?? '');
    const description = decode(meta('og:description') ?? meta('description') ?? '');
    return title || description ? { title, description, image: meta('og:image') ?? null } : null;
  } catch { return null; }
}

async function transcribe(audio, title) {
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
  const notes = {};
  const sources = {};
  const media = { platform };
  let title = null;
  let canonicalUrl = url;
  let info = null;
  if (clean(caption)) sources.caption = clean(caption);
  if (clean(transcript_text)) sources.transcript = clean(transcript_text);
  const draftId = newDraftId();
  const work = tempDir('cookhoard-video-');
  try {
    if (!tools.ytdlp) {
      notes.ytdlp = 'missing';
      const page = await pageCaption(url);
      if (page) {
        title = page.title || null;
        if (!sources.caption) sources.caption = [page.title, page.description].filter(Boolean).join('\n');
        if (page.image) media.thumbnail = page.image;
        notes.caption = 'leído de la página (sin yt-dlp: sin subtítulos ni audio)';
      } else if (!sources.caption && !sources.transcript) {
        return { status: 'needs_ytdlp', platform, why: 'Hace falta yt-dlp para leer vídeos. Instálalo (por ejemplo con winget install yt-dlp) o indica su ruta en Ajustes. También puedes pegar la descripción del vídeo con import_recipe_text.',
          tools: { ytdlp: false, ffmpeg: !!tools.ffmpeg } };
      }
    } else {
      const fetched = await fetchInfo(tools.ytdlp, url, settings);
      if (fetched.ok) {
        info = fetched.info;
        title = info.title;
        canonicalUrl = info.webpage_url || url;
        media.uploader = info.uploader ?? undefined; media.duration = info.duration; if (info.thumbnail) media.thumbnail = info.thumbnail;
        if (!sources.caption) sources.caption = [info.title, info.description].filter(Boolean).join('\n');
        notes.caption = info.description ? 'ok' : 'el vídeo no tiene descripción';
      } else {
        const why = explainYtdlp(fetched.stderr, platform);
        notes.ytdlp = `${why.code}: ${why.why}`;
        if (!sources.caption && !sources.transcript) {
          const page = await pageCaption(url);
          if (page?.description) { sources.caption = [page.title, page.description].filter(Boolean).join('\n'); title = page.title || null; notes.caption = 'leído de la página'; }
          else return { status: 'failed', code: why.code, platform, why: why.why, hint: why.code === 'needs_login' ? 'settings.media.cookies_from_browser' : undefined };
        }
      }
      if (info || notes.ytdlp === undefined) {
        const subs = await fetchSubtitles(tools.ytdlp, url, settings, work);
        if (subs.text) { sources.subtitles = subs.text; notes.subtitles = `ok (${subs.file})`; } else notes.subtitles = 'sin subtítulos';
      }
      const wantTranscript = (transcript ?? settings.media.transcript) !== false && !sources.transcript;
      const enough = hasUsableIngredientList(sources.caption ?? '') || hasUsableIngredientList(sources.subtitles ?? '');
      if (wantTranscript && info && (!enough && !sources.subtitles)) {
        const audio = await fetchAudio(tools.ytdlp, tools.ffmpeg, url, settings, work);
        if (!audio.ok) notes.transcript = `no se pudo bajar el audio: ${explainYtdlp(audio.stderr, platform).why}`;
        else {
          const spoken = await transcribe(audio, title ?? platform);
          if (spoken.text) sources.transcript = spoken.text;
          notes.transcript = spoken.text ? spoken.note : spoken.note;
        }
      } else if (!wantTranscript) notes.transcript = 'desactivado';
      else notes.transcript = sources.subtitles || enough ? 'no hizo falta' : 'sin información';
      const anyList = Object.values(sources).some((text) => hasUsableIngredientList(text));
      const wantFrames = (keyframes ?? settings.media.keyframes) !== false && info && !anyList;
      if (wantFrames) {
        if (!tools.ffmpeg) notes.frames = 'sin ffmpeg: no se miran fotogramas';
        else {
          const vision = (await modelStatus()).vision;
          if (!vision?.available) notes.frames = `sin modelo de visión (${vision?.reason ?? 'no disponible'})`;
          else {
            const got = await fetchFrames(tools.ytdlp, tools.ffmpeg, url, settings, work, { duration: info.duration });
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
  return { status: 'draft', draft, tools: { ytdlp: !!tools.ytdlp, ffmpeg: !!tools.ffmpeg } };
}
