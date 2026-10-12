// What the shared Faustus copilot asks this app for: the real objects open in the current view, the unsaved form fields,
// and a way to refresh the open view when the assistant finishes a turn. Nothing here renders anything.
// Every screen talks to the same tools the assistant uses, so the objects are read with those tools (get_recipe,
// recipe_draft_get, pantry_list, kitchen_state, shopping_list, price_book).
import { call } from './api.js';

const EVENT = 'cookhoard:context-request';
const SCREENS = ['today', 'recipes', 'import', 'pantry', 'menu', 'shopping', 'prices', 'settings'];
const IMPORT_TABS = ['link', 'text', 'ticket', 'drafts'];
const MAX_PICKED = 10;

// ---- partial saves -----------------------------------------------------------------------------------------------------

// Fields of `draft` whose value differs from `initial` (compared as JSON, so a cleared text counts as a change).
export function changedFields(initial, draft) {
  const base = initial || {};
  return Object.fromEntries(Object.entries(draft || {}).filter(([key, value]) => JSON.stringify(value) !== JSON.stringify(base[key])));
}

// A refreshed baseline arrives while the user is editing: fields the user did not touch follow the new baseline, touched ones stay.
export function rebaseForm(previousBase, nextBase, form) {
  const out = { ...nextBase };
  for (const key of Object.keys(form || {})) {
    if (JSON.stringify(form[key]) !== JSON.stringify(previousBase?.[key])) out[key] = form[key];
  }
  return out;
}

// ---- route ---------------------------------------------------------------------------------------------------------------

export function parseRoute(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/').filter(Boolean).map((p) => { try { return decodeURIComponent(p); } catch { return p; } });
  return { screen: SCREENS.includes(parts[0]) ? parts[0] : 'today', params: parts.slice(1) };
}

// ---- registry ------------------------------------------------------------------------------------------------------------

// Every mounted screen and open form answers this event: `editor(snapshot)` for a form ({ kind, object_id, dirty, fields }),
// `view(partial)` for what the screen shows (filters, step of the cooking mode...).
export function collectContext(target = globalThis.window) {
  const editors = [];
  const view = {};
  if (!target?.dispatchEvent) return { editors, view };
  target.dispatchEvent(new CustomEvent(EVENT, {
    detail: {
      editor: (snapshot) => { if (snapshot) editors.push(snapshot); },
      view: (partial) => { if (partial && typeof partial === 'object') Object.assign(view, partial); },
    },
  }));
  editors.sort((a, b) => Number(!!b.dirty) - Number(!!a.dirty));
  return { editors, view };
}

// Answer the context request: `getter()` returns { editors?: [snapshot|null], view?: {...} } and is read at ask time.
export function registerProvider(getter, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const handler = (event) => {
    let out = null;
    try { out = getter(); } catch { out = null; }
    if (!out) return;
    for (const snapshot of out.editors || []) if (snapshot) event.detail.editor(snapshot);
    if (out.view) event.detail.view(out.view);
  };
  target.addEventListener(EVENT, handler);
  return () => target.removeEventListener(EVENT, handler);
}

// ---- objects -------------------------------------------------------------------------------------------------------------

const pick = (source, keys) => Object.fromEntries(keys.filter((k) => source?.[k] !== undefined && source[k] !== null && source[k] !== '').map((k) => [k, source[k]]));
export const clip = (text, n) => (typeof text === 'string' && text.length > n ? `${text.slice(0, n)}...` : text);

// The form values for the copilot: long texts shortened.
export function clipFields(fields, n = 1500) {
  return Object.fromEntries(Object.entries(fields || {}).map(([key, value]) => [key, typeof value === 'string' ? clip(value, n) : value]));
}

export const recipeObject = (r) => ({
  kind: 'recipe', object_id: r.id, title: r.title,
  ...pick(r, ['servings', 'totalMin', 'rating', 'cooked_count']),
  saved: !!r.saved,
  ...(r.diet?.length ? { diet: r.diet } : {}),
  ...(r.source?.kind ? { source: r.source.kind } : {}),
  ...(Array.isArray(r.ingredients) ? { ingredients: r.ingredients.length } : {}),
  ...(Array.isArray(r.steps) ? { steps: r.steps.length } : {}),
  ...(r.cost?.total ? { cost: r.cost.total } : {}),
});

export const draftObject = (d) => ({
  kind: 'draft', object_id: d.id, title: d.title,
  ...(d.kind ? { source: d.kind } : {}),
  ...(d.confidence?.level ? { confidence: d.confidence.level } : {}),
  ...(Array.isArray(d.ingredients) ? { ingredients: d.ingredients.length } : {}),
  ...(Array.isArray(d.steps) ? { steps: d.steps.length } : {}),
});

export const pantryObject = (i) => ({
  kind: 'pantry_item', object_id: i.id, title: i.name,
  ...pick(i, ['location', 'qty', 'unit', 'expiresAt', 'days_left', 'expiry_kind']),
  ...(i.leftover ? { leftover: true } : {}),
  ...(i.opened_at ? { opened_at: i.opened_at } : {}),
});

export const shoppingObject = (item) => ({ kind: 'shopping_item', object_id: item.ingredient_id, title: item.name, ...pick(item, ['qty', 'unit']) });

export const priceObject = (p) => ({
  kind: 'price', object_id: p.ingredientId, title: p.name,
  ...(p.last ? { last: pick(p.last, ['unit_price', 'store', 'date']) } : {}),
  ...pick(p, ['price_unit', 'median90', 'count']),
});

