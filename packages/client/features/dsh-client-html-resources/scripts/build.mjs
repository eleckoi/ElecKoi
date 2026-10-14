import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = join(root, 'dist');
// Build the standalone frame realm before mounting its same-origin resource.
await import(new URL('../../../../compatibility/tavern-native/scripts/build.mjs', import.meta.url));
await mkdir(join(output, 'client'), { recursive: true });
await build({ entryPoints: [join(root, 'src/browser-libraries.js')], bundle: true,
  format: 'iife', globalName: 'ElecKoiHtmlLibraries', target: 'chrome108', sourcemap: true,
  outfile: join(output, 'html-libraries.global.js') });
await build({ entryPoints: ['zod-module', 'lodash-module'].map(name => join(root, 'src', name + '.js')),
  format: 'esm', target: 'chrome108', outdir: output });
await cp(join(root, 'src/runtime.js'), join(output, 'client/runtime.js'));
await cp(join(root, 'assets'), join(output, 'assets'), { recursive: true });
await cp(new URL('../../../../compatibility/tavern-native/dist/tavern-native.global.js', import.meta.url), join(output,'assets/tavern-native.global.js'));
await cp(new URL('../../../../compatibility/tavern-native/dist/tavern-tokenizers.global.js', import.meta.url), join(output,'assets/tavern-tokenizers.global.js'));
await cp(new URL('../../../../compatibility/tavern-native/dist/tokenizer-models/', import.meta.url), join(output,'assets/tokenizer-models'), {recursive:true});
await cp(new URL('../../../../compatibility/tavern-native/dist/licenses/', import.meta.url), join(output,'assets/tokenizer-licenses'), {recursive:true});
await cp(new URL('../../../../compatibility/tavern-native/dist/TOKENIZER_NOTICES.md', import.meta.url), join(output,'assets/TOKENIZER_NOTICES.md'));
await cp(new URL('../../../../compatibility/tavern-native/dist/SillyTavern.LICENSE.txt', import.meta.url), join(output,'assets/SillyTavern.LICENSE.txt'));
await cp(new URL('../../../../compatibility/tavern-native/dist/SillyTavern.SOURCE.json', import.meta.url), join(output,'assets/SillyTavern.SOURCE.json'));
console.log('Built ElecKoi HTML resources and native Tavern frame runtime.');
