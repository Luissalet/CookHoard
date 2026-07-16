// Detect a cooking timer from free-text step descriptions (ES/EN).
// "Hornea 20 min" → 1200 · "cuece 1 h 30 min" → 5400 · "10-12 min" → 600 (lower bound:
// the timer should prompt you to *check*, not guarantee doneness).

const NUM = String.raw`(\d+(?:[.,]\d+)?|\d+\s*\/\s*\d+)`;
const SEP = String.raw`(?:\s*(?:-|–|—|a|to|o|or)\s*${NUM})?`; // optional range: "10-12", "10 a 12"
const H = String.raw`(?:h|hr|hrs|hora|horas|hour|hours)`;
const M = String.raw`(?:min|mins|minuto|minutos|minute|minutes|m)`;
const S = String.raw`(?:s|seg|segs|segundo|segundos|sec|secs|second|seconds)`;

function parseNum(raw: string): number {
  const frac = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  return Number(raw.replace(',', '.'));
}

/** First match of `re` in `text`, or null. Case-insensitive. */
function find(text: string, re: string): RegExpMatchArray | null {
  return text.match(new RegExp(re, 'i'));
}

/**
 * Extract a timer (in seconds) from a step's text, or undefined if none is found.
 * On a range ("10-12 min") it returns the lower bound. Values over 24 h are ignored
 * (an "overnight rest" is not a countdown you want on screen).
 */
export function detectTimer(text: string): number | undefined {
  const t = ` ${text} `;

  // "2 horas y media" — digit + "y media" needs handling before the plain-hours match.
  const hHalf = find(t, String.raw`\b${NUM}\s*horas?\s+y\s+media\b`);
  if (hHalf) return Math.round(parseNum(hHalf[1]!) * 3600 + 1800);

  // Word forms — they carry no digits.
  if (find(t, String.raw`\b(?:una?\s+)?horas?\s+y\s+media\b|\ban?\s+hour\s+and\s+a\s+half\b`)) return 5400;
  if (find(t, String.raw`\bmedia\s+hora\b|\bhalf\s+an?\s+hour\b`)) return 1800;
  if (find(t, String.raw`\b(?:un\s+)?cuarto\s+de\s+hora\b|\ba\s+quarter\s+of\s+an\s+hour\b`)) return 900;

  // "1 h 30 min" (compound) or plain hours — hours may be decimal ("1,5 h").
  const hm = find(t, String.raw`\b${NUM}\s*${H}\b(?:[\s.,y]|and)*(?:${NUM}\s*${M}\b)?`);
  if (hm) {
    const sec = Math.round(parseNum(hm[1]!) * 3600 + (hm[2] ? parseNum(hm[2]) * 60 : 0));
    return sec > 0 && sec <= 86400 ? sec : undefined;
  }

  // Minutes, with optional range. `\b` after M keeps "m" from eating "ml".
  const min = find(t, String.raw`\b${NUM}${SEP}\s*${M}\b`);
  if (min) {
    const sec = Math.round(parseNum(min[1]!) * 60);
    return sec > 0 && sec <= 86400 ? sec : undefined;
  }

  // Seconds last — rarest in recipes.
  const sec = find(t, String.raw`\b${NUM}${SEP}\s*${S}\b`);
  if (sec) {
    const v = Math.round(parseNum(sec[1]!));
    return v > 0 ? v : undefined;
  }

  return undefined;
}

/** mm:ss (or h:mm:ss above the hour) — shared by cook mode and step editors. */
export function formatTimer(totalSec: number): string {
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}
