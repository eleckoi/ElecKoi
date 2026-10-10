import { mkdir, writeFile, readFile, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'esbuild';
import { WorkspaceTypertGenerator } from '@deepseek-ai/dsh-typert-generator';
const root = path.resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const packageRoot = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const output = path.join(packageRoot, 'lib');
await mkdir(path.join(output, 'types'), { recursive: true });
const [application, component] = await Promise.all([readFile(path.join(root, 'package.json'), 'utf8').then(JSON.parse),
  readFile(path.join(packageRoot, 'package.json'), 'utf8').then(JSON.parse)]);
await writeFile(path.join(packageRoot, 'src/component-metadata.js'), '// Regenerated from workspace/package metadata by scripts/build.mjs.\n'
  + `export const APP_VERSION = ${JSON.stringify(application.version)};\nexport const COMPONENT_VERSION = ${JSON.stringify(component.version)};\n`);
await writeFile(path.join(output, 'types/component-metadata.js'), '// Generated package metadata.\n'
  + `export const APP_VERSION = ${JSON.stringify(application.version)};\nexport const COMPONENT_VERSION = ${JSON.stringify(component.version)};\n`);
const artifacts = new WorkspaceTypertGenerator(root, { checkDiagnostics: false }).generate(['@eleckoi/dsh-compatibility-host'], ['host']);
if (artifacts.length !== 1 || !artifacts[0].remote) throw new Error('Author Host generated Remote is missing');
await mkdir(output, { recursive: true });
await mkdir(path.join(output, 'web'), { recursive: true });
const clientSource = path.join(root, 'packages/dsh-client-tavern-shared/src');
await cp(path.join(clientSource, 'runtime.js'), path.join(output, 'web/runtime.js'));
await cp(path.join(clientSource, 'media-runtime.js'), path.join(output, 'web/media-runtime.js'));
for (const name of ['application-api.js', 'background-presentation.js', 'client-appearance-capabilities.js', 'client-api-handlers.js', 'client-character-library.js']) {
  await cp(path.join(clientSource, name), path.join(output, 'web/' + name));
}
const [artifact] = artifacts;
await Promise.all(Object.entries({ 'typert.host.js': artifact.js, 'typert.host.d.ts': artifact.dts,
  'typert.remote-client.js': artifact.remote.js, 'typert.remote-client.d.ts': artifact.remote.dts, 'typert.remote-client.d.ts.map': artifact.remote.dtsMap })
  .map(([name, content]) => writeFile(path.join(output, name), content)));
await build({ entryPoints: [path.join(packageRoot, 'src/client/index.ts')], outfile: path.join(output, 'client.js'), bundle: true,
  format: 'cjs', platform: 'browser', target: 'chrome108',
  banner: { js: 'window.__ModuleLoader__.load({id:"@eleckoi/dsh-compatibility-host",factory(require){var module={exports:{}};var exports=module.exports;' },
  footer: { js: 'return module.exports;}});' } });
