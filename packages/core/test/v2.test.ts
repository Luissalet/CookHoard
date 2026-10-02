import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  fold, parseNumber, parseMoney, addDays, daysBetween, canonicalUnit, formatQuantity, normalisePrice, addQuantities, compatible,
  resolveName, resolveOrCreate, makeUserIngredient, ingredientInfo, guessCategory, estimateExpiry, expiryLevel, normalizeKitchen, emptyKitchen,
  parseRecipeText, parseIngredientLine, parseTicket, matchTicketLines, applyPurchase, purchaseAmounts, applyTicketLine, setPantryItem, pantryView, addLeftovers,
  priceStats, priceFor, recipeCost, whatToCook, subtitleText, spokenIngredients, spokenSteps, platformOf, looksLikeVideoUrl, buildDraft, mergeLlm, draftToRecipe,
  hasUsableIngredientList, htmlToText, recipeTraits, SEED_RECIPES, getSettings, SECTION_IDS, type KitchenV2, type Recipe,
} from '../src/index.ts';
import * as F from './fixtures.ts';

const TODAY = '2026-10-02';
const lines = (text: string) => parseTicket(text).lines;

test('text helpers read Spanish numbers and money', () => {
  assert.equal(fold('Limón  Ñandú'), 'limon nandu');
  assert.equal(parseNumber('1 y 1/2'), 1.5);
  assert.equal(parseNumber('½'), 0.5);
  assert.equal(parseNumber('2,5'), 2.5);
  assert.equal(parseNumber('un cuarto'), 0.25);
  assert.equal(parseNumber('abc'), null);
  assert.equal(parseMoney('1.234,56'), 1234.56);
  assert.equal(parseMoney('2,99 €'), 2.99);
  assert.equal(parseMoney('-0,20'), -0.2);
  assert.equal(parseMoney('3.50'), 3.5);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.equal(daysBetween('2026-10-02', '2026-10-05'), 3);
});

test('units: canonical names, families, conversions and prices per kg/L/ud', () => {
  assert.equal(canonicalUnit('gr'), 'g');
  assert.equal(canonicalUnit('Cucharadas'), 'cda');
  assert.equal(canonicalUnit('litros'), 'L');
  assert.equal(compatible('g', 'kg'), true);
  assert.equal(compatible('g', 'ml'), false);
  assert.deepEqual(addQuantities({ quantity: 500, unit: 'g' }, { quantity: 1, unit: 'kg' }), { quantity: 1500, unit: 'g' });
  assert.equal(addQuantities({ quantity: 1, unit: 'kg' }, { quantity: 1, unit: 'L' }), null);
  assert.equal(formatQuantity(0.5, 'kg'), '500 g');
  assert.equal(formatQuantity(1500, 'ml'), '1,5 L');
  assert.deepEqual(normalisePrice(1.36, 0.456, 'kg'), { unit_price: 2.98, price_unit: 'kg' });
  assert.deepEqual(normalisePrice(2.1, 9000, 'ml'), { unit_price: 0.23, price_unit: 'L' });
  assert.deepEqual(normalisePrice(2.4, 12, 'ud'), { unit_price: 0.2, price_unit: 'ud' });
});

test('ingredient resolution: exact, alias, learned alias, fuzzy, then a new user ingredient', () => {
  assert.equal(resolveName('Tomates').id, 'tomato');
  assert.equal(resolveName('LECHE SEMI DESN').id, 'leche');
  assert.equal(resolveName('1 cebolla grande').id, 'onion');
  assert.equal(resolveName('limón').id, 'lemon');
  assert.equal(resolveName('salmón').id, 'salmon');
  assert.notEqual(resolveName('salmón').id, 'salt', 'sal must not match inside salmón');
  assert.equal(resolveName('champ').id, 'champinones');
  assert.equal(resolveName('QUESO RALLADO 4Q').id, 'queso_rallado');
  assert.equal(resolveName('zzz inventado').id, null);
  const learned = { learnedAliases: { 'cola cao x': 'chocolate' } };
  assert.equal(resolveName('COLA CAO X', learned).via, 'learned');
  const made = resolveOrCreate('Jengibre confitado raro', {}, { create: true, now: TODAY });
  assert.equal(made.via, 'fuzzy', 'a known word inside is matched first');
  const brand = resolveOrCreate('zumbazo exótico', {}, { create: true, now: TODAY });
  assert.equal(brand.via, 'new');
  assert.equal(brand.created?.id, 'zumbazo_exotico');
  const again = resolveName('zumbazo exótico', { userIngredients: [brand.created!] });
  assert.equal(again.id, 'zumbazo_exotico');
  assert.equal(makeUserIngredient({ name: 'Leche' }, {}).id, 'leche_2', 'ids never clash with the built-ins');
  assert.equal(ingredientInfo('leche').category, 'leche');
  assert.equal(guessCategory('Pechuga de pavo curada'), 'ave');
  assert.equal(ingredientInfo('un_slug_antiguo').known, false);
});

