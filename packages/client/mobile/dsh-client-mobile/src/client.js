window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-mobile',
  factory(require) {
    const React = require('react')
    const page = component => React.lazy(() => import(new URL('eleckoi-page-mobile.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module[component] })))
    const MobileWindow = page('MobileWindow')
    const MobileWorkspaceControls = page('MobileWorkspaceControls')
    const MobilePluginBack = page('MobilePluginBack')
    const pages = {
      messages: page('MobileMessagesPage'), character: page('MobileCharactersPage'),
      presets: page('MobilePresetsPage'), model: page('MobileModelsPage'),
      creatorStudio: page('MobileCreatorPage'), community: page('MobileCommunityPage'),
      settings: page('MobileSettingsPage')
    }
    function apply(ctx) {
      ctx.slots.inject('plugins.header.leading', () => ctx.slots.register({
        name: 'plugins.header.leading', id: 'eleckoi-mobile-back',
        select: owner => globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android' ? owner : null,
        registrant: '@eleckoi/dsh-client-mobile'
      }, () => React.createElement(MobilePluginBack)))
      ctx.slots.inject('conversation.header.leading', () => ctx.slots.register({
        name: 'conversation.header.leading', priority: 100,
        select: owner => globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android' ? owner : null,
        registrant: '@eleckoi/dsh-client-mobile'
      }, () => React.createElement(MobileWorkspaceControls)))
      ctx.slots.inject('eleckoi.shell.window', () => ctx.slots.register({
        name: 'eleckoi.shell.window', priority: -100, select: owner => globalThis.__ELECKOI_CLIENT_PLATFORM__?.kind === 'android' ? owner : null, registrant: '@eleckoi/dsh-client-mobile'
      }, owner => React.createElement(MobileWindow, owner)))
      ctx.slots.inject('main', () => Object.entries(pages).map(([key, Component]) => ctx.slots.register({
        name: 'main', key, priority: -100, registrant: '@eleckoi/dsh-client-mobile'
      }, () => React.createElement(Component))))
    }
    return { inject: ['slots'], apply }
  }
})
