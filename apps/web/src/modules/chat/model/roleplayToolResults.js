import { normalizePathToolResult, parseToolJson } from '../../../ui/toolResults.js';
export { parseToolJson, resultMatchesQuery, resultReadingBadge, resultLeaf, resultValueText, resultTextSegments } from '../../../ui/toolResults.js';

const definitions = Object.freeze({
  eleckoi_glob_setting_files: { domain: 'settings', operation: 'glob', label: '查找设定文件' },
  eleckoi_grep_setting_files: { domain: 'settings', operation: 'grep', label: '搜索设定内容' },
  eleckoi_read_setting_files: { domain: 'settings', operation: 'read', label: '读取设定正文' },
  eleckoi_glob_variables: { domain: 'variables', operation: 'glob', label: '查找变量' },
  eleckoi_grep_variables: { domain: 'variables', operation: 'grep', label: '搜索变量内容' },
  eleckoi_read_variables: { domain: 'variables', operation: 'read', label: '读取变量' },
});

export function roleplayToolDefinition(name) { return definitions[name]; }
export function roleplayToolResult(definition, block, tUi) {
  if (!definition || block?.kind !== 'tool-result' || block.isError) return undefined;
  if (!block.content?.length || block.content.some(part => part.type !== 'text')) return undefined;
  return normalizePathToolResult(definition, parseToolJson(block.content.map(part => part.text).join('')), tUi);
}
