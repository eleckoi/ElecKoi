import { rootProcessItems } from './agentProcessHierarchy.js';

const settingMutations = new Set([
  'eleckoi_apply_setting_patch', 'eleckoi_write_setting_file', 'eleckoi_edit_setting_file',
  'eleckoi_make_setting_directory', 'eleckoi_move_setting_file', 'eleckoi_move_setting_directory',
  'eleckoi_delete_setting_file', 'eleckoi_delete_setting_directory',
]);

const actions = {
  eleckoi_glob_setting_files: '查找设定文件', eleckoi_grep_setting_files: '搜索设定内容',
  eleckoi_read_setting_files: '读取设定正文', eleckoi_glob_variables: '查找变量',
  eleckoi_grep_variables: '搜索变量内容', eleckoi_read_variables: '读取变量',
  eleckoi_apply_variable_patch: '修改变量', eleckoi_apply_setting_patch: '修改对话设定',
  update_plan: '更新任务计划', update_roleplay_plan: '更新角色扮演计划', todo_write: '更新任务计划',
};

export function processItemPresentation(item) {
  if (item.kind === 'reasoning' || item.toolName === 'reasoning') {
    return {
      title: item.status === 'running' ? '正在思考' : item.status === 'error' ? '思考中断' : '思考过程',
      target: '',
      icon: 'reasoning',
    };
  }
  if (item.kind === 'narrative' || item.toolName === 'assistant_narrative') {
    return { title: item.summary || item.detail || '', target: '', icon: 'description' };
  }
  if (item.toolName === 'approval') {
    const title = item.status === 'running' ? '等待授权'
      : item.status === 'complete' ? '已授权一次'
        : item.status === 'cancelled' ? '授权已取消' : '已安全拒绝高风险操作';
    return { title, target: targetOf(item), icon: 'wrench' };
  }
  if (item.kind === 'subagent' || item.toolName === 'subagent' || item.toolName === 'subagent_fork') {
    const target = [targetOf(item), item.delegatedModel].filter(Boolean).join(' · ');
    return { title: stateTitle(item, '子 Agent 正在处理', '子 Agent 已完成', '子 Agent 运行失败'), target, icon: 'groups' };
  }
  if (item.kind === 'compaction') return { title: stateTitle(item, '正在自动压缩', '上下文已自动压缩', '自动压缩失败'), target: targetOf(item), icon: 'description' };
  const action = settingMutations.has(item.toolName) ? '修改对话设定' : actions[item.toolName];
  const title = action
    ? item.status === 'running' ? `正在${action}` : item.status === 'error' ? `${action}失败` : item.status === 'cancelled' ? `${action}已取消` : `已${action}`
    : genericTitle(item);
  return { title, target: targetOf(item), icon: iconOf(item) };
}

export function liveProcessPresentation(items) {
  const latest = [...rootProcessItems(items || [])].reverse().find(Boolean);
  if (!latest) return null;
  return processItemPresentation(latest.status === 'complete' ? { ...latest, status: 'running' } : latest);
}

export function shouldShowInlineAgentProcess(message, displayedContent) {
  return message?.role === 'assistant'
    && message?.pending === true
    && (message?.process || []).some(Boolean)
    && !String(displayedContent || '').trim();
}

function stateTitle(item, running, complete, failed) {
  return item.status === 'running' ? running : item.status === 'error' ? failed : item.status === 'cancelled' ? '已取消' : complete;
}
function genericTitle(item) {
  const name = item.toolName || '工具';
  return item.status === 'running' ? `正在运行 ${name}` : item.status === 'error' ? `${name} 运行失败` : item.status === 'cancelled' ? `${name} 已取消` : `已运行 ${name}`;
}
function targetOf(item) {
  const args = object(item.arguments);
  const result = object(item.summary);
  const candidate = args.path || args.pattern || args.query || args.task || args.command || args.description || result.path || result.message;
  return typeof candidate === 'string' ? candidate.slice(0, 120) : '';
}
function iconOf(item) {
  const name = item.toolName;
  if (name === 'update_plan' || name === 'update_roleplay_plan' || name === 'todo_write') return 'list';
  if (name === 'subagent' || name === 'subagent_fork') return 'groups';
  if (item.kind === 'action') return 'bolt';
  if (item.kind === 'file_change' || name === 'eleckoi_apply_variable_patch' || settingMutations.has(name)) return 'edit';
  if (name === 'eleckoi_glob_setting_files' || name === 'eleckoi_grep_setting_files' || name === 'eleckoi_glob_variables' || name === 'eleckoi_grep_variables') return 'search-setting';
  if (name === 'eleckoi_read_setting_files' || name === 'eleckoi_read_variables' || name === 'read') return 'read';
  if (name === 'glob' || name === 'list_files' || name === 'ls') return 'folder';
  if (name === 'grep' || name === 'search') return 'search';
  if (item.kind === 'command') return 'terminal';
  if (item.kind === 'compaction') return 'description';
  return 'wrench';
}
function object(raw) { try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
