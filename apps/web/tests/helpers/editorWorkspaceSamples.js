import { createScriptItem } from '../../src/modules/scripts/model/scriptEditing.js';

const rule = (id, name, pattern, replacement, extra = {}) => ({ id, name, pattern, replacement, targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0, ...extra });
const script = (id, name, content, extra = {}) => ({ ...createScriptItem('script', id), name, content, enabled: true, ...extra });
const source = `export default ({ api }) => {
  // 在聊天菜单中注册一项书店互动。
  const stop = api.ui.registerButton({
    id: 'today-plan',
    label: '今日安排',

    async onClick({ api, signal }) {
      signal.throwIfAborted();

      // 先填写草稿，发送仍由用户决定。
      await api.input.set(
        '今天书店有什么安排？'
      );
    },
  });

  // 停用或退出时，撤回这项按钮。
  return stop;
};`;

// Synthetic editor content; browser checks do not execute the scripts.
export function initialLibrary(kind, scope) {
  if (kind === 'regex') return { enabled: true, rules: scope === 'character' ? [
    rule('quotes', '对白排版', '/「([^」]+)」/g', '“$1”'),
    rule('blank-lines', '整理连续空行', '/\\n{3,}/g', '\n\n', { order: 1 }),
    rule('notes', '隐藏创作备注', '/\\[备注:[^\\]]*\\]/g', '', { order: 2, enabled: false }),
  ] : [rule('global-space', '清理行末空格', '/[ \\t]+$/gm', ''), rule('global-quotes', '统一省略号', '/\\.{3}/g', '……', { order: 1 })] };
  return { scope, ownerId: scope === 'global' ? '' : 'design-character', enabled: true, variables: {}, files: [], trees: scope === 'character' ? [
    { ...createScriptItem('folder', 'daily'), name: '日常互动', scripts: [
      script('bookshop', '书店日常', source, { info: '为示例书店提供「今日安排」互动按钮，点击后填写输入框草稿。', data: { openingHour: '09:00', closingHour: '21:30', welcome: '今天也欢迎你来坐坐。' } }),
      script('weather', '天气小记', '// 根据当前天气整理一段小记。\n\nexport default {\n  name: "天气小记",\n  setup(ctx) {\n    // 在这里编写脚本。\n  },\n};', { enabled: false }),
    ] },
    script('quick-actions', '快捷互动按钮', '// 兼容脚本示例\n\nconsole.log("示例书店，今天也开始营业了。");', { runtime: undefined, button: { enabled: true, buttons: [{ name: '递上一杯热茶', visible: true }, { name: '看看窗外', visible: true }] }, info: '为对话提供几项快捷互动。' }),
  ] : [script('global-helper', '通用工具', '// 在这里编写共享脚本。\n\nexport default {\n  name: "通用工具",\n  setup(ctx) {},\n};')] };
}
