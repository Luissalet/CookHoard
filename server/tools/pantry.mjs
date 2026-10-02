// Pantry places and expiry, the shopping list by supermarket section, and the user's ingredient dictionary.
import {
  PLACES, getSettings, pantryView, setPantryItem, sectionLabel, categoryOf, CATEGORIES, allIngredients, makeUserIngredient, resolveName, aliasKey,
  priceFor, lineCost, ingredientInfo, applyPurchase, reconcilePantry, round2, fold,
} from '@cookhoard/core';
import { readKitchen, updateKitchen } from '../store.mjs';
import { today } from '../clock.mjs';
import { z, fail, tool, lexOf, nameOf, ingredientRef } from './common.mjs';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa AAAA-MM-DD.');
const placeEnum = z.enum(PLACES);
const unitEnum = z.enum(['ud', 'L', 'kg', 'g', 'ml', 'ración']);

export function pantryList(state, { place, expiring_within_days } = {}) {
  const items = pantryView(state, today()).filter((p) => (!place || p.location === place) && (expiring_within_days === undefined || (p.days_left !== null && p.days_left <= expiring_within_days)));
  const counts = Object.fromEntries(PLACES.map((p) => [p, items.filter((i) => i.location === p).length]));
  return { today: today(), total: items.length, counts, items: items.map((p) => ({ id: p.ingredientId, name: p.name, section: p.section, location: p.location, qty: p.qty, unit: p.unit,
    expiresAt: p.expiresAt, expiry_kind: p.expiry_kind, expiry_basis: p.expiry_basis, days_left: p.days_left, level: p.level, opened_at: p.openedAt, added_at: p.addedAt,
    ...(p.leftover ? { leftover: p.leftover } : {}) })) };
}

/** The shopping list grouped by supermarket section, in the person's section order, with price estimates and copyable text. */
export function shoppingView(state) {
  const settings = getSettings(state);
  const lex = lexOf(state);
  const rows = state.shopping.filter((item) => !item.checked).map((item) => {
    const info = ingredientInfo(item.ingredientId, lex);
    const section = categoryOf(info.category).section;
    const price = priceFor(state, item.ingredientId, today());
    let estimate = null;
    if (price && item.qty && item.unit) {
      const cost = lineCost(item.qty, item.unit, price, info.unitWeightG);
      if (cost) estimate = { amount: round2(cost.cost), approx: cost.approx, basis: price.basis, store: price.store ?? null };
    } else if (price && !item.qty && price.price_unit === 'ud') estimate = { amount: round2(price.unit_price), approx: true, basis: price.basis, store: price.store ?? null };
    return { ingredient_id: item.ingredientId, name: item.name || info.name, qty: item.qty ?? null, unit: item.unit ?? null, section, section_label: sectionLabel(section, settings.lang),
      from_recipes: item.fromRecipes.length, price: price ? { unit_price: price.unit_price, price_unit: price.price_unit, basis: price.basis, date: price.date } : null, estimate };
  });
  const sections = settings.sections.map((id) => ({ id, label: sectionLabel(id, settings.lang), items: rows.filter((row) => row.section === id).sort((a, b) => a.name.localeCompare(b.name, 'es')) })).filter((s) => s.items.length);
  const fmt = (row) => `${row.name}${row.qty ? ` · ${String(row.qty).replace('.', ',')}${row.unit ? ` ${row.unit}` : ''}` : ''}`;
  const text = sections.map((s) => `${s.label}\n${s.items.map((row) => `[ ] ${fmt(row)}`).join('\n')}`).join('\n\n');
  const markdown = sections.map((s) => `### ${s.label}\n${s.items.map((row) => `- [ ] ${fmt(row)}`).join('\n')}`).join('\n\n');
  const priced = rows.filter((row) => row.estimate);
  return { count: rows.length, sections, text, markdown,
    estimate: { total: round2(priced.reduce((sum, row) => sum + row.estimate.amount, 0)), priced: priced.length, unpriced: rows.length - priced.length, approx: priced.some((row) => row.estimate.approx) } };
}