test('shelf life: estimates by place, opened items and frozen, always labelled as estimated', () => {
  const meat = estimateExpiry({ ingredientId: 'ternera', place: 'nevera', from: '2026-10-01' });
  assert.equal(meat.date, '2026-10-03');
  assert.equal(meat.kind, 'estimated');
  assert.match(meat.basis, /2 días/);
  assert.equal(estimateExpiry({ ingredientId: 'carne_picada', place: 'nevera', from: '2026-10-01' }).date, '2026-10-02');
  assert.equal(estimateExpiry({ ingredientId: 'egg', place: 'nevera', from: '2026-10-01' }).date, '2026-10-22');
  assert.equal(estimateExpiry({ ingredientId: 'bread', place: 'despensa', from: '2026-10-01' }).date, '2026-10-04');
  assert.equal(estimateExpiry({ ingredientId: 'ternera', place: 'congelador', from: '2026-10-01' }).days, 180);
  const closed = estimateExpiry({ ingredientId: 'leche', place: 'despensa', from: '2026-10-01' });
  assert.equal(closed.days, 90);
  const opened = estimateExpiry({ ingredientId: 'leche', place: 'nevera', from: '2026-10-01', openedAt: '2026-10-05' });
  assert.equal(opened.date, '2026-10-09', 'opened milk lasts 4 days');
  assert.equal(estimateExpiry({ ingredientId: 'salt', place: 'despensa', from: '2026-10-01' }).date, null);
  const custom = estimateExpiry({ ingredientId: 'mi_cosa', place: 'nevera', from: '2026-10-01' }, { userIngredients: [{ id: 'mi_cosa', name: 'Mi cosa', aliases: [], category: 'otros', defaultUnit: 'ud', shelfLife: { nevera: 9 } }] });
  assert.equal(custom.date, '2026-10-10');
  assert.equal(expiryLevel('2026-10-01', TODAY), 'expired');
  assert.equal(expiryLevel('2026-10-02', TODAY), 'today');
  assert.equal(expiryLevel('2026-10-04', TODAY), 'soon');
  assert.equal(expiryLevel('2026-10-20', TODAY), 'ok');
  assert.equal(expiryLevel(null, TODAY), 'none');
});

test('kitchen v1 migrates in memory: expiry map becomes exact pantry records and the list semantics are kept', () => {
  const v1 = { version: 1, shopping: [{ ingredientId: 'egg', fromRecipes: [], checked: true, qty: 6, unit: 'ud' }, { ingredientId: 'milk_x', fromRecipes: [] }],
    menu: null, recipes: [], makes: [], savedIds: [], pantryExpiry: { egg: '2026-10-05' } };
  const v2 = normalizeKitchen(v1);
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.pantry.egg, { location: 'nevera', expiresAt: '2026-10-05', expiry_kind: 'exact' });
  assert.equal(v2.pantry.milk_x, undefined, 'unchecked items are not in the pantry');
  assert.equal(v2.shopping[0]!.qty, 6);
  assert.deepEqual(normalizeKitchen(structuredClone(v2)), v2, 'normalising twice changes nothing');
  assert.throws(() => normalizeKitchen({ version: 3, shopping: [] }), /formato desconocido/);
  assert.throws(() => normalizeKitchen({ version: 1, shopping: 'x' }), /formato desconocido/);
  assert.equal(normalizeKitchen({ version: 1, shopping: [], menu: null }).settings && getSettings(emptyKitchen()).sections.length, SECTION_IDS.length);
});

