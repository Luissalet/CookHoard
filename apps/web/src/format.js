const FRACTIONS = [[0.125, '⅛'], [0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']];

/** Quantity for a recipe line: whole numbers, common fractions for small amounts, otherwise up to two decimals. */
export function fmtQty(value, lang = 'es') {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  const whole = Math.floor(value + 1e-9);
  const rest = value - whole;
  if (value < 10 && rest > 0.04) {
    const hit = FRACTIONS.find(([f]) => Math.abs(rest - f) < 0.03);
    if (hit) return `${whole || ''}${whole ? ' ' : ''}${hit[1]}`.trim();
  }
  const rounded = Math.round(value * 100) / 100;
  return String(rounded).replace('.', lang === 'es' ? ',' : '.');
}

export const fmtMoney = (value, lang = 'es') => (value === null || value === undefined ? '—' : `${(Math.round(value * 100) / 100).toFixed(2).replace('.', lang === 'es' ? ',' : '.')} €`);
export const fmtPrice = (price, unit, lang) => `${fmtMoney(price, lang)}/${unit}`;
export const fmtMinutes = (m) => (m == null ? '' : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`);

export function fmtDate(iso, lang = 'es', options = { day: 'numeric', month: 'short' }) {
  if (!iso) return '';
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', options);
}

export function fmtClock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`;
}

export const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export function daysUntil(iso) {
  if (!iso) return null;
  const a = new Date(`${todayIso()}T12:00:00`); const b = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return Math.round((b - a) / 86400000);
}
