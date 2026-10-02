// Supermarket tickets: text (pasted, OCR from Kafka, mail receipts) → lines → pantry, price book and a review queue.
// Matching is by rules and learned aliases only; the local model may suggest a name for unmatched lines but a person confirms it.
import crypto from 'node:crypto';
import {
  parseTicket, matchTicketLines, purchaseAmounts, applyTicketLine, resolveName, resolveOrCreate, aliasKey, fold, getSettings, pantryView, reconcilePantry,
} from '@cookhoard/core';
import { readKitchen, updateKitchen } from './store.mjs';
import { nowIso, today } from './clock.mjs';
import { ask, callApp, whyFailed } from './hub.mjs';
import { docsExtract } from './hoard-commons/fam-services.js';
import { fail, lexOf, nameOf } from './tools/common.mjs';

const SUGGEST_SCHEMA = { type: 'object', properties: { lines: { type: 'array', items: { type: 'object',
  properties: { raw: { type: 'string' }, name: { type: ['string', 'null'] }, food: { type: 'boolean' } }, required: ['raw', 'food'] } } }, required: ['lines'] };

const hashOf = (text) => crypto.createHash('sha256').update(fold(text).replace(/[^a-z0-9]+/g, ' ').trim()).digest('hex').slice(0, 24);

/** Ask the local model what the unmatched ticket abbreviations are. Suggestions only; returns a Map raw → suggestion. */
async function suggestions(queued, lex) {
  const out = new Map();
  if (!queued.length) return { map: out, note: null };
  const answer = await ask({ capability: 'llm', json: SUGGEST_SCHEMA, effort: 'low', maxTokens: 1500, timeoutMs: 120000, messages: [
    { role: 'system', content: 'Eres un asistente que interpreta abreviaturas de tickets de supermercado españoles. Para cada línea indica el nombre genérico del ingrediente o producto en castellano (por ejemplo "PECH POLLO FIL" → "pechuga de pollo") y si es comida o bebida (food). Si no estás seguro, name null. Responde SOLO con JSON.' },
    { role: 'user', content: JSON.stringify(queued.map((line) => line.raw)) }] });
  if (!answer.ok || !Array.isArray(answer.json?.lines)) return { map: out, note: answer.ok ? 'respuesta del modelo no válida' : answer.why };
  for (const entry of answer.json.lines) {
    if (!entry?.raw) continue;
    const found = entry.name ? resolveName(entry.name, lex) : { id: null };
    out.set(fold(entry.raw), { ingredient_id: found.id ?? null, name: entry.name ?? null, food: entry.food !== false, via: 'model' });
  }
  return { map: out, note: null };
}

/** What a line adds to the pantry and what it costs per kg, L or unit once the pack size in its name is counted. */
const normalised = (line) => {
  if (line.status === 'discount' || line.total == null) return {};
  const got = purchaseAmounts({ qty: line.qty, unit: line.unit, total: line.total, pack: line.pack ?? null });
  return { pantry_qty: got.qty, pantry_unit: got.unit, ...(got.price ? { price: got.price.unit_price, price_unit: got.price.price_unit } : {}) };
};

const lineView = (line, state) => ({ id: line.id, raw: line.raw, name: line.name, qty: line.qty, unit: line.unit, total: line.total, status: line.status,
  ...(line.pack ? { pack: line.pack } : {}), ...normalised(line), ingredient_id: line.ingredientId ?? null, ingredient: line.ingredientId ? nameOf(state, line.ingredientId) : null, via: line.via ?? null,
  ...(line.suggestion ? { suggestion: line.suggestion } : {}) });

export function ticketView(ticket, state, { lines = true } = {}) {
  const count = (status) => ticket.lines.filter((line) => line.status === status).length;
  return { id: ticket.id, store: ticket.store, date: ticket.date, total: ticket.total, source: ticket.source, doc_id: ticket.docId ?? null, file: ticket.fileName ?? null,
    applied: count('applied'), queued: count('queued'), ignored: count('ignored'), discounts: count('discount'), warnings: ticket.warnings,
    ...(lines ? { lines: ticket.lines.map((line) => lineView(line, state)) } : {}) };
}

