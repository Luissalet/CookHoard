// Shared test helpers: a scratch data folder, a fake hub that records calls, a fixed clock and the fake yt-dlp.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setHub } from '../hub.mjs';
import { setClock } from '../clock.mjs';
import { resetDetection } from '../media.mjs';
import * as family from '../hoard-link.js';

export const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-ytdlp.mjs', import.meta.url));

export function scratch(prefix = 'cookhoard-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const before = process.env.COOKHOARD_DATA_DIR;
  process.env.COOKHOARD_DATA_DIR = dir;
  process.env.COOKHOARD_SCHEDULER = '0';
  resetDetection();
  return { dir, done() { if (before === undefined) delete process.env.COOKHOARD_DATA_DIR; else process.env.COOKHOARD_DATA_DIR = before; setHub(null); unhookHubFetch(); setClock(null); resetDetection(); fs.rmSync(dir, { recursive: true, force: true }); } };
}

// Calls to sibling apps travel through the shared client (hoard-link.js -> the hub's HTTP proxy). The double answers them in process: fetch() to the
// hub's address is routed to hub.call(app, tool, args), everything else goes to the real fetch.
const realFetch = globalThis.fetch;
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
export function unhookHubFetch() { globalThis.fetch = realFetch; }
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
    return json(200, { ok: true });
  };
}

export const fixedClock = (iso = '2026-09-10T10:00:00') => setClock(() => new Date(iso));

/**
 * A hub double. `calls` is a map "app.tool" → handler(args) returning the result (or { error, status }).
 * `chat` is a function (options) → { ok, text, json } or null for "no model". `vision` says whether the vision model exists.
 */
export function fakeHub({ calls = {}, chat = null, vision = false, down = false } = {}) {
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
  setHub(hub);
  hookHubFetch(hub);
  return hub;
}
