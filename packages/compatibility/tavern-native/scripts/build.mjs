import { build } from 'esbuild';
import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('..', import.meta.url));
const output = path.join(root, 'dist');
await mkdir(output, {recursive: true});
await build({entryPoints: [path.join(root,'src/realm.js')], bundle: true, format: 'iife', target: 'chrome108',
  minify: true, legalComments: 'eof', loader: {'.html': 'text'}, outfile: path.join(output,'tavern-native.global.js'),
  banner: {js: '/* SillyTavern 1.19.0 (06bde939), AGPL-3.0. Licensed ST modules and native ElecKoi adapters; independent TavernHelper facade. */'},
});
await build({entryPoints: [path.join(root,'src/tokenizers.js')], bundle: true, format: 'iife', target: 'chrome108',
  minify: true, legalComments: 'eof', external: ['module','fs','path','url'],
  plugins: [{name:'tokenizer-browser-environment',setup(builder) {
    builder.onLoad({filter:/tokenizer-engine\.js$/}, async () => {
      const {createRequire} = await import('node:module');
      const runtime = createRequire(import.meta.url).resolve('@agnai/web-tokenizers');
      return {contents:`import bindings from ${JSON.stringify(runtime)}; export const Tokenizer = bindings.Tokenizer;`,loader:'js'};
    });
    builder.onLoad({filter:/web-tokenizers[\\/]lib[\\/]index\.(?:js|cjs)$/}, async ({path: file}) => {
      const {readFile} = await import('node:fs/promises');
      let contents = await readFile(file,'utf8');
      contents = contents.replace(/var ENVIRONMENT_IS_NODE\s*=\s*globalThis\.process\?\.versions\?\.node && globalThis\.process\?\.type != 'renderer'/,'var ENVIRONMENT_IS_NODE = false');
      return {contents,loader:'js'};
    });
  }}], outfile: path.join(output,'tavern-tokenizers.global.js') });
await cp(path.join(root,'src/tokenizer-models'),path.join(output,'tokenizer-models'),{recursive:true});
await cp(path.join(root,'TOKENIZER_NOTICES.md'),path.join(output,'TOKENIZER_NOTICES.md'));
await cp(path.join(root,'licenses'),path.join(output,'licenses'),{recursive:true});
await cp(path.join(root,'src/st/runtime/vendor/sillytavern/LICENSE'),path.join(output,'SillyTavern.LICENSE.txt'));
await cp(path.join(root,'src/st/SOURCE.json'),path.join(output,'SillyTavern.SOURCE.json'));
console.log('Built native Tavern browser realm with licensed ST runtime.');
