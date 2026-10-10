import { SlashCommandParser } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandParser.js';
import { SlashCommand } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommand.js';
import { ARGUMENT_TYPE, SlashCommandArgument, SlashCommandNamedArgument } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandArgument.js';
import { SlashCommandClosure } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandClosure.js';
import { delay, isTrueBoolean } from '../vendor/sillytavern/public/scripts/utils.js';
import { DOMPurify } from './libraries.js';
import commandDescriptors from './command-contract.json';
import { SlashCommandAbortController } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandAbortController.js';
import { SlashCommandNamedArgumentAssignment } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandNamedArgumentAssignment.js';
import { SlashCommandBreakController } from '../vendor/sillytavern/public/scripts/slash-commands/SlashCommandBreakController.js';
import { initRegisterMacros, macros } from '../vendor/sillytavern/public/scripts/macros/macro-system.js';
import { registerVariableCommands, getLocalVariable, setLocalVariable, deleteLocalVariable, addLocalVariable, incrementLocalVariable, decrementLocalVariable, existsLocalVariable,
  getGlobalVariable, setGlobalVariable, deleteGlobalVariable, addGlobalVariable, incrementGlobalVariable, decrementGlobalVariable, existsGlobalVariable } from '../vendor/sillytavern/public/scripts/variables.js';
import { attach, sync, withReadOnlyVariables } from './host.js';
import template from '../vendor/sillytavern/popup-template.html';
import { ToolManager } from '../vendor/sillytavern/public/scripts/tool-calling.js';
import { Popup, POPUP_TYPE } from '../vendor/sillytavern/public/scripts/popup.js';
import { registerExtractedCommands } from '../vendor/sillytavern/public/scripts/eleckoi-core-commands.js';
import { registerActionLoaderSlashCommands } from '../vendor/sillytavern/public/scripts/action-loader-slashcommands.js';
import { registerNativeCommands } from './native-commands.js';
import Cropper from '../vendor/sillytavern/public/lib/cropper.min.cjs';
import installCropper from '../vendor/sillytavern/public/lib/eleckoi-jquery-cropper.js';
import cropperStyle from '../vendor/sillytavern/cropper-style.html';

