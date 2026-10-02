// Pack sizes written in product names, and the store name read from the ticket header. Tickets are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTicket, extractPack, purchaseAmounts, storeFromHeader } from '../src/index.ts';

const wrap = (body: string, head = 'SUPERMERCADO EJEMPLO S.A.\nC/ Mayor 12, 28001 Madrid\nNIF A12345678\n02/10/2026 18:32\nDESCRIPCION P.UNIT IMPORTE') => `${head}\n${body}\nTOTAL 9,99`;
const first = (body: string) => parseTicket(wrap(body)).lines[0]!;

test('pack sizes in names: kg, g, L, ml, cl, units, packs and multipacks', () => {
  const sizes: Array<[string, unknown]> = [
    ['PATATA MALLA 3 KG', { count: 1, qty: 3, unit: 'kg' }],
    ['ARROZ 500 G', { count: 1, qty: 500, unit: 'g' }],
    ['ARROZ 500GR', { count: 1, qty: 500, unit: 'g' }],
    ['LECHE 1L', { count: 1, qty: 1, unit: 'L' }],
    ['LECHE 1 L', { count: 1, qty: 1, unit: 'L' }],
    ['LECHE 1,5L', { count: 1, qty: 1.5, unit: 'L' }],
    ['COLA 330 ML', { count: 1, qty: 330, unit: 'ml' }],
    ['VINO 75 CL', { count: 1, qty: 750, unit: 'ml' }],
    ['HUEVOS 12 UDS', { count: 12, qty: 1, unit: 'ud' }],
    ['YOGUR PACK 6', { count: 6, qty: 1, unit: 'ud' }],
    ['YOGUR X6', { count: 6, qty: 1, unit: 'ud' }],
    ['YOGUR 6X125G', { count: 6, qty: 125, unit: 'g' }],
    ['YOGUR 6 X 125 G', { count: 6, qty: 125, unit: 'g' }],
    ['YOGUR 125G X6', { count: 6, qty: 125, unit: 'g' }],
    ['AGUA 6X1,5L', { count: 6, qty: 1.5, unit: 'L' }],
    ['AGUA 1,5L PACK 6', { count: 6, qty: 1.5, unit: 'L' }],
  ];
  for (const [name, pack] of sizes) assert.deepEqual(extractPack(name).pack, pack, name);
  assert.equal(extractPack('PATATA MALLA 3 KG').name, 'PATATA MALLA');
  assert.equal(extractPack('YOGUR 6X125G').name, 'YOGUR');
  assert.equal(extractPack('HUEVOS L 12').pack, null, 'a bare number is not a size');
  assert.equal(extractPack('PAN BIMBO').pack, null);
});

test('a ticket line keeps its pack, with or without a leading count, a currency sign or a tax letter', () => {
  for (const line of ['1 PATATA MALLA 3 KG 3,49', 'PATATA MALLA 3 KG 3,49', '1 PATATA MALLA 3KG 3,49 A', '1 PATATA MALLA 3 KG 3,49 €', '1 PATATA MALLA 3 KG\n3,49']) {
    const l = first(line);
    assert.deepEqual([l.name, l.qty, l.total, l.pack], ['PATATA MALLA', 1, 3.49, { count: 1, qty: 3, unit: 'kg' }], line);
  }
  const yogurt = first('6X125G YOGUR NATURAL 1,99');
  assert.deepEqual([yogurt.name, yogurt.pack], ['YOGUR NATURAL', { count: 6, qty: 125, unit: 'g' }], 'the leading 6 is a pack count, not a line count');
});

test('the pantry quantity and the unit price use the pack size times the line quantity', () => {
  assert.deepEqual(purchaseAmounts({ qty: 1, unit: 'ud', total: 3.49, pack: { count: 1, qty: 3, unit: 'kg' } }), { qty: 3, unit: 'kg', price: { unit_price: 1.16, price_unit: 'kg' } });
  const tomato = first('2 TOMATE TRITURADO 400G 0,79 1,58');
  assert.equal(tomato.qty, 2);
  const got = purchaseAmounts(tomato);
  assert.deepEqual([got.qty, got.unit, got.price!.unit_price, got.price!.price_unit], [0.8, 'kg', 1.98, 'kg']);
  assert.deepEqual(purchaseAmounts({ qty: 1, unit: 'ud', total: 1.99, pack: { count: 6, qty: 125, unit: 'g' } }).qty, 0.75, '6x125 g is 750 g');
  assert.deepEqual(purchaseAmounts({ qty: 2, unit: 'ud', total: 3.0, pack: { count: 6, qty: 1, unit: 'ud' } }), { qty: 12, unit: 'ud', price: { unit_price: 0.25, price_unit: 'ud' } });
  assert.deepEqual(purchaseAmounts({ qty: 3, unit: 'ud', total: 2.7, pack: null }), { qty: 3, unit: 'ud', price: { unit_price: 0.9, price_unit: 'ud' } });
});

test('the store comes from the header when no known supermarket matches', () => {
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89')).store, 'Supermercado Ejemplo');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', 'DISTRIBUCIONES LA HUERTA, S.L.U.\nCALLE ANCHA 4\n02/10/2026')).store, 'Distribuciones La Huerta');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', 'HIPERMERCADO DEL VALLE\nAVDA. PRUEBA 3 28000\nCIF B12345678\n02/10/2026')).store, 'Hipermercado Del Valle');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', 'FRUTERIA PEPE\nNIF/CIF 12345678Z\n02/10/2026')).store, 'Fruteria Pepe', 'shouting letters count when a tax id follows');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', 'SUPERMERCADO EJEMPLO, S.A.   A-00000000\nC/ DE PRUEBA 1 00000 CIUDAD\n04/09/2026 19:32')).store, 'Supermercado Ejemplo');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', 'MERCADONA, S.A.\nC/ PRUEBA 1\n02/10/2026')).store, 'Mercadona', 'a known supermarket still wins');
  assert.equal(parseTicket(wrap('1 LECHE 1L 0,89', '02/10/2026 18:32\nDESCRIPCION P.UNIT IMPORTE')).store, null, 'no header, no store');
  assert.equal(parseTicket('LECHE ENTERA 1L 0,89\nPAN BARRA 0,60\nTOTAL 1,49').store, null, 'product lines are never taken for the store');
  assert.equal(storeFromHeader(['PLATANOS', '0,456 kg x 2,99 EUR/kg 1,36']), null);
  assert.equal(storeFromHeader(['TICKET DE COMPRA', 'FACTURA SIMPLIFICADA', '02/10/2026']), null);
});
