import { createMessageApi } from './messages.js';
import { createVariableApi } from './variables.js';
import { createCatalogFunctions } from './catalog.js';
import { createEventFunctions, createRuntimeFunctions } from './helper-runtime.js';
import { createSillyTavernApi } from './st.js';
import { createGenerationApi } from './generation.js';
import { createAudioApi } from './audio.js';
import { createIframeApi, iframeEvents } from './iframe.js';
import { decorateHelper } from './extras.js';

/** All code here is evaluated in one author frame; only native services and shared references cross realms. */
globalThis.__ElecKoiCreateTavernApi = runtime => {
  const view = runtime.window;
  const definitions = new Map();
  const install = (name, value) => {
    if (!definitions.has(name)) definitions.set(name, Object.getOwnPropertyDescriptor(view, name));
    Object.defineProperty(view, name, { configurable: true, writable: true, value });
  };
  const helper = {
    ...createMessageApi(runtime), ...createVariableApi(runtime),
    ...createCatalogFunctions(runtime), ...createEventFunctions(runtime), ...createRuntimeFunctions(runtime),
    ...createGenerationApi(runtime), ...createAudioApi(runtime), ...createIframeApi(runtime),
    getLastMessageId: () => runtime.snapshot.messages.length - 1,
    getCurrentMessageId: () => runtime.snapshot.messages.findIndex(item => item.id === runtime.snapshot.context.messageId),
    getIframeName: () => view.name,
    getIframeWindow: () => view,
    getScriptWindow: () => view,
    getTavernHelper: () => helper,
    setInput: text => runtime.native.request('input.set', { text }),
    getInput: () => runtime.native.request('input.get', {}),
    setInputText: text => runtime.native.request('input.set', { text }),
  };
  let SillyTavern;
  decorateHelper(runtime,helper);
  for (const [name, value] of Object.entries(helper)) install(name, value);
  install('TavernHelper', helper);
  const previousSt = Object.getOwnPropertyDescriptor(view, 'SillyTavern');
  SillyTavern = createSillyTavernApi(runtime, helper);
  const tools = runtime.shared.functionTools ??= new Map();
  const toolOwners = runtime.shared.functionToolOwners ??= new Map();
  let toolOwnerAlive = true;
  const toolOwnerAbort = new view.AbortController();
  const manager = SillyTavern.getContext().ToolManager;
  const registered = Object.getOwnPropertyDescriptor(manager, 'tools').get;
  const registerTool = manager.registerFunctionTool.bind(manager);
  const unregisterTool = manager.unregisterFunctionTool.bind(manager);
  const ownedTools = new Map();
  manager.registerFunctionTool = (...args) => {
    registerTool(...args);
    const name = typeof args[0] === 'string' ? args[0] : args[0].name;
    const tool = registered.call(manager).find(tool => tool.toFunctionOpenAI().function.name === name);
    tools.set(name, tool); ownedTools.set(name, tool);
    const registration = typeof args[0] === 'object' ? args[0] : undefined;
    toolOwners.set(name, { tool, conversationId: runtime.snapshot.context.conversationId || '', signal: toolOwnerAbort.signal, alive: () => toolOwnerAlive,
      invoke: (parameters, context) => registration?.action ? registration.action(parameters, context) : tool.invoke(parameters) });
  };
  manager.unregisterFunctionTool = name => { unregisterTool(name); tools.delete(name); toolOwners.delete(name); ownedTools.delete(name); };
  Object.defineProperty(manager, 'tools', { configurable: true, get: () => [...tools.values()] });
  runtime.tools = () => [...tools.values()];
  runtime.addCleanup(() => {
    toolOwnerAlive = false;
    toolOwnerAbort.abort(new Error('Function tool document closed.'));
    for (const [name,tool] of ownedTools) if (tools.get(name) === tool) { tools.delete(name); toolOwners.delete(name); }
  });
  helper.substitudeMacros = (text, overrides = {}) => {
    let value=String(text);
    for (const entry of runtime.shared.macroLikes?.values() ?? []) value=value.replace(entry.regex,(...args)=>entry.replace({ ...runtime.snapshot.context, ...(overrides.name1Override === undefined ? {} : { userName: overrides.name1Override }),
      ...(overrides.name2Override === undefined ? {} : { characterName: overrides.name2Override }), chat:runtime.snapshot.messages },...args));
    return SillyTavern.getContext().substituteParams(value, overrides);
  };
  helper.substituteMacros = helper.substitudeMacros;
  runtime.substitute = helper.substituteMacros;
  helper.triggerSlash = async text => (await SillyTavern.getContext().executeSlashCommandsWithOptions(String(text))).pipe;
  helper.triggerSlashWithOptions = (text, options) => SillyTavern.getContext().executeSlashCommandsWithOptions(String(text), options);
  helper.registerMacro = (name, callback, options) => SillyTavern.getContext().MacroRegistry.registerMacro(name, { ...options, handler: callback });
  helper.unregisterMacro = name => SillyTavern.getContext().MacroRegistry.unregisterMacro(name);
  for (const name of ['substitudeMacros', 'substituteMacros', 'triggerSlash', 'triggerSlashWithOptions', 'registerMacro', 'unregisterMacro']) install(name, helper[name]);
  install('tavern_events', SillyTavern.getContext().eventTypes);
  install('iframe_events', iframeEvents);
  install('placeholder_prompt_default_order', ['world_info_before','persona_description','char_description','char_personality','scenario','world_info_after','dialogue_examples','chat_history','user_input']);
  install('builtin_prompt_default_order', view.placeholder_prompt_default_order);
  const dispose = () => {
    SillyTavern.dispose();
    for (const [name, descriptor] of definitions) {
      if (descriptor) Object.defineProperty(view, name, descriptor);
      else delete view[name];
    }
    if (previousSt) Object.defineProperty(view, 'SillyTavern', previousSt);
    else delete view.SillyTavern;
  };
  return { helper, SillyTavern, dispose };
};
