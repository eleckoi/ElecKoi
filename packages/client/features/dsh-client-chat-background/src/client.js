window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-chat-background',
  factory(require) {
    const React = require('react')
    const ChatWallpaper = React.lazy(() => import(new URL('eleckoi-page-chat-background.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.ChatWallpaper })))
    function Background({ wallpaper, activeView }) {
      if (activeView !== 'chat' || !wallpaper?.image) return null
      return React.createElement(React.Suspense, { fallback: null }, React.createElement(ChatWallpaper, { wallpaper }))
    }
    function MenuItem({ onOpen, label }) {
      return React.createElement('button', { type: 'button', role: 'menuitem', onClick: onOpen }, label)
    }
    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind('eleckoi.ui')
        ctx.slots.inject('eleckoi.roleplay.background', () => ctx.slots.register({ name: 'eleckoi.roleplay.background' }, Background))
        ctx.slots.inject('eleckoi.roleplay.header.menu', () => ctx.slots.register({
          name: 'eleckoi.roleplay.header.menu', id: 'chat-background', inject: () => ({ label: t('自定义背景') }),
        }, MenuItem))
      }
    }
  }
})
