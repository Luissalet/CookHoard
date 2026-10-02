import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callTool } from '../tools/index.mjs';
import { readKitchen, dataFile } from '../store.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';
import { TICKET_ROWS } from '../../packages/core/test/fixtures.ts';

const setup = (t, options, clock) => { const s = scratch(); fixedClock(clock); const hub = fakeHub(options); t.after(() => s.done()); return { s, hub }; };

test('pantry places and expiry: estimates restart when the place changes, typed dates win, opening shortens', async (t) => {
  setup(t);
  const added = await callTool('pantry_set', { ingredient: 'pollo', qty: 500, unit: 'g' });
  assert.equal(added.item.location, 'nevera');
  assert.equal(added.item.expiry_kind, 'estimated');
  const fridgeDays = added.item.days_left;
  const frozen = await callTool('pantry_set', { ingredient: 'pollo', place: 'congelador' });
  assert.equal(frozen.item.location, 'congelador');
  assert.ok(frozen.item.days_left > fridgeDays * 5, 'frozen lasts far longer than the fridge');
  assert.equal(frozen.item.expiry_kind, 'estimated');
  const exact = await callTool('pantry_set', { ingredient: 'pollo', expires_at: '2026-09-12' });
  assert.equal(exact.item.expiry_kind, 'exact');
  assert.equal(exact.item.expiresAt, '2026-09-12');
  const moved = await callTool('pantry_set', { ingredient: 'pollo', place: 'nevera' });
  assert.equal(moved.item.expiresAt, '2026-09-12', 'a typed date is never replaced by an estimate');
  await callTool('pantry_set', { ingredient: 'leche', place: 'nevera', qty: 1, unit: 'L' });
  const closed = (await callTool('pantry_list', {})).items.find((i) => i.id === 'leche');
  const opened = await callTool('pantry_set', { ingredient: 'leche', opened: true });
  assert.equal(opened.item.opened_at, '2026-09-10');
  assert.ok(opened.item.days_left <= closed.days_left, 'an opened pack lasts no longer than a closed one');
  const cleared = await callTool('pantry_set', { ingredient: 'pollo', clear_expiry: true });
  assert.equal(cleared.item.expiresAt, null);
  const list = await callTool('pantry_list', { place: 'nevera' });
  assert.ok(list.items.every((i) => i.location === 'nevera'));
  assert.equal(list.counts.congelador, 0);
  assert.equal((await callTool('pantry_list', { expiring_within_days: 0 })).total, 0);
});

test('set_expiry (the original tool) now writes an exact date; the file is version 2 after the first write', async (t) => {
  const { s } = setup(t);
  await callTool('add_kitchen_item', { name: 'yogur', checked: true });
  await callTool('set_expiry', { ingredient_id: 'yogur', expires_at: '2026-09-20' });
  const stored = JSON.parse(fs.readFileSync(dataFile(), 'utf8'));
  assert.equal(stored.version, 2);
  assert.equal(stored.pantry.yogur.expiry_kind, 'exact');
  const state = await callTool('kitchen_state', {});
  assert.equal(state.shopping.find((i) => i.ingredientId === 'yogur').expiresAt, '2026-09-20');
  assert.ok(s.dir);
});

