// The server entry point and its shared plumbing: stable token, clean shutdown, conflict on an unknown kitchen version, atomic state files.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app.mjs';
import { runDaily } from '../scheduler.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const bootstrap = fileURLToPath(new URL('../bootstrap.mjs', import.meta.url));
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

test('the MCP token is created once and survives a restart; a short or damaged one is replaced', (t) => {
  const s = scratch(); fakeHub(); t.after(() => s.done());
  const first = createApp({ dataDir: s.dir, serveStatic: false }).token;
  assert.ok(first.length >= 32);
  assert.equal(createApp({ dataDir: s.dir, serveStatic: false }).token, first, 'a running bridge keeps working across restarts');
  fs.writeFileSync(path.join(s.dir, 'mcp-token'), 'corto');
  const replaced = createApp({ dataDir: s.dir, serveStatic: false }).token;
  assert.notEqual(replaced, 'corto');
  assert.equal(fs.readFileSync(path.join(s.dir, 'mcp-token'), 'utf8').trim(), replaced);
});

test('SIGTERM closes the server cleanly, exits 0 and removes the address and pid files', { skip: process.platform === 'win32' }, async (t) => {
  const s = scratch(); t.after(() => s.done());
  const child = spawn(process.execPath, [bootstrap], { env: { ...process.env, COOKHOARD_DATA_DIR: s.dir, COOKHOARD_PORT: '5393', COOKHOARD_SCHEDULER: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  const exit = new Promise((resolve) => child.once('close', (code, signal) => resolve({ code, signal })));
  assert.ok(await until(() => /en http:\/\/127\.0\.0\.1:\d+/.test(out)), out);
  assert.ok(fs.existsSync(path.join(s.dir, 'app-url')));
  assert.equal(fs.readFileSync(path.join(s.dir, 'app.pid'), 'utf8').trim(), String(child.pid));
  child.kill('SIGTERM');
  assert.deepEqual(await exit, { code: 0, signal: null }, out);
  assert.match(out, /Closing CookHoard \(SIGTERM\)/);
  assert.ok(!fs.existsSync(path.join(s.dir, 'app-url')) && !fs.existsSync(path.join(s.dir, 'app.pid')));
});

test('a kitchen file of an unknown version is a conflict with the message for the person, and nothing is overwritten', async (t) => {
  const s = scratch(); fakeHub(); t.after(() => s.done());
  const { app } = createApp({ dataDir: s.dir, serveStatic: false });
  const server = await new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => server.close());
  const file = path.join(s.dir, 'kitchen.json');
  fs.writeFileSync(file, JSON.stringify({ version: 3, shopping: [] }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (name) => fetch(`${base}/api/tools/${name}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  const ui = await post('kitchen_state');
  assert.equal(ui.status, 409);
  assert.match((await ui.json()).error, /formato desconocido/);
  const agent = await fetch(`${base}/api/agent/call`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${fs.readFileSync(path.join(s.dir, 'mcp-token'), 'utf8').trim()}` }, body: JSON.stringify({ name: 'kitchen_state' }) });
  assert.equal(agent.status, 409);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 3);
  const bad = await fetch(`${base}/api/tools/kitchen_state`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{oops' });
  assert.equal(bad.status, 400);
  assert.equal((await bad.json()).code, 'invalid_json');
});

test('the kitchen file and the scheduler state are written atomically: no temporary files are left', async (t) => {
  const s = scratch(); fixedClock(); fakeHub(); t.after(() => s.done());
  const { callTool } = await import('../tools/index.mjs');
  await callTool('add_kitchen_item', { name: 'yogur', checked: true });
  runDaily({ force: true });
  assert.deepEqual(fs.readdirSync(s.dir).filter((n) => /\.tmp$|\.lock$/.test(n)), []);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(s.dir, 'scheduler.json'), 'utf8')).last_result, { expiring: 0, emitted: false });
  assert.ok(JSON.parse(fs.readFileSync(path.join(s.dir, 'kitchen.json'), 'utf8')).shopping.some((i) => i.ingredientId === 'yogur'));
});
