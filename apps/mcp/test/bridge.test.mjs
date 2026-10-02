import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const bridge = fileURLToPath(new URL('../bootstrap.mjs', import.meta.url));
const appMain = fileURLToPath(new URL('../../../server/bootstrap.mjs', import.meta.url));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, ms = 20000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(100); } return false; };

/** A hub double that records the events the app sends (the audit trail of /api/agent/call). */
async function fakeHub() {
  const events = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => { try { events.push(JSON.parse(body)); } catch { /* ignore */ } res.setHeader('content-type', 'application/json'); res.end('{"ok":true}'); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { events, url: `http://127.0.0.1:${server.address().port}`, close: () => server.close() };
}

async function connect(env) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [bridge], cwd: os.tmpdir(), env: { ...process.env, ...env } });
  const client = new Client({ name: 'cookhoard-bridge-test', version: '1.0.0' });
  await client.connect(transport);
  return client;
}
const json = (result) => JSON.parse(result.content[0].text);
const killApp = (dir) => { try { process.kill(Number(fs.readFileSync(path.join(dir, 'app.pid'), 'utf8')), 'SIGTERM'); } catch { /* already gone */ } };

test('the bridge proxies to the running app, which records the call', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-bridge-'));
  const hub = await fakeHub();
  const app = spawn(process.execPath, [appMain], { env: { ...process.env, COOKHOARD_DATA_DIR: dir, COOKHOARD_PORT: '5397', PORT_STRICT: '1', COOKHOARD_SCHEDULER: '0', HOARD_HUB_URL: hub.url }, stdio: 'ignore' });
  t.after(() => { app.kill(); hub.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  assert.ok(await until(async () => { try { return (await fetch('http://127.0.0.1:5397/api/health')).ok; } catch { return false; } }), 'the app starts');
  const client = await connect({ COOKHOARD_DATA_DIR: dir, COOKHOARD_URL: 'http://127.0.0.1:5397', COOKHOARD_AUTOSTART: '0' });
  t.after(() => client.close());
  const added = json(await client.callTool({ name: 'add_kitchen_item', arguments: { name: 'yogur', checked: true } }));
  assert.equal(added.item.ingredientId, 'yogur');
  assert.ok(await until(() => hub.events.some((e) => e.type === 'agent.call' && e.data.tool === 'add_kitchen_item' && e.data.ok === true)), 'the app saw the call');
  const state = await (await fetch('http://127.0.0.1:5397/api/tools/kitchen_state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json();
  assert.ok(state.shopping.some((i) => i.ingredientId === 'yogur'));
  const bad = await client.callTool({ name: 'find_recipes', arguments: { limit: 999 } });
  assert.equal(bad.isError, true);
  assert.match(bad.content[0].text, /limit/);
});

test('when the app is not running the bridge starts it and keeps working', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-autostart-'));
  const hub = await fakeHub();
  const client = await connect({ COOKHOARD_DATA_DIR: dir, COOKHOARD_PORT: '5398', COOKHOARD_SCHEDULER: '0', HOARD_HUB_URL: hub.url });
  t.after(async () => { await client.close(); killApp(dir); hub.close(); await wait(300); fs.rmSync(dir, { recursive: true, force: true }); });
  const result = json(await client.callTool({ name: 'add_kitchen_item', arguments: { name: 'leche', checked: true } }));
  assert.equal(result.item.ingredientId, 'leche');
  assert.equal((await (await fetch('http://127.0.0.1:5398/api/health')).json()).service, 'cookhoard', 'the app is up now');
  assert.ok(await until(() => hub.events.some((e) => e.type === 'agent.call' && e.data.tool === 'add_kitchen_item')), 'the call went through the app');
});

test('without the app and without autostart the same tools run in the bridge process; a lost answer to a write is reported as unknown', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-fallback-'));
  const client = await connect({ COOKHOARD_DATA_DIR: dir, COOKHOARD_AUTOSTART: '0', COOKHOARD_PORT: '5399' });
  t.after(async () => { await client.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const local = json(await client.callTool({ name: 'add_kitchen_item', arguments: { name: 'tomate', checked: true } }));
  assert.equal(local.item.ingredientId, 'tomato');
  assert.ok(fs.existsSync(path.join(dir, 'kitchen.json')));
  // a server that takes the connection and drops it: the write may or may not have happened
  const dropper = net.createServer((socket) => socket.once('data', () => socket.destroy()));
  await new Promise((resolve) => dropper.listen(0, '127.0.0.1', resolve));
  t.after(() => dropper.close());
  fs.writeFileSync(path.join(dir, 'mcp-token'), 'token-de-prueba');
  const second = await connect({ COOKHOARD_DATA_DIR: dir, COOKHOARD_AUTOSTART: '0', COOKHOARD_URL: `http://127.0.0.1:${dropper.address().port}` });
  t.after(() => second.close());
  const lost = await second.callTool({ name: 'add_kitchen_item', arguments: { name: 'pepino', checked: true } });
  assert.equal(lost.isError, true);
  const body = json(lost);
  assert.equal(body.status, 'outcome_unknown');
  assert.equal(body.reconcile_action, 'read_current_state_before_retry');
  const read = json(await second.callTool({ name: 'kitchen_state', arguments: {} }));
  assert.ok(read.shopping.some((i) => i.ingredientId === 'tomato'), 'a read falls back to the local file');
});
