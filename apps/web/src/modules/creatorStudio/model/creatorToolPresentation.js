import { sourceText } from '../../../app/i18n/productCopy.js';
import { parseToolJson, resultTextSegments, resultValueText, normalizePathToolResult } from '../../../ui/toolResults.js';

const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value, key) => record(value) && Object.hasOwn(value, key);
export const creatorToolNames = ['eleckoi_list_toolsets', 'eleckoi_describe_toolset', 'eleckoi_call_capability'];
const domains = {
  character: ['角色资料', ['create', 'read', 'update', 'read_openings', 'save_openings']],
  settings: ['设定', ['list', 'read', 'create', 'update', 'update_many', 'edit', 'remove', 'create_group', 'update_group', 'remove_group']],
  variables: ['变量配置', ['list', 'read', 'create', 'update', 'remove', 'create_object', 'update_object', 'remove_object', 'update_schema', 'validate_schema']],
  scripts: ['原生脚本', ['list', 'read', 'create', 'update', 'remove', 'create_folder', 'update_folder', 'remove_folder', 'move', 'configure']],
  regex: ['正则规则', ['list', 'read', 'create', 'update', 'remove', 'test']],
  editorVersions: ['配置版本', ['read', 'save']],
  presetScripts: ['预设原生脚本', ['read', 'save']],
  presetPrompts: ['预设提示词', ['glob', 'grep', 'read']],
};
const fieldLabels = {
  id: '编号', title: '标题', name: '名称', description: '说明', info: '说明', content: '正文',
  enabled: '启用', type: '类型', defaultValue: '默认值', updateRule: '更新规则', readMode: '读取方式',
  agentReadStrategy: '读取方式', readStrategy: '读取方式', group: '所属分组', groupId: '分组编号', objectId: '变量组编号',
  parentId: '上级编号', folderId: '目标文件夹', order: '顺序', treeViewOrder: '目录顺序',
  assistantName: '角色名称', profileAge: '年龄', profileSex: '性别', profileHeight: '身高', profileBirthday: '生日', profileLike: '喜好',
  schemaCode: '校验代码', initialStateJson: '初始变量', variables: '变量', pattern: '匹配表达式', replacement: '替换内容',
  targets: '作用对象', displayOnly: '仅显示', promptOnly: '仅请求', runOnEdit: '编辑时运行',
  contentMode: '正文类型', dynamicMode: '动态模式', triggerMode: '触发方式', keywords: '关键词', keywordMatch: '关键词匹配',
  scope: '所属范围', ownerId: '所属编号', presetId: '预设编号', activeVersionId: '当前版本编号', revision: '修改版本', resourceRevision: '资源版本',
  defaultOpeningMessageId: '默认开场白编号', openingMessages: '开场白', variableVersionId: '变量版本编号',
  documents: '配置正文', versions: '配置版本', inputSchema: '参数', effect: '操作类型',
  operationCount: '操作数量', file_path: '结果路径', offset: '字节偏移', total_bytes: '总字节数',
  removedId: '已删除编号', removedGroupIds: '已删除文件夹', removedEntryIds: '已删除条目',
  removedObjectIds: '已删除变量组', removedVariableIds: '已删除变量',
};

function definition(name, args, t) {
  if (name === 'eleckoi_list_toolsets') return { action: t('查看创作能力'), icon: 'list', mode: 'toolsets' };
  if (name === 'eleckoi_describe_toolset') return { action: t('查看操作说明'), icon: 'info', mode: 'describe' };
  if (own(args, 'result')) return { action: t(args.result?.query === undefined ? '续读工具结果' : '搜索工具结果'),
    icon: args.result?.query === undefined ? 'read' : 'search', mode: 'page' };
  const [domain, operation, extra] = (args?.capability_id || '').split('.');
  if (extra || !domains[domain]?.[1].includes(operation)) return undefined;
  let noun = domains[domain][0];
  if (operation.endsWith('_group')) noun = '设定文件夹';
  if (operation.endsWith('_object')) noun = '变量组';
  if (operation.endsWith('_folder')) noun = '脚本文件夹';
  if (operation.endsWith('_openings')) noun = '开场白';
  if (operation === 'update_schema') noun = '变量校验代码';
  if (operation === 'configure') noun = '脚本库配置';
  const verb = operation === 'list' || operation === 'glob' ? '查看' : operation === 'grep' ? '搜索'
    : operation.startsWith('read') ? '读取' : operation.startsWith('create') ? '新建'
      : operation.startsWith('remove') ? '删除' : operation === 'move' ? '移动' : operation.startsWith('save') ? '保存' : '修改';
  const icon = operation === 'validate_schema' ? 'check' : operation === 'test' ? 'test' : operation === 'edit' ? 'edit'
    : operation === 'list' || operation === 'glob' ? 'list' : operation === 'grep' ? 'search' : verb === '读取' ? 'read'
      : verb === '新建' ? (operation.includes('_') ? 'folder' : 'add') : verb === '删除' ? 'remove' : verb === '移动' ? 'move'
        : domain === 'editorVersions' && operation === 'save' ? 'version' : 'edit';
  return { domain, operation, icon, mode: 'capability', action: operation === 'edit' ? t('替换设定正文')
    : operation === 'validate_schema' ? t('校验变量') : operation === 'test' ? t('预览正则结果') : t('{value0}{value1}', { value0: t(verb), value1: t(noun) }) };
}

