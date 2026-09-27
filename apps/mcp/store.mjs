import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function dataFile(env = process.env) {
  const directory = env.COOKHOARD_DATA_DIR || path.join(env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'CookHoard');
  return path.join(directory, 'kitchen.json');
}

export function readKitchen(file = dataFile()) {
  if (!fs.existsSync(file)) return { version: 1, shopping: [], menu: null, recipes: [] };
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (parsed?.version !== 1 || !Array.isArray(parsed.shopping) ||
      !(parsed.menu === null || (typeof parsed.menu === 'object' && Array.isArray(parsed.menu.plan?.days))) ||
      (parsed.recipes !== undefined && !Array.isArray(parsed.recipes))) {
    throw new Error('Los datos de cocina tienen un formato desconocido; no se sobrescribieron.');
  }
  return { ...parsed, recipes: parsed.recipes || [] };
}

export function writeKitchen(state, file = dataFile()) {
  const directory = path.dirname(file);
  fs.mkdirSync(directory, { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(state, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export function updateKitchen(transform, file = dataFile()) {
  const current = readKitchen(file);
  const next = transform(structuredClone(current));
  writeKitchen(next, file);
  return next;
}