test('shopping list: sections follow the order in settings, text and markdown copy, estimates from the price book', async (t) => {
  setup(t);
  await callTool('price_add', { ingredient: 'leche', unit_price: 0.89, price_unit: 'ud', store: 'Mercadona' });
  await callTool('price_add', { ingredient: 'plátano', unit_price: 2.98, price_unit: 'kg', store: 'Mercadona' });
  await callTool('price_add', { ingredient: 'pan rallado', unit_price: 0.8, price_unit: 'ud', store: 'Mercadona' });
  await callTool('add_kitchen_item', { name: 'leche', checked: false, qty: 2, unit: 'ud' });
  await callTool('add_kitchen_item', { name: 'plátano', checked: false, qty: 1, unit: 'kg' });
  await callTool('add_kitchen_item', { name: 'pan rallado', checked: false });
  const list = await callTool('shopping_list', {});
  assert.equal(list.count, 3);
  assert.deepEqual(list.sections.map((s) => s.id).slice(0, 2), ['frutas_verduras', 'lacteos'].filter((id) => list.sections.some((s) => s.id === id)).slice(0, 2));
  const banana = list.sections.flatMap((s) => s.items).find((i) => i.ingredient_id === 'banana');
  assert.equal(banana.estimate.amount, 2.98);
  assert.equal(list.estimate.priced, 3);
  assert.match(list.text, /\[ \] Plátano · 1 kg/);
  assert.match(list.markdown, /- \[ \] Leche · 2 ud/);
  await callTool('settings_set', { settings: { sections: ['lacteos', 'despensa'] } });
  const reordered = await callTool('shopping_list', {});
  assert.equal(reordered.sections[0].id, 'lacteos');
  assert.ok(reordered.sections.some((s) => s.id === 'frutas_verduras'), 'sections not listed keep their place after the chosen ones');
  assert.ok(reordered.text.indexOf('Lácteos') < reordered.text.indexOf('Frutas'));
  const bought = await callTool('shopping_mark_bought', { items: [{ ingredient: 'leche', qty: 2, unit: 'ud', price: 1.9, store: 'Mercadona' }, { ingredient: 'plátano' }] });
  assert.equal(bought.bought.length, 2);
  assert.equal(bought.shopping.count, 1);
  const pantry = await callTool('pantry_list', {});
  assert.ok(pantry.items.find((i) => i.id === 'leche').expiresAt);
  assert.ok((await callTool('price_book', { query: 'leche' })).items[0].stores.some((s) => s.store === 'Mercadona'));
});

test('prices, recipe cost, menu cost against the weekly budget; missing prices are listed, never guessed', async (t) => {
  setup(t);
  await callTool('settings_set', { settings: { weeklyBudget: 40 } });
  const recipe = (await callTool('save_recipe', { title: 'Arroz con tomate', servings: 2, ingredients: [{ name: 'arroz', quantity: 200, unit: 'g' }, { name: 'tomate frito', quantity: 1, unit: 'ud' }, { name: 'sal', quantity: 1, unit: 'pizca' }], steps: ['Cuece el arroz.'] })).recipe;
  const none = await callTool('recipe_cost', { recipe_id: recipe.id });
  assert.equal(none.complete, false);
  assert.ok(none.missing_prices.length >= 2);
  await callTool('price_add', { ingredient: 'arroz', unit_price: 1.5, price_unit: 'kg', store: 'Mercadona' });
  await callTool('price_add', { ingredient: 'tomate frito', unit_price: 1.05, price_unit: 'ud', store: 'Mercadona', date: '2026-09-01' });
  const cost = await callTool('recipe_cost', { recipe_id: recipe.id });
  assert.equal(cost.total, 1.35);
  assert.equal(cost.per_serving, 0.68);
  assert.ok(!cost.missing_prices.includes('Arroz'));
  const scaled = await callTool('recipe_cost', { recipe_id: recipe.id, servings: 4 });
  assert.equal(scaled.total, 2.7);
  const viaGet = await callTool('get_recipe', { recipe_id: recipe.id });
  assert.equal(viaGet.cost.total, 1.35);
  await callTool('plan_week', { month: 9 });
  await callTool('set_menu_day', { day: 1, recipe_id: recipe.id });
  const menu = await callTool('menu_cost', {});
  assert.equal(menu.days[0].cost.total, 1.35);
  assert.equal(menu.budget, 40);
  assert.equal(menu.vs_budget.over, false);
  assert.equal(menu.complete, false, 'other days have no prices yet');
});