/** Derive the presentation exclusively from this call; never query or replay historical writes. */
export function creatorToolPresentation(name, block, phase, t = sourceText) {
  if (!creatorToolNames.includes(name)) return undefined;
  const args = parseToolJson((block?.call ?? block)?.argsRaw);
  const def = definition(name, args, t);
  if (!def) return undefined;
  const running = phase !== 'result';
  const raw = block?.content?.every(part => part.type === 'text' && typeof part.text === 'string')
    ? block.content.map(part => part.text).join('') : undefined;
  const payload = parseToolJson(raw);
  if (!running && (!args || raw === undefined)) return undefined;
  const cancelled = block?.error?.code === 'interrupted' || block?.meta?.stopped === true;
  const failed = block?.isError === true || Boolean(block?.error);
  const state = running ? 'running' : cancelled ? 'cancelled' : failed ? 'error' : payload?.status === 'spilled' ? 'spilled' : 'complete';
  const model = { ...def, state, parts: [], entries: [], summary: '', browser: undefined };
  const text = (value, kind = 'text', label = '') => {
    const content = typeof value === 'string' ? value : resultValueText(value);
    if (content === undefined) return;
    (content === '' ? [''] : resultTextSegments(content)).forEach((text, index) => model.parts.push({ kind, text, label: index === 0 ? label : '' }));
  };
  const field = (key, value) => text(displayValue(key, value, t), 'path', t(fieldLabels[key] ?? key));
  const changeField = (key, value) => {
    const display = displayValue(key, value, t);
    if (display === null || typeof display !== 'object' && String(display).length <= 80 && !String(display).includes('\n')) {
      model.parts.push({ kind: 'variable', path: key, segments: [t(fieldLabels[key] ?? key)], action: t('设为'), value: resultValueText(display) });
    } else text(display, ['content', 'schemaCode'].includes(key) ? 'code' : 'text', t(fieldLabels[key] ?? key));
  };
  model.title = running ? t('正在{value0}', { value0: def.action }) : state === 'cancelled' ? t('{value0}已中断', { value0: def.action })
    : state === 'error' ? t('{value0}失败', { value0: def.action }) : state === 'spilled' ? t('{value0}结果较长', { value0: def.action }) : t('已{value0}', { value0: def.action });
  if (running) return model;
  if (state === 'error' || state === 'cancelled') {
    text(block.error?.message || payload?.message || raw || t('本次操作没有完成。'), 'error');
    return model;
  }
  // The official native renderer retains artifact references and non-text attachments.
  if (state === 'spilled' || !payload) return undefined;
  const input = args.arguments;
  if (def.mode === 'page') {
    if (!record(args.result) || payload.kind !== 'tool_result_page' || !Number.isSafeInteger(payload.offset) || !Number.isSafeInteger(payload.total_bytes)) return undefined;
    field('file_path', payload.file_path); field('offset', payload.offset); field('total_bytes', payload.total_bytes);
    if (typeof payload.content === 'string') text(payload.content, 'text', t('本次返回的片段'));
    else if (Array.isArray(payload.matches) && payload.matches.every(item => record(item) && typeof item.text === 'string')) {
      for (const match of payload.matches) { field('offset', match.offset); text(match.text); }
      model.summary = t('{value0} 项', { value0: payload.matches.length });
    } else return undefined;
    text(t(payload.next_offset === null ? '已到结果末尾' : '仍有后续内容'), 'note');
    return model;
  }
  if (def.mode === 'toolsets') {
    if (!Array.isArray(payload.toolsets) || payload.toolsets.some(item => !record(item) || typeof item.id !== 'string' || typeof item.title !== 'string')) return undefined;
    model.entries = payload.toolsets.map(item => entry(item, t, ['id', 'description', 'operationCount']));
    model.directory = true;
  } else if (def.mode === 'describe') {
    if (!record(payload.toolset) || !Array.isArray(payload.operations)) return undefined;
    model.summary = payload.toolset.title || args.toolset_id;
    text(payload.toolset.description, 'note');
    for (const guide of payload.toolset.guide || []) text(guide);
    if (payload.toolset.examples) text(payload.toolset.examples, 'text', t('示例'));
    model.entries = payload.operations.map(item => entry(item, t, ['id', 'effect', 'inputSchema']));
    model.directory = true;
  } else {
    if (!record(input) || !own(payload, 'value')) return undefined;
    const value = payload.value;
    if (def.domain === 'presetPrompts') {
      const browser = normalizePathToolResult({ domain: 'settings', operation: def.operation }, value, t);
      if (!browser) return undefined;
      model.browser = { ...browser, domain: 'presetPrompts', counts: { matched: browser.counts.matched,
        required: browser.entries.filter(item => item.required).length } };
      model.summary = [input.pattern || input.path, t('{value0} 项', { value0: browser.entries.length })].filter(Boolean).join(' · ');
      return model;
    }
    if (def.operation === 'edit') {
      if (typeof input.old_string !== 'string' || typeof input.new_string !== 'string' || value?.changed !== true || !Number.isSafeInteger(value.replacements) || value.replacements < 1) return undefined;
      text(input.old_string, 'removed', t('原文')); text(input.new_string, 'added', t('新文'));
      model.summary = t('{value0} 处替换', { value0: value.replacements });
    } else if (def.operation === 'test') {
      if (typeof input.text !== 'string' || typeof value?.output !== 'string' || typeof value.appliesToSurface !== 'boolean') return undefined;
      text(input.text, 'removed', t('输入文字')); text(value.output, 'added', t('处理结果'));
      text(t('尚未保存'), 'note');
      if (!value.appliesToSurface) text(t('当前规则不适用于此范围'), 'note');
      else if (value.changed === false) text(t('处理后的文字未变化'), 'note');
      model.summary = input.rule?.name || '';
    } else if (def.operation === 'validate_schema') {
      if (!record(value?.state)) return undefined;
      for (const [key, item] of Object.entries(value.state)) text(item, 'path', key);
      text(t('尚未保存'), 'note');
    } else if (def.operation === 'list' || def.operation.startsWith('read')) {
      const records = readRecords(def, value);
      if (!records || records.some(item => !record(item))) return undefined;
      model.entries = records.map(item => entry(item, t));
      model.directory = true;
      if (record(value)) for (const key of ['enabled', 'revision', 'activeVersionId', 'schemaCode', 'initialStateJson', 'variables']) {
        if (own(value, key) && !(key === 'variables' && Array.isArray(value.variables))) field(key, value[key]);
      }
    } else {
      if (!record(value) && !Array.isArray(value)) return undefined;
      const saved = value.item ?? value.rule ?? value;
      model.summary = typeof saved.title === 'string' ? saved.title : typeof saved.name === 'string' ? saved.name : '';
      if (def.operation.startsWith('create')) {
        if (!record(saved)) return undefined;
        model.entries = [entry(saved, t)];
      } else if (def.operation === 'update_many') {
        if (!Array.isArray(input.updates) || input.updates.some(item => !record(item.changes))) return undefined;
        for (const update of input.updates) { field('id', update.id); for (const [key, item] of Object.entries(update.changes)) changeField(key, item); }
        model.summary = t('{value0} 项', { value0: input.updates.length });
      } else if (def.operation.startsWith('remove')) {
        for (const key of ['removedId', 'removedGroupIds', 'removedEntryIds', 'removedObjectIds', 'removedVariableIds']) if (own(value, key)) field(key, value[key]);
        if (!model.parts.length) field('id', input.id);
      } else if (def.operation === 'move') {
        field('name', saved.name ?? input.id); field('folderId', input.folderId === '' ? t('根目录') : input.folderId);
      } else if (record(input.changes)) {
        for (const [key, item] of Object.entries(input.changes)) changeField(key, item);
      } else if (def.operation === 'update_schema') text(input.schemaCode, 'code', t('校验代码'));
      else if (def.operation.startsWith('save') || def.operation === 'update') {
        if (def.domain === 'editorVersions') {
          if (!Array.isArray(value.documents) || !Array.isArray(value.versions)) return undefined;
          const documents = value.documents.map(document => parseToolJson(document));
          if (documents.some(document => !document) || value.versions.some(library => !Array.isArray(library?.versions))) return undefined;
          model.entries = [...documents.map(document => {
            const address = document.target || document;
            return entry(document, t, undefined, { key: JSON.stringify([input.kind, address.scope, address.ownerId]), title: t('配置正文') });
          }), ...value.versions.flatMap(library => library.versions.map(version => entry({ ...version, scope: library.scope, ownerId: library.ownerId }, t)))];
        } else {
          const records = def.domain === 'presetScripts' ? scriptRecords(value) : def.domain === 'character' && def.operation === 'save_openings' ? value.openingMessages : [saved];
          if (!Array.isArray(records) || records.some(item => !record(item))) return undefined;
          model.entries = records.map(item => entry(item, t));
        }
        for (const [key, item] of Object.entries(input)) if (!['documents', 'versions', 'trees', 'openingMessages', 'expectedRevision'].includes(key)) field(key, item);
      }
      if (!model.parts.length && !model.entries.length) return undefined;
    }
  }
  if (model.entries.length || model.directory) {
    if (model.entries.some(item => !item)) return undefined;
    if (!model.summary) model.summary = t('{value0} 项', { value0: model.entries.length });
    model.browser = { domain: 'creator', operation: 'read', entries: model.entries, payload, counts: {} };
  }
  return model;
}

