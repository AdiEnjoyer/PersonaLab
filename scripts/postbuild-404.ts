import { copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dist = path.join(fileURLToPath(new URL('../', import.meta.url)), 'dist');
// GitHub Pages serves 404.html for unknown paths, so deep links load the SPA.
await copyFile(path.join(dist, 'index.html'), path.join(dist, '404.html'));
console.log('dist/404.html written');