test('food spending uses tickets and weekly budget; Ledger is optional and silent when it is not there', async (t) => {
  setup(t, { calls: { 'ledger.summary': ({ month }) => ({ month, categories: [{ name: 'Supermercado', kind: 'expense', spent: 18250, budget: 30000 }, { name: 'Ocio', kind: 'expense', spent: 9000, budget: null }] }) } });
  await callTool('settings_set', { settings: { weeklyBudget: 60 } });
  await callTool('ticket_import_text', { text: TICKET_ROWS.replace('04/09/2026', '08/09/2026') });
  const spending = await callTool('food_spending', {});
  assert.equal(spending.tickets.count, 1);
  assert.equal(spending.tickets.total, 13.73);
  assert.equal(spending.week.spent, 13.73);
  assert.equal(spending.week.remaining, 46.27);
  assert.equal(spending.ledger.available, true);
  assert.equal(spending.ledger.spent, 182.5);
  assert.deepEqual(spending.ledger.categories.map((c) => c.name), ['Supermercado']);
  fakeHub({ down: true });
  const degraded = await callTool('food_spending', {});
  assert.equal(degraded.ledger.available, false);
  assert.equal(degraded.tickets.total, 13.73);
});

test('what to cook: uses expiring food, avoids what was cooked lately, offers leftovers, filters by time and allergens', async (t) => {
  setup(t);
  await callTool('pantry_set', { ingredient: 'tomate', expires_at: '2026-09-11' });
  await callTool('pantry_set', { ingredient: 'cebolla', qty: 2, unit: 'ud' });
  await callTool('pantry_set', { ingredient: 'aceite de oliva' });
  const rec = (await callTool('save_recipe', { title: 'Sofrito de tomate', servings: 2, prepMin: 5, cookMin: 15, ingredients: ['tomate', 'cebolla', 'aceite de oliva'], steps: ['Sofríe.'] })).recipe;
  const first = await callTool('what_to_cook', { limit: 20 });
  const sofrito = first.options.find((o) => o.recipe_id === rec.id);
  assert.deepEqual(sofrito.missing, []);
  assert.deepEqual(sofrito.uses_expiring, ['Tomate']);
  assert.ok(sofrito.reasons.some((r) => /caduca/.test(r)));
  assert.equal(first.options[0].recipe_id, rec.id, 'what expires tomorrow goes first');
  const quick = await callTool('what_to_cook', { max_minutes: 10, limit: 20 });
  assert.ok(!quick.options.some((o) => o.recipe_id === rec.id));
  const cooked = await callTool('record_cooking', { recipe_id: rec.id, servings_made: 4, servings_eaten: 2, rating: 5 });
  assert.equal(cooked.leftovers.servings, 2);
  assert.equal(cooked.leftovers.expiry_kind, 'estimated');
  const after = await callTool('what_to_cook', { limit: 20 });
  assert.ok(!after.options.some((o) => o.recipe_id === rec.id), 'cooked today: not repeated');
  assert.equal(after.leftovers.length, 1);
  assert.match(after.leftovers[0].title, /Sobras: Sofrito de tomate/);
  assert.equal(after.leftovers[0].leftover_servings, 2);
  const spare = await callTool('what_to_cook', { avoid_days: 0, only_have: true, limit: 20 });
  assert.ok(spare.options.some((o) => o.recipe_id === rec.id));
  const glutenFree = await callTool('what_to_cook', { avoid_allergens: ['gluten'], limit: 20 });
  assert.ok(glutenFree.excluded.alergenos >= 0);
});

test('the Hoy overview gathers what matters from one read', async (t) => {
  setup(t);
  await callTool('pantry_set', { ingredient: 'yogur', expires_at: '2026-09-10' });
  await callTool('add_kitchen_item', { name: 'harina' });
  await callTool('import_recipe_text', { text: 'Tortitas\nIngredientes:\n200 g de harina\n2 huevos\nPreparación:\n1. Mezcla.\n2. Cocina 2 minutos.', use_model: false });
  await callTool('ticket_import_text', { text: `LIDL\n05/09/2026\nXPT BRC 3,10\nLECHE ENTERA 1L 0,95\nTOTAL 4,05`, use_model: false });
  const today = await callTool('today_overview', {});
  assert.equal(today.date, '2026-09-10');
  assert.equal(today.expiring[0].name, 'Yogur');
  assert.equal(today.expiring[0].days_left, 0);
  assert.equal(today.shopping_to_buy, 1);
  assert.equal(today.drafts_pending, 1);
  assert.equal(today.review_queue, 1);
  assert.ok(today.dinner.options.length >= 1);
});

