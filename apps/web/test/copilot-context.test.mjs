// What the Faustus copilot is told about the open view: real objects, unsaved forms, never a throw.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContext, changedFields, rebaseForm, parseRoute, collectContext, registerProvider, clipFields, clip,
  recipeObject, draftObject, pantryObject, subscribeRefresh, onTurnEnd,
} from '../src/copilot-context.js';

const RECIPE = { id: 'r1', title: 'Sopa de ajo', servings: 2, totalMin: 30, saved: true, diet: ['vegano'], source: { kind: 'text' }, ingredients: [1, 2, 3], steps: [1, 2], cost: { total: 3.4 } };
const DRAFT = { id: 'd1', title: 'Tortilla', kind: 'video', confidence: { level: 'media' }, ingredients: [1, 2], steps: [1] };
const PANTRY = { items: [{ id: 'ing-leche', name: 'Leche', location: 'nevera', qty: 2, unit: 'L', expiresAt: '2026-10-20' }], total: 1 };

// A tool double: records calls, answers from a table, throws for unknown ids like the real tools do.
function tools(overrides = {}) {
  const calls = [];
  const table = {
    get_recipe: ({ recipe_id }) => { if (recipe_id === 'r1') return RECIPE; throw new Error('Receta no encontrada'); },
    recipe_draft_get: ({ draft_id }) => { if (draft_id === 'd1') return { draft: DRAFT }; throw new Error('Borrador no encontrado'); },
    pantry_list: () => PANTRY,
    kitchen_state: () => ({ week: '2026-W42', menu: { days: [{ recipeId: 'r1', title: 'Sopa de ajo', servings: 2 }, { recipeId: 'r2', title: 'Arroz' }] } }),
    shopping_list: () => ({ sections: [{ items: [{ ingredient_id: 'ing-leche', name: 'Leche', qty: 2, unit: 'L' }, { ingredient_id: 'ing-pan', name: 'Pan', qty: 1, unit: 'ud' }] }] }),
    price_book: () => ({ items: [{ ingredientId: 'ing-leche', name: 'Leche', last: { unit_price: 0.9, store: 'Mercadona', date: '2026-10-01' }, count: 4 }] }),
    ...overrides,
  };
  const fn = async (name, args = {}) => { calls.push(name); if (!table[name]) throw new Error(`no tool ${name}`); return table[name](args); };
  fn.calls = calls;
  return fn;
}

test('changedFields lists only what differs, and a cleared text counts as a change', () => {
  assert.deepEqual(changedFields({ a: 'x', b: 1, c: ['k'] }, { a: 'x', b: 2, c: ['k'] }), { b: 2 });
  assert.deepEqual(changedFields({ a: 'x' }, { a: '' }), { a: '' });
  assert.deepEqual(changedFields(null, { a: 1 }), { a: 1 });
  assert.deepEqual(changedFields({ a: 1 }, null), {});
});

test('rebaseForm lets untouched fields follow a refresh and keeps the ones the user edited', () => {
  const prev = { title: 'A', servings: '2', steps: ['x'] };
  const next = { title: 'B', servings: '4', steps: ['x', 'y'] };
  assert.deepEqual(rebaseForm(prev, next, { title: 'A', servings: '3', steps: ['x'] }), { title: 'B', servings: '3', steps: ['x', 'y'] });
  assert.deepEqual(rebaseForm(prev, next, { ...prev }), next);
});

test('routes parse to a screen and its params; anything unknown is Today', () => {
  assert.deepEqual(parseRoute('#/recipes/r1/cook'), { screen: 'recipes', params: ['r1', 'cook'] });
  assert.deepEqual(parseRoute('#/import/drafts'), { screen: 'import', params: ['drafts'] });
  assert.deepEqual(parseRoute('#/nada'), { screen: 'today', params: [] });
  assert.deepEqual(parseRoute(''), { screen: 'today', params: [] });
  assert.deepEqual(parseRoute('#/recipes/a%20b'), { screen: 'recipes', params: ['a b'] });
});

test('every view answers with active_objects, even when empty, and never names a project', async () => {
  for (const hash of ['', '#/today', '#/recipes', '#/import', '#/import/ticket', '#/pantry', '#/menu', '#/shopping', '#/prices', '#/settings']) {
    const out = await buildContext({ hash, tools: tools() });
    assert.ok(Array.isArray(out.active_objects), hash);
    assert.equal(out.project, undefined, hash);
    assert.ok(out.view.page, hash);
  }
});

test('an open recipe is a real object read with the tool; "new" and unknown ids give none and do not throw', async () => {
  const out = await buildContext({ hash: '#/recipes/r1', view: { servings: 4 }, tools: tools() });
  assert.equal(out.view.page, 'recipe');
  assert.equal(out.view.object_id, 'r1');
  assert.equal(out.view.servings, 4);
  assert.deepEqual(out.active_objects, [recipeObject(RECIPE)]);
  assert.equal(out.active_objects[0].ingredients, 3);
  for (const hash of ['#/recipes/new', '#/recipes/ghost']) {
    const none = await buildContext({ hash, tools: tools() });
    assert.deepEqual(none.active_objects, [], hash);
  }
});

test('the cooking mode is its own page and carries the step', async () => {
  const out = await buildContext({ hash: '#/recipes/r1/cook', view: { cook: { step: 2, of: 5, text: 'Dora el ajo' } }, tools: tools() });
  assert.equal(out.view.page, 'cooking');
  assert.deepEqual(out.view.cook, { step: 2, of: 5, text: 'Dora el ajo' });
  assert.equal(out.active_objects[0].object_id, 'r1');
});

