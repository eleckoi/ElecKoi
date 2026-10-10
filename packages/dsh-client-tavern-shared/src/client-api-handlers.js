import { CharacterLibraryBrowser } from './client-character-library.js';
export const CLIENT_API_METHODS = ['plugins.openManager', 'characters.openLibrary'];
/** Reuse the existing DSH manager and navigation services. */
export function installClientApiBindings(runtime, bindings) {
  const browser = new CharacterLibraryBrowser(runtime);
  runtime.stops.push(() => browser.close());
  bindings['characters.openLibrary'] = async p => {
    const forceDefault = p?.forceDefault === true, opened = browser.open(forceDefault);
    if (opened) await runtime.adapter.publish('characters.libraryOpened', { forceDefault });
    return opened;
  };
  bindings['plugins.openManager'] = async () => {
    const entry = runtime.slots?.entriesOfSlot('main').find(item => item.options.key === 'plugins');
    if (!entry || !runtime.layout?.selectPanel) throw new Error('The DSH plugin manager is not mounted');
    const face = entry.inject?.();
    if (!face?.ensure) throw new Error('The DSH plugin manager has not initialized');
    await face.ensure(); runtime.layout.selectPanel('plugins'); return null;
  };
}
