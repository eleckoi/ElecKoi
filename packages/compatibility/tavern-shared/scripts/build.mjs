import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
await mkdir(path.join(root, 'dist'), { recursive: true });
await import('./build-tavern-runtime.mjs');
await build({ entryPoints: [path.join(root, 'src/index.js')], bundle: true, format: 'iife', globalName: 'ElecKoiTavernShared',
  target: 'chrome108', sourcemap: true, outfile: path.join(root, 'dist/tavern-shared.global.js') });
await cp(path.join(root, 'assets'), path.join(root, 'dist/assets'), { recursive: true });
console.log('Built shared installers, pure Tavern runtime, and browser resources. Host capabilities remain explicitly injected.');
