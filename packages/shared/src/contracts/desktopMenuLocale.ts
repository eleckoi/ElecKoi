/** Caption-menu copy shared by the desktop main and preload entry points. */
const en = {
  application: 'Application',
  aboutMenu: 'About DeepSeek Harness',
  edit: 'Edit',
  menuBar: 'Application menu',
  delete: 'Delete',
  undo: 'Undo',
  redo: 'Redo',
  cut: 'Cut',
  copy: 'Copy',
  paste: 'Paste',
  selectAll: 'Select All',
  exitApplication: 'Exit',
  checkUpdatesMenu: 'Check for Updates…',
  reloadPageMenu: 'Reload Page',
  restartAppHostMenu: 'Restart App and Host',
} as const
const zh = {
  application: '应用',
  aboutMenu: '关于 DeepSeek Harness',
  edit: '编辑',
  menuBar: '应用菜单',
  delete: '删除',
  undo: '撤销',
  redo: '重做',
  cut: '剪切',
  copy: '复制',
  paste: '粘贴',
  selectAll: '全选',
  exitApplication: '退出',
  checkUpdatesMenu: '检查更新…',
  reloadPageMenu: '刷新页面',
  restartAppHostMenu: '重启应用与 Host',
} as const
export function resolveDesktopLocale(locale: string) {
  return locale.toLowerCase().startsWith('zh')
    ? { id: 'zh-CN', messages: zh }
    : { id: 'en', messages: en }
}