test('the recipe list sends its filters, and a failing tool never breaks the answer', async () => {
  const out = await buildContext({ hash: '#/recipes', view: { filters: { q: 'sopa', diet: 'vegano' } }, tools: tools() });
  assert.equal(out.view.page, 'recipes');
  assert.deepEqual(out.view.filters, { q: 'sopa', diet: 'vegano' });
  const broken = await buildContext({ hash: '#/menu', tools: tools({ kitchen_state: () => { throw new Error('boom'); } }) });
  assert.deepEqual(broken.active_objects, []);
});

test('the import tab names the draft being reviewed', async () => {
  const out = await buildContext({ hash: '#/import/drafts', view: { draft_id: 'd1', review_count: 2, drafts_count: 1 }, tools: tools() });
  assert.equal(out.view.tab, 'drafts');
  assert.equal(out.view.draft_id, 'd1');
  assert.equal(out.view.review_count, 2);
  assert.deepEqual(out.active_objects, [draftObject(DRAFT)]);
  const none = await buildContext({ hash: '#/import/drafts', view: { draft_id: 'ghost' }, tools: tools() });
  assert.deepEqual(none.active_objects, []);
  assert.equal(none.view.draft_id, undefined);
});

test('the menu is one object with its days; the shopping list names only the ticked rows that exist', async () => {
  const menu = await buildContext({ hash: '#/menu', view: { picking_day: 3 }, tools: tools() });
  assert.equal(menu.active_objects[0].kind, 'menu');
  assert.equal(menu.active_objects[0].days.length, 2);
  assert.equal(menu.view.picking_day, 3);
  const shop = await buildContext({ hash: '#/shopping', view: { picked: ['ing-leche', 'ghost'] }, tools: tools() });
  assert.deepEqual(shop.active_objects.map((o) => o.object_id), ['ing-leche']);
  const nothing = await buildContext({ hash: '#/shopping', view: {}, tools: tools() });
  assert.deepEqual(nothing.active_objects, []);
});

test('the price book names the open product and the search', async () => {
  const out = await buildContext({ hash: '#/prices', view: { query: 'lec', price_open: 'ing-leche' }, tools: tools() });
  assert.equal(out.view.query, 'lec');
  assert.equal(out.active_objects[0].kind, 'price');
  assert.equal(out.active_objects[0].last.store, 'Mercadona');
});

test('open forms: unsaved fields travel in view.editor, the edited object is resolved, a creation form has no object', async () => {
  const t = tools();
  const dirty = { kind: 'pantry-item', object_id: 'ing-leche', dirty: true, changed: ['qty'], fields: { qty: '3' } };
  const out = await buildContext({ hash: '#/pantry', editors: [{ kind: 'recipe-draft', object_id: 'd1', dirty: false, fields: {} }, dirty], tools: t });
  assert.deepEqual(out.active_objects.map((o) => `${o.kind}:${o.object_id}`), ['draft:d1', 'pantry_item:ing-leche']);
  assert.deepEqual(out.view.editor, dirty, 'the dirty form is the main editor');
  assert.equal(out.view.editors.length, 2);
  const created = await buildContext({ hash: '#/pantry', editors: [{ kind: 'pantry-item', object_id: null, dirty: true, fields: { name: 'Yogur' } }, { kind: 'pantry-item', object_id: 'new', dirty: true, fields: {} }], tools: t });
  assert.deepEqual(created.active_objects, []);
  assert.equal(created.view.editor.fields.name, 'Yogur');
  const ghost = await buildContext({ hash: '#/pantry', editors: [{ kind: 'pantry-item', object_id: 'ghost', dirty: true, fields: {} }, { kind: 'cooked-record', object_id: 'ghost', dirty: true, fields: {} }], tools: tools() });
  assert.deepEqual(ghost.active_objects, []);
});

test('the same tool is not asked twice in one answer', async () => {
  const t = tools();
  await buildContext({ hash: '#/pantry', editors: [{ kind: 'pantry-item', object_id: 'ing-leche' }, { kind: 'pantry-item', object_id: 'ing-leche' }], tools: t });
  assert.equal(t.calls.filter((c) => c === 'pantry_list').length, 1);
  assert.equal(pantryObject(PANTRY.items[0]).title, 'Leche');
});

test('screens and forms answer the context request through the registry', () => {
  const target = new EventTarget();
  const off = registerProvider(() => ({ editors: [{ kind: 'import-text', dirty: false }, null], view: { place: 'nevera' } }), target);
  const off2 = registerProvider(() => ({ editors: [{ kind: 'recipe-draft', object_id: 'd1', dirty: true }] }), target);
  registerProvider(() => { throw new Error('a broken screen'); }, target);
  const { editors, view } = collectContext(target);
  assert.deepEqual(editors.map((e) => e.kind), ['recipe-draft', 'import-text'], 'dirty forms first');
  assert.deepEqual(view, { place: 'nevera' });
  off(); off2();
  assert.deepEqual(collectContext(target).editors, []);
});

test('long texts are shortened for the copilot', () => {
  assert.equal(clip('abcdef', 3), 'abc...');
  assert.equal(clip('abc', 3), 'abc');
  assert.equal(clipFields({ text: 'x'.repeat(2000), n: 3 }, 100).text.length, 103);
  assert.equal(clipFields({ n: 3 }).n, 3);
});

test('a finished turn refreshes the open view once, however many signals arrive', async () => {
  let runs = 0;
  const off = subscribeRefresh(() => { runs += 1; });
  onTurnEnd(); onTurnEnd(); onTurnEnd();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(runs, 1);
  off();
  onTurnEnd();
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(runs, 1);
});