export async function importTicketText(text, { store, date, source = 'text', docId, fileName, useModel = true } = {}) {
  const input = String(text ?? '');
  if (input.trim().length < 12) fail('El ticket está vacío o es demasiado corto.');
  const hash = hashOf(input);
  const before = readKitchen();
  const duplicate = before.tickets.find((t) => t.hash === hash);
  if (duplicate) return { duplicate: true, ticket: ticketView(duplicate, before), added_to_pantry: [] };
  const settings = getSettings(before);
  const parsed = parseTicket(input, { stores: settings.supermarkets });
  if (!parsed.lines.length) fail('No se ha reconocido ninguna línea de compra en el texto. Pega el ticket con una línea por producto.');
  const lex = lexOf(before);
  const matched = matchTicketLines(parsed.lines, lex, before.ignoredTerms);
  const hint = useModel ? await suggestions(matched.filter((line) => line.status === 'queued'), lex) : { map: new Map(), note: 'desactivado' };
  const id = `ticket-${crypto.randomUUID().slice(0, 8)}`;
  const added = [];
  const state = updateKitchen((current) => {
    const ticket = { id, source, store: store ?? parsed.store, date: date ?? parsed.date ?? today(), total: parsed.total, ...(docId ? { docId } : {}), ...(fileName ? { fileName } : {}),
      hash, importedAt: nowIso(), warnings: [...parsed.warnings], lines: [] };
    matched.forEach((line, index) => {
      const record = { id: `L${index + 1}`, raw: line.raw, name: line.name, qty: line.qty, unit: line.unit, unit_price: line.unit_price, total: line.total,
        ...(line.pack ? { pack: line.pack } : {}), ...(line.frozen ? { frozen: true } : {}), ingredientId: null, via: line.via, status: line.status };
      if (line.status === 'queued') { const s = hint.map.get(fold(line.raw)); if (s) record.suggestion = s; }
      if (line.status === 'applied') {
        const result = applyTicketLine(current, ticket, record, line.ingredientId, today());
        added.push({ ingredient_id: line.ingredientId, name: nameOf(current, line.ingredientId), qty: result.added.qty, unit: result.added.unit });
      }
      ticket.lines.push(record);
    });
    if (hint.note && matched.some((line) => line.status === 'queued')) ticket.warnings.push(`Sin sugerencias del modelo: ${hint.note}`);
    current.tickets.unshift(ticket);
    reconcilePantry(current);
    return current;
  });
  const ticket = state.tickets[0];
  const view = pantryView(state, today());
  return { duplicate: false, ticket: ticketView(ticket, state),
    added_to_pantry: added.map((a) => { const p = view.find((v) => v.ingredientId === a.ingredient_id); return { ...a, location: p?.location, expiresAt: p?.expiresAt ?? null, expiry_kind: p?.expiry_kind ?? null }; }),
    review_needed: ticket.lines.filter((line) => line.status === 'queued').length };
}

/** Review queue: every unmatched line of every ticket. */
export function reviewQueue(state) {
  const rows = [];
  for (const ticket of state.tickets) for (const line of ticket.lines) {
    if (line.status === 'queued') rows.push({ ticket_id: ticket.id, store: ticket.store, date: ticket.date, ...lineView(line, state) });
  }
  return rows;
}

/** Resolve one queued line: map it to an ingredient (optionally remembering the alias), or ignore it once / always. */
export function mapTicketLine({ ticket_id, line_id, ingredient, ignore, ignore_always, learn = true, create = true }) {
  let result;
  const state = updateKitchen((current) => {
    const ticket = current.tickets.find((t) => t.id === ticket_id) || fail('Ticket no encontrado.');
    const line = ticket.lines.find((l) => l.id === line_id) || fail('Línea no encontrada.');
    if (line.status === 'applied') fail('Esa línea ya está aplicada a la despensa.');
    if (ignore || ignore_always) {
      line.status = 'ignored';
      delete line.suggestion;
      if (ignore_always) { const key = aliasKey(line.name); if (key && !current.ignoredTerms.includes(key)) current.ignoredTerms.push(key); }
      result = { status: 'ignored', always: !!ignore_always };
      return current;
    }
    if (!ingredient) fail('Indica el ingrediente (ingredient) o ignore: true.');
    const lex = lexOf(current);
    let id = current.userIngredients.some((u) => u.id === ingredient) ? ingredient : null;
    if (!id) {
      const found = resolveOrCreate(String(ingredient), lex, { create, now: today() });
      if (found.created) current.userIngredients.push(found.created);
      id = found.created?.id ?? found.id;
    }
    if (!id) fail(`Ingrediente no reconocido: "${ingredient}".`);
    if (learn) current.learnedAliases[aliasKey(line.name)] = id;
    applyTicketLine(current, ticket, line, id, today());
    line.via = learn ? 'learned' : 'manual';
    delete line.suggestion;
    reconcilePantry(current);
    result = { status: 'applied', ingredient_id: id, learned: !!learn };
    return current;
  });
  const ticket = state.tickets.find((t) => t.id === ticket_id);
  return { ...result, ticket: ticketView(ticket, state), review_left: reviewQueue(state).length };
}

