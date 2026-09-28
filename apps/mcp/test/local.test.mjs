import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { callTool } from '../tools.mjs';
import { readKitchen, dataFile } from '../store.mjs';

test('local kitchen persists menu and list through a full planning cycle', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-mcp-'));
  process.env.COOKHOARD_DATA_DIR = directory;
  try {
    const initial = await callTool('kitchen_state');
    assert.deepEqual(initial.shopping, []);
    await callTool('add_kitchen_item', { name: 'tomate', checked: true });
    const recommendations = await callTool('recommend_recipes', { month: 7 });
    assert.ok(recommendations.recipes.some((item) => item.have.includes('Tomate')));
    const planned = await callTool('plan_week', { month: 7 });
    assert.equal(planned.menu.days.length, 7);
    const firstIds = planned.menu.days.map((day) => day.recipeId);
    const changed = await callTool('change_menu_day', { day: 1 });
    assert.notEqual(changed.menu.days[0].recipeId, firstIds[0]);
    assert.deepEqual(changed.menu.days.slice(1).map((day) => day.recipeId), firstIds.slice(1));
    const firstShopping = await callTool('add_menu_missing');
    const secondShopping = await callTool('add_menu_missing');
    assert.deepEqual(secondShopping.shopping, firstShopping.shopping, 'repeating does not duplicate ingredients');
    assert.ok(readKitchen().shopping.some((item) => item.ingredientId === 'tomato' && item.checked));
    assert.equal((await callTool('kitchen_state')).menu.days[0].recipeId, changed.menu.days[0].recipeId);
    await callTool('set_kitchen_item', { ingredient_id: 'tomato', checked: false });
    assert.ok(!(await callTool('kitchen_state')).pantry.some((item) => item.id === 'tomato'));
    await callTool('remove_kitchen_item', { ingredient_id: 'tomato' });
    assert.ok(!readKitchen().shopping.some((item) => item.ingredientId === 'tomato'));
    assert.ok(fs.existsSync(dataFile()));
    const saved = await callTool('save_recipe', { title: 'Ensalada de prueba', ingredients: ['tomate', 'pepino'], steps: ['Cortar y mezclar.'], season: 'summer' });
    assert.ok(saved.recipe.id.startsWith('local-'));
    assert.equal((await callTool('find_recipes', { query: 'Ensalada de prueba' })).recipes[0].id, saved.recipe.id);
    assert.equal((await callTool('get_recipe', { recipe_id: saved.recipe.id })).steps[0].text, 'Cortar y mezclar.');
    assert.ok((await callTool('recommend_recipes', { month: 7, limit: 20 })).recipes.some((item) => item.recipe.id === saved.recipe.id));
  } finally {
    delete process.env.COOKHOARD_DATA_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('Faustus-compatible stdio MCP starts from an unrelated cwd', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-stdio-'));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../bootstrap.mjs', import.meta.url))],
    cwd: os.tmpdir(),
    env: { ...process.env, COOKHOARD_DATA_DIR: directory },
  });
  const client = new Client({ name: 'cookhoard-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const catalog = await client.listTools();
    assert.ok(catalog.tools.some((tool) => tool.name === 'recommend_recipes'));
    assert.ok(catalog.tools.some((tool) => tool.name === 'set_menu_day'));
    assert.ok(catalog.tools.some((tool) => tool.name === 'import_recipe_url'));
    assert.equal(catalog.tools.find((tool) => tool.name === 'menu_ingredients').annotations.readOnlyHint, true);
    const result = await client.callTool({ name: 'find_recipes', arguments: { query: 'gazpacho' } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).recipes[0].id, 'gazpacho');
  } finally {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('menu portions aggregate every required ingredient, preserve units and leave the kitchen unchanged on reads and errors', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-portions-'));
  process.env.COOKHOARD_DATA_DIR = directory;
  try {
    const { recipe } = await callTool('save_recipe', { title: 'Prueba de raciones', servings: 2,
      ingredients: [{ name: 'tomate', quantity: 100, unit: 'g' },
        { name: 'tomate', quantity: 1, unit: 'ud' },
        { name: 'sal', quantity: 2, unit: 'g', isCore: false },
        { name: 'sal', unit: 'g', isCore: false },
        { name: 'pepino', quantity: 20, unit: 'g', optional: true }], steps: ['Mezclar.'] });
    const unknown = await callTool('save_recipe', { title: 'Sin rendimiento', ingredients: ['tomate'], steps: ['Cortar.'] });
    await callTool('plan_week');
    const before = readKitchen();
    await callTool('set_menu_day', { day: 1, recipe_id: recipe.id, servings: 4 });
    await callTool('set_menu_day', { day: 2, recipe_id: recipe.id, servings: 2 });
    assert.deepEqual(readKitchen().menu.plan.days.slice(2), before.menu.plan.days.slice(2));
    await callTool('add_kitchen_item', { name: 'tomate', checked: true });
    const bytes = fs.readFileSync(dataFile(), 'utf8');
    const totals = await callTool('menu_ingredients', { days: [1, 2, 2] });
    const tomatoG = totals.required.find((item) => item.ingredient_id === 'tomato' && item.unit === 'g');
    assert.equal(tomatoG.quantity, 300);
    assert.equal(tomatoG.pantry_present, true);
    assert.equal(totals.required.find((item) => item.ingredient_id === 'tomato' && item.unit === 'ud').quantity, 3);
    const salt = totals.required.find((item) => item.ingredient_id === 'salt');
    assert.equal(salt.quantity, null);
    assert.equal(salt.known_quantity, 6);
    assert.equal(salt.unknown_quantity_count, 2);
    assert.equal(totals.optional[0].quantity, 60);
    assert.equal(fs.readFileSync(dataFile(), 'utf8'), bytes);
    for (const args of [{ day: 0, recipe_id: recipe.id }, { day: 8, recipe_id: recipe.id },
      { day: 1, recipe_id: 'missing' }, { day: 1, recipe_id: unknown.recipe.id, servings: 3 }]) {
      await assert.rejects(callTool('set_menu_day', args));
      assert.equal(fs.readFileSync(dataFile(), 'utf8'), bytes);
    }
    await callTool('set_menu_day', { day: 1, recipe_id: recipe.id, servings: 3 });
    const corrected = fs.readFileSync(dataFile(), 'utf8');
    await callTool('set_menu_day', { day: 1, recipe_id: recipe.id, servings: 3 });
    assert.equal(fs.readFileSync(dataFile(), 'utf8'), corrected);
    assert.equal((await callTool('menu_ingredients', { days: [1, 2] })).required[0].quantity, 250);
    await callTool('set_menu_day', { day: 1, recipe_id: recipe.id });
    assert.equal((await callTool('menu_ingredients', { days: [1] })).required[0].quantity, 100);
    await callTool('set_menu_day', { day: 1, recipe_id: unknown.recipe.id });
    const unscaled = await callTool('menu_ingredients', { days: [1] });
    assert.equal(unscaled.days[0].servings, null);
    assert.equal(unscaled.required[0].quantity, null);
    await callTool('set_menu_day', { day: 1, recipe_id: recipe.id, servings: 3 });
    await callTool('change_menu_day', { day: 1 });
    assert.equal(readKitchen().menu.plan.days[0].servings, undefined);
  } finally {
    delete process.env.COOKHOARD_DATA_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('local cookbook keeps structured recipes, cooking history and expiry on disk', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-features-'));
  process.env.COOKHOARD_DATA_DIR = directory;
  try {
    const saved = await callTool('save_recipe', { title: 'Tortilla de prueba', servings: 2,
      ingredients: [{ name: 'huevo', quantity: 3, unit: 'ud' }, { name: 'patata', quantity: 0.5, unit: 'kg' }],
      steps: [{ text: 'Batir huevos', timerSec: 60 }, 'Cocinar'], temperature: 'hot' });
    const id = saved.recipe.id;
    assert.equal(saved.recipe.servings, 2);
    assert.equal(saved.recipe.ingredients[0].quantity, 3);
    assert.equal((await callTool('get_recipe', { recipe_id: id })).steps[0].timerSec, 60);
    await callTool('update_recipe', { recipe_id: id, changes: { servings: 4, description: 'Más raciones' } });
    assert.equal((await callTool('get_recipe', { recipe_id: id })).servings, 4);
    await callTool('set_recipe_saved', { recipe_id: id, saved: true });
    assert.equal((await callTool('saved_recipes')).recipes[0].id, id);
    const cooking = await callTool('record_cooking', { recipe_id: id, rating: 5,
      notes: 'Salió bien', would_repeat: true });
    assert.equal(cooking.cooking.rating, 5);
    assert.equal((await callTool('cooking_history', { recipe_id: id })).cooking.length, 1);
    await callTool('add_kitchen_item', { name: 'huevo', checked: true });
    await callTool('set_expiry', { ingredient_id: 'egg', expires_at: '2020-01-01' });
    const expiring = await callTool('use_expiring', { within_days: 3 });
    assert.ok(expiring.expiring.some((item) => item.ingredientId === 'egg'));
    assert.ok(expiring.recipes.some((item) => item.recipe.id === id));
    const backup = await callTool('export_kitchen');
    assert.equal(backup.kitchen.recipes[0].servings, 4);
    assert.equal(readKitchen().makes.length, 1);
    await callTool('delete_recipe', { recipe_id: id });
    assert.equal((await callTool('find_recipes', { query: 'Tortilla de prueba' })).recipes.length, 0);
    assert.equal((await callTool('cooking_history', { recipe_id: id })).cooking.length, 1);
    const imported = await callTool('import_kitchen', { snapshot_json: JSON.stringify(backup.kitchen) });
    assert.equal(imported.recipes, 1);
    assert.equal((await callTool('get_recipe', { recipe_id: id })).servings, 4);
    await callTool('import_kitchen', { snapshot_json: JSON.stringify(backup.kitchen) });
    assert.equal(readKitchen().recipes.length, 1, 'restoring twice does not duplicate recipes');
    assert.equal(readKitchen().makes.length, 1, 'restoring twice does not duplicate cooking records');
  } finally {
    delete process.env.COOKHOARD_DATA_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('a recipe page imports through MCP once and persists its source', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'cookhoard-url-'));
  process.env.COOKHOARD_DATA_DIR = directory;
  const page = `<html><script type="application/ld+json">broken</script>
    <script data-purpose="recipe" type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
      { '@type': 'WebPage', name: 'Example' },
      { '@type': ['Thing', 'Recipe'], name: 'Sopa local', recipeYield: '2 personas',
        recipeIngredient: ['200 g tomate', '1 cebolla'],
        recipeInstructions: [{ '@type': 'HowToStep', text: 'Cocer 20 minutos.' }] },
    ] })}</script></html>`;
  const server = http.createServer((request, response) => {
    response.setHeader('content-type', 'text/html; charset=utf-8');
    response.end(request.url === '/recipe' ? page : '<html>sin receta</html>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const imported = await callTool('import_recipe_url', { url: `${base}/recipe` });
    assert.equal(imported.already_imported, false);
    assert.equal(imported.recipe.title, 'Sopa local');
    assert.equal(imported.recipe.servings, 2);
    assert.equal(imported.recipe.ingredients[0].quantity, 200);
    assert.equal(imported.recipe.ingredients[0].unit, 'g');
    assert.equal(imported.recipe.sourceUrl, `${base}/recipe`);
    assert.equal(imported.steps[0].timerSec, 1200);
    assert.equal((await callTool('get_recipe', { recipe_id: imported.recipe.id })).sourceUrl, `${base}/recipe`);
    const repeated = await callTool('import_recipe_url', { url: `${base}/recipe` });
    assert.equal(repeated.already_imported, true);
    assert.equal(repeated.recipe.id, imported.recipe.id);
    const before = fs.readFileSync(dataFile(), 'utf8');
    await assert.rejects(callTool('import_recipe_url', { url: `${base}/missing` }), /No se encontró una receta/);
    assert.equal(fs.readFileSync(dataFile(), 'utf8'), before);
    assert.equal(readKitchen().recipes.length, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.COOKHOARD_DATA_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