export const PANTRY_TOOLS = [
  tool({ name: 'pantry_list', readOnly: true, schema: z.object({ place: placeEnum.optional(), expiring_within_days: z.number().int().min(0).max(365).optional() }),
    description: 'List the pantry by place with quantity and expiry (exact or estimated). Qué hay en la nevera.\nEach item says whether its expiry date was typed (exact) or estimated from the shelf-life table and why. Optional place (nevera, despensa, congelador) and expiring_within_days.\nSinónimos: qué tengo, despensa, nevera, congelador, caducidades, qué caduca',
    run: ({ place, expiring_within_days }) => pantryList(readKitchen(), { place, expiring_within_days }) }),

  tool({ name: 'pantry_set', idempotent: true,
    schema: z.object({ ingredient: z.string().trim().min(1).max(100), place: placeEnum.optional(), qty: z.number().positive().nullable().optional(), unit: unitEnum.optional(),
      expires_at: day.optional(), estimate_expiry: z.boolean().optional(), opened: z.boolean().optional(), clear_expiry: z.boolean().optional(), note: z.string().max(200).optional() }),
    description: 'Put an ingredient in the pantry or change its place, quantity, opened state or expiry. Guardar.\nA date in expires_at is exact; without it an estimate is made from the place (a change of place or opening restarts the clock). opened: true marks the pack as opened today. The result returns the item with its expiry kind and basis.\nSinónimos: guardar en el congelador, he abierto, abierto hoy, mover a la nevera, caduca el, cuánto dura',
    run: ({ ingredient, place, qty, unit, expires_at, estimate_expiry, opened, clear_expiry, note }) => {
      let id;
      const state = updateKitchen((current) => {
        id = ingredientRef(current, ingredient, { create: true });
        setPantryItem(current, { ingredientId: id, location: place, qty, unit, expiresAt: expires_at, estimateExpiry: estimate_expiry, openedAt: opened ? today() : undefined, clearExpiry: clear_expiry, note }, today());
        reconcilePantry(current);
        return current;
      });
      return { item: pantryList(state).items.find((item) => item.id === id) };
    } }),

  tool({ name: 'shopping_list', readOnly: true, schema: z.object({}),
    description: 'The shopping list by supermarket section, with a price estimate and ready-to-copy text. Lista de la compra.\nSections follow the order set in Ajustes. Estimates use the learned price book and say when they are approximate or missing.\nSinónimos: lista de la compra, qué tengo que comprar, copiar la lista, lista por pasillos, cuánto costará la compra',
    run: () => shoppingView(readKitchen()) }),

  tool({ name: 'shopping_mark_bought', schema: z.object({ items: z.array(z.object({ ingredient: z.string().trim().min(1).max(100), qty: z.number().positive().optional(), unit: unitEnum.optional(),
    price: z.number().positive().optional(), store: z.string().max(60).optional() })).min(1).max(100) }),
    description: 'Mark shopping-list items as bought; they enter the pantry with an estimated expiry. Ya comprado.\nqty and unit replace the list amount; price is the total paid for that line and feeds the price book.\nSinónimos: ya he comprado, marcar como comprado, tachar de la lista, llegué del súper',
    run: ({ items }) => {
      const bought = [];
      const state = updateKitchen((current) => {
        for (const entry of items) {
          const id = ingredientRef(current, entry.ingredient, { create: true });
          const listed = current.shopping.find((item) => item.ingredientId === id);
          let qty = entry.qty ?? listed?.qty ?? 1;
          let unit = entry.unit ?? listed?.unit ?? 'ud';
          if (unit === 'g') { qty /= 1000; unit = 'kg'; } else if (unit === 'ml') { qty /= 1000; unit = 'L'; } else if (unit === 'ración') unit = 'ud';
          const pack = unit === 'L' ? { qty, unit: 'L', count: 1 } : null;
          if (pack) { qty = 1; unit = 'ud'; }
          if (listed?.checked) { bought.push({ ingredient_id: id, name: nameOf(current, id), already_in_pantry: true }); continue; }
          if (listed) { listed.checked = true; listed.qty = undefined; listed.unit = undefined; }
          const result = applyPurchase(current, { ingredientId: id, qty, unit, pack, total: entry.price ?? null, store: entry.store ?? null, date: today() }, today());
          bought.push({ ingredient_id: id, name: nameOf(current, id), qty: result.added.qty, unit: result.added.unit });
        }
        reconcilePantry(current);
        return current;
      });
      return { bought, shopping: shoppingView(state), pantry: pantryList(state).total };
    } }),

  tool({ name: 'ingredients_search', readOnly: true, schema: z.object({ query: z.string().trim().min(1).max(100), limit: z.number().int().min(1).max(30).default(10) }),
    description: 'Look up an ingredient in the dictionary (including yours) and how a name is understood. Buscar ingrediente.\nReturns candidates with category, place and shelf life, and which one a typed name resolves to.\nSinónimos: buscar ingrediente, qué es, cómo se llama, diccionario de ingredientes',
    run: ({ query, limit }) => {
      const state = readKitchen();
      const lex = lexOf(state);
      const needle = fold(query);
      const found = resolveName(query, lex);
      const matches = allIngredients(lex).filter((info) => fold(info.name).includes(needle) || fold(info.nameEn).includes(needle) || fold(info.id).includes(needle)).slice(0, limit);
      return { resolves_to: found.id ? { id: found.id, name: nameOf(state, found.id), via: found.via } : null,
        candidates: matches.map((info) => ({ id: info.id, name: info.name, category: info.category, place: info.place, builtin: info.builtin })) };
    } }),

  tool({ name: 'ingredient_add', schema: z.object({ name: z.string().trim().min(1).max(100), category: z.enum(CATEGORIES.map((c) => c.id)).optional(), aliases: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
    default_unit: unitEnum.optional(), shelf_days: z.object({ nevera: z.number().int().min(1).max(3650).optional(), despensa: z.number().int().min(1).max(3650).optional(), congelador: z.number().int().min(1).max(3650).optional() }).optional() }),
    description: 'Add an ingredient to your own dictionary with category, aliases and shelf life. Crear ingrediente propio.\nUnknown names in recipes and tickets are created automatically; use this to choose the category or the days it lasts.\nSinónimos: nuevo ingrediente, añadir al diccionario, cuánto dura en la nevera, categoría de ingrediente',
    run: ({ name, category, aliases, default_unit, shelf_days }) => {
      let created;
      const state = updateKitchen((current) => {
        const lex = lexOf(current);
        const existing = resolveName(name, lex);
        if (existing.id && existing.via !== 'fuzzy') fail(`Ya existe: ${nameOf(current, existing.id)} (${existing.id}).`);
        created = makeUserIngredient({ name, category, aliases, defaultUnit: default_unit, shelfLife: shelf_days }, lex, today());
        current.userIngredients.push(created);
        return current;
      });
      return { ingredient: created, user_ingredients: state.userIngredients.length };
    } }),

  tool({ name: 'ingredient_alias_add', idempotent: true, schema: z.object({ alias: z.string().trim().min(2).max(100), ingredient: z.string().trim().min(1).max(100) }),
    description: 'Teach CookHoard that a word or ticket abbreviation means an ingredient. Enseñar un alias.\nFuture recipes and tickets with that text map to the ingredient without asking.\nSinónimos: esto significa, enseñar abreviatura, alias de ingrediente, PECH POLLO es pechuga',
    run: ({ alias, ingredient }) => {
      let id;
      updateKitchen((current) => { id = ingredientRef(current, ingredient, { create: false }); current.learnedAliases[aliasKey(alias)] = id; return current; });
      return { alias: aliasKey(alias), ingredient_id: id, ingredient: nameOf(readKitchen(), id) };
    } }),
];