let initialized = false;
export function initialize(context, api, configuration) {
  attach(context, api, { ...configuration, execute });
  if (initialized) return;
  initialized = true;
  installCropper(globalThis.jQuery,Cropper);
  const showPopup = Popup.prototype.show;
  const ownedPopups = new Set();
  let observingPopups = false;
  const disposePopups = () => {
    for (const popup of [...ownedPopups]) {
      // Its controls run in the closing iframe, while the dialog was adopted
      // by the persistent parent. Disposal cannot be vetoed by a dead owner.
      popup.onClosing = null;
      popup.onClose = null;
      popup.dlg.style.animation = 'none';
      popup.completeCancelled().catch(error => console.error('[ElecKoi popup disposal]', error));
    }
  };
  Popup.prototype.show = function () {
    if (!observingPopups) {
      globalThis.addEventListener?.('pagehide', disposePopups);
      observingPopups = true;
    }
    const document = globalThis.top?.__ElecKoiShared ? globalThis.top.document : globalThis.document;
    installPopupDocument(document);
    const showModal = this.dlg.showModal.bind(this.dlg);
    this.dlg.showModal = () => { document.body.append(this.dlg); return showModal(); };
    ownedPopups.add(this);
    return showPopup.call(this).finally(() => {
      ownedPopups.delete(this);
      const cropper=globalThis.$(this.cropImage).data('cropper');
      if(cropper)globalThis.$(this.cropImage).cropper('destroy');
    });
  };
  new SlashCommandParser();
  initRegisterMacros(); registerVariableCommands(); ToolManager.initToolSlashCommands(); registerExtractedCommands(); registerActionLoaderSlashCommands();
  const add = (name, callback, aliases = [], helpString = '', splitUnnamedArgument = false) => {
    if (SlashCommandParser.commands[name]) return;
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({ name, callback, aliases, helpString, splitUnnamedArgument,
      unnamedArgumentList: [SlashCommandArgument.fromProps({ typeList: [ARGUMENT_TYPE.STRING], isRequired: false, acceptsMultiple: splitUnnamedArgument })] }));
  };
  add('echo', (_args, value) => String(value), [], 'Return text to the pipe.');
  add('trigger', async () => { await api.flush(); await api.input.send(); return ''; }, [], 'Start the native Agent reply.');
  const inputDescriptor=commandDescriptors.input;
  const argumentTypes=values=>(Array.isArray(values)?values:[values || 'STRING']).map(type=>ARGUMENT_TYPE[type] || ARGUMENT_TYPE.STRING);
  SlashCommandParser.addCommandObject(SlashCommand.fromProps({...inputDescriptor,callback:inputCallback,
    namedArgumentList:inputDescriptor.namedArgumentList.map(value=>SlashCommandNamedArgument.fromProps({...value,typeList:argumentTypes(value.typeList)})),
    unnamedArgumentList:inputDescriptor.unnamedArgumentList.map(value=>SlashCommandArgument.fromProps({...value,typeList:argumentTypes(value.typeList)}))}));
  add('delay', async (_args, value) => { await new Promise(resolve => setTimeout(resolve, Number(value))); return ''; }, [], 'Wait for a number of milliseconds.');
  add('return', (_args, value) => value, [], 'Return a value to the current pipe.');
  add('abort', (args, value) => { args._abortController.abort(value); return ''; }, [], 'Cancel script execution.');
  add('run', async (args, value) => {
    const closure = typeof value === 'string' ? args._scope.existsVariable(value) ? args._scope.getVariable(value) : null : value;
    if (!closure && typeof value === 'string') return api.quickReplies.executeByName(value, args, { scope: args._scope, abortController: args._abortController, debugController: args._debugController });
    if (typeof closure?.execute !== 'function') throw new TypeError('/run requires a closure or a scoped closure variable');
    closure.scope.parent = args._scope; closure.breakController = new SlashCommandBreakController();
    closure.abortController = args._abortController; closure.debugController ||= args._debugController;
    closure.providedArgumentList = closure.argumentList.filter(value => Object.hasOwn(args, value.name)).map(value => {
      const assignment = new SlashCommandNamedArgumentAssignment(); assignment.name = value.name; assignment.value = args[value.name]; return assignment;
    });
    return (await closure.execute()).pipe;
  }, ['call', 'exec'], 'Execute a scoped closure.');
  registerNativeCommands(context, api);
}
export function substitute(text, configuration = {}) {
  if (!initialized) throw new Error('Tavern macro runtime is not initialized; await ElecKoi.ready()');
  sync();
  const evaluate = () => macros.engine.evaluate(String(text), macros.envBuilder.buildFromRawEnv({ content: String(text), replaceCharacterCard: true, ...configuration }));
  return configuration.readOnly ? withReadOnlyEvaluation(evaluate) : evaluate();
}
export function withReadOnlyEvaluation(callback) {
  return withReadOnlyVariables({
    local: { get: getLocalVariable, set: setLocalVariable, del: deleteLocalVariable, add: addLocalVariable, inc: incrementLocalVariable, dec: decrementLocalVariable, has: existsLocalVariable },
    global: { get: getGlobalVariable, set: setGlobalVariable, del: deleteGlobalVariable, add: addGlobalVariable, inc: incrementGlobalVariable, dec: decrementGlobalVariable, has: existsGlobalVariable },
  }, callback);
}

