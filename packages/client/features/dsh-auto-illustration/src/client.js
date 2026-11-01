window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-auto-illustration',
  factory(require) {
    const React = require('react')
    const Page = React.lazy(() => import(new URL('eleckoi-page-auto-illustration.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.AutoIllustrationPage })))
    return {
      inject: ['slots', 'eleckoiModels', 'eleckoiPresets'],
      apply(ctx) {
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: '@eleckoi/dsh-auto-illustration',
          registrant: '@eleckoi/dsh-auto-illustration'
        }, () => React.createElement(Page, { modelCatalog: ctx.eleckoiModels, presetCatalog: ctx.eleckoiPresets })))
      }
    }
  }
})
