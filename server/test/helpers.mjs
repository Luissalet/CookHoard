// Shared test helpers: a scratch data folder, a fake hub that records calls, a fixed clock and the fake yt-dlp.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setHub } from '../hub.mjs';
import { setClock } from '../clock.mjs';
import { resetDetection } from '../media.mjs';

export const FAKE_YTDLP = fileURLToPath(new URL('./fixtures/fake-ytdlp.mjs', import.meta.url));

export function scratch(prefix = 'cookhoard-test-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const before = process.env.COOKHOARD_DATA_DIR;
  process.env.COOKHOARD_DATA_DIR = dir;
  process.env.COOKHOARD_SCHEDULER = '0';
  resetDetection();
  return { dir, done() { if (before === undefined) delete process.env.COOKHOARD_DATA_DIR; else process.env.COOKHOARD_DATA_DIR = before; setHub(null); setClock(null); resetDetection(); fs.rmSync(dir, { recursive: true, force: true }); } };
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
  setHub(hub);
  return hub;
}
