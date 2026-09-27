// Resolve tsx from this package, even when Faustus starts us from another cwd.
import { tsImport } from 'tsx/esm/api';
await tsImport('./server.mjs', import.meta.url);
