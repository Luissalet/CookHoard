import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { callTool } from '../tools/index.mjs';
import { readKitchen, dataFile, updateKitchen } from '../store.mjs';
import { withFileLock } from '../lock.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');

const V1 = { version: 1, shopping: [{ ingredientId: 'tomato', fromRecipes: [], checked: true }, { ingredientId: 'milk', fromRecipes: [], checked: false, qty: 2, unit: 'L' }],
  menu: null, recipes: [{ id: 'local-1', authorId: 'local', title: 'Mi ensalada', ingredients: [{ ingredientId: 'tomato', note: 'tomate' }], steps: [{ text: 'Corta.' }], createdAt: '2026-01-01T00:00:00.000Z' }],
  makes: [{ id: 'make-1', recipeId: 'local-1', authorId: 'local', rating: 4, createdAt: '2026-02-02T10:00:00.000Z' }], savedIds: ['local-1'], pantryExpiry: { tomato: '2026-09-15' } };

test('a version 1 file is read as is, reading never touches it, the first write stores version 2 and keeps a copy', async (t) => {
  const s = scratch(); fixedClock(); fakeHub(); t.after(() => s.done());
  fs.mkdirSync(s.dir, { recursive: true });
  fs.writeFileSync(dataFile(), JSON.stringify(V1, null, 2) + '\n');
  const before = sha(dataFile());
  const state = await callTool('kitchen_state', {});
  assert.equal(state.shopping.find((i) => i.ingredientId === 'tomato').expiresAt, '2026-09-15', 'the old expiry map survives as an exact date');
  assert.equal(state.pantry.find((p) => p.id === 'tomato').expiry_kind, 'exact');
  assert.equal(state.pantry.find((p) => p.id === 'tomato').location, 'nevera');
  assert.equal((await callTool('get_recipe', { recipe_id: 'local-1' })).title, 'Mi ensalada');
  await callTool('find_recipes', { query: 'ensalada' });
  await callTool('export_kitchen', {});
  await callTool('what_to_cook', {});
  assert.equal(sha(dataFile()), before, 'reads leave the bytes identical');
  assert.ok(!fs.existsSync(`${dataFile()}.v1.bak`));
  await callTool('add_kitchen_item', { name: 'yogur', checked: false });
  const written = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  assert.equal(written.version, 2);
  assert.equal(written.pantry.tomato.expiresAt, '2026-09-15');
  assert.equal(written.pantryExpiry, undefined);
  assert.equal(written.recipes[0].title, 'Mi ensalada');
  assert.equal(sha(`${dataFile()}.v1.bak`), before, 'the old file is kept next to it');
  const afterSecond = sha(dataFile());
  await callTool('add_kitchen_item', { name: 'yogur', checked: false });
  assert.equal(sha(dataFile()), afterSecond, 'repeating an idempotent write leaves identical bytes');
});

test('export and import round-trip both versions without duplicating anything', async (t) => {
  const s = scratch(); fixedClock(); fakeHub(); t.after(() => s.done());
  fs.writeFileSync(dataFile(), JSON.stringify(V1));
  await callTool('ticket_import_text', { text: 'LIDL\n05/09/2026\nLECHE ENTERA 1L 0,95\nTOTAL 0,95' });
  await callTool('import_recipe_text', { text: 'Tortitas\nIngredientes:\n200 g de harina\n2 huevos\nPreparación:\n1. Mezcla.\n2. Cocina.', use_model: false });
  const exported = (await callTool('export_kitchen', {})).kitchen;
  assert.equal(exported.version, 2);
  assert.ok(exported.priceBook.length && exported.tickets.length && exported.drafts.length);
  // v2 → empty kitchen
  const other = fs.mkdtempSync(path.join(path.dirname(s.dir), 'cookhoard-other-'));
  process.env.COOKHOARD_DATA_DIR = other;
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const summary = await callTool('import_kitchen', { snapshot_json: JSON.stringify(exported) });
  assert.equal(summary.recipes, 1);
  assert.equal(summary.tickets, 1);
  assert.equal(summary.prices, 1);
  const copy = readKitchen();
  assert.deepEqual(copy.recipes, exported.recipes);
  assert.deepEqual(copy.tickets, exported.tickets);
  assert.deepEqual(copy.drafts, exported.drafts);
  assert.deepEqual(copy.pantry, exported.pantry);
  const again = await callTool('import_kitchen', { snapshot_json: JSON.stringify(exported) });
  assert.deepEqual(again, summary, 'importing twice does not duplicate');
  // v1 snapshot → v2 kitchen
  const third = fs.mkdtempSync(path.join(path.dirname(s.dir), 'cookhoard-third-'));
  process.env.COOKHOARD_DATA_DIR = third;
  t.after(() => fs.rmSync(third, { recursive: true, force: true }));
  const fromV1 = await callTool('import_kitchen', { snapshot_json: JSON.stringify(V1) });
  assert.equal(fromV1.recipes, 1);
  assert.equal(readKitchen().pantry.tomato.expiresAt, '2026-09-15');
  await assert.rejects(callTool('import_kitchen', { snapshot_json: '{"version":9}' }), /formato válido/);
});

