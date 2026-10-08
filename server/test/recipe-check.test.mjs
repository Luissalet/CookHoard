import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { callTool, toolCatalog } from '../tools/index.mjs';
import { dataFile, readKitchen } from '../store.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const setup = (t) => { const s = scratch(); fixedClock(); fakeHub(); t.after(() => s.done()); return s; };
const save = async (ingredients, extra = {}) => (await callTool('save_recipe', {
  title: 'Plato inventado', servings: 2, ingredients, steps: ['Mezcla.'], ...extra,
})).recipe.id;

test('one recipe scales mass, volume and counts without saving a menu or changing any bytes', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 200, unit: 'g' }, { name: 'leche', quantity: 250, unit: 'ml' }, { name: 'huevo', quantity: 2, unit: 'ud' }]);
  await callTool('pantry_set', { ingredient: 'arroz', qty: 0.3, unit: 'kg' });
  await callTool('pantry_set', { ingredient: 'leche', qty: 0.4, unit: 'L' });
  await callTool('pantry_set', { ingredient: 'huevo', qty: 6, unit: 'ud' });
  const before = fs.readFileSync(dataFile());
  const out = await callTool('recipe_check', { recipe_id: id, servings: 4 });
  assert.equal(out.factor, 2);
  assert.equal(out.base_servings, 2);
  assert.equal(out.servings, 4);
  assert.equal(out.stock_sufficient, false);
  assert.deepEqual(out.required.map((g) => [g.quantity, g.covered_quantity, g.to_buy_quantity]), [[400, 300, 100], [500, 400, 100], [4, 4, 0]]);
  assert.equal(out.missing.length, 2);
  assert.equal(readKitchen().menu, null);
  assert.deepEqual(await callTool('recipe_check', { recipe_id: id, servings: 4 }), out);
  assert.deepEqual(fs.readFileSync(dataFile()), before);
});

test('coverage allocates duplicate mixed-unit lines once; optional stock comes after required', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 100, unit: 'g' }, { name: 'arroz', quantity: 0.2, unit: 'kg' }, { name: 'arroz', quantity: 50, unit: 'g', optional: true }]);
  await callTool('pantry_set', { ingredient: 'arroz', qty: 300, unit: 'g' });
  const out = await callTool('recipe_check', { recipe_id: id });
  assert.equal(out.stock_sufficient, true);
  assert.deepEqual(out.required.map((g) => g.to_buy_quantity), [0, 0]);
  assert.equal(out.optional[0].to_buy_quantity, 50);
  assert.equal(out.missing.length, 0);
});

test('unknown amounts, incompatible units and assumed staples are uncertain, explicit depletion is a deficit', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 200, unit: 'g' }, { name: 'leche', quantity: 100, unit: 'ml' }, { name: 'sal', quantity: 1, unit: 'g' }]);
  await callTool('pantry_set', { ingredient: 'arroz' });
  await callTool('pantry_set', { ingredient: 'leche', qty: 3, unit: 'ud' });
  let out = await callTool('recipe_check', { recipe_id: id });
  assert.equal(out.stock_sufficient, null);
  assert.equal(out.needs_check.length, 3);
  await callTool('add_kitchen_item', { name: 'sal', checked: false });
  out = await callTool('recipe_check', { recipe_id: id });
  assert.equal(out.stock_sufficient, false);
  assert.equal(out.missing[0].quantity, 1);
  const unspecified = await save(['huevo']);
  await callTool('pantry_set', { ingredient: 'huevo', qty: 6, unit: 'ud' });
  assert.equal((await callTool('recipe_check', { recipe_id: unspecified })).stock_sufficient, null);
});

test('unknown base servings are allowed for original quantities but cannot be silently scaled', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 100, unit: 'g' }], { servings: undefined });
  const before = fs.readFileSync(dataFile());
  assert.equal((await callTool('recipe_check', { recipe_id: id })).base_servings, null);
  await assert.rejects(callTool('recipe_check', { recipe_id: id, servings: 4 }), /raciones base/);
  await assert.rejects(callTool('recipe_check', { recipe_id: 'missing' }), /no encontrada/);
  await assert.rejects(callTool('recipe_check', { recipe_id: id, servings: 0 }));
  assert.deepEqual(fs.readFileSync(dataFile()), before);
});

