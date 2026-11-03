import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callTool } from '../tools/index.mjs';
import { readKitchen } from '../store.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const setup = (t) => { const s = scratch(); fixedClock(); fakeHub(); t.after(() => s.done()); return s; };

test('global cooking history: current titles, unavailable recipes, zeros and false kept, latest N of total', async (t) => {
  setup(t);
  const keep = (await callTool('save_recipe', { title: 'Lentejas', servings: 4, ingredients: ['lentejas'], steps: ['Cuece.'] })).recipe;
  const gone = (await callTool('save_recipe', { title: 'Tortilla', servings: 2, ingredients: ['huevo'], steps: ['Bate.'] })).recipe;
  const notes = 'Notas largas '.repeat(40).trim();
  await callTool('record_cooking', { recipe_id: keep.id, servings_made: 4, servings_eaten: 4, rating: 4, time_taken_min: 0, would_repeat: false, notes });
  await callTool('record_cooking', { recipe_id: gone.id });
  await callTool('record_cooking', { recipe_id: keep.id, servings_made: 2, servings_eaten: 0 });
  await callTool('delete_recipe', { recipe_id: gone.id });
  await callTool('update_recipe', { recipe_id: keep.id, changes: { title: 'Lentejas de la abuela' } });
  const before = JSON.stringify(readKitchen().makes);

  const all = await callTool('cooking_history', { limit: 20 });
  assert.equal(all.total, 3);
  assert.deepEqual(all.cooking.map((m) => m.recipe_title), ['Lentejas de la abuela', null, 'Lentejas de la abuela'], 'current title, null when the recipe is gone; newest first');
  const [latest, orphan, first] = all.cooking;
  assert.equal(latest.servingsEaten, 0);
  assert.equal(orphan.recipeId, gone.id);
  assert.equal(orphan.rating, undefined);
  assert.equal(first.timeTakenMin, 0);
  assert.equal(first.wouldRepeat, false);
  assert.equal(first.notes, notes);

  const two = await callTool('cooking_history', { limit: 2 });
  assert.equal(two.total, 3);
  assert.deepEqual(two.cooking.map((m) => m.id), all.cooking.slice(0, 2).map((m) => m.id));
  const one = await callTool('cooking_history', { recipe_id: keep.id, limit: 1 });
  assert.equal(one.total, 2);
  assert.equal(one.cooking[0].id, latest.id);
  assert.equal(JSON.stringify(readKitchen().makes), before, 'reading the history changes nothing');
  assert.ok(!('recipe_title' in readKitchen().makes[0]), 'the title is added to the answer, not stored');
});
