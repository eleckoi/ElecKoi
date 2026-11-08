import { sourceText } from '../../../app/i18n/productCopy.js';
import { parseToolJson, resultTextSegments, resultValueText } from './roleplayToolResults.js';

const definitions = Object.freeze({
  eleckoi_apply_variable_patch: { domain: 'variables', label: '修改变量' },
  eleckoi_apply_setting_patch: { domain: 'settings', label: '修改对话设定' },
});
const settingActions = {
  write_file: '修改对话设定', edit_file: '修改对话设定', make_directory: '创建设定文件夹',
  move_file: '移动设定', move_directory: '移动设定文件夹', delete_file: '删除设定', delete_directory: '删除设定文件夹',
};
const variableActions = { replace: '设为', delta: '增减', insert: '添加', remove: '删除' };
const own = (value, key) => Object.hasOwn(value, key);
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const roleplayMutationDefinition = name => definitions[name];

/** Present only recorded arguments and receipts; never infer prior variable values or replay writes. */
export function roleplayToolMutation(definition, block, phase, tUi = sourceText) {
  const running = phase !== 'result';
  const args = parseToolJson((block?.call ?? block)?.argsRaw);
  const raw = block?.content?.every(part => part.type === 'text') ? block.content.map(part => part.text).join('') : undefined;
  const payload = raw === undefined ? undefined : parseToolJson(raw);
  const cancelled = !running && block?.error?.code === 'interrupted';
  const rejected = !running && (block?.isError || block?.meta?.stopped === true || payload?.status && payload.status !== 'ok');
  if (!running && block?.content?.some(part => part.type !== 'text')) return undefined;
  if (payload?.status === 'spilled') return undefined;
  if (!running && !cancelled && !block?.isError && (!raw || !payload || typeof payload.status !== 'string')) return undefined;
  if (definition.domain === 'variables' && args && (!Array.isArray(args.operations) || args.operations.some(op =>
    !record(op) || !own(variableActions, op.op) || typeof op.path !== 'string' || !op.path.startsWith('/') || (op.op !== 'remove' && !own(op, 'value'))))) return undefined;
  if (definition.domain === 'settings' && args && (!own(settingActions, args.operation) || typeof args.path !== 'string')) return undefined;
  if (!running && !args) return undefined;
  const unchanged = !running && !rejected && (payload?.state_unchanged === true || payload?.changed === false || payload?.applied_operations === 0);
  if (!running && !rejected && !cancelled && !unchanged) {
    if (definition.domain === 'variables' && (!Number.isSafeInteger(payload.applied_operations) || payload.applied_operations !== args.operations.length)) return undefined;
    if (definition.domain === 'settings' && payload.changed !== true) return undefined;
  }
  const state = running ? 'running' : cancelled ? 'cancelled' : rejected ? 'error' : unchanged ? 'unchanged' : 'changed';
  const action = tUi(definition.domain === 'settings' ? settingActions[args?.operation] || definition.label : definition.label);
  const title = state === 'running' ? tUi('正在{value0}', { value0: action })
    : state === 'cancelled' ? tUi('{value0}已取消', { value0: action })
      : state === 'error' ? definition.domain === 'variables' ? tUi('变量修改未生效') : tUi('{value0}失败', { value0: action })
        : state === 'unchanged' ? tUi(definition.domain === 'variables' ? '变量未变化' : '设定未变化') : tUi('已{value0}', { value0: action });
  const parts = [];
  const text = (value, kind = 'text', label = '') => {
    (value === '' ? [''] : resultTextSegments(value)).forEach((value, index) => parts.push({ kind, text: value, label: index === 0 ? label : '' }));
  };
  const path = payload?.path ?? args?.path;
  if (state === 'error' || state === 'cancelled') {
    text(payload?.message || payload?.error?.message || block?.error?.message || raw || tUi(state === 'cancelled' ? '本次操作已取消。' : '本次修改未生效，原有数据保持。'), 'error');
    if (Array.isArray(payload?.issues)) for (const issue of payload.issues) {
      text(record(issue) && typeof issue.message === 'string'
        ? `${Array.isArray(issue.path) && issue.path.length ? issue.path.join(' / ') + '：' : ''}${issue.message}` : resultValueText(issue), 'error');
    }
    if (state === 'cancelled') return { title, state, parts };
  }
  if (unchanged) text(tUi('本次未作修改。'), 'note');
  else if (args && definition.domain === 'variables') {
    for (const op of args.operations) {
      const segments = op.path.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
      const delta = op.op === 'delta' && typeof op.value === 'number';
      const value = delta ? Math.abs(op.value) : op.value;
      parts.push({ kind: 'variable', path: op.path, segments,
        action: tUi(delta && op.value !== 0 ? op.value > 0 ? '增加' : '减少' : variableActions[op.op]),
        value: op.op === 'remove' ? undefined : typeof value === 'boolean' ? tUi(value ? '是' : '否') : resultValueText(value),
      });
    }
    if (state === 'changed') text(payload.message === '变量补丁已通过校验并暂存，将随本回合成功完成后提交。'
      ? tUi('已通过校验，随本轮完成后保存。') : payload.message || tUi('本次修改已完成。'), 'note');
  } else if (args && definition.domain === 'settings' && state !== 'error') {
    parts.push({ kind: 'path', label: tUi('目标路径'), text: path });
    if (args.operation === 'edit_file') {
      if (typeof args.old_string !== 'string' || typeof args.new_string !== 'string') return undefined;
      text(args.old_string, 'removed', tUi('原文'));
      text(args.new_string, 'added', tUi('新文'));
      if (state === 'changed') text(Number.isSafeInteger(payload?.replacements) ? tUi('已替换 {value0} 处，其他正文保留。', { value0: payload.replacements }) : tUi('本次修改已完成。'), 'note');
    } else if (args.operation === 'write_file') {
      if (typeof args.content !== 'string') return undefined;
      text(args.content, 'text', tUi('写入正文'));
    } else if (args.operation.startsWith('move_')) {
      if (typeof (payload?.destination ?? args.destination) !== 'string') return undefined;
      parts[parts.length - 1].label = tUi('原位置');
      parts.push({ kind: 'path', label: tUi('新位置'), text: payload?.destination ?? args.destination });
    }
  }
  const summary = definition.domain === 'variables' && args ? tUi('{value0} 项操作', { value0: state === 'changed' ? payload.applied_operations : args.operations.length })
    : state === 'changed' && Number.isSafeInteger(payload?.replacements) ? tUi('{value0} 处替换', { value0: payload.replacements }) : path;
  return { title, state, parts, summary };
}
