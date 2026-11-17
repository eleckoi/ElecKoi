/** Model-visible usage shared by discovery and failed calls; it never dispatches work. */
export const creatorCallContract = {
  tool: 'eleckoi_call_capability',
  operation_call: {
    capability_id: '使用 operations 中的准确 id，例如 character.list。',
    arguments: '按该操作 inputSchema 填写业务参数。只读操作省略时等同 {}，仍须满足业务必填字段；写操作明确提供对象。',
    character_id: '可选的真实角色编号，来自 character.list；省略时沿当前编辑目标。操作的 target 是种类元数据，不是角色编号。不需要角色的操作省略本字段。',
  },
  result_read: {
    exclusive_fields: ['result'],
    file_path_source: '只使用本会话已有溢出回执中的准确 file_path；没有回执时先执行普通查询，不编造路径。',
    continuation: '按回执 next_offset 续读直到 null；只读取原结果，不重新执行写操作。',
  },
}

function emptyReadExample(operation) {
  const schema = operation.inputSchema
  if (operation.effect === 'read' && schema.type === 'object' && !(schema.required?.length)) {
    return { capability_id: operation.id, arguments: {} }
  }
}

export function describeCreatorOperation(operation, includeSchema) {
  const { execute: _execute, inputSchema, ...metadata } = operation
  if (!includeSchema) return metadata
  const example = emptyReadExample(operation)
  return { ...metadata, inputSchema, ...(example ? { call_example: example } : {}) }
}

/** Official tool finalization preserves the error and only adds a usage contract. */
export function creatorCallErrorContent(exec, result, capabilities) {
  if (!result.isError || exec.signal.aborted) return
  const args = exec.arguments && typeof exec.arguments === 'object' && !Array.isArray(exec.arguments) ? exec.arguments : {}
  const operation = capabilities.find(item => item.id === args.capability_id)
  const mixed = Object.hasOwn(args, 'result') && Object.keys(args).some(key => key !== 'result')
  const missingWriteArguments = operation?.effect === 'write' && args.arguments === undefined && !Object.hasOwn(args, 'result')
  const recovery = mixed
    ? { reason: 'mixed_call_forms', operation_executed: false, next_step: '选择一种调用形式。普通操作删除 result 并按下列 inputSchema 填写 arguments；续读仅保留 result，使用已有溢出回执。' }
    : missingWriteArguments
      ? { reason: 'missing_write_arguments', operation_executed: false, next_step: '按下列 inputSchema 明确提供写入参数，不自动补业务内容。' }
      : { next_step: '先核对原错误及下列调用合同。读取可更正参数后重试；写入执行或提交状态不明时先读取实际状态，不自动重做写入。' }
  return [...result.content, { type: 'text', text: JSON.stringify({ tool_usage: creatorCallContract,
    ...(operation ? { operation: describeCreatorOperation(operation, true) }
      : { discover: { tool: 'eleckoi_list_toolsets', arguments: {} }, describe: '再用 eleckoi_describe_toolset 查询具体能力组，默认包含准确 inputSchema。' }),
    recovery,
  }, null, 2) }]
}
