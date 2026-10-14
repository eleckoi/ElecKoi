import { DEFAULT_CHAT_DISPLAY_PREFERENCES, normalizeChatDisplaySettings } from '@shared/contracts/settings/schemas';
import { APP_DEFAULT_CHAT_BACKGROUND, CUSTOM_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND, characterArtwork, resolveChatWallpaper } from '../preferences/chatWallpaper.js';
import { createAppearanceThemeFromImageSource } from '../theme/appearanceTheme.js';
import { assetFetchSrc } from '../../../app/services/assets.js';
import { requestNativeFrontend } from '../../authorFrontend/model/nativeFrontendRequest.js';

/** Presentation commands update the same native preferences, characters and frontend projects as the UI. */
export function createTavernAppearance({ displayPreferences, appearance, characters, frontends, conversationId, characterId }) {
  const preferences = () => {
    if (!displayPreferences) throw new Error('Native display preferences are not connected.');
    const snapshot = displayPreferences.getSnapshot();
    if (snapshot.status !== 'ready') throw new Error(snapshot.error || 'Native display preferences are not ready.');
    return snapshot;
  };
  const scope = target => ({ conversationId: target?.conversationId || conversationId, characterId: target?.characterId || characterId });
  const catalog = () => {
    if (!characters) throw new Error('The native character catalog is not connected.');
    const snapshot = characters.getSnapshot();
    if (snapshot.status !== 'ready') throw new Error(snapshot.error || 'The native character catalog is not ready.');
    return snapshot.collection.items;
  };
  const card = target => {
    const selected = catalog().find(item => item.id === scope(target).characterId);
    if (!selected) throw new Error(`Native character does not exist: ${scope(target).characterId}`);
    return selected;
  };
  const wallpaper = target => {
    const selected = scope(target), ui = preferences().ui;
    return ui.chat_background_locks?.[selected.conversationId] || resolveChatWallpaper({ character: card(target), globalWallpaper: ui.global_chat_wallpaper });
  };
  const backgrounds = target => {
    const ui = preferences().ui, current = card(target), list = [
      { name: 'default', value: APP_DEFAULT_CHAT_BACKGROUND, image: '' },
      { name: 'character', value: '', image: characterArtwork(current) },
      { name: 'global', value: GLOBAL_CHAT_BACKGROUND, image: ui.global_chat_wallpaper?.image || '' },
    ];
    const add = (name, value) => {
      if (!value || list.some(item => item.value === value)) return;
      const unique = list.some(item => item.name === name) ? `${name} (${list.length})` : name;
      list.push({ name: unique, value, image: value });
    };
    for (const entry of catalog()) {
      add(entry.name, characterArtwork(entry));
      if (entry.chatBackground && ![APP_DEFAULT_CHAT_BACKGROUND, CUSTOM_CHAT_BACKGROUND, GLOBAL_CHAT_BACKGROUND].includes(entry.chatBackground)) add(`${entry.name} · background`, entry.chatBackground);
    }
    const actual = wallpaper(target);
    add('chat background', actual.image);
    const lock = ui.chat_background_locks?.[scope(target).conversationId];
    const value = lock ? lock.image : current.chatBackground || '';
    return { items: list, current: list.find(item => item.value === value)?.name || value, locked: !!lock };
  };
  const resolveBackground = (reference, target) => {
    const name = String(reference ?? ''), state = backgrounds(target);
    const found = state.items.find(item => item.name === name || item.value === name || item.image && item.image === name);
    if (found) return found;
    if (/^(?:https?:|eleckoi-media:|data:image\/|\/)/i.test(name)) return { name, value: name, image: name };
    throw new Error(`Native background does not exist: ${name}`);
  };
  const selectBackground = async (reference, target) => {
    const selected = scope(target), item = resolveBackground(reference, selected), ui = preferences().ui;
    if (ui.chat_background_locks?.[selected.conversationId]) {
      const base = resolveChatWallpaper({ character: { ...card(selected), chatBackground: item.value }, globalWallpaper: ui.global_chat_wallpaper });
      await displayPreferences.updateUi(current => ({ ...current, chat_background_locks: { ...current.chat_background_locks, [selected.conversationId]: { ...base, source: 'chat' } } }));
    } else await characters.update({ ...card(selected), chatBackground: item.value });
    return item.name;
  };
  const lockBackground = async (enabled, target) => {
    const selected = scope(target), frozen = enabled ? { ...wallpaper(selected), source: 'chat' } : undefined;
    if (!selected.conversationId) throw new Error('A native chat is required to lock a background.');
    await displayPreferences.updateUi(current => {
      const locks = { ...current.chat_background_locks };
      if (enabled) locks[selected.conversationId] = frozen;
      else delete locks[selected.conversationId];
      return { ...current, chat_background_locks: locks };
    });
    return enabled;
  };
  const messageStyle = async name => {
    if (!['single', 'bubble', 'flat'].includes(name)) throw new TypeError(`Unknown message style: ${name}`);
    const current = normalizeChatDisplaySettings(preferences().chatDisplay || DEFAULT_CHAT_DISPLAY_PREFERENCES);
    const layout = name === 'bubble' ? 'social' : 'roleplay';
    await displayPreferences.setChatDisplay({ ...current, layout, profiles: { ...current.profiles,
      [layout]: { ...current.profiles[layout], assistant_bubble_enabled: name === 'bubble' } } });
    await displayPreferences.updateUi({ message_style: name });
    return name;
  };
  const theme = async name => {
    const ui = preferences().ui;
    if (!name) return ui.appearance_theme_name || appearance?.theme.getTheme().preference || 'system';
    if (['light', 'dark', 'system', 'auto'].includes(name)) {
      if (!appearance) throw new Error('The native theme service is not connected.');
      appearance.theme.setTheme(name === 'auto' ? 'system' : name);
      await displayPreferences.updateUi({ appearance_theme: null, appearance_theme_name: name === 'auto' ? 'system' : name });
      return name;
    }
    if (name === 'default') {
      await requestNativeFrontend(frontends, { scope: 'application' }, 'frontends.restoreDefault');
      await displayPreferences.updateUi({ appearance_theme: null, appearance_theme_name: appearance?.theme.getTheme().preference || 'system' });
      return name;
    }
    const palette = ui.appearance_palettes?.[name];
    if (palette) {
      await displayPreferences.updateUi({ appearance_theme: palette, appearance_theme_name: name });
      return name;
    }
    for (const owner of [{ scope: 'application' }, { scope: 'character', characterId }]) {
      if (owner.scope === 'character' && !owner.characterId) continue;
      const workspace = await requestNativeFrontend(frontends, owner, 'frontends.workspace');
      const project = workspace.projects.find(item => item.id === name || item.name === name);
      if (!project) continue;
      await requestNativeFrontend(frontends, owner, 'frontends.select', { projectId: project.id });
      await displayPreferences.updateUi({ appearance_theme_name: project.name });
      return project.name;
    }
    throw new Error(`Native theme or frontend project does not exist: ${name}`);
  };
  const palette = async options => {
    const target = scope(options), entry = options?.background ? resolveBackground(options.background, target) : { name: backgrounds(target).current, image: wallpaper(target).image };
    if (!entry.image) throw new Error('The selected native background has no image to sample.');
    const name = options?.name || `bgcol - ${entry.name}`, ui = preferences().ui;
    if (ui.appearance_palettes?.[name] && !options?.force) return theme(name);
    const generated = await createAppearanceThemeFromImageSource(assetFetchSrc(entry.image), { name });
    await displayPreferences.updateUi(current => ({ ...current, appearance_palettes: { ...current.appearance_palettes, [name]: generated }, appearance_theme: generated, appearance_theme_name: name }));
    return name;
  };
  const methods = { backgrounds, selectBackground, lockBackground, messageStyle, theme, palette };
  return (method, args = []) => {
    const operation = methods[String(method).replace(/^appearance\./, '')];
    if (!operation) throw new Error(`Unknown native appearance operation: ${method}`);
    return operation(...args);
  };
}
