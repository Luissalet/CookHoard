// Status, settings, the "Hoy" overview and the link to the price watcher app.
import { getSettings, pantryView, whatToCook, menuWeekKey, normaliseSections, SECTION_IDS } from '@cookhoard/core';
import { readKitchen, updateKitchen, dataDir } from '../store.mjs';
import { now, today } from '../clock.mjs';
import { callApp, modelStatus, hub } from '../hub.mjs';
import { detectTools } from '../media.mjs';
import { schedulerStatus } from '../scheduler.mjs';
import { version } from '../version.mjs';
import { z, tool, recipesOf, freshWeek } from './common.mjs';
import { reviewQueue } from '../tickets.mjs';
import { menuCost } from './costs.mjs';

export const mediaPublic = (settings) => ({ ytdlp: settings.media.ytdlp, cookies_from_browser: settings.media.cookies_from_browser, cookies_file: settings.media.cookies_file, keyframes: settings.media.keyframes, transcript: settings.media.transcript });

export async function statusView() {
  const state = readKitchen();
  const settings = getSettings(state);
  const tools = await detectTools(settings);
  const models = await modelStatus();
  return { app: 'cookhoard', version, data_dir: dataDir(), today: today(),
    counts: { recipes: state.recipes.length, makes: state.makes.length, pantry: Object.keys(state.pantry).length, shopping_to_buy: state.shopping.filter((i) => !i.checked).length,
      drafts: state.drafts.length, tickets: state.tickets.length, review_queue: reviewQueue(state).length, prices: state.priceBook.length, user_ingredients: state.userIngredients.length },
    media: { ytdlp: tools.ytdlp ? { path: tools.ytdlp.path, version: tools.ytdlp.version } : null, ffmpeg: tools.ffmpeg ? { version: tools.ffmpeg.version } : null,
      cookies: settings.media.cookies_file ? 'file' : settings.media.cookies_from_browser },
    models, hub: hub.status?.() ? { url: hub.status().hub } : null, scheduler: schedulerStatus(), settings: { lang: settings.lang, weeklyBudget: settings.weeklyBudget, defaultServings: settings.defaultServings } };
}

export function settingsView(state) {
  const s = getSettings(state);
  return { lang: s.lang, sections: s.sections, weeklyBudget: s.weeklyBudget, defaultServings: s.defaultServings, supermarkets: s.supermarkets, media: mediaPublic(s), hub: s.hub };
}

const settingsPatch = z.object({
  lang: z.enum(['es', 'en']).optional(), sections: z.array(z.enum(SECTION_IDS)).max(30).optional(), weeklyBudget: z.number().min(0).max(100000).nullable().optional(),
  defaultServings: z.number().int().min(1).max(30).optional(), supermarkets: z.array(z.string().trim().min(2).max(40)).max(60).optional(),
  media: z.object({ ytdlp: z.string().max(500).optional(), cookies_from_browser: z.enum(['none', 'edge', 'chrome', 'firefox']).optional(), cookies_file: z.string().max(500).optional(),
    keyframes: z.boolean().optional(), transcript: z.boolean().optional() }).optional(),
  hub: z.object({ tantalus_watcher: z.string().max(60).optional() }).optional(),
});

export function applySettings(patch) {
  const parsed = settingsPatch.parse(patch);
  const state = updateKitchen((current) => {
    const s = { ...current.settings };
    for (const key of ['lang', 'weeklyBudget', 'defaultServings']) if (parsed[key] !== undefined) s[key] = parsed[key];
    if (parsed.sections) s.sections = normaliseSections(parsed.sections);
    if (parsed.supermarkets) s.supermarkets = parsed.supermarkets.map((n) => n.toLowerCase());
    if (parsed.media) s.media = { ...(s.media ?? {}), ...parsed.media };
    if (parsed.hub) s.hub = { ...(s.hub ?? {}), ...parsed.hub };
    current.settings = s;
    return current;
  });
  return settingsView(state);
}

/** Everything the "Hoy" screen shows. Local only: no calls to other apps. */
export function todayView(state, { dinners = 3 } = {}) {
  const day = today();
  const pantry = pantryView(state, day);
  const expiring = pantry.filter((p) => p.days_left !== null && p.days_left <= 3).map((p) => ({ id: p.ingredientId, name: p.name, days_left: p.days_left, level: p.level, location: p.location, expiry_kind: p.expiry_kind, leftover: !!p.leftover }));
  const dinner = whatToCook(state, recipesOf(state), { limit: dinners }, day);
  const plan = freshWeek(state, menuWeekKey(now()));
  const dow = (now().getDay() + 6) % 7;
  const planned = plan?.days?.[dow] ?? null;
  const cost = menuCost(state);
  return { date: day, expiring, dinner: { options: dinner.options, leftovers: dinner.leftovers }, menu_today: planned ? { day: dow + 1, recipe_id: planned.recipeId, title: planned.title, servings: planned.servings ?? null } : null,
    menu_planned: !!plan, shopping_to_buy: state.shopping.filter((i) => !i.checked).length, drafts_pending: state.drafts.length, review_queue: reviewQueue(state).length,
    week_budget: getSettings(state).weeklyBudget, menu_cost: cost ? { total: cost.total, complete: cost.complete } : null };
}

