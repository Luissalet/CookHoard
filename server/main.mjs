// Entry point: pick a port, open the kitchen and serve the UI and the API on 127.0.0.1. Listening, the clean shutdown (SIGINT / SIGTERM)
// and the forced exit after 15 s are runServer of hoard-commons/express.js.
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.mjs';
import { runServer } from './hoard-commons/express.js';
import { findAvailablePort, validPort, envFlag, writeUrl, writeTextAtomic } from './hoard-commons/server.js';
import { dataDir } from './store.mjs';
import { version } from './version.mjs';

const PREFERRED = validPort(process.env.COOKHOARD_PORT || process.env.PORT, 5210);
const directory = dataDir();
const forget = () => { for (const name of ['app-url', 'app.pid']) { try { fs.rmSync(path.join(directory, name), { force: true }); } catch { /* best effort */ } } };

try {
  const PORT = envFlag('PORT_STRICT', false) ? PREFERRED : await findAvailablePort(PREFERRED, { span: 100 });
  let scheduler;
  const { port } = await runServer({
    service: 'CookHoard',
    createApp: () => { const made = createApp({ dataDir: directory, startBackground: true }); scheduler = made.scheduler; return made.app; },
    port: PORT,
    onShutdown: () => { scheduler?.stop(); forget(); },
  });
  try { writeUrl(path.join(directory, 'app-url'), `http://127.0.0.1:${port}`); writeTextAtomic(path.join(directory, 'app.pid'), `${process.pid}\n`); } catch { /* the bridge falls back to the default port */ }
  if (port !== PREFERRED) console.log(`Puerto ${PREFERRED} ocupado; usando ${port}.`);
  console.log(`CookHoard ${version} en http://127.0.0.1:${port} · datos en ${directory}`);
} catch (error) {
  console.error(`No se pudo iniciar CookHoard: ${error.message}`);
  process.exitCode = 1;
}