test('recipe text parser: sections, bullets, fractions, units, steps with timers and temperatures', () => {
  const r = parseRecipeText(F.RECIPE_BULLETS);
  assert.equal(r.title, 'Tortilla de patatas');
  assert.equal(r.servings, 4);
  assert.equal(r.ingredients.length, 5);
  assert.deepEqual(r.ingredients.slice(0, 3).map((i) => [i.quantity, i.unit, i.name]), [[5, null, 'huevos'], [1, 'kg', 'patatas'], [0.5, null, 'cebolla']]);
  assert.equal(r.ingredients[4]!.note, 'al gusto');
  assert.equal(r.steps.length, 3);
  assert.equal(r.steps[1]!.timerSec, 1200);
  assert.equal(r.steps[2]!.timerSec, 240);
  assert.equal(r.plausible, true);

  const cap = parseRecipeText(F.RECIPE_CAPTION);
  assert.deepEqual(cap.ingredients.map((i) => [i.quantity, i.unit, i.name, i.optional]), [[200, 'g', 'harina', false], [1.5, 'taza', 'leche', false], [2, null, 'huevos', false], [1, 'pizca', 'sal', false], [1, 'cda', 'azúcar', true]]);
  assert.ok(cap.steps.length >= 1 && cap.steps[0]!.timerSec === 120);
  assert.ok(!cap.steps.some((s) => /s[ií]gueme/i.test(s.text)), 'promotional lines are dropped');

  const en = parseRecipeText(F.RECIPE_ENGLISH);
  assert.equal(en.servings, 2);
  assert.deepEqual(en.ingredients.map((i) => [i.quantity, i.unit, i.name]), [[200, 'g', 'spaghetti'], [2, 'cda', 'pesto'], [1, 'diente', 'garlic'], [null, null, 'Parmesan']]);
  assert.equal(en.steps[0]!.temperatureC, 180);

  const plain = parseRecipeText(F.RECIPE_NUMBERED_NO_HEADERS);
  assert.equal(plain.title, 'Crema de calabacín');
  assert.equal(plain.ingredients.length, 4);
  assert.equal(plain.steps.length, 4);
  assert.equal(plain.steps[0]!.timerSec, 300);
  assert.equal(plain.ingredients[3]!.unit, 'ml');
});

test('ingredient lines: ranges, words, vague amounts, notes and trailing quantities', () => {
  const f = (text: string) => parseIngredientLine(text)!;
  assert.deepEqual([f('2-3 dientes de ajo').quantity, f('2-3 dientes de ajo').quantityMax, f('2-3 dientes de ajo').unit, f('2-3 dientes de ajo').name], [2, 3, 'diente', 'ajo']);
  assert.equal(f('Medio kilo de harina').quantity, 0.5);
  assert.equal(f('Medio kilo de harina').unit, 'kg');
  assert.equal(f('Una docena de huevos').quantity, 12);
  assert.equal(f('Un poco de aceite').quantity, null);
  assert.equal(f('Un poco de aceite').note, 'un poco');
  assert.equal(f('1 cebolla, picada').note, 'picada');
  assert.equal(f('Aceite (3 cucharadas)').quantity, 3);
  assert.equal(f('Aceite (3 cucharadas)').unit, 'cda');
  assert.equal(f('250 ml de nata para cocinar').name, 'nata para cocinar');
  assert.equal(f('1/2 vaso de vino blanco').unit, 'vaso');
  assert.equal(f('2 latas de atún (opcional)').optional, true);
  assert.equal(f('2 l de agua').unit, 'L');
  assert.equal(f('2 limones').unit, null);
  assert.equal(f('Harina: 200 g').quantity, 200);
});

test('html to text keeps list items as lines for the text pipeline', () => {
  const text = htmlToText('<html><nav>menu</nav><h1>Sopa</h1><h2>Ingredientes</h2><ul><li>200 g de tomate</li><li>1 cebolla</li></ul><h2>Preparación</h2><ol><li>Cuece 20 minutos.</li></ol><script>x()</script></html>');
  const parsed = parseRecipeText(text);
  assert.equal(parsed.ingredients.length, 2);
  assert.equal(parsed.steps[0]!.timerSec, 1200);
  assert.ok(!/menu|x\(\)/.test(text));
});