export const menuObject = (state) => ({
  kind: 'menu', object_id: state.week, title: `Menu ${state.week}`,
  days: (state.menu?.days || []).map((d, i) => ({ day: i + 1, recipe_id: d.recipeId, title: d.title, ...(d.servings ? { servings: d.servings } : {}) })),
});

async function safe(fn) {
  try { return await fn(); } catch { return null; }
}

// Pure core (dependencies injected so it can be tested): never throws; unknown or "new" ids yield no object.
export async function buildContext({ hash, editors = [], view: viewInfo = {}, tools = call }) {
  const route = parseRoute(hash);
  const screen = route.screen;
  const objects = [];
  const seen = new Set();
  const add = (object) => { if (!object?.object_id) return; const key = `${object.kind}:${object.object_id}`; if (!seen.has(key)) { seen.add(key); objects.push(object); } };
  const realId = (id) => (id && id !== 'new' ? String(id) : null);
  const cache = {};
  const once = (name, args = {}) => (cache[name + JSON.stringify(args)] ||= safe(() => tools(name, args)));

  const view = { page: screen };

  if (screen === 'recipes') {
    const id = realId(route.params[0]);
    if (id) {
      view.page = route.params[1] === 'cook' ? 'cooking' : 'recipe';
      const recipe = await once('get_recipe', { recipe_id: id });
      if (recipe?.id) { view.object_id = recipe.id; add(recipeObject(recipe)); }
      if (viewInfo.servings) view.servings = viewInfo.servings;
      if (viewInfo.cook) view.cook = viewInfo.cook;
    } else {
      view.page = 'recipes';
      if (viewInfo.filters && Object.keys(viewInfo.filters).length) view.filters = viewInfo.filters;
    }
  }

  if (screen === 'import') {
    const tab = IMPORT_TABS.includes(route.params[0]) ? route.params[0] : 'link';
    view.tab = tab;
    if (viewInfo.review_count != null) view.review_count = viewInfo.review_count;
    if (viewInfo.drafts_count != null) view.drafts_count = viewInfo.drafts_count;
    const draftId = realId(viewInfo.draft_id);
    if (draftId) {
      const one = await once('recipe_draft_get', { draft_id: draftId });
      if (one?.draft?.id) { view.draft_id = one.draft.id; add(draftObject(one.draft)); }
    }
  }

  if (screen === 'pantry' && viewInfo.place && viewInfo.place !== 'all') view.place = viewInfo.place;

  if (screen === 'menu') {
    const state = await once('kitchen_state');
    if (state?.menu?.days && state.week) add(menuObject(state));
    if (viewInfo.picking_day) view.picking_day = viewInfo.picking_day;
  }

  if (screen === 'shopping') {
    const picked = Array.isArray(viewInfo.picked) ? viewInfo.picked.slice(0, MAX_PICKED) : [];
    if (picked.length) {
      const list = await once('shopping_list');
      const items = (list?.sections || []).flatMap((s) => s.items || []);
      for (const id of picked) { const item = items.find((x) => x.ingredient_id === id); if (item) add(shoppingObject(item)); }
      view.picked = picked.length;
    }
  }

  if (screen === 'prices') {
    if (viewInfo.query) view.query = viewInfo.query;
    const open = realId(viewInfo.price_open);
    if (open) {
      const book = await once('price_book', { query: viewInfo.query || '' });
      const row = (book?.items || []).find((p) => p.ingredientId === open);
      if (row) { view.price_open = open; add(priceObject(row)); }
    }
  }

  // Objects behind the open forms (an edit form names its object; a creation form names none).
  for (const e of editors) {
    const id = realId(e.object_id);
    if (!id) continue;
    if (e.kind === 'recipe-draft') { const one = await once('recipe_draft_get', { draft_id: id }); if (one?.draft?.id) add(draftObject(one.draft)); }
    if (e.kind === 'pantry-item') { const list = await once('pantry_list'); const item = (list?.items || []).find((x) => x.id === id); if (item) add(pantryObject(item)); }
    if (e.kind === 'cooked-record') { const recipe = await once('get_recipe', { recipe_id: id }); if (recipe?.id) add(recipeObject(recipe)); }
  }

  const editor = editors.find((e) => e.dirty) || editors[0];
  if (editor) view.editor = editor;
  if (editors.length > 1) view.editors = editors;
  return { active_objects: objects, view };
}

export function context() {
  const { editors, view } = collectContext();
  return buildContext({ hash: globalThis.window?.location?.hash, editors, view });
}

// ---- refresh when the assistant finishes a turn --------------------------------------------------------------------------
const refreshers = new Set();
let timer = null;

function scheduleRefresh() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    for (const fn of [...refreshers]) { try { fn(); } catch { /* a refresh must never break the page */ } }
  }, 250);
}

// A screen registers what "reload what is on screen" means (it keeps the forms the user is editing untouched).
export function subscribeRefresh(fn) {
  refreshers.add(fn);
  return () => refreshers.delete(fn);
}

export const onTurnEnd = () => scheduleRefresh();

// Once at start: the object the launcher looks for, and the window event it dispatches on turn end (the debounce merges the two).
export function installCopilot(target = globalThis.window) {
  if (!target || target.hoardCopilot) return;
  target.hoardCopilot = { context, onTurnEnd };
  target.addEventListener('hoard:copilot-turn-end', scheduleRefresh);
}
