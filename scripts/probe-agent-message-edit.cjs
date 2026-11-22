const assert = require('node:assert/strict')
const { mkdirSync, writeFileSync } = require('node:fs')
const { resolve } = require('node:path')
const { loadNativeModule } = require('./probe-desktop-native.cjs')
const { DEFAULT_CHAT_DISPLAY_PREFERENCES } = loadNativeModule('packages/shared/src/contracts/settings/schemas.ts')

module.exports = async ({ window, waitFor, remoteCall, nativeTheme, conversationId }) => {
  const run = source => window.webContents.executeJavaScript(source)
  const report = resolve(process.env.ELECKOI_AGENT_MESSAGE_EDIT_REPORT || 'build/agent-message-edit')
  mkdirSync(report, { recursive: true })
  nativeTheme.themeSource = 'dark'
  await remoteCall('eleckoiDisplayPreferences/setChatDisplay', { chatDisplay: { ...DEFAULT_CHAT_DISPLAY_PREFERENCES, layout: 'agent' } })
  await waitFor(`Boolean(document.querySelector('.chat-panel.layout-agent'))`, 'Agent conversation layout did not open')
  await run(`document.querySelector('[data-composer-input]').focus()`)
  await window.webContents.insertText('Synthetic prompt')
  await waitFor(`document.querySelector('button[aria-label="发送消息"]')?.disabled === false`, 'Synthetic input did not enable send')
  await run(`document.querySelector('button[aria-label="发送消息"]').click()`)
  const selectors = {
    assistant: '.message-agent.theirs.is-latest-assistant',
    user: '.message-agent.mine',
  }
  await waitFor(`Boolean(document.querySelector('${selectors.assistant} button[aria-label="编辑"]:enabled')) && !document.querySelector('button[aria-label="停止生成"]')`, 'Synthetic reply did not settle')
  const settle = () => run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
  const results = []
  for (const width of [1440, 900, 390]) {
    window.setContentSize(width, 900)
    await run(`document.documentElement.dataset.eleckoiMobile = '${width === 390}'`)
    await settle()
    for (const [role, selector] of Object.entries(selectors)) {
      await run(`document.querySelector('${selector} button[aria-label="编辑"]').click()`)
      await waitFor(`Boolean(document.querySelector('${selector} .message-inline-editor textarea'))`, 'Message editor did not open')
      await settle()
      const layout = await run(`(() => {
        const row = document.querySelector('${selector}'), editor = row.querySelector('.message-inline-editor'), textarea = editor.querySelector('textarea');
        const edges = element => { if (!element) return null; const {left, right, width} = element.getBoundingClientRect(); return {left, right, width}; };
        const style = getComputedStyle(row), field = edges(textarea), button = edges(editor.querySelector('button:last-child'));
        const chain = [];
        for (let node = editor; node && node !== row; node = node.parentElement) {
          const css = getComputedStyle(node);
          chain.push({ name: node.className, slot: node.dataset.slot, display: css.display, column: css.gridColumn, width: edges(node).width });
        }
        const box = edges(row);
        return { role: '${role}', viewport: innerWidth, panel: edges(document.querySelector('.chat-panel')),
          leftSidebar: edges(document.querySelector('.conversation-main')),
          contentLeft: box.left + parseFloat(style.paddingLeft), contentRight: box.right - parseFloat(style.paddingRight),
          field, button, chain, raw: textarea.value.startsWith('<FINAL>') && textarea.value.endsWith('</FINAL>'),
          overflow: row.scrollWidth > row.clientWidth + 1 };
      })()`)
      results.push(layout)
      await run(`document.querySelector('${selector} .message-inline-editor button').click()`)
      await waitFor(`!document.querySelector('${selector} .message-inline-editor')`, 'Cancel did not close editor')
    }
  }
  writeFileSync(resolve(report, 'layout.json'), JSON.stringify({ conversationId, results }, null, 2))
  const near = (actual, expected) => Math.abs(actual - expected) < 1
  for (const item of results) {
    assert(!item.overflow && near(item.field.right, item.contentRight) && near(item.button.right, item.field.right)
      && (item.role !== 'assistant' || item.raw && near(item.field.left, item.contentLeft)), JSON.stringify(item))
  }
  assert(results.filter(item => item.viewport >= 900).every(item => item.leftSidebar?.width > 100), 'Desktop sidebar was not open')
  process.stdout.write('Production Agent message editors fit the chat column with the desktop sidebar open and at phone width.\n')
}
