import fs from 'node:fs';
import { renderApiDocs } from '../server/api-docs.mjs';

fs.mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
fs.writeFileSync(new URL('../docs/API.md', import.meta.url), renderApiDocs());
console.log('docs/API.md actualizado');