test('what_to_cook honours servings, quantities, only_have and costs instead of just ingredient presence', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 200, unit: 'g' }], { prepMin: 1, cookMin: 1 });
  await callTool('pantry_set', { ingredient: 'arroz', qty: 300, unit: 'g' });
  await callTool('price_add', { ingredient: 'arroz', unit_price: 2, price_unit: 'kg', store: 'Tienda inventada' });
  const query = { servings: 4, limit: 20, avoid_days: 0 };
  const before = fs.readFileSync(dataFile());
  const out = (await callTool('what_to_cook', query)).options.find((o) => o.recipe_id === id);
  assert.equal(out.servings, 4);
  assert.equal(out.stock_sufficient, false);
  assert.equal(out.quantity_deficits[0].quantity, 100);
  assert.equal(out.cost.total, 0.8);
  assert.ok(!out.reasons.some((r) => r.startsWith('Tienes todos')));
  assert.ok(!(await callTool('what_to_cook', { ...query, only_have: true })).options.some((o) => o.recipe_id === id));
  assert.ok(!(await callTool('what_to_cook', { ...query, allow_missing: 0 })).options.some((o) => o.recipe_id === id));
  const noMissing = await callTool('what_to_cook', { ...query, allow_missing: 0 });
  assert.ok(noMissing.filters.includes('como mucho 0 ingrediente(s) con déficit de cantidad'));
  assert.ok(!noMissing.filters.some((f) => f.includes('99 ingrediente')));
  assert.ok((await callTool('what_to_cook', { ...query, servings: 2, only_have: true })).options.some((o) => o.recipe_id === id));
  assert.deepEqual(fs.readFileSync(dataFile()), before);
});

test('quantity filtering precedes the result limit and excludes unconfirmed yields and stock', async (t) => {
  setup(t);
  const missing = await save([{ name: 'arroz', quantity: 400, unit: 'g' }], { title: 'AAA favorita', prepMin: 1 });
  const fits = await save([{ name: 'arroz', quantity: 50, unit: 'g' }], { title: 'ZZZ disponible', prepMin: 1 });
  const unknown = await save([{ name: 'arroz', quantity: 10, unit: 'g' }], { servings: undefined });
  await callTool('pantry_set', { ingredient: 'arroz', qty: 100, unit: 'g' });
  const out = await callTool('what_to_cook', { servings: 2, only_have: true, limit: 1, avoid_days: 0 });
  assert.equal(out.options[0].recipe_id, fits);
  assert.equal(out.options[0].stock_sufficient, true);
  assert.ok(out.filters.includes('solo con cantidades obligatorias confirmadas'));
  assert.ok(!out.options.some((o) => [missing, unknown].includes(o.recipe_id)));
  assert.ok(out.excluded.raciones_sin_base >= 1);
  assert.ok(toolCatalog().find((t) => t.name === 'recipe_check').annotations.readOnlyHint);
});

test('binary fraction noise is not a shortage in either recipe or menu, but actual deficits remain', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 0.1, unit: 'kg' }, { name: 'arroz', quantity: 0.2, unit: 'kg' }]);
  await callTool('pantry_set', { ingredient: 'arroz', qty: 300, unit: 'g' });
  const out = await callTool('recipe_check', { recipe_id: id });
  assert.equal(out.stock_sufficient, true);
  assert.equal(out.required[0].to_buy_quantity, 0);
  await callTool('plan_week', {});
  await callTool('set_menu_day', { day: 1, recipe_id: id });
  assert.equal((await callTool('menu_ingredients', { days: [1] })).required[0].to_buy_quantity, 0);
  await callTool('pantry_set', { ingredient: 'arroz', qty: 299.9, unit: 'g' });
  const shortage = await callTool('recipe_check', { recipe_id: id });
  assert.equal(shortage.stock_sufficient, false);
  assert.ok(Math.abs(shortage.required[0].to_buy_quantity - 0.0001) < 1e-12);
});

test('overflow in authored or scaled quantities is explicit and never mutates the kitchen', async (t) => {
  setup(t);
  const id = await save([{ name: 'arroz', quantity: 1e308, unit: 'g' }]);
  const before = fs.readFileSync(dataFile());
  await assert.rejects(callTool('recipe_check', { recipe_id: id, servings: 4 }), /rango de cálculo/);
  assert.deepEqual(fs.readFileSync(dataFile()), before);
});

test('agent HTTP route returns actionable input errors for a recipe with unknown base yield', async (t) => {
  const s = setup(t);
  const { createApp } = await import('../app.mjs');
  const id = await save([{ name: 'arroz', quantity: 100, unit: 'g' }], { servings: undefined });
  const before = fs.readFileSync(dataFile());
  const { app, token } = createApp({ dataDir: s.dir, serveStatic: false });
  const server = await new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/agent/call`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: 'recipe_check', arguments: { recipe_id: id, servings: 4 } }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.match(body.error, /raciones base/);
    assert.equal(body.code, 'invalid_recipe_quantities');
    assert.deepEqual(fs.readFileSync(dataFile()), before);
  } finally { await new Promise((resolve) => server.close(resolve)); }
});
