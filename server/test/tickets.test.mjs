import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../tools/index.mjs';
import { readKitchen } from '../store.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';
import { TICKET_ROWS, TICKET_MERCADONA, TICKET_DISCOUNT, TICKET_WRAPPED } from '../../packages/core/test/fixtures.ts';

const setup = (t, options) => { const s = scratch(); fixedClock(); const hub = fakeHub(options); t.after(() => s.done()); return hub; };

test('a pasted ticket fills the pantry with estimated expiry, the price book, and ignores what is not food', async (t) => {
  setup(t);
  const result = await callTool('ticket_import_text', { text: TICKET_ROWS });
  assert.equal(result.duplicate, false);
  assert.equal(result.ticket.date, '2026-09-04');
  assert.equal(result.ticket.total, 13.73);
  assert.equal(result.ticket.applied, 6);
  assert.equal(result.ticket.ignored, 2, 'bag and detergent are not food');
  assert.equal(result.review_needed, 0);
  const pantry = await callTool('pantry_list', {});
  const milk = pantry.items.find((i) => i.id === 'leche');
  assert.equal(milk.expiry_kind, 'estimated');
  assert.ok(milk.expiry_basis, 'an estimate says what it is based on');
  assert.equal(pantry.items.find((i) => i.id === 'banana').qty, 0.456);
  assert.equal(pantry.items.find((i) => i.id === 'banana').unit, 'kg');
  const prices = await callTool('price_book', { query: 'plátano' });
  assert.equal(prices.items[0].price_unit, 'kg');
  assert.equal(prices.items[0].last.unit_price, 2.98);
  assert.equal(readKitchen().tickets.length, 1);
  const again = await callTool('ticket_import_text', { text: TICKET_ROWS });
  assert.equal(again.duplicate, true);
  assert.equal(readKitchen().tickets.length, 1, 'the same ticket is imported once');
  assert.equal(readKitchen().priceBook.length, 6);
});

test('unmatched lines wait in the review queue with the model’s suggestion, never applied by themselves', async (t) => {
  const hub = setup(t, { chat: () => ({ ok: true, text: '', json: { lines: [{ raw: 'ZZQ KRL 2,00', name: 'pechuga de pollo', food: true }, { raw: 'XPT BRC 3,10', name: null, food: true }] } }) });
  const text = `MERCADONA\n05/09/2026\nXPT BRC 3,10\nZZQ KRL 2,00\nLECHE ENTERA 1L 0,95\nTOTAL 6,05`;
  const result = await callTool('ticket_import_text', { text });
  assert.equal(result.ticket.store, 'Mercadona');
  assert.equal(result.review_needed, 2);
  assert.equal(hub.log.chats.length, 1);
  assert.deepEqual(JSON.parse(hub.log.chats[0].messages[1].content).length, 2);
  const queue = await callTool('ticket_review_list', {});
  assert.equal(queue.count, 2);
  const chicken = queue.lines.find((l) => /ZZQ/.test(l.raw));
  assert.equal(chicken.suggestion.name, 'pechuga de pollo');
  assert.equal(chicken.suggestion.via, 'model');
  assert.ok(!(await callTool('pantry_list', {})).items.some((i) => /pollo/i.test(i.name)), 'a suggestion does not touch the pantry');
  // confirm: the abbreviation is learned and the next ticket matches by itself
  const mapped = await callTool('ticket_line_map', { ticket_id: chicken.ticket_id, line_id: chicken.id, ingredient: 'pechuga de pollo' });
  assert.equal(mapped.status, 'applied');
  assert.equal(mapped.review_left, 1);
  assert.ok((await callTool('pantry_list', {})).items.some((i) => /pollo/i.test(i.name)));
  const next = await callTool('ticket_import_text', { text: `MERCADONA\n12/09/2026\nZZQ KRL 2,20\nTOTAL 2,20` });
  assert.equal(next.ticket.applied, 1);
  assert.equal(next.ticket.lines[0].via, 'learned');
  // ignore always
  const rest = (await callTool('ticket_review_list', {})).lines[0];
  const ignored = await callTool('ticket_line_map', { ticket_id: rest.ticket_id, line_id: rest.id, ignore_always: true });
  assert.equal(ignored.status, 'ignored');
  assert.equal(ignored.review_left, 0);
  const third = await callTool('ticket_import_text', { text: `MERCADONA\n13/09/2026\nXPT BRC 3,10\nLECHE ENTERA 1L 0,95\nTOTAL 4,05` });
  assert.equal(third.ticket.lines.find((l) => /XPT/.test(l.raw)).status, 'ignored');
  await assert.rejects(callTool('ticket_line_map', { ticket_id: 'nope', line_id: 'L1', ignore: true }), /Ticket no encontrado/);
});

