// Daily routine: at 09:00 local time (or at start-up when that moment passed today without a run) look for food about to expire
// and tell the family bus. State lives in <data>/scheduler.json, apart from the kitchen file. Time and timers are injectable.
import fs from 'node:fs';
import path from 'node:path';
import { pantryView } from '@cookhoard/core';
import { dataDir, readKitchen } from './store.mjs';
import { now, today } from './clock.mjs';
import { emit } from './hub.mjs';

export const DAILY_HOUR = 9;
export const EXPIRING_DAYS = 2;
const stateFile = () => path.join(dataDir(), 'scheduler.json');

export function readSchedulerState() {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch { return {}; }
}
function writeSchedulerState(value) {
  try { fs.mkdirSync(path.dirname(stateFile()), { recursive: true }); fs.writeFileSync(stateFile(), JSON.stringify(value, null, 2) + '\n'); } catch { /* the routine still ran */ }
}

/** One run of the daily routine. Emits cookhoard.pantry.expiring when something expires within two days. */
export function runDaily({ force = false } = {}) {
  const state = readSchedulerState();
  const day = today();
  if (!force && state.last_run === day) return { ran: false, reason: 'already_ran_today', last_run: state.last_run };
  const kitchen = readKitchen();
  const view = pantryView(kitchen, day).filter((p) => p.days_left !== null && p.days_left <= EXPIRING_DAYS);
  const items = view.slice(0, 10).map((p) => ({ id: p.ingredientId, name: p.name, days_left: p.days_left }));
  if (view.length) emit('cookhoard.pantry.expiring', { count: view.length, items });
  const result = { ran: true, day, expiring: view.length, emitted: view.length > 0 };
  writeSchedulerState({ last_run: day, last_run_at: now().toISOString(), last_result: { expiring: view.length, emitted: result.emitted } });
  return result;
}

/** Start the daily scheduler. `tick` runs every minute; the first check happens at once (catch-up). */
export function startScheduler({ enabled = process.env.COOKHOARD_SCHEDULER !== '0', intervalMs = 60000, setTimer = setInterval, clearTimer = clearInterval } = {}) {
  if (!enabled) return { enabled: false, stop() {}, tick() { return { ran: false, reason: 'disabled' }; } };
  const tick = () => {
    if (now().getHours() < DAILY_HOUR) return { ran: false, reason: 'before_time' };
    try { return runDaily(); } catch (error) { return { ran: false, reason: 'error', error: String(error?.message || error) }; }
  };
  const timer = setTimer(tick, intervalMs);
  timer?.unref?.();
  setTimeout(tick, 2000).unref?.();
  return { enabled: true, tick, stop() { clearTimer(timer); } };
}

export function schedulerStatus(enabled = process.env.COOKHOARD_SCHEDULER !== '0') {
  const state = readSchedulerState();
  return { enabled, daily_at: `${String(DAILY_HOUR).padStart(2, '0')}:00`, last_run: state.last_run ?? null, last_result: state.last_result ?? null };
}
