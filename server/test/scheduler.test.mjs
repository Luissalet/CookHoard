import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { callTool } from '../tools/index.mjs';
import { runDaily, startScheduler, readSchedulerState, schedulerStatus } from '../scheduler.mjs';
import { readKitchen } from '../store.mjs';
import { scratch, fakeHub, fixedClock } from './helpers.mjs';

const expiring = (hub) => hub.log.events.filter((e) => e.type === 'cookhoard.pantry.expiring');

test('the daily routine emits one event with the count and at most ten items, and only once a day', async (t) => {
  const s = scratch(); fixedClock('2026-09-10T09:05:00'); const hub = fakeHub(); t.after(() => s.done());
  const names = ['kiwano', 'jícama', 'yuzu', 'durián', 'rambután', 'mangostán', 'pitaya', 'feijoa', 'lichi', 'carambola', 'níspero', 'tamarillo'];
  for (const [i, name] of names.entries()) await callTool('pantry_set', { ingredient: name, expires_at: i < 11 ? '2026-09-11' : '2026-12-01' });
  const first = runDaily();
  assert.equal(first.ran, true);
  assert.equal(first.expiring, 11);
  const [event] = expiring(hub);
  assert.equal(event.data.count, 11);
  assert.equal(event.data.items.length, 10);
  assert.deepEqual(Object.keys(event.data.items[0]).sort(), ['days_left', 'id', 'name']);
  assert.equal(runDaily().reason, 'already_ran_today');
  assert.equal(expiring(hub).length, 1);
  assert.equal(readSchedulerState().last_run, '2026-09-10');
  assert.ok(fs.existsSync(path.join(s.dir, 'scheduler.json')));
  assert.ok(!('last_run' in readKitchen()), 'scheduler state is not in the kitchen file');
  fixedClock('2026-09-11T09:01:00');
  assert.equal(runDaily().ran, true);
  assert.equal(expiring(hub).length, 2);
});

test('nothing expiring: the run is recorded but no event is sent', async (t) => {
  const s = scratch(); fixedClock('2026-09-10T09:05:00'); const hub = fakeHub(); t.after(() => s.done());
  await callTool('pantry_set', { ingredient: 'lentejas', expires_at: '2027-01-01' });
  const result = runDaily();
  assert.equal(result.emitted, false);
  assert.equal(expiring(hub).length, 0);
  assert.equal(schedulerStatus().last_result.expiring, 0);
});

test('the timer waits for 09:00 and catches up when the app starts later; COOKHOARD_SCHEDULER=0 turns it off', async (t) => {
  const s = scratch(); const hub = fakeHub(); t.after(() => s.done());
  await callTool('pantry_set', { ingredient: 'yogur', expires_at: '2026-09-10' });
  let tick;
  const handle = () => startScheduler({ enabled: true, setTimer: (fn) => { tick = fn; return { unref() {} }; }, clearTimer: () => {} });
  fixedClock('2026-09-10T07:30:00');
  const early = handle();
  assert.equal(tick().reason, 'before_time');
  assert.equal(expiring(hub).length, 0);
  fixedClock('2026-09-10T14:20:00');
  assert.equal(tick().ran, true, 'started in the afternoon: the missed run happens now');
  assert.equal(expiring(hub).length, 1);
  assert.equal(tick().reason, 'already_ran_today');
  early.stop();
  assert.equal(startScheduler({ enabled: false }).enabled, false);
  process.env.COOKHOARD_SCHEDULER = '0';
  assert.equal(startScheduler().enabled, false);
});