test('an unknown file format is refused and never overwritten', async (t) => {
  const s = scratch(); fakeHub(); t.after(() => s.done());
  fs.writeFileSync(dataFile(), '{"version":7,"things":[]}');
  const before = sha(dataFile());
  await assert.rejects(callTool('add_kitchen_item', { name: 'yogur' }), /formato desconocido/);
  assert.equal(sha(dataFile()), before);
});

test('concurrent writers in separate processes never lose an update', async (t) => {
  const s = scratch(); t.after(() => s.done());
  const worker = fileURLToPath(new URL('./fixtures/worker.mjs', import.meta.url));
  const run = (name) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', 'tsx', worker, name, '25'], { env: { ...process.env, COOKHOARD_DATA_DIR: s.dir }, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err))));
  });
  await Promise.all(['a', 'b', 'c', 'd'].map(run));
  const ids = readKitchen().savedIds;
  assert.equal(ids.length, 100);
  assert.equal(new Set(ids).size, 100);
  assert.ok(!fs.existsSync(`${dataFile()}.lock`), 'the lock is released');
});

test('Windows EPERM contention retries a readable live lock, but a permission denial still throws', async (t) => {
  const s = scratch(); t.after(() => s.done());
  const file = dataFile();
  const lock = `${file}.lock`;
  fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, at: Date.now(), token: 'other' }));
  const open = fs.openSync;
  let attempts = 0;
  const denial = Object.assign(new Error('synthetic permission denial'), { code: 'EPERM' });
  const mocked = t.mock.method(fs, 'openSync', (target, flags, ...rest) => {
    if (target === lock && flags === 'wx') {
      attempts++;
      if (attempts === 1) throw denial;
      fs.rmSync(lock);
    }
    return open(target, flags, ...rest);
  });
  assert.equal(withFileLock(file, () => 'done'), 'done');
  assert.equal(attempts, 2);
  mocked.mock.restore();
  t.mock.method(fs, 'openSync', (target, flags, ...rest) => {
    if (target === lock && flags === 'wx') throw denial;
    return open(target, flags, ...rest);
  });
  assert.throws(() => withFileLock(file, () => 'never'), (error) => error === denial);
});

test('a lock left by a dead process is taken over; a live one makes the other wait and fail clearly', async (t) => {
  const s = scratch(); t.after(() => s.done());
  const file = dataFile();
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: 2 ** 22 + 12345, at: Date.now(), token: 'x' }));
  assert.equal(withFileLock(file, () => 'ok'), 'ok');
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, at: Date.now(), token: 'y' }));
  assert.throws(() => withFileLock(file, () => 'never', { timeoutMs: 150 }), /otro proceso/);
  fs.writeFileSync(`${file}.lock`, JSON.stringify({ pid: process.pid, at: Date.now() - 60000, token: 'z' }));
  assert.equal(withFileLock(file, () => 'old', { staleMs: 1000 }), 'old');
  // a transform that throws writes nothing and releases the lock
  updateKitchen((state) => { state.savedIds.push('keep'); return state; });
  assert.throws(() => updateKitchen(() => { throw new Error('boom'); }), /boom/);
  assert.deepEqual(readKitchen().savedIds, ['keep']);
  assert.ok(!fs.existsSync(`${file}.lock`));
});