test('settings: partial updates, validation, and Tantalus watching with a created watcher', async (t) => {
  const created = [];
  const { hub } = setup(t, { calls: {
    'tantalus.watcher_list': () => ({ watchers: [] }),
    'tantalus.watcher_create': (args) => { created.push(args); return { id: 'w_1' }; },
    'tantalus.target_add': (args) => ({ target: { id: 't_1', url: args.url, label: args.label } }) } });
  const initial = await callTool('settings_get', {});
  assert.equal(initial.lang, 'es');
  assert.equal(initial.media.cookies_from_browser, 'none');
  const changed = await callTool('settings_set', { settings: { weeklyBudget: 75, media: { cookies_from_browser: 'edge' } } });
  assert.equal(changed.settings.weeklyBudget, 75);
  assert.equal(changed.settings.media.cookies_from_browser, 'edge');
  assert.equal(changed.settings.media.transcript, true, 'fields not given keep their value');
  await assert.rejects(callTool('settings_set', { settings: { media: { cookies_from_browser: 'safari' } } }), /Invalid option|cookies_from_browser/);
  const watch = await callTool('tantalus_watch_add', { url: 'https://tienda.ejemplo/aceite', label: 'Aceite 5 L' });
  assert.equal(watch.status, 'ok');
  assert.equal(created[0].name, 'CookHoard');
  assert.equal(created[0].mode, 'availability');
  const add = hub.log.calls.find((c) => c.tool === 'target_add');
  assert.deepEqual([add.args.watcher_id, add.args.url, add.args.check_now], ['w_1', 'https://tienda.ejemplo/aceite', false]);
  assert.equal((await callTool('settings_get', {})).hub.tantalus_watcher, 'w_1');
  fakeHub({ down: true });
  const down = await callTool('tantalus_watch_add', { url: 'https://tienda.ejemplo/otro', watcher_id: 'w_9' });
  assert.equal(down.status, 'unavailable');
  assert.match(down.why, /Hoard Hub/);
});

test('ingredients: user dictionary, learned aliases, lookups', async (t) => {
  setup(t);
  const added = await callTool('ingredient_add', { name: 'Kéfir de búfala', category: 'yogur', aliases: ['kefir bufala'], shelf_days: { nevera: 14 } });
  assert.equal(added.ingredient.id, 'kefir_de_bufala');
  await assert.rejects(callTool('ingredient_add', { name: 'Kéfir de búfala' }), /Ya existe/);
  const search = await callTool('ingredients_search', { query: 'kefir bufala' });
  assert.equal(search.resolves_to.id, 'kefir_de_bufala');
  await callTool('ingredient_alias_add', { alias: 'KEF BUF 500', ingredient: 'kefir_de_bufala' });
  const ticket = await callTool('ticket_import_text', { text: `DIA\n05/09/2026\nKEF BUF 500 2,15\nLECHE ENTERA 1L 0,95\nTOTAL 3,10` });
  assert.equal(ticket.ticket.lines[0].ingredient_id, 'kefir_de_bufala');
  assert.equal(ticket.ticket.lines[0].via, 'learned');
  const pantry = await callTool('pantry_list', {});
  const kefir = pantry.items.find((i) => i.id === 'kefir_de_bufala');
  assert.equal(kefir.days_left, 14 - 5, 'the 14-day shelf life the person set is used (bought 05/09, today 10/09)');
  assert.equal(kefir.expiry_kind, 'estimated');
  assert.ok(fs.existsSync(path.join(process.env.COOKHOARD_DATA_DIR, 'kitchen.json')));
  assert.equal(readKitchen().userIngredients.length, 1);
});
