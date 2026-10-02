// Cross-process lock for kitchen.json: the app and an in-process MCP bridge may both write it, and a write must never lose the other's.
// A lock file created exclusively (wx) holds {pid, at}; one that is old or whose process is gone is stale and is taken over.
import fs from 'node:fs';

const sleepBuffer = new Int32Array(new SharedArrayBuffer(4));
export const sleepSync = (ms) => Atomics.wait(sleepBuffer, 0, 0, ms);

const alive = (pid) => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
};

function readLock(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

export function withFileLock(file, fn, { timeoutMs = 15000, staleMs = 10000 } = {}) {
  const lock = `${file}.lock`;
  const deadline = Date.now() + timeoutMs;
  const token = `${process.pid}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
  let waited = 0;
  for (;;) {
    try {
      const fd = fs.openSync(lock, 'wx');
      fs.writeSync(fd, JSON.stringify({ pid: process.pid, at: Date.now(), token }));
      fs.closeSync(fd);
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const held = readLock(lock);
      // An empty file means its creator is between creating and writing it: only old ones count as abandoned.
      let stale;
      if (held) stale = !alive(held.pid) || Date.now() - (held.at || 0) > staleMs;
      else { try { stale = Date.now() - fs.statSync(lock).mtimeMs > 2000; } catch { continue; } }
      if (stale) {
        // Only one contender wins the rename; the others see ENOENT and retry the exclusive create.
        const aside = `${lock}.stale.${process.pid}.${Date.now()}`;
        try { fs.renameSync(lock, aside); fs.rmSync(aside, { force: true }); } catch { /* someone else took it over */ }
        continue;
      }
      if (Date.now() > deadline) throw new Error('La cocina está siendo modificada por otro proceso; inténtalo de nuevo en unos segundos.');
      waited = Math.min(waited + 5, 40);
      sleepSync(waited);
    }
  }
  try {
    return fn();
  } finally {
    const held = readLock(lock);
    if (held && held.token === token) fs.rmSync(lock, { force: true });
  }
}
