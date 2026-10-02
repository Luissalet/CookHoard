import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TOOLS, toolCatalog, lintDescription } from '../tools/index.mjs';
import { renderApiDocs } from '../api-docs.mjs';

const LEGACY = ['kitchen_state', 'find_recipes', 'get_recipe', 'save_recipe', 'recommend_recipes', 'plan_week', 'change_menu_day', 'set_menu_day', 'menu_ingredients', 'add_menu_missing',
  'add_kitchen_item', 'set_kitchen_item', 'remove_kitchen_item', 'update_recipe', 'delete_recipe', 'record_cooking', 'cooking_history', 'set_recipe_saved', 'saved_recipes', 'set_expiry',
  'use_expiring', 'import_recipe_jsonld', 'import_recipe_url', 'export_kitchen', 'import_kitchen'];

test('the 25 original tools are all still there', () => {
  const names = new Set(TOOLS.map((t) => t.name));
  for (const name of LEGACY) assert.ok(names.has(name), name);
  assert.equal(TOOLS.length, new Set(TOOLS.map((t) => t.name)).size, 'names are unique');
});

test('every description: first line up to 110 characters, details, then a Sinónimos line', () => {
  for (const tool of TOOLS) assert.deepEqual(lintDescription(tool), [], tool.name);
});

test('read-only tools carry readOnlyHint, writing tools never claim it, destructive ones say so', () => {
  const catalogue = new Map(toolCatalog().map((t) => [t.name, t]));
  for (const tool of TOOLS) {
    const hints = catalogue.get(tool.name).annotations;
    assert.equal(hints.readOnlyHint, tool.readOnly, tool.name);
    if (tool.readOnly) assert.equal(hints.destructiveHint, false, tool.name);
  }
  for (const name of ['delete_recipe', 'recipe_draft_discard']) assert.equal(catalogue.get(name).annotations.destructiveHint, true, name);
  for (const name of ['kitchen_state', 'find_recipes', 'menu_ingredients', 'pantry_list', 'shopping_list', 'price_book', 'what_to_cook', 'today_overview', 'ticket_review_list']) {
    assert.equal(catalogue.get(name).annotations.readOnlyHint, true, name);
  }
});

test('docs/API.md is generated from the catalogue and is up to date', () => {
  const current = fs.readFileSync(new URL('../../docs/API.md', import.meta.url), 'utf8');
  assert.equal(current.replaceAll('\r\n', '\n'), renderApiDocs(), 'run "npm run docs:api" and commit docs/API.md');
  for (const tool of TOOLS) assert.ok(current.includes(`### \`${tool.name}\``), tool.name);
});
