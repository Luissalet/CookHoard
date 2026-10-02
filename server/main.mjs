// Entry point: pick a port, open the kitchen and serve the UI and the API on 127.0.0.1.
import fs from 'node:fs';
import path from 'node:path';
import { createApp } from './app.mjs';
import { findAvailablePort, validPort } from './port.mjs';
import { dataDir } from './store.mjs';
import { version } from './version.mjs';

const PREFERRED = validPort(process.env.COOKHOARD_PORT || process.env.PORT, 5210);
const PORT = process.env.PORT_STRICT === '1' ? PREFERRED : await findAvailablePort(PREFERRED);
const directory = dataDir();
const { app, scheduler } = createApp({ dataDir: directory, startBackground: true });

const server = app.listen(PORT, '127.0.0.1', () => {
  try { fs.writeFileSync(path.join(directory, 'app-url'), `http://127.0.0.1:${PORT}\n`); fs.writeFileSync(path.join(directory, 'app.pid'), `${process.pid}\n`); } catch { /* the bridge falls back to the default port */ }
  if (PORT !== PREFERRED) console.log(`Puerto ${PREFERRED} ocupado; usando ${PORT}.`);
  console.log(`CookHoard ${version} en http://127.0.0.1:${PORT} · datos en ${directory}`);
});
server.on('close', () => scheduler.stop());
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { for (const name of ['app-url', 'app.pid']) { try { fs.rmSync(path.join(directory, name), { force: true }); } catch { /* best effort */ } } process.exit(0); });
server.on('error', (error) => { console.error(`No se pudo iniciar CookHoard: ${error.message}`); process.exitCode = 1; });