test('ticket parser: Mercadona-like layout with weighed lines, counts, non-food and totals', () => {
  const t = parseTicket(F.TICKET_MERCADONA);
  assert.equal(t.store, 'Mercadona');
  assert.equal(t.date, '2026-09-04');
  assert.equal(t.total, 13.73);
  assert.equal(t.computed_total, 13.73);
  assert.deepEqual(t.warnings, []);
  const by = Object.fromEntries(t.lines.map((l) => [l.name, l]));
  assert.deepEqual([by['LECHE SEMI DESN']!.qty, by['LECHE SEMI DESN']!.total], [1, 0.89]);
  assert.deepEqual([by['YOGUR NATURAL']!.qty, by['YOGUR NATURAL']!.unit_price, by['YOGUR NATURAL']!.total], [2, 0.45, 0.9]);
  assert.deepEqual([by['PLATANO']!.qty, by['PLATANO']!.unit, by['PLATANO']!.unit_price, by['PLATANO']!.total], [0.456, 'kg', 2.99, 1.36]);
  const matched = matchTicketLines(t.lines, {});
  assert.equal(matched.find((l) => l.name === 'BOLSA PLASTICO')!.status, 'ignored');
  assert.equal(matched.find((l) => l.name === 'DETERGENTE ROPA')!.ignoreReason, 'non_food');
  assert.equal(matched.find((l) => l.name === 'PAN RALLADO')!.ingredientId, 'pan_rallado');
  assert.equal(matched.filter((l) => l.status === 'applied').length, 6);
});

test('ticket parser: multiplier lines, pack sizes, discounts and the card block are understood', () => {
  const t = parseTicket(F.TICKET_DISCOUNT);
  assert.equal(t.store, 'Lidl');
  assert.equal(t.date, '2026-09-05');
  const milk = t.lines.find((l) => l.name === 'LECHE ENTERA')!;
  assert.deepEqual([milk.qty, milk.unit_price, milk.total, milk.pack], [2, 1.05, 2.1, { count: 1, qty: 1, unit: 'L' }]);
  const bananas = t.lines.find((l) => l.name === 'PLATANOS')!;
  assert.deepEqual([bananas.qty, bananas.unit, bananas.unit_price, bananas.total], [0.456, 'kg', 2.99, 1.36]);
  const water = t.lines.find((l) => l.name === 'AGUA MINERAL')!;
  assert.deepEqual(water.pack, { count: 6, qty: 1.5, unit: 'L' });
  assert.equal(water.total, 1.75, 'the discount is taken off the item above it');
  assert.equal(t.total, 7.56);
  assert.equal(t.computed_total, 7.56);
  assert.equal(t.warnings.length, 0);
  const off = parseTicket(F.TICKET_DISCOUNT.replace('Total 7,56', 'Total 9,99'));
  assert.equal(off.warnings.length, 1, 'a sum that does not match the total is flagged');
});

test('ticket parser: wrapped descriptions, weighed lines with the name, frozen and quantity-last layouts', () => {
  const wrapped = parseTicket(F.TICKET_WRAPPED);
  assert.equal(wrapped.lines[0]!.name, 'PECHUGA POLLO FILETES');
  assert.equal(wrapped.lines[0]!.pack!.qty, 1);
  const salmon = wrapped.lines.find((l) => l.name === 'SALMON FRESCO')!;
  assert.deepEqual([salmon.qty, salmon.unit, salmon.unit_price, salmon.total], [0.5, 'kg', 14.9, 7.45]);
  assert.equal(wrapped.lines.find((l) => /HELADO/.test(l.name))!.frozen, true);
  assert.equal(wrapped.computed_total, 19.19);
  assert.equal(wrapped.warnings.length, 0);
  const last = parseTicket(F.TICKET_QTY_LAST);
  assert.equal(last.store, 'Dia');
  assert.equal(last.date, '2026-09-07');
  const milk = last.lines.find((l) => /LECHE/.test(l.name))!;
  assert.equal(milk.total, 2.67);
  assert.equal(last.lines.length, 5);
  const m = matchTicketLines(last.lines, {});
  assert.equal(m.find((l) => /PAPEL/.test(l.name))!.status, 'ignored');
  assert.equal(m.find((l) => /XYZ/.test(l.name))!.status, 'queued');
  assert.equal(m.find((l) => /ACEITE/.test(l.name))!.ingredientId, 'olive_oil');
});

test('ticket parser: ignored-always terms and learned aliases', () => {
  const t = parseTicket(F.TICKET_QTY_LAST);
  const queued = matchTicketLines(t.lines, {}).find((l) => l.status === 'queued')!;
  const ignored = matchTicketLines(t.lines, {}, ['salsa xyz rara']);
  assert.equal(ignored.find((l) => /XYZ/.test(l.name))!.ignoreReason, 'ignored_always');
  const learned = matchTicketLines(t.lines, { learnedAliases: { 'salsa xyz rara': 'tomate_frito' } });
  assert.equal(learned.find((l) => /XYZ/.test(l.name))!.ingredientId, 'tomate_frito');
  assert.equal(queued.name, 'SALSA XYZ RARA 250G'.replace(' 250G', ''));
});

