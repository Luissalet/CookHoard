// Shared test helpers: a scratch data folder, a fake hub that records calls, a fixed clock and the fake yt-dlp.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setHub } from '../hub.mjs';
import { setClock } from '../clock.mjs';
import { resetDetection } from '../media.mjs';
import * as family from '../hoard-link.js';
import { webForgetAvailability } from '../hoard-commons/fam-web.js';

export const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-ytdlp.mjs', import.meta.url));

export function scratch(prefix = 'cookhoard-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const before = process.env.COOKHOARD_DATA_DIR;
  const beforeAllow = process.env.COOKHOARD_ALLOW_PRIVATE_URLS;
  process.env.COOKHOARD_DATA_DIR = dir;
  process.env.COOKHOARD_SCHEDULER = '0';
  process.env.COOKHOARD_ALLOW_PRIVATE_URLS = '1';     // the tests serve pages from 127.0.0.1
  resetDetection();
  return { dir, done() { if (before === undefined) delete process.env.COOKHOARD_DATA_DIR; else process.env.COOKHOARD_DATA_DIR = before; if (beforeAllow === undefined) delete process.env.COOKHOARD_ALLOW_PRIVATE_URLS; else process.env.COOKHOARD_ALLOW_PRIVATE_URLS = beforeAllow; setHub(null); unhookHubFetch(); setClock(null); resetDetection(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Calls to sibling apps travel through the shared client (hoard-link.js -> the hub's HTTP proxy). The double answers them in process: fetch() to the
// hub's address is routed to hub.call(app, tool, args), everything else goes to the real fetch.
const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function unhookHubFetch() { globalThis.fetch = realFetch; webForgetAvailability(); }
function hookHubFetch(hub) {
  globalThis.fetch = async (input, init) => {
    const url = String(input?.url ?? input);
    const base = family.status().hub;
    if (!url.startsWith(base)) return realFetch(input, init);
    const rest = url.slice(base.length);
    const call = rest.match(/^\/api\/apps\/([^/]+)\/call$/);
    if (hub.down) {
      if (call && init?.method === 'POST') { const { tool, arguments: args } = JSON.parse(init.body); hub.log.calls.push({ app: decodeURIComponent(call[1]), tool, args }); }
      throw new TypeError('fetch failed');
    }
    if (call && init?.method === 'POST') {
      const { tool, arguments: args } = JSON.parse(init.body);
      const app = decodeURIComponent(call[1]);
      const answer = await hub.call(app, tool, args);
      if (answer.ok) return json(200, { ok: true, app, tool, status: 200, contract: '1', result: answer.result });
      return json(answer.status ?? 502, { ok: false, app, tool, status: answer.status ?? null, contract: '1', error: answer.error });
    }
    if (/^\/api\/apps\/[^/]+$/.test(rest)) return json(200, { state: 'running' });
    if (rest === '/api/events') return json(200, { ok: true });
    if (rest === '/api/web/status') return hub.web ? json(200, { ok: true, enabled: true }) : json(404, { error: 'not found' });
    if (rest === '/api/web/fetch' && hub.web) { const answer = await hub.web(JSON.parse(init.body)); return json(answer.http ?? 200, answer.body ?? answer); }
    return json(404, { error: 'not found' });
  };
}

export const fixedClock = (iso = '2026-09-10T10:00:00') => setClock(() => new Date(iso));

/**
 * A hub double. `calls` is a map "app.tool" → handler(args) returning the result (or { error, status }).
 * `chat` is a function (options) → { ok, text, json } or null for "no model". `vision` says whether the vision model exists.
 * `web` is a function (fetch payload) → the answer of the hub's /api/web/fetch; without it the hub has no web service and pages are read locally.
 */
export function fakeHub({ calls = {}, chat = null, vision = false, down = false, web = null } = {}) {
  const log = { calls: [], chats: [], events: [] };
  const hub = {
    log,
    async call(app, tool, args) {
      log.calls.push({ app, tool, args });
      if (down) return { ok: false, status: null, error: 'hub not reachable at http://127.0.0.1:8810' };
      const handler = calls[`${app}.${tool}`];
      if (!handler) return { ok: false, status: 404, error: `unknown tool ${tool}` };
      const result = await handler(args);
      if (result && result.__error) return { ok: false, status: result.status ?? 500, error: result.__error };
      return { ok: true, result };
    },
    async chat(options) {
      log.chats.push(options);
      if (down) return { ok: false, error: 'hub_down', detail: 'down' };
      if (options.capability === 'vision' && !vision) return { ok: false, error: 'no_model', detail: 'no vision model' };
      if (!chat) return { ok: false, error: 'no_model', detail: 'no model' };
      const answer = await chat(options);
      return answer ?? { ok: false, error: 'no_model', detail: 'no model' };
    },
    async linkStatus() { return down ? { ok: false, error: 'hub_down' } : { llm: { available: !!chat }, vision: { available: vision } }; },
    emit(type, data) { log.events.push({ type, data }); return Promise.resolve(true); },
    status() { return { hub: 'http://127.0.0.1:8810' }; },
  };
  hub.down = down;
  hub.web = web;                  // (payload) => the hub's /api/web/fetch answer; null: the hub has no web service
  webForgetAvailability();
  setHub(hub);
  hookHubFetch(hub);
  return hub;
}