async function tantalusWatcher(settings) {
  if (settings.hub.tantalus_watcher) return { id: settings.hub.tantalus_watcher };
  const listed = await callApp('tantalus', 'watcher_list', {}, { timeoutMs: 15000 });
  if (!listed.ok) return { why: listed.why };
  const rows = listed.result?.watchers ?? listed.result?.items ?? (Array.isArray(listed.result) ? listed.result : []);
  const found = rows.find((w) => /cookhoard/i.test(w.name ?? '') && (w.mode ?? 'availability') === 'availability');
  if (found) return { id: found.id };
  const created = await callApp('tantalus', 'watcher_create', { name: 'CookHoard', mode: 'availability', config: {}, interval_min: 120, notes: 'Productos de la compra vigilados desde CookHoard' }, { timeoutMs: 30000 });
  if (!created.ok) return { why: created.why };
  const id = created.result?.id ?? created.result?.watcher?.id;
  return id ? { id } : { why: 'Tantalus no ha devuelto el identificador del vigilante.' };
}

export const SYSTEM_TOOLS = [
  tool({ name: 'cookhoard_status', readOnly: true, openWorld: true, schema: z.object({}),
    description: 'CookHoard status: version, counts, yt-dlp, ffmpeg, local model, hub, daily routine. Estado de CookHoard.\nUse it to find out why a video import or a ticket step could not run.\nSinónimos: estado de cookhoard, funciona yt-dlp, hay modelo, qué falta instalar, diagnóstico',
    run: () => statusView() }),

  tool({ name: 'settings_get', readOnly: true, schema: z.object({}),
    description: 'Read the settings: language, shopping sections order, weekly budget, supermarkets, video options. Ajustes.\nSinónimos: ajustes, configuración, presupuesto semanal, orden de la compra, cookies',
    run: () => settingsView(readKitchen()) }),

  tool({ name: 'settings_set', idempotent: true, schema: z.object({ settings: settingsPatch }),
    description: 'Change settings (only the fields given): language, sections, budget, supermarkets, yt-dlp. Cambiar ajustes.\nReturns the settings after the change.\nSinónimos: cambia el presupuesto, presupuesto semanal de 80, ordena la compra, usar cookies de Edge, ruta de yt-dlp',
    run: ({ settings }) => ({ settings: applySettings(settings) }) }),

  tool({ name: 'today_overview', readOnly: true, schema: z.object({ dinners: z.number().int().min(1).max(10).default(3) }),
    description: 'What matters today: food about to expire, dinner ideas, menu, shopping, reviews. Resumen de hoy.\nSinónimos: qué hay hoy, qué toca hoy, resumen de la cocina, qué caduca y qué cenamos',
    run: ({ dinners }) => todayView(readKitchen(), { dinners }) }),

  tool({ name: 'tantalus_watch_add', openWorld: true, schema: z.object({ url: z.url().refine((v) => /^https?:\/\//i.test(v), 'Usa un enlace HTTP o HTTPS.'), label: z.string().trim().max(200).optional(), watcher_id: z.string().max(60).optional() }),
    description: 'Watch the price of a product page with the price watcher app (Tantalus). Vigilar el precio de un producto.\nUses the watcher in Ajustes or a "CookHoard" watcher it creates. Says so when Tantalus is not reachable.\nSinónimos: vigila el precio, avísame si baja, seguir precio, producto en oferta',
    run: async ({ url, label, watcher_id }) => {
      const settings = getSettings(readKitchen());
      const watcher = watcher_id ? { id: watcher_id } : await tantalusWatcher(settings);
      if (!watcher.id) return { status: 'unavailable', why: watcher.why };
      const added = await callApp('tantalus', 'target_add', { watcher_id: watcher.id, url, ...(label ? { label } : {}), check_now: false }, { timeoutMs: 60000 });
      if (!added.ok) return { status: 'unavailable', why: added.why };
      if (!settings.hub.tantalus_watcher && !watcher_id) updateKitchen((current) => { current.settings = { ...current.settings, hub: { ...(current.settings.hub ?? {}), tantalus_watcher: watcher.id } }; return current; });
      return { status: 'ok', watcher_id: watcher.id, target: added.result?.target ?? added.result };
    } }),
];
