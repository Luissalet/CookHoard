// The Express app: UI, REST, the family contract (/api/health, /api/agent/*) and the media folder. main.mjs boots it; tests call createApp().
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createGuard } from './guard.mjs';
import { ROOT, version } from './version.mjs';
import { dataDir as resolveDataDir } from './store.mjs';
import { TOOLS_BY_NAME, callTool, toolCatalog, INSTRUCTIONS } from './tools/index.mjs';
import { manifest, serviceWorker } from './manifest.mjs';
import { detectTools } from './media.mjs';
import { schedulerStatus, startScheduler } from './scheduler.mjs';
import { readKitchen } from './store.mjs';
import { getSettings } from '@cookhoard/core';
import * as family from './hoard-link.js';

export { ROOT };

export function writeToken(directory) {
  const token = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, 'mcp-token'), token, { mode: 0o600 });
  return token;
}

const errorStatus = (error) => error.status || (error.issues ? 400 : /Los datos de cocina tienen un formato desconocido/.test(error.message) ? 409 : 500);
const errorMessage = (error) => (error.issues ? error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; ') : error.message);

export function createApp({ dataDir, allowedHosts = process.env.COOKHOARD_ALLOWED_HOSTS, serveStatic = true, startBackground = false } = {}) {
  if (dataDir) process.env.COOKHOARD_DATA_DIR = dataDir;
  const directory = resolveDataDir();
  fs.mkdirSync(directory, { recursive: true });
  const token = writeToken(directory);
  family.configure({ app: 'cookhoard', dataDir: directory });

  const app = express();
  app.disable('x-powered-by');
  app.use(createGuard(allowedHosts));
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', async (req, res) => {
    const tools = await detectTools(getSettings(readKitchen()));
    res.json({ service: 'cookhoard', version, ytdlp: tools.ytdlp ? { version: tools.ytdlp.version } : null, ffmpeg: tools.ffmpeg ? { version: tools.ffmpeg.version } : null,
      scheduler: schedulerStatus(), tools: TOOLS_BY_NAME.size, hoard_link: family.healthBlock() });
  });

  app.get('/api/agent/tools', (req, res) => res.json({ instructions: INSTRUCTIONS, tools: toolCatalog() }));

  // family.recordAgentRoute: one agent.call event per call on the hub's bus.
  app.post('/api/agent/call', family.recordAgentRoute(async (req, res) => {
    const header = req.headers.authorization || '';
    const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    const ok = given.length === token.length && crypto.timingSafeEqual(Buffer.from(given), Buffer.from(token));
    if (!ok) return res.status(401).json({ error: 'Token MCP no válido.' });
    const { name, arguments: args } = req.body || {};
    if (typeof name !== 'string') return res.status(400).json({ error: 'Falta el nombre de la herramienta.' });
    try { res.json(await callTool(name, args)); }
    catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error), ...(error.code ? { code: error.code } : {}) }); }
  }));

  // The web UI calls the same tools (no token: same origin, guarded by the local-only guard).
  app.post('/api/tools/:name', async (req, res) => {
    try { res.json(await callTool(req.params.name, req.body || {})); }
    catch (error) { res.status(errorStatus(error)).json({ error: errorMessage(error), ...(error.code ? { code: error.code } : {}) }); }
  });

  app.use('/media', (req, res, next) => { res.set('Cache-Control', 'private, max-age=86400'); next(); }, express.static(path.join(directory, 'media'), { fallthrough: false, index: false }));

  app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').send(JSON.stringify(manifest())));
  app.get('/sw.js', (req, res) => res.set('Service-Worker-Allowed', '/').type('application/javascript').send(serviceWorker()));
  app.all(/^\/api(\/.*)?$/, (req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

  const dist = path.join(ROOT, 'apps', 'web', 'dist');
  if (serveStatic && fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get(/^(?!\/api|\/media).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else if (serveStatic) {
    app.get('/', (req, res) => res.status(503).type('text/plain').send('CookHoard está en marcha, pero falta la interfaz: ejecuta "npm run build" una vez.'));
  }

  // eslint-disable-next-line no-unused-vars
  app.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON no válido.' });
    if (error.status === 404 && req.path.startsWith('/media')) return res.status(404).json({ error: 'Imagen no encontrada.' });
    res.status(errorStatus(error)).json({ error: errorMessage(error) });
  });

  const scheduler = startBackground ? startScheduler() : { enabled: false, stop() {} };
  return { app, token, scheduler, dataDir: directory };
}