function kitchenWithTicket(text: string, store = 'Mercadona') {
  const state = emptyKitchen();
  const parsed = parseTicket(text);
  const ticket = { id: 't1', store: parsed.store ?? store, date: parsed.date };
  const matched = matchTicketLines(parsed.lines, state);
  const record = matched.map((m, i) => ({ id: `l${i}`, raw: m.raw, name: m.name, qty: m.qty, unit: m.unit, unit_price: m.unit_price, total: m.total, pack: m.pack ?? null,
    ...(m.frozen ? { frozen: true } : {}), ingredientId: m.ingredientId, via: m.via, status: m.status } as any));
  for (const line of record) if (line.status === 'applied') applyTicketLine(state, ticket, line, line.ingredientId, TODAY);
  return { state, record };
}

test('a ticket fills the pantry with estimated expiry and the price book with €/kg, €/L and €/ud', () => {
  const { state } = kitchenWithTicket(F.TICKET_MERCADONA);
  const view = pantryView(state, TODAY);
  const egg = view.find((v) => v.ingredientId === 'egg')!;
  assert.equal(egg.expiry_kind, 'estimated');
  assert.equal(egg.expiresAt, '2026-09-25', 'bought on 04/09: 21 days');
  assert.equal(view.find((v) => v.ingredientId === 'banana')!.qty, 0.456);
  assert.equal(state.shopping.some((i) => i.ingredientId === 'limpieza_y_hogar'), false);
  const stats = priceStats(state, '2026-09-10');
  const banana = stats.find((s) => s.ingredientId === 'banana')!;
  assert.deepEqual([banana.price_unit, banana.last.unit_price, banana.last.store], ['kg', 2.98, 'Mercadona']);
  const egg2 = stats.find((s) => s.ingredientId === 'egg')!;
  assert.equal(egg2.price_unit, 'ud');
  const milk = stats.find((s) => s.ingredientId === 'leche')!;
  assert.deepEqual([milk.price_unit, milk.last.unit_price], ['ud', 0.89], 'no pack size on the line: priced per unit');
});

test('weighed, pack and frozen purchases are converted and placed', () => {
  assert.deepEqual(purchaseAmounts({ qty: 2, unit: 'ud', total: 2.1, pack: { qty: 1, unit: 'L', count: 1 } }), { qty: 2, unit: 'L', price: { unit_price: 1.05, price_unit: 'L' } });
  assert.deepEqual(purchaseAmounts({ qty: 1, unit: 'ud', total: 2.1, pack: { qty: 1.5, unit: 'L', count: 6 } }), { qty: 9, unit: 'L', price: { unit_price: 0.23, price_unit: 'L' } });
  const { state } = kitchenWithTicket(F.TICKET_WRAPPED);
  const ice = state.shopping.find((i) => i.ingredientId === 'helado')!;
  assert.equal(state.pantry.helado!.location, 'congelador');
  assert.equal(ice.checked, true);
  const chicken = state.shopping.find((i) => i.ingredientId === 'chicken')!;
  assert.deepEqual([chicken.qty, chicken.unit], [1, 'kg']);
  assert.equal(state.pantry.chicken!.expiresAt, '2026-09-08');
});

test('buying again adds compatible quantities, replaces incompatible ones and keeps a later exact date', () => {
  const state = emptyKitchen();
  const base = { store: 'X', date: '2026-10-01', total: 1, unit: 'ud' as const, pack: null };
  applyPurchase(state, { ...base, ingredientId: 'leche', qty: 1, pack: { qty: 1, unit: 'L', count: 1 } }, TODAY);
  applyPurchase(state, { ...base, ingredientId: 'leche', qty: 2, pack: { qty: 1, unit: 'L', count: 1 } }, TODAY);
  assert.equal(state.shopping.find((i) => i.ingredientId === 'leche')!.qty, 3);
  const swapped = applyPurchase(state, { ...base, ingredientId: 'leche', qty: 4 }, TODAY);
  assert.equal(swapped.unit_replaced, true);
  setPantryItem(state, { ingredientId: 'egg', qty: 6, unit: 'ud', expiresAt: '2026-10-20' }, TODAY);
  applyPurchase(state, { ...base, ingredientId: 'egg', qty: 12 }, TODAY);
  assert.equal(state.pantry.egg!.expiry_kind, 'exact');
  assert.equal(state.pantry.egg!.expiresAt, '2026-10-20');
});