function readRecords(def, value) {
  if (!record(value)) return undefined;
  if (def.operation === 'read_openings') return value.openingMessages;
  if (def.domain === 'editorVersions') return value.versions;
  if (def.domain === 'presetScripts' || def.domain === 'scripts' && def.operation === 'list') return scriptRecords(value);
  if (def.domain === 'scripts' && def.operation === 'read') return value.item?.type === 'folder'
    ? scriptRecords({ trees: [value.item] }) : [value.item];
  if (def.domain === 'regex' && def.operation === 'read') return [value.rule];
  if (def.operation === 'read') return [value];
  if (def.domain === 'settings') return Array.isArray(value.groups) && Array.isArray(value.entries) ? [...value.groups, ...value.entries] : undefined;
  if (def.domain === 'variables') return Array.isArray(value.objects) && Array.isArray(value.variables) ? [...value.objects, ...value.variables] : undefined;
  if (def.domain === 'regex') return value.rules;
  return undefined;
}

function scriptRecords(value) {
  if (!Array.isArray(value.trees)) return undefined;
  return value.trees.flatMap(tree => record(tree) && tree.type === 'folder' && Array.isArray(tree.scripts) ? [tree, ...tree.scripts] : [tree]);
}

function entry(value, t, keys, identity) {
  if (!record(value) || typeof value.id !== 'string' && !identity || value.title !== undefined && typeof value.title !== 'string' || value.name !== undefined && typeof value.name !== 'string') return undefined;
  const title = value.title || value.name || identity?.title || value.id;
  return { key: identity?.key || `${value.scope || ''}:${value.ownerId || ''}:${value.id}`, path: value.id || '', title, required: false, requiredOnly: false, matches: [], source: value,
    fields: (keys || Object.keys(value)).filter(key => own(value, key) && !['title', 'name', 'createdAt', 'updatedAt', 'scripts'].includes(key))
      .map(key => ({ label: t(fieldLabels[key] ?? key), value: displayValue(key, value[key], t), code: ['content', 'schemaCode'].includes(key) })) };
}

function displayValue(key, value, t) {
  if (typeof value === 'boolean') return t(value ? '是' : '否');
  if (key === 'agentReadStrategy' && value === 'keyword') return `${t('选读')} · ${t('关键词匹配')}`;
  if (['agentReadStrategy', 'readMode', 'readStrategy'].includes(key)) return t(value === 'required' || value === '必读' ? '必读' : value === 'normal' || value === 'on_demand' || value === '选读' ? '选读' : value);
  return value;
}