export async function execute(text, configuration = {}) {
  sync();
  const abortController = configuration.abortController || new SlashCommandAbortController();
  const parser = new SlashCommandParser();
  const closure = parser.parse(String(text), true, configuration.parserFlags, abortController, configuration.debugController);
  if (configuration.scope) closure.scope.parent = configuration.scope;
  closure.scope.pipe = configuration.pipe ?? '';
  closure.onProgress = configuration.onProgress;
  closure.source = configuration.source || 'ElecKoi';
  const result = await closure.execute();
  // Upstream's stepping generator can lose an abort returned before the first executor.
  if (abortController.signal.aborted) Object.assign(result, { isAborted: true, isQuietlyAborted: abortController.signal.isQuiet, abortReason: String(abortController.signal.reason) });
  return result;
}
export function installPopupDocument(document) {
  if (!document.querySelector('#popup_template')) document.documentElement.insertAdjacentHTML('beforeend', template);
  if (!document.getElementById('eleckoi-cropper-style')) document.head.insertAdjacentHTML('beforeend',cropperStyle);
  if (document.getElementById('eleckoi-popup-style')) return;
  const style = document.createElement('style'); style.id = 'eleckoi-popup-style';
  style.textContent = `dialog.popup{position:fixed;inset:0;margin:auto;box-sizing:border-box;max-width:min(680px,calc(100vw - 24px));max-height:85dvh;padding:16px;border:1px solid var(--line-strong,#c7d1d8);border-radius:16px;background:var(--surface-raised,Canvas);color:var(--text,CanvasText);box-shadow:0 16px 48px #0003;animation:eleckoi-popup-in .26s cubic-bezier(.2,.8,.2,1) both}.popup::backdrop{background:var(--overlay-scrim,#08141c52)}.popup-body{display:flex;flex-direction:column;gap:12px;min-height:0}.popup-content{min-height:0;overflow:auto;font-size:14px;line-height:1.6}.popup-controls{display:flex;gap:8px;justify-content:flex-end;border-top:1px solid var(--line,#dce3e7);padding-top:12px}.popup .menu_button{min-height:44px;padding:6px 12px;border:1px solid var(--line-strong,#c7d1d8);border-radius:8px;background:var(--surface-content,Canvas);color:var(--text,CanvasText);font:inherit;font-size:13px;cursor:pointer}.popup .popup-button-ok{background:var(--blue,#285dd8);color:var(--on-accent,#fff);border-color:transparent}.popup-input{box-sizing:border-box;width:100%;min-height:44px;border:1px solid var(--line-strong,#c7d1d8);border-radius:8px;padding:8px;background:var(--control-bg,Canvas);color:inherit;font:inherit}.popup-button-close{position:absolute;right:4px;top:4px;min-width:44px;min-height:44px;cursor:pointer}.popup-crop-wrap:not(:has(img[src]:not([src=""]))){display:none}.popup[closing]{animation:eleckoi-popup-out .2s cubic-bezier(.2,.8,.2,1) both}.popup.large{width:90vw}.popup.transparent{background:transparent}@keyframes eleckoi-popup-in{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}@keyframes eleckoi-popup-out{to{opacity:0;transform:translateY(20px)}}@media(prefers-reduced-motion:reduce){dialog.popup,.popup[closing]{animation:none}}`;
  document.head.appendChild(style);
  style.textContent += '.popup.wide_dialogue_popup,.popup.wider_dialogue_popup{width:calc(100vw - 24px)}.popup.large_dialogue_popup{width:90vw;height:90vh}.popup.transparent_dialogue_popup{background:transparent;border:0;box-shadow:none}.popup.horizontal_scrolling_dialogue_popup .popup-content{overflow-x:auto}.popup.vertical_scrolling_dialogue_popup .popup-content{overflow-y:auto}.popup.left_aligned_dialogue_popup .popup-content{text-align:left}.faPicker{display:grid;grid-template-columns:repeat(auto-fill,minmax(44px,1fr));gap:6px}.faPicker .hidden{display:none}.faQuery{width:100%;box-sizing:border-box}.faQuery-container{position:sticky;top:0;z-index:1;margin-bottom:12px}';
}

// Pinned ST input contract: the value belongs to the dialog and its callbacks,
// while /setinput is the separate native composer operation.
async function inputCallback(args, prompt) {
  const safeValue=DOMPurify.sanitize(prompt || '');
  const defaultInput=typeof args.default==='string' ? args.default : '';
  const popupOptions={large:isTrueBoolean(args.large),wide:isTrueBoolean(args.wide),
    okButton:typeof args.okButton==='string' ? args.okButton : 'Ok',
    rows:typeof args.rows==='string' ? Number.isNaN(Number(args.rows)) ? 4 : Number(args.rows) : 4,
    placeholder:typeof args.placeholder==='string' ? args.placeholder : null,
    tooltip:typeof args.tooltip==='string' ? args.tooltip : null};
  await delay(1);
  const result=await new Popup(safeValue,POPUP_TYPE.INPUT,defaultInput,popupOptions).show();
  await delay(1);
  const key=result===null || result===false ? 'onCancel' : 'onSuccess';
  if(args[key]) {
    if(!(args[key] instanceof SlashCommandClosure))throw new Error(`argument '${key}' must be a closure for command /input`);
    await args[key].execute();
  }
  return String(result || '');
}