test('pantry set: place change restarts the estimate, opening shortens it, an exact date wins', () => {
  const state = emptyKitchen();
  setPantryItem(state, { ingredientId: 'ternera', qty: 500, unit: 'g' }, '2026-10-01');
  assert.equal(state.pantry.ternera!.location, 'nevera');
  assert.equal(state.pantry.ternera!.expiresAt, '2026-10-03');
  setPantryItem(state, { ingredientId: 'ternera', location: 'congelador' }, '2026-10-02');
  assert.equal(state.pantry.ternera!.expiresAt, '2027-03-31', '180 days from the day it was frozen');
  assert.equal(state.pantry.ternera!.expiry_kind, 'estimated');
  setPantryItem(state, { ingredientId: 'leche', location: 'nevera', openedAt: '2026-10-02' }, '2026-10-02');
  assert.equal(state.pantry.leche!.expiresAt, '2026-10-06');
  setPantryItem(state, { ingredientId: 'leche', expiresAt: '2026-10-30' }, '2026-10-02');
  assert.deepEqual([state.pantry.leche!.expiry_kind, state.pantry.leche!.expiresAt], ['exact', '2026-10-30']);
});

test('leftovers become a pantry item with an estimated 3-day expiry', () => {
  const state = emptyKitchen();
  const out = addLeftovers(state, { recipeId: 'gazpacho', title: 'Gazpacho andaluz', servings: 2, makeId: 'm1' }, TODAY);
  assert.equal(out.expiresAt, '2026-10-05');
  const view = pantryView(state, TODAY).find((p) => p.ingredientId === out.ingredientId)!;
  assert.equal(view.name, 'Sobras: Gazpacho andaluz');
  assert.deepEqual([view.qty, view.unit, view.expiry_kind], [2, 'ración', 'estimated']);
  addLeftovers(state, { recipeId: 'gazpacho', title: 'Gazpacho andaluz', servings: 1 }, TODAY);
  assert.equal(state.shopping.find((i) => i.ingredientId === out.ingredientId)!.qty, 3);
});

test('costs: median of the last 90 days, last price per store, and the prices that are missing', () => {
  const state = emptyKitchen();
  const point = (ingredientId: string, store: string, date: string, unit_price: number, price_unit: 'kg' | 'L' | 'ud') =>
    state.priceBook.push({ id: `${ingredientId}${date}${store}`, ingredientId, store, date, unit_price, price_unit, source: 'ticket' });
  point('tomato', 'A', '2026-09-20', 2, 'kg'); point('tomato', 'A', '2026-09-25', 3, 'kg'); point('tomato', 'B', '2026-09-28', 4, 'kg'); point('tomato', 'A', '2025-01-01', 9, 'kg');
  point('egg', 'A', '2026-09-20', 0.25, 'ud');
  assert.equal(priceFor(state, 'tomato', TODAY)!.unit_price, 3);
  assert.equal(priceFor(state, 'tomato', TODAY, { mode: 'last' })!.unit_price, 4);
  assert.deepEqual([priceFor(state, 'tomato', TODAY, { store: 'A' })!.unit_price, priceFor(state, 'tomato', TODAY, { store: 'A' })!.basis], [3, 'store_last']);
  const recipe: Recipe = { id: 'r', authorId: 'local', title: 'Prueba', servings: 2, createdAt: TODAY, steps: [{ text: 'x' }], ingredients: [
    { ingredientId: 'tomato', quantity: 500, unit: 'g' }, { ingredientId: 'egg', quantity: 4 }, { ingredientId: 'lentil', quantity: 200, unit: 'g' },
    { ingredientId: 'salt' }, { ingredientId: 'onion', quantity: 2 }] };
  const cost = recipeCost(state, recipe, TODAY);
  assert.equal(cost.total, 2.5, '0,5 kg x 3 + 4 x 0,25');
  assert.equal(cost.per_serving, 1.25);
  assert.deepEqual(cost.missing_prices, ['Lentejas', 'Cebolla']);
  assert.equal(cost.complete, false);
  assert.ok(cost.uncosted.includes('Sal'));
  assert.equal(recipeCost(state, recipe, TODAY, { servings: 4 }).total, 5);
  point('onion', 'A', '2026-09-20', 1.2, 'kg');
  const withOnion = recipeCost(state, recipe, TODAY);
  const onionLine = withOnion.lines.find((l) => l.ingredientId === 'onion')!;
  assert.equal(onionLine.approx, true, 'units converted through the typical weight are marked approximate');
  assert.equal(onionLine.cost, 0.36);
});

