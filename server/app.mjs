// The Express app: UI, REST, the family contract (/api/health, /api/agent/*) and the media folder. main.mjs boots it; tests call createApp().
import express from 'express';
import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, version } from './version.mjs';
import { dataDir as resolveDataDir } from './store.mjs';
import { TOOLS, TOOLS_BY_NAME, callTool, INSTRUCTIONS } from './tools/index.mjs';
import { annotationsOf } from './tools/common.mjs';
import { manifest, serviceWorker } from './manifest.mjs';
import { detectTools } from './media.mjs';
import { schedulerStatus, startScheduler } from './scheduler.mjs';
import { readKitchen } from './store.mjs';
import { getSettings } from '@cookhoard/core';
import * as family from './hoard-link.js';
import { createGuard, installSpa, installErrorHandlers, makeAgentRoutes, errorBody } from './hoard-commons/express.js';
import { readOrCreateToken } from './hoard-commons/server.js';
import { serviceAvailable } from './hoard-commons/fam-services.js';

export { ROOT };

/** The bearer token of this data folder: <data>/mcp-token, created once and then kept (a bridge that is already running keeps working). */
export const loadToken = (directory) => readOrCreateToken(path.join(directory, 'mcp-token'));

/** The unreadable-kitchen error is a conflict (409) and its Spanish message is for the person; anything else goes through the shared envelope. */
const shaped = (error) => (/Los datos de cocina tienen un formato desconocido/.test(error?.message) ? Object.assign(error, { status: 409, expose: true }) : error);

/** Agent results are capped (the largest list is halved until it fits; a `truncated` block says what was cut). The UI route is not. */
const AGENT_RESULT_BYTES = 100_000;

export function createApp({ dataDir, allowedHosts = process.env.COOKHOARD_ALLOWED_HOSTS, serveStatic = true, startBackground = false } = {}) {
  if (dataDir) process.env.COOKHOARD_DATA_DIR = dataDir;
  const directory = resolveDataDir();
  fs.mkdirSync(directory, { recursive: true });
  const token = loadToken(directory);
  family.configure({ app: 'cookhoard', dataDir: directory });

  const app = express();
  app.disable('x-powered-by');
  app.use(createGuard({ allowedHosts }));
  app.use(express.json({ limit: '12mb' }));

  app.get('/api/health', async (req, res) => {
    const tools = await detectTools(getSettings(readKitchen()));
    res.json({ service: 'cookhoard', version, ytdlp: tools.ytdlp ? { version: tools.ytdlp.version } : null, ffmpeg: tools.ffmpeg ? { version: tools.ffmpeg.version } : null,
      links_media: await serviceAvailable('media'), scheduler: schedulerStatus(), tools: TOOLS_BY_NAME.size, hoard_link: family.healthBlock() });
  });

  // GET /api/agent/tools and POST /api/agent/call: Bearer token, result cap, one error envelope and the agent.call event of the family bus.
  makeAgentRoutes({ app: 'cookhoard', tools: TOOLS.map((t) => ({ ...t, annotations: annotationsOf(t) })), z, token, instructions: INSTRUCTIONS, capLimit: AGENT_RESULT_BYTES,
    callTool: (name, args) => callTool(name, args).catch((error) => { throw shaped(error); }), recordCall: family.recordCall }).install(app);

  // The web UI calls the same tools (no token: same origin, guarded by the local-only guard).
  app.post('/api/tools/:name', async (req, res) => {
    try { res.json(await callTool(req.params.name, req.body || {})); }
    catch (error) { const { status, body } = errorBody(shaped(error)); res.status(status).json(body); }
  });

  app.use('/media', (req, res, next) => { res.set('Cache-Control', 'private, max-age=86400'); next(); }, express.static(path.join(directory, 'media'), { index: false }),
    (req, res) => res.status(404).json({ error: 'Imagen no encontrada.', code: 'not_found' }));

  app.get('/manifest.webmanifest', (req, res) => res.type('application/manifest+json').send(JSON.stringify(manifest())));
  app.get('/sw.js', (req, res) => res.set('Service-Worker-Allowed', '/').type('application/javascript').send(serviceWorker()));

  if (serveStatic) installSpa(app, path.join(ROOT, 'apps', 'web', 'dist'), { express });
  else app.all(/^\/api(\/.*)?$/, (req, res) => res.status(404).json({ error: 'Ruta no encontrada.', code: 'not_found' }));
  installErrorHandlers(app);

  const scheduler = startBackground ? startScheduler() : { enabled: false, stop() {} };
  return { app, token, scheduler, dataDir: directory };
}