test('without a model the queue is still there and says why there are no suggestions', async (t) => {
  setup(t);
  const result = await callTool('ticket_import_text', { text: `LIDL\n05/09/2026\nZZQ KRL 2,00\nLECHE ENTERA 1L 0,95\nTOTAL 2,95` });
  assert.equal(result.review_needed, 1);
  assert.ok(result.ticket.warnings.some((w) => /Sin sugerencias del modelo/.test(w)));
});

test('other layouts: discounts, weighed lines, wrapped descriptions and frozen food', async (t) => {
  setup(t);
  const lidl = await callTool('ticket_import_text', { text: TICKET_DISCOUNT });
  assert.equal(lidl.ticket.lines.find((l) => l.ingredient_id === 'agua_envasada').total, 1.75, 'the discount is taken off the line it follows');
  assert.ok(lidl.added_to_pantry.some((a) => a.ingredient_id === 'banana' && a.unit === 'kg'));
  const carrefour = await callTool('ticket_import_text', { text: TICKET_WRAPPED });
  const names = carrefour.added_to_pantry.map((a) => a.name.toLowerCase());
  assert.ok(names.some((n) => /pollo|pechuga/.test(n)));
  const ice = carrefour.added_to_pantry.find((a) => /helado/i.test(a.name));
  if (ice) assert.equal(ice.location, 'congelador');
  await callTool('ticket_import_text', { text: TICKET_MERCADONA });
  assert.equal(readKitchen().tickets.length, 3);
  const list = await callTool('tickets_list', {});
  assert.equal(list.count, 3);
  const one = await callTool('tickets_list', { ticket_id: list.tickets[0].id });
  assert.ok(one.ticket.lines.length > 0);
  await assert.rejects(callTool('ticket_import_text', { text: 'hola qué tal todo bien' }), /No se ha reconocido ninguna línea/);
});

test('a ticket file goes through Kafka (filed, read back) and Kafka being down is explained', async (t) => {
  let filed;
  setup(t, { calls: {
    'kafka.doc_add_file': (args) => { filed = args; return { created: 1, documents: [{ id: 'd_test1', kind: 'receipt' }] }; },
    'kafka.doc_get': () => ({ document: { id: 'd_test1', file_name: 'ticket.pdf' }, pages: [{ page: 1, text: TICKET_ROWS }] }) } });
  const result = await callTool('ticket_import_file', { path: '/tmp/cookhoard-fixtures/ticket.pdf' });
  assert.equal(filed.path, '/tmp/cookhoard-fixtures/ticket.pdf');
  assert.equal(filed.kind, 'receipt');
  assert.equal(result.status, 'imported');
  assert.equal(result.doc_id, 'd_test1');
  assert.equal(result.ticket.doc_id, 'd_test1');
  assert.equal(result.ticket.file, 'ticket.pdf');
  assert.equal(result.ticket.source, 'file');
  assert.equal(result.ticket.applied, 6);
});

test('Kafka unreachable or unable to read the photo: clear status, nothing invented', async (t) => {
  const hub = setup(t, { down: true });
  const down = await callTool('ticket_import_file', { path: '/tmp/x.pdf' });
  assert.equal(down.status, 'kafka_unavailable');
  assert.match(down.why, /Hoard Hub/);
  assert.match(down.why, /ticket_import_text/);
  fakeHub({ calls: { 'kafka.doc_add_file': () => ({ created: 1, documents: [{ id: 'd_2' }] }), 'kafka.doc_get': () => ({ pages: [{ page: 1, text: '' }] }) } });
  const empty = await callTool('ticket_import_file', { path: '/tmp/x.jpg' });
  assert.equal(empty.status, 'no_text');
  assert.equal(readKitchen().tickets.length, 0);
  assert.ok(hub.log.calls.length >= 1);
});

test('receipts Kafka read from the mail: only supermarkets, only new ones', async (t) => {
  const docs = [
    { id: 'd_a', kind: 'receipt', issuer: 'Mercadona', source: 'mail', issue_date: '2026-09-08' },
    { id: 'd_b', kind: 'receipt', issuer: 'Gasolinera Ejemplo', source: 'mail', issue_date: '2026-09-08' },
    { id: 'd_c', kind: 'receipt', issuer: 'Mercadona', source: 'upload', issue_date: '2026-09-01' }];
  setup(t, { calls: { 'kafka.docs_list': () => ({ documents: docs, count: 3 }),
    'kafka.doc_get': ({ doc }) => ({ document: { id: doc }, pages: [{ page: 1, text: TICKET_MERCADONA }] }) } });
  const first = await callTool('ticket_import_mail', {});
  assert.equal(first.status, 'ok');
  assert.equal(first.considered, 1);
  assert.equal(first.imported[0].doc_id, 'd_a');
  assert.equal(first.imported[0].applied, 6);
  const second = await callTool('ticket_import_mail', {});
  assert.equal(second.considered, 0, 'already imported');
  assert.equal(readKitchen().tickets.length, 1);
});