test('what to cook: filters, expiring first, recent dishes avoided and leftovers offered', () => {
  const state = emptyKitchen();
  const recipes: Recipe[] = SEED_RECIPES;
  for (const id of ['tomato', 'cucumber', 'green_pepper', 'garlic', 'bread']) setPantryItem(state, { ingredientId: id, qty: 1, unit: 'kg' }, TODAY);
  const q = whatToCook(state, recipes, { only_have: true, month: 7 }, TODAY);
  assert.equal(q.options[0]!.recipe_id, 'gazpacho');
  assert.ok(q.options.every((o) => o.missing.length === 0));
  assert.match(q.options[0]!.reasons[0]!, /Tienes todos/);
  const none = whatToCook(state, recipes, { max_minutes: 1 }, TODAY);
  assert.ok(none.options.length < q.options.length + 5);
  assert.ok(none.excluded.tiempo! >= 1);
  state.makes.push({ id: 'm1', recipeId: 'gazpacho', authorId: 'local', createdAt: '2026-10-01T20:00:00.000Z', rating: 5 });
  const recent = whatToCook(state, recipes, { only_have: true, month: 7, avoid_days: 3 }, TODAY);
  assert.ok(!recent.options.some((o) => o.recipe_id === 'gazpacho'));
  const allowed = whatToCook(state, recipes, { only_have: true, month: 7, avoid_days: 0 }, TODAY);
  assert.equal(allowed.options[0]!.recipe_id, 'gazpacho');
  state.pantry.tomato = { ...state.pantry.tomato!, expiresAt: '2026-10-03', expiry_kind: 'exact' };
  const expiring = whatToCook(state, recipes, { month: 7, avoid_days: 0 }, TODAY);
  assert.ok(expiring.options[0]!.uses_expiring.includes('Tomate'));
  const vegan = whatToCook(state, recipes, { diet: ['vegano'] }, TODAY);
  assert.ok(!vegan.options.some((o) => o.recipe_id === 'lentejas'), 'chorizo makes the lentils not vegan');
  const noGluten = whatToCook(state, recipes, { avoid_allergens: ['gluten'] }, TODAY);
  assert.ok(!noGluten.options.some((o) => o.recipe_id === 'gazpacho'));
  addLeftovers(state, { recipeId: 'lentejas', title: 'Lentejas estofadas', servings: 2 }, TODAY);
  assert.equal(whatToCook(state, recipes, {}, TODAY).leftovers[0]!.type, 'leftover');
  assert.ok(recipeTraits(SEED_RECIPES.find((r) => r.id === 'gazpacho')!).diet.includes('vegano'));
});

test('subtitles: rolling auto-captions are collapsed and spoken amounts are read', () => {
  const vtt = `WEBVTT\nKind: captions\n\n00:00:00.000 --> 00:00:03.000 align:start\nhoy hacemos <c>unas tortitas</c>\n\n00:00:03.000 --> 00:00:06.000\nhoy hacemos unas tortitas\necho 200 gramos de harina\n\n00:00:06.000 --> 00:00:09.000\necho 200 gramos de harina\ndos huevos y una cucharada de azúcar\n\n00:00:09.000 --> 00:00:12.000\nmezclamos todo y cocinamos 2 minutos por cada lado\n`;
  const text = subtitleText(vtt);
  assert.equal(text.split('\n').length, 4);
  assert.deepEqual(spokenIngredients(text).map((i) => [i.quantity, i.unit, i.name]), [[200, 'g', 'harina'], [2, null, 'huevos'], [1, 'cda', 'azúcar']]);
  assert.equal(spokenSteps(text).find((s) => s.timerSec)?.timerSec, 120);
  assert.equal(subtitleText(JSON.stringify({ events: [{ segs: [{ utf8: 'hola ' }, { utf8: 'mundo' }] }] })), 'hola mundo');
});

