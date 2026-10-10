import { build } from 'esbuild';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const tools = fileURLToPath(new URL('../runtime/', import.meta.url));
await mkdir(path.join(tools, '../dist'), { recursive: true });
const vendor = path.join(tools, 'vendor/sillytavern');
const runtime = path.join(tools, 'tavern-runtime');
const iconCss = await readFile(path.join(tools, '../assets/fontawesome/css/all.min.css'), 'utf8');
const icons = [...iconCss.matchAll(/((?:\.fa-[a-z0-9-]+,?)+)\{--fa:/g)].map(match => match[1].split(',').map(selector => selector.slice(1)));
if (!icons.length) throw new Error('Bundled Font Awesome inventory is empty');
await writeFile(path.join(runtime, 'icon-inventory.json'), JSON.stringify(icons) + '\n');
const modules = (await readdir(path.join(vendor, 'public/scripts/slash-commands'))).filter(file => file.endsWith('.js'));
const entry = modules.map(file => `export * from ${JSON.stringify('./vendor/sillytavern/public/scripts/slash-commands/' + file)};`).join('\n') + `
export { macros, initRegisterMacros } from './vendor/sillytavern/public/scripts/macros/macro-system.js';
export { registerVariableCommands } from './vendor/sillytavern/public/scripts/variables.js';
export * from './vendor/sillytavern/public/scripts/popup.js';
export * from './vendor/sillytavern/public/scripts/tool-calling.js';
export * from './vendor/sillytavern/public/scripts/message-formatter.js';
export * from './vendor/sillytavern/public/scripts/action-loader.js';
export { SimpleMutex as ModuleWorkerWrapper } from './vendor/sillytavern/public/scripts/util/SimpleMutex.js';
export { SimpleMutex } from './vendor/sillytavern/public/scripts/util/SimpleMutex.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroEngine.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroRegistry.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroBrowser.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroCstWalker.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroEnvBuilder.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroLexer.js';
export * from './vendor/sillytavern/public/scripts/macros/engine/MacroParser.js';
export { IGNORE_SYMBOL } from './vendor/sillytavern/public/scripts/constants.js';
export * as constants from './vendor/sillytavern/public/scripts/constants.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-media.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-request-services.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-service-responses.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-instruct.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-generation-utils.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-group-selection.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-connect-map.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-worldbook-utils.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-reasoning.js';
export * from './vendor/sillytavern/public/scripts/eleckoi-prompt-post-processing.js';
export { default as reasoningTemplates } from './tavern-runtime/reasoning-templates.json';
export * from './vendor/sillytavern/public/scripts/extensions/regex/engine.js';
export * from './vendor/sillytavern/public/scripts/utils.js';
export { default as libs } from './tavern-runtime/libraries.js';
export { attach, sync, accountStorage, t, getCurrentLocale, getPresetManager, oai_settings } from './tavern-runtime/host.js';
export { default as popupTemplate } from './vendor/sillytavern/popup-template.html';
export { initialize, substitute, withReadOnlyEvaluation, execute, installPopupDocument } from './tavern-runtime/integration.js';
export { installRequestServices } from './tavern-runtime/request-transport.js';
export { installPresetManagers } from './tavern-runtime/preset-manager-api.js';
export { createStreamingProcessor } from './tavern-runtime/streaming-processor.js';
export { createPromptManager, typedPromptSettings } from './tavern-runtime/prompt-manager.js';
export { createQuickReplyApi } from './tavern-runtime/quick-replies.js';
export { restoreMediaPresentation } from './tavern-runtime/media-commands.js';
export { restorePresentation } from './tavern-runtime/presentation-commands.js';
export { renderStoryString } from './vendor/sillytavern/public/scripts/eleckoi-context-template.js';
export { createConnectionApi } from './tavern-runtime/connections.js';
export { resolveTokenizerModel } from './vendor/sillytavern/public/scripts/eleckoi-tokenizer-model.js';
export { resolveTokenizerType } from './vendor/sillytavern/public/scripts/eleckoi-tokenizer-selection.js';
export { createWorldbookTimedEffects } from './vendor/sillytavern/public/scripts/eleckoi-worldbook-timing.js';
export { createWorldbookMatcher } from './vendor/sillytavern/public/scripts/eleckoi-worldbook-matching.js';
export { Prompt, PromptCollection, TokenHandler } from './vendor/sillytavern/public/scripts/eleckoi-prompt-models.js';
export { processChatSlashCommands } from './vendor/sillytavern/public/scripts/eleckoi-core-commands.js';
`;
const mappings = ['script.js', 'scripts/power-user.js', 'scripts/i18n.js', 'scripts/group-chats.js', 'scripts/tags.js', 'scripts/world-info.js',
  'scripts/events.js', 'scripts/extensions.js', 'scripts/preset-manager.js', 'scripts/openai.js', 'scripts/tokenizers.js', 'scripts/RossAscends-mods.js', 'scripts/instruct-mode.js', 'scripts/textgen-settings.js', 'scripts/util/AccountStorage.js', 'scripts/slash-commands.js'];
await build({ stdin: { contents: entry, resolveDir: tools, sourcefile: 'tavern-runtime-entry.js' }, bundle: true, format: 'iife', globalName: '__ElecKoiSt',
  target: 'chrome108', minify: true, legalComments: 'eof', loader: { '.html': 'text' },
  outfile: path.join(tools, '../dist/tavern-runtime.global.js'),
  banner: { js: '/* ST 1.19.0 (06bde939), AGPL-3.0; original host adapters; tools/build-tavern-runtime.mjs. */' },
  plugins: [{ name: 'eleckoi-host-adapters', setup(builder) {
    builder.onLoad({ filter: /[\\/]tool-calling\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      // Persistence and mounting are asynchronous here. The actual surface publishes rendered.
      return { contents: source.replace('        addOneMessage(message);', '        await addOneMessage(message);')
        .replace('        await eventSource.emit(event_types.TOOL_CALLS_RENDERED, invocations);', ''), loader: 'js' };
    });
    builder.onLoad({ filter: /[\\/]SlashCommandBrowser\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      // The real browser can live in a plugin panel; its removal observer follows that document.
      return { contents: source.replace("document.querySelector('#chat')", 'parent.ownerDocument.documentElement')
        .replace('const find = () => targets.find(', "const find = () => targets.filter(value => typeof value === 'string').find(")
        .replaceAll("window.removeEventListener('keydown', boundHandler)", "parent.ownerDocument.defaultView.removeEventListener('keydown', boundHandler)")
        .replaceAll("window.addEventListener('keydown', boundHandler)", "parent.ownerDocument.defaultView.addEventListener('keydown', boundHandler)"), loader: 'js' };
    });
    builder.onLoad({ filter: /[\\/]action-loader\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      return { contents: source.replace("$('#loader')", "$(loaderPopup.dlg).find('#loader')").replace("$('#load-spinner')", "$(loaderPopup.dlg).find('#load-spinner')"), loader: 'js' };
    });
    builder.onLoad({ filter: /[\\/]message-formatter\.js$/ }, async args => {
      const source = await readFile(args.path, 'utf8');
      return { contents: source.replace('    addHook(fn,', '    removeHook(fn) { for (const [stage, hooks] of this.#hooks) this.#hooks.set(stage, hooks.filter(hook => hook.fn !== fn)); }\n    addHook(fn,'), loader: 'js' };
    });
    builder.onLoad({ filter: /[\\/]popup\.js$/ }, async args => {
      // A shared-host popup is adopted by the visible parent document. Focus must follow that document.
      const source = await readFile(args.path, 'utf8');
      // Native dialogs may be adopted into the visible sibling/parent document.
      // Toast positioning and topmost-layer lookups must follow that same document.
      const adapted = source.replaceAll('document.activeElement', 'this.dlg.ownerDocument.activeElement')
        .replace('content instanceof HTMLElement', 'content?.nodeType === 1')
        .replace('evt.target instanceof HTMLElement', 'evt.target?.nodeType === 1')
        .replace('resultControl instanceof HTMLElement', 'resultControl?.nodeType === 1')
        .replaceAll('textarea instanceof HTMLTextAreaElement', "textarea?.tagName === 'TEXTAREA'")
        .replaceAll('input instanceof HTMLInputElement', "input?.tagName === 'INPUT'")
        .replace('export function getTopmostModalLayer() {', 'export function getTopmostModalLayer(document = globalThis.top?.__ElecKoiShared ? globalThis.top.document : globalThis.document) {')
        .replace('export function fixToastrForDialogs() {', 'export function fixToastrForDialogs(document = globalThis.top?.__ElecKoiShared ? globalThis.top.document : globalThis.document) {')
        .replace('if (dlg instanceof HTMLElement) return dlg;', 'if (dlg?.nodeType === 1) return dlg;');
      return { contents: adapted, loader: 'js' };
    });
    builder.onResolve({ filter: /./ }, args => {
      if (!args.importer.includes('vendor')) return;
      const resolved = args.path.startsWith('/') ? args.path.slice(1) : path.relative(path.join(vendor, 'public'), path.resolve(path.dirname(args.importer), args.path)).replaceAll('\\', '/');
      if (resolved === 'lib.js') return { path: path.join(runtime, 'libraries.js') };
      if (mappings.includes(resolved)) return { path: path.join(runtime, 'host.js') };
      if (args.path.startsWith('/')) return { path: path.join(vendor, 'public', resolved) };
    });
  } }],
});
const manifest = JSON.parse(await readFile(path.join(vendor, 'manifest.json')));
await writeFile(path.join(tools, '../dist/SillyTavern.LICENSE.txt'), await readFile(path.join(vendor, 'LICENSE')));
console.log(`Built ST ${manifest.version} runtime (${modules.length} Slash modules).`);
