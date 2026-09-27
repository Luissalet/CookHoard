import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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
    const result = await client.callTool({ name: 'find_recipes', arguments: { query: 'gazpacho' } });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).recipes[0].id, 'gazpacho');
  } finally {
    await client.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
