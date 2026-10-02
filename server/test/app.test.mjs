import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp } from '../app.mjs';
import { TOOLS, toolCatalog } from '../tools/index.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

async function serve(t, options = {}) {
  const s = scratch(); fixedClock(); fakeHub();
  const { app, token, dataDir } = createApp({ dataDir: s.dir, serveStatic: false, ...options });
  const server = await new Promise((resolve) => { const srv = app.listen(0, '127.0.0.1', () => resolve(srv)); });
  t.after(() => { server.close(); s.done(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { base, token, dataDir, port: server.address().port };
}

/** A request with a chosen Host/Origin (fetch cannot set Host). */
const raw = (port, { method = 'GET', url = '/api/health', headers = {}, body } = {}) => new Promise((resolve, reject) => {
  const req = http.request({ host: '127.0.0.1', port, method, path: url, headers }, (res) => {
    let data = ''; res.on('data', (c) => { data += c; }); res.on('end', () => resolve({ status: res.statusCode, body: data }));
  });
  req.on('error', reject);
  if (body) req.write(body);
  req.end();
});

test('health says who this is and carries the family block', async (t) => {
  const { base } = await serve(t);
  const health = await (await fetch(`${base}/api/health`)).json();
  assert.equal(health.service, 'cookhoard');
  assert.match(health.version, /^\d+\.\d+\.\d+$/);
  assert.equal(health.hoard_link.app, 'cookhoard');
  assert.equal(health.hoard_link.family, '0.6.0');
  assert.equal(health.tools, TOOLS.length);
  assert.ok('ytdlp' in health && 'ffmpeg' in health && health.scheduler);
});

test('the agent catalogue lists every tool with hints, and calls need the token written in the data folder', async (t) => {
  const { base, token, dataDir } = await serve(t);
  assert.equal(fs.readFileSync(path.join(dataDir, 'mcp-token'), 'utf8'), token);
  const catalogue = await (await fetch(`${base}/api/agent/tools`)).json();
  assert.equal(catalogue.tools.length, TOOLS.length);
  assert.ok(catalogue.instructions.includes('draft'));
  for (const entry of catalogue.tools) {
    const tool = TOOLS.find((x) => x.name === entry.name);
    assert.equal(entry.annotations.readOnlyHint, tool.readOnly, entry.name);
    assert.equal(entry.inputSchema.type, 'object');
  }
  const post = (headers, body) => fetch(`${base}/api/agent/call`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, { name: 'kitchen_state' })).status, 401);
  assert.equal((await post({ authorization: 'Bearer nope' }, { name: 'kitchen_state' })).status, 401);
  const auth = { authorization: `Bearer ${token}` };
  const ok = await post(auth, { name: 'kitchen_state', arguments: {} });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).shopping, []);
  assert.equal((await post(auth, { name: 'no_such_tool' })).status, 404);
  const bad = await post(auth, { name: 'find_recipes', arguments: { limit: 500 } });
  assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /limit/);
  assert.equal((await post(auth, { arguments: {} })).status, 400);
  const added = await post(auth, { name: 'pantry_set', arguments: { ingredient: 'yogur', place: 'nevera' } });
  assert.equal((await added.json()).item.location, 'nevera');
});

test('the UI route runs the same tools; non-local hosts, other origins and form posts are refused', async (t) => {
  const { base, port } = await serve(t);
  const viaUi = await fetch(`${base}/api/tools/today_overview`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(viaUi.status, 200);
  assert.equal((await viaUi.json()).date, '2026-09-10');
  assert.equal((await raw(port, { headers: { host: 'evil.example' } })).status, 403);
  assert.equal((await raw(port, { headers: { host: `localhost:${port}` } })).status, 200);
  assert.equal((await raw(port, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await raw(port, { headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'cors' } })).status, 403);
  assert.equal((await raw(port, { method: 'POST', url: '/api/tools/kitchen_state', headers: { 'sec-fetch-mode': 'navigate', 'content-type': 'text/plain' }, body: '{}' })).status, 403);
  assert.equal((await raw(port, { url: '/api/nada' })).status, 404);
  assert.equal((await raw(port, { method: 'POST', url: '/api/tools/kitchen_state', headers: { 'content-type': 'application/json' }, body: '{oops' })).status, 400);
});

test('COOKHOARD_ALLOWED_HOSTS opens exactly the hosts listed', async (t) => {
  const { port } = await serve(t, { allowedHosts: 'cocina.ejemplo, *.ts.example' });
  assert.equal((await raw(port, { headers: { host: 'cocina.ejemplo' } })).status, 200);
  assert.equal((await raw(port, { headers: { host: 'phone.ts.example' } })).status, 200);
  assert.equal((await raw(port, { headers: { host: 'otra.ejemplo' } })).status, 403);
});

test('saved thumbnails are served under /media, the PWA manifest and worker are there', async (t) => {
  const { base, dataDir, port } = await serve(t);
  fs.mkdirSync(path.join(dataDir, 'media'), { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'media', 'draft-1.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  const image = await fetch(`${base}/media/draft-1.jpg`);
  assert.equal(image.status, 200);
  assert.equal((await image.arrayBuffer()).byteLength, 4);
  assert.equal((await raw(port, { url: '/media/missing.jpg' })).status, 404);
  assert.ok([403, 404].includes((await raw(port, { url: '/media/../kitchen.json' })).status), 'no way out of the media folder');
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.name, 'CookHoard');
  assert.deepEqual(manifest.icons.map((i) => i.sizes), ['192x192', '512x512']);
  const worker = await (await fetch(`${base}/sw.js`)).text();
  assert.match(worker, /\/assets\//);
  assert.ok(!/\/api\//.test(worker.split('fetch')[1] ?? '') || /startsWith\('\/assets\/'\)/.test(worker));
});

const bootstrap = fileURLToPath(new URL('../bootstrap.mjs', import.meta.url));
function launch(env) {
  const child = spawn(process.execPath, [bootstrap], { env: { ...process.env, COOKHOARD_SCHEDULER: '0', ...env }, stdio: ['ignore', 'pipe', 'pipe'] });
  const out = { text: '', child };
  child.stdout.on('data', (d) => { out.text += d; });
  child.stderr.on('data', (d) => { out.text += d; });
  out.exit = new Promise((resolve) => child.on('close', (code) => resolve(code)));
  return out;
}
const until = async (fn, ms = 15000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; };

test('the app picks the next free port, and PORT_STRICT=1 refuses to', async (t) => {
  const s = scratch(); t.after(() => s.done());
  const a = launch({ COOKHOARD_DATA_DIR: s.dir, COOKHOARD_PORT: '5391' });
  t.after(() => a.child.kill());
  assert.ok(await until(() => /en http:\/\/127\.0\.0\.1:5391/.test(a.text)), a.text);
  assert.equal(fs.readFileSync(path.join(s.dir, 'app-url'), 'utf8').trim(), 'http://127.0.0.1:5391');
  const other = fs.mkdtempSync(path.join(path.dirname(s.dir), 'cookhoard-p2-'));
  t.after(() => fs.rmSync(other, { recursive: true, force: true }));
  const b = launch({ COOKHOARD_DATA_DIR: other, COOKHOARD_PORT: '5391' });
  t.after(() => b.child.kill());
  assert.ok(await until(() => /usando 5392/.test(b.text)), b.text);
  const strict = launch({ COOKHOARD_DATA_DIR: other, COOKHOARD_PORT: '5391', PORT_STRICT: '1' });
  assert.equal(await strict.exit, 1);
  assert.match(strict.text, /No se pudo iniciar CookHoard/);
});
