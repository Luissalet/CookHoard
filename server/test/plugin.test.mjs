// The Faustus manifest stays consistent with the app and the bridge.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../version.mjs';

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'faustus-plugin.json'), 'utf8'));

test('identity and original capabilities are kept', () => {
  assert.equal(manifest.id, 'cookhoard');
  assert.equal(manifest.name, 'CookHoard');
  for (const cap of ['recipes', 'cooking steps', 'fridge', 'shopping list', 'weekly menu', 'pantry stock deficits']) assert.ok(manifest.capabilities.includes(cap), cap);
});

test('every placeholder used is declared and has a default or is the install folder', () => {
  const text = JSON.stringify({ ...manifest, notes: '', purpose: '' });
  const used = new Set([...text.matchAll(/\{([A-Z_]+)\}/g)].map((m) => m[1]));
  for (const name of used) assert.ok(manifest.placeholders.includes(name), `undeclared placeholder ${name}`);
  for (const name of manifest.placeholders) if (name !== 'COOKHOARD_DIR') assert.ok(manifest.defaults[name], `no default for ${name}`);
});

test('the app block matches the server', () => {
  assert.equal(manifest.app.url_default, `http://127.0.0.1:5201`);
  assert.equal(manifest.app.health.expect.service, 'cookhoard');
  assert.equal(manifest.app.launch_hint.env.COOKHOARD_PORT, '5201');
  assert.equal(manifest.app.launch_hint.env.PORT_STRICT, '1');
  assert.ok(fs.existsSync(path.join(ROOT, manifest.app.launch_hint.argv[0])));
  assert.ok(fs.existsSync(path.join(ROOT, 'apps/mcp/bootstrap.mjs')));
  assert.equal(manifest.mcp.env.COOKHOARD_URL, '{APP_URL}');
});

test('optional environment variables named in the manifest are read by the code', () => {
  const source = ['server', 'apps/mcp'].flatMap((dir) => fs.readdirSync(path.join(ROOT, dir)).filter((f) => f.endsWith('.mjs')).map((f) => fs.readFileSync(path.join(ROOT, dir, f), 'utf8'))).join('\n');
  for (const name of manifest.mcp.optional_env) assert.ok(source.includes(name), name);
});