// ───────────────────────────── Kafka ─────────────────────────────

const pagesText = (document) => (document?.pages ?? []).map((page) => page.text ?? '').join('\n').trim();

/** The text of a receipt file: Kafka's stateless reader (the text layer, OCR for a scan), or, for a Kafka that has not got it yet, the old way: file it, read it back. */
async function readReceiptFile(path) {
  const read = await docsExtract(path, { ocr: 'auto', lang: 'es' });
  if (read.ok) return { text: String(read.text ?? '').trim() };
  if (read.kind !== 'tool_missing') return { failure: { status: 'kafka_unavailable', why: whyFailed('kafka', 'doc_extract', read) } };
  const filed = await callApp('kafka', 'doc_add_file', { path, kind: 'receipt' }, { timeoutMs: 180000 });
  if (!filed.ok) return { failure: { status: 'kafka_unavailable', why: filed.why } };
  const doc = filed.result?.documents?.[0];
  if (!doc?.id) return { failure: { status: 'kafka_no_document', why: 'Kafka no ha creado ningún documento con ese fichero.', detail: filed.result } };
  const back = await callApp('kafka', 'doc_get', { doc: doc.id, include_text: true }, { timeoutMs: 60000 });
  if (!back.ok) return { failure: { status: 'kafka_unavailable', why: back.why } };
  return { text: pagesText(back.result), docId: doc.id, fileName: back.result?.document?.file_name };
}

/** Read a receipt (PDF or photo) with Kafka and import it as a ticket. */
export async function importTicketFile(path, options = {}) {
  const got = await readReceiptFile(path);
  if (got.failure) {
    const { status, why } = got.failure;
    return { ...got.failure, ...(status === 'kafka_unavailable' ? { why: `${why} CookHoard lee los tickets en fichero a través de Kafka (OCR). Mientras tanto puedes pegar el texto con ticket_import_text.` } : {}) };
  }
  if (got.text.length < 20) return { status: 'no_text', ...(got.docId ? { doc_id: got.docId } : {}), why: 'Kafka no ha podido leer texto en el fichero (¿foto borrosa o sin OCR disponible?). Pega el texto con ticket_import_text.' };
  const fileName = got.fileName ?? String(path).split(/[\\/]/).pop();
  const imported = await importTicketText(got.text, { ...options, source: 'file', ...(got.docId ? { docId: got.docId } : {}), fileName });
  return { status: 'imported', ...(got.docId ? { doc_id: got.docId } : {}), ...imported };
}

/** Import supermarket receipts that Kafka already read from the mail account (ones not imported yet). */
export async function importTicketMail({ limit = 10, text = '' } = {}) {
  const state = readKitchen();
  const known = new Set(state.tickets.map((t) => t.docId).filter(Boolean));
  const stores = getSettings(state).supermarkets;
  const listed = await callApp('kafka', 'docs_list', { kind: 'receipt', ...(text ? { text } : {}), limit: 100 }, { timeoutMs: 60000 });
  if (!listed.ok) return { status: 'kafka_unavailable', why: `${listed.why} Los recibos del correo los lee Kafka.`, imported: [] };
  const docs = (listed.result?.documents ?? []).filter((d) => !known.has(d.id) && (d.source === 'mail' || d.source === 'email' || /mail|correo/i.test(String(d.source ?? '')))
    && stores.some((name) => fold(`${d.issuer ?? ''} ${d.title ?? ''}`).includes(fold(name))));
  const out = { status: 'ok', considered: docs.length, imported: [], skipped: [] };
  for (const doc of docs.slice(0, limit)) {
    const read = await callApp('kafka', 'doc_get', { doc: doc.id, include_text: true }, { timeoutMs: 60000 });
    const body = read.ok ? pagesText(read.result) : '';
    if (!body) { out.skipped.push({ doc_id: doc.id, why: read.ok ? 'sin texto' : read.why }); continue; }
    try {
      const done = await importTicketText(body, { source: 'mail', docId: doc.id, store: doc.issuer || undefined, date: doc.issue_date || undefined });
      out.imported.push({ doc_id: doc.id, ticket_id: done.ticket.id, store: done.ticket.store, date: done.ticket.date, applied: done.ticket.applied, queued: done.ticket.queued, duplicate: done.duplicate });
    } catch (error) { out.skipped.push({ doc_id: doc.id, why: error.message }); }
  }
  if (docs.length > limit) out.remaining = docs.length - limit;
  return out;
}
