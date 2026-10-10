window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-tavern-shared',
  factory() {
    async function loadScript(url) {
      await new Promise((resolve, reject) => {
        const script = document.createElement('script'); script.src = url;
        script.onload = resolve; script.onerror = () => reject(new Error(`Shared Client script failed to load: ${url}`));
        document.head.appendChild(script);
      });
    }
    async function apply(ctx) {
      const capability = await ctx.remote.eleckoiAuthorPlugins.capabilities();
      if (!capability.ok) throw new Error(capability.error.message);
      const baseUrl = capability.value.assetsBaseUrl;
      await loadScript(baseUrl + 'assets/tavern-shared.global.js');
      const { TavernSharedClient } = await import(baseUrl + 'client/runtime.js');
      const runtime = new TavernSharedClient({ window, remote: ctx.remote, conversations: ctx.eleckoiConversations,
        layout: ctx.layout, slots: ctx.slots,
        services: { characters: ctx.eleckoiCharacters, presets: ctx.eleckoiPresets, models: ctx.eleckoiModels,
          settingLibraries: ctx.eleckoiSettingLibraries, variables: ctx.eleckoiVariables, regexRules: ctx.eleckoiRegexRules,
          persona: ctx.eleckoiPersona, webSearch: ctx.eleckoiWebSearch, creator: ctx.eleckoiCreatorStudio },
        displayPreferences: ctx.eleckoiDisplayPreferences, sdk: window.ElecKoiTavernShared,
        report(error) { console.error('ElecKoi 共享兼容运行时失败', error); window.dispatchEvent(new CustomEvent('eleckoi:plugin-error', { detail: { error } })); } });
      ctx.provide('eleckoiTavernShared', runtime);
      await ctx.effect(async () => {
        try { await runtime.start(); } catch (error) { await runtime.dispose(); throw error; }
        const stop = ctx.on('connection/reset', () => { void runtime.restore().catch(error => runtime.fail(error)); });
        return async () => { stop(); await runtime.dispose(); };
      }, 'eleckoi: shared frontend runtime');
    }
    return { inject: ['remote', 'remote.eleckoiCompatibility', 'remote.eleckoiAuthorPlugins', 'remote.eleckoiCharacters', 'remote.eleckoiConversations',
      'eleckoiConversations', 'eleckoiDisplayPreferences', 'eleckoiCharacters', 'eleckoiPresets', 'eleckoiModels',
      'eleckoiSettingLibraries', 'eleckoiVariables', 'eleckoiRegexRules', 'eleckoiPersona', 'eleckoiWebSearch', 'eleckoiCreatorStudio', 'layout', 'slots'], apply };
  }
});
