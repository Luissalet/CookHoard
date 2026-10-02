// Start the app from any working directory: tsx is resolved from this package, the TypeScript core runs under plain node.
import { tsImport } from 'tsx/esm/api';
await tsImport('./main.mjs', import.meta.url);
