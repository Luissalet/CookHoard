// Recipe pages: read through the shared fetcher (the hub's polite fetcher when it is there, the local one otherwise), JSON-LD read leniently.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { callTool } from '../tools/index.mjs';
import { readKitchen } from '../store.mjs';
import { recipeFromHtml } from '../importers/url.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const RECIPE = { '@context': 'https://schema.org', '@type': 'Recipe', name: 'Sopa de ajo', recipeYield: '2', recipeIngredient: ['4 dientes de ajo', '200 g de pan', '750 ml de caldo'],
  recipeInstructions: [{ '@type': 'HowToStep', text: 'Dora el ajo.' }, { '@type': 'HowToStep', text: 'Añade el pan y el caldo y cuece 15 minutos.' }] };
const pageOf = (script) => `<html><head><script type="application/ld+json">${script}</script></head><body>Sopa</body></html>`;

const setup = (t, options) => { const s = scratch(); fixedClock(); const hub = fakeHub(options); t.after(() => s.done()); return { s, hub }; };
async function serve(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

test('JSON-LD with trailing commas, a comment wrapper or HTML-escaped quotes still gives the recipe', () => {
  assert.equal(recipeFromHtml(pageOf(`{"@type":"Recipe","name":"Sopa","recipeIngredient":["1 ajo",],}`))?.name, 'Sopa');
  assert.equal(recipeFromHtml(pageOf(`<!-- ${JSON.stringify(RECIPE)} -->`))?.name, 'Sopa de ajo');
  assert.equal(recipeFromHtml(pageOf(JSON.stringify(RECIPE).replaceAll('"', '&quot;')))?.name, 'Sopa de ajo');
  assert.equal(recipeFromHtml(pageOf(JSON.stringify({ '@graph': [{ '@type': 'WebPage' }, RECIPE] })))?.name, 'Sopa de ajo');
  assert.equal(recipeFromHtml(pageOf('esto no es JSON')), null);
});

test('a page whose JSON-LD has a trailing comma imports as a recipe', async (t) => {
  setup(t);
  const broken = JSON.stringify(RECIPE).replace(/\}$/, ',}');
  const base = await serve(t, (req, res) => { res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(pageOf(broken)); });
  const result = await callTool('import_recipe_url', { url: `${base}/sopa` });
  assert.equal(result.recipe.title, 'Sopa de ajo');
  assert.equal(readKitchen().recipes.length, 1);
});

test('by default only public addresses are opened; COOKHOARD_ALLOW_PRIVATE_URLS opens the local network', async (t) => {
  setup(t);
  const base = await serve(t, (req, res) => { res.setHeader('content-type', 'text/html'); res.end(pageOf(JSON.stringify(RECIPE))); });
  delete process.env.COOKHOARD_ALLOW_PRIVATE_URLS;
  await assert.rejects(callTool('import_recipe_url', { url: `${base}/sopa` }), /red privada.*COOKHOARD_ALLOW_PRIVATE_URLS/);
  assert.equal(readKitchen().recipes.length, 0);
  process.env.COOKHOARD_ALLOW_PRIVATE_URLS = '1';
  assert.equal((await callTool('import_recipe_url', { url: `${base}/sopa` })).recipe.title, 'Sopa de ajo');
});

test('with the hub web service up the page is read through the hub and a block is explained', async (t) => {
  let payload;
  let answer = { ok: true, status: 200, final_url: 'https://recetas.example/sopa', content_type: 'text/html', text: pageOf(JSON.stringify(RECIPE)) };
  setup(t, { web: (body) => { payload = body; return answer; } });
  delete process.env.COOKHOARD_ALLOW_PRIVATE_URLS;
  const result = await callTool('import_recipe_url', { url: 'https://recetas.example/sopa?utm=1' });
  assert.equal(result.recipe.title, 'Sopa de ajo');
  assert.equal(result.recipe.sourceUrl, 'https://recetas.example/sopa', 'the final address the hub reports is the one saved');
  assert.equal(payload.url, 'https://recetas.example/sopa?utm=1');
  assert.equal(payload.accept, 'html');
  assert.equal(payload.max_bytes, 2_000_000);
  answer = { ok: false, status: 403, blocked: true, block_reason: 'cloudflare', error: 'blocked' };
  await assert.rejects(callTool('import_recipe_url', { url: 'https://recetas.example/otra' }), /bloquea las lecturas automáticas \(cloudflare\)/);
});

test('pages that cannot be read say why: error status, not a page, too large, nobody home', async (t) => {
  setup(t);
  const base = await serve(t, (req, res) => {
    if (req.url === '/gone') { res.statusCode = 404; res.setHeader('content-type', 'text/html'); return res.end('<html>no</html>'); }
    if (req.url === '/image') { res.setHeader('content-type', 'image/png'); return res.end(Buffer.alloc(64, 1)); }
    res.setHeader('content-type', 'text/html'); res.end(`<html><body>${'a '.repeat(1_200_000)}</body></html>`);
  });
  await assert.rejects(callTool('import_recipe_url', { url: `${base}/gone` }), /La página respondió con 404/);
  await assert.rejects(callTool('import_recipe_url', { url: `${base}/image` }), /no devuelve una página/);
  await assert.rejects(callTool('import_recipe_url', { url: `${base}/big` }), /demasiado grande/);
  await assert.rejects(callTool('import_recipe_url', { url: 'http://127.0.0.1:9/nada' }), /No se pudo abrir la página/);
});
