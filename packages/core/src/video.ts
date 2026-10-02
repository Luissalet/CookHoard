// Reading recipes out of videos: subtitle files → text, spoken text → ingredients and steps, platform names.
declare const URL: { new (url: string): { hostname: string; pathname: string } };

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

/** A line of speech and when it was said (seconds; null when the file has no timing). */
export interface Cue { text: string; start: number | null; end: number | null }

/** Longest silence inside a sentence; a longer one means the speaker stopped. */
export const CUE_GAP_SECONDS = 1.2;

const clock = (raw: string): number | null => {
  const m = raw.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})$/);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4]!.padEnd(3, '0')) / 1000 : null;
};

/** The lines of a subtitle file (WebVTT, SRT or json3) with their timing, with the repeats of rolling auto-captions removed. */
export function subtitleCues(content: string): Cue[] {
  const trimmed = content.trim();
  const raw: Cue[] = [];
  if (trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed) as { events?: Array<{ tStartMs?: number; dDurationMs?: number; segs?: Array<{ utf8?: string }> }> };
      for (const e of data.events ?? []) {
        const text = (e.segs ?? []).map((x) => x.utf8 ?? '').join('').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const start = typeof e.tStartMs === 'number' ? e.tStartMs / 1000 : null;
        raw.push({ text, start, end: start !== null && typeof e.dDurationMs === 'number' ? start + e.dDurationMs / 1000 : start });
      }
    } catch { return []; }
  } else {
    for (const block of content.replace(/\r/g, '').split(/\n{2,}/)) {
      let start: number | null = null; let end: number | null = null;
      for (const rawLine of block.split('\n')) {
        const line = rawLine.trim();
        if (!line || /^WEBVTT/.test(line) || /^(NOTE|STYLE|Kind:|Language:)/.test(line) || /^\d+$/.test(line)) continue;
        if (/-->/.test(line)) { const [a, b] = line.split('-->'); start = clock(a ?? ''); end = clock((b ?? '').trim().split(/\s+/)[0] ?? ''); continue; }
        const clean = decode(line.replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
        if (clean) raw.push({ text: clean, start, end });
      }
    }
  }
  return dedupe(raw);
}

/**
 * Plain text of a subtitle file as continuous speech. Lines that follow each other are joined with a space; a line break is
 * kept only where the speaker stopped (a silence longer than CUE_GAP_SECONDS, or the line ends a sentence).
 */
export function subtitleText(content: string): string {
  const cues = subtitleCues(content);
  let out = '';
  cues.forEach((cue, i) => {
    if (i > 0) {
      const prev = cues[i - 1]!;
      const gap = prev.end !== null && cue.start !== null ? cue.start - prev.end : 0;
      out += gap > CUE_GAP_SECONDS || /[.!?…]$/.test(prev.text) ? '\n' : ' ';
    }
    out += cue.text;
  });
  return out;
}

/** Drop repeated lines: auto-captions show every line twice (rolling), and cues often repeat the previous one. */
function dedupe(lines: Cue[]): Cue[] {
  const out: Cue[] = [];
  for (const line of lines) {
    const same = out.slice(-3).find((x) => x.text === line.text);
    if (same) { if (line.end !== null && (same.end === null || line.end > same.end)) same.end = line.end; continue; }
    const prev = out[out.length - 1];
    if (prev !== undefined && line.text.startsWith(prev.text + ' ')) { prev.text = line.text; if (line.end !== null) prev.end = line.end; continue; }
    out.push({ ...line });
  }
  return out;
}