test('platforms and video links', () => {
  assert.equal(platformOf('https://www.instagram.com/reel/AbC/'), 'instagram');
  assert.equal(platformOf('https://vm.tiktok.com/xyz'), 'tiktok');
  assert.equal(platformOf('https://youtu.be/abc'), 'youtube');
  assert.equal(looksLikeVideoUrl('https://www.instagram.com/reel/AbC/'), true);
  assert.equal(looksLikeVideoUrl('https://www.youtube.com/shorts/abc'), true);
  assert.equal(looksLikeVideoUrl('https://example.com/receta'), false);
  assert.equal(looksLikeVideoUrl('https://www.instagram.com/some_user/'), false);
});

test('drafts: caption first, subtitles complete it, evidence and confidence are kept', () => {
  const caption = 'Tortitas esponjosas 😍\nIngredientes:\n- 200 g de harina\n- 2 huevos\n- Leche\n- 1 pizca de sal\nPreparación:\n1. Mezcla todo.\n2. Cocina 2 minutos por lado.';
  const subtitles = 'echamos 250 ml de leche\nmezclamos bien';
  const d = buildDraft({ kind: 'video', id: 'd1', now: TODAY, title: 'Tortitas', sources: { caption, subtitles }, media: { platform: 'instagram', uploader: 'cuenta_ejemplo' } });
  assert.equal(d.ingredients.length, 4);
  assert.equal(d.ingredients[0]!.evidence!.source, 'caption');
  const milk = d.ingredients.find((i) => i.name === 'Leche')!;
  assert.deepEqual([milk.quantity, milk.unit], [250, 'ml'], 'a quantity missing in the caption is read from the subtitles');
  assert.equal(milk.evidence!.source, 'caption');
  assert.match(milk.note!, /subtitles/);
  assert.equal(d.steps.length, 2);
  assert.ok(d.confidence.score > 0.6);
  assert.deepEqual(d.confidence.missing, ['raciones']);
  assert.ok(hasUsableIngredientList(caption));
  assert.ok(!hasUsableIngredientList('Qué rica estaba esta tarta, la repetiré seguro #tarta'));
});

test('model output only fills gaps and every line says whether its evidence was found in the text', () => {
  const d = buildDraft({ kind: 'video', id: 'd2', now: TODAY, title: 'Crema', sources: { transcript: 'ponemos dos puerros y una patata, añadimos medio litro de caldo y cocemos veinte minutos' } });
  const llm = { servings: 2, ingredients: [
    { name: 'puerros', quantity: 2, unit: 'ud', evidence: 'dos puerros' },
    { name: 'caldo', quantity: 0.5, unit: 'L', evidence: 'medio litro de caldo' },
    { name: 'nata', quantity: 100, unit: 'ml', evidence: 'cien mililitros de nata' }],
    steps: [{ text: 'Cocer 20 minutos', evidence: 'cocemos veinte minutos' }] };
  mergeLlm(d, llm);
  const nata = d.ingredients.find((i) => i.name === 'nata')!;
  assert.equal(nata.evidence!.verified, false);
  assert.equal(nata.quantity, null, 'a quantity without evidence in the text is not accepted');
  assert.ok(d.confidence.notes.some((n) => /modelo/.test(n)));
  assert.equal(d.servings, 2);
  assert.equal(d.status_notes.model?.startsWith('used'), true);
});

test('accepting a draft makes a recipe, creating new user ingredients and keeping steps with timers', () => {
  const d = buildDraft({ kind: 'text', id: 'd3', now: TODAY, title: 'Salsa rara', sources: { text: 'Salsa rara\nIngredientes\n- 100 g de zumbaflor\n- 2 huevos\nPreparación\n1. Mezcla y cuece 10 minutos a 180º.' } });
  const { recipe, newIngredients } = draftToRecipe(d, { servings: 3 }, 'local-1', TODAY, {});
  assert.equal(recipe.servings, 3);
  assert.equal(newIngredients.length, 1);
  assert.equal(newIngredients[0]!.name, 'Zumbaflor');
  assert.equal(recipe.ingredients[0]!.ingredientId, 'zumbaflor');
  assert.equal(recipe.ingredients[1]!.ingredientId, 'egg');
  assert.deepEqual([recipe.steps[0]!.timerSec, recipe.steps[0]!.temperatureC], [600, 180]);
});
