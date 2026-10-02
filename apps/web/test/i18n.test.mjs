// Every text key the UI asks for exists in Spanish and English, and both dictionaries have the same keys.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { es, en, makeT } from '../src/i18n.js';

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(dir) { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (/\.jsx?$/.test(e.name) && e.name !== 'i18n.js') files.push(p); } })(src);

const used = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*'([^']+)'/g)) used.set(m[1], path.basename(file));
}
// keys built from a variable: the values each one can take
const dynamic = {
  'day.': [1, 2, 3, 4, 5, 6, 7], 'nav.': ['today', 'recipes', 'import', 'pantry', 'menu', 'shopping', 'prices', 'settings', 'more'],
  'pantry.': ['nevera', 'despensa', 'congelador'], 'source.': ['all', 'own', 'video', 'url', 'text', 'seed', 'web', 'manual'],
  'diet.': ['vegetariano', 'vegano', 'sin_gluten', 'sin_lactosa'], 'time.': [20, 40, 60], 'draft.': ['high', 'medium', 'low'],
  'menu.status.': ['to_buy', 'check_stock', 'assumed_staple', 'in_stock'], 'unit.': ['ud', 'kg', 'g', 'L', 'ml', 'ración'],
  'step.': ['caption', 'subtitles', 'transcript', 'frames', 'model', 'thumbnail', 'ytdlp', 'web'],
};

test('every static key exists in both languages', () => {
  const missing = [];
  for (const [key, file] of used) for (const [name, dict] of [['es', es], ['en', en]]) if (!(key in dict)) missing.push(`${name}:${key} (${file})`);
  assert.deepEqual(missing, []);
});
test('dynamic keys exist in both languages', () => {
  const missing = [];
  for (const [prefix, values] of Object.entries(dynamic)) for (const v of values) for (const [name, dict] of [['es', es], ['en', en]]) if (!(`${prefix}${v}` in dict)) missing.push(`${name}:${prefix}${v}`);
  assert.deepEqual(missing, []);
});
test('Spanish and English have the same keys', () => {
  const onlyEs = Object.keys(es).filter((k) => !(k in en));
  const onlyEn = Object.keys(en).filter((k) => !(k in es));
  assert.deepEqual({ onlyEs, onlyEn }, { onlyEs: [], onlyEn: [] });
});
test('placeholders match between languages', () => {
  const bad = [];
  const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
  for (const k of Object.keys(es)) if (k in en && names(es[k]) !== names(en[k])) bad.push(k);
  assert.deepEqual(bad, []);
});
test('makeT substitutes variables and falls back to Spanish', () => {
  assert.equal(makeT('en')('cooking.step', { n: 2, total: 5 }).includes('2'), true);
  assert.equal(makeT('es')('no.such.key'), 'no.such.key');
});
