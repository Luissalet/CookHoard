// The kitchen file: <data dir>/kitchen.json. Version 1 files are read as they are and migrated in memory;
// every write stores version 2 (the first one keeps a copy of the old file next to it).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { normalizeKitchen, emptyKitchen } from '@cookhoard/core';
import { withFileLock } from './lock.mjs';
import { writeJsonAtomic } from './hoard-commons/server.js';

export { normalizeKitchen };

export function dataDir(env = process.env) {
  return env.COOKHOARD_DATA_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CookHoard');
}

export function dataFile(env = process.env) {
  return path.join(dataDir(env), 'kitchen.json');
}

export function readKitchen(file = dataFile()) {
  if (!fs.existsSync(file)) return emptyKitchen();
  return normalizeKitchen(JSON.parse(fs.readFileSync(file, 'utf8')));
}

export function writeKitchen(state, file = dataFile()) {
  writeJsonAtomic(file, state);
}

function keepVersionOne(file) {
  try {
    if (!fs.existsSync(file)) return;
    const head = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (head?.version === 1) {
      const backup = `${file}.v1.bak`;
      if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    }
  } catch { /* unreadable file: normalizeKitchen reports it before we get here */ }
}

/** Read, transform and write under the cross-process lock. A transform that throws writes nothing. */
export function updateKitchen(transform, file = dataFile()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  return withFileLock(file, () => {
    const current = readKitchen(file);
    const next = transform(structuredClone(current));
    keepVersionOne(file);
    writeKitchen(next, file);
    return next;
  });
}
