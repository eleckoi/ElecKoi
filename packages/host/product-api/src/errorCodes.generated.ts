/**
 * 失败码表（客户端 bundle 用）。
 *
 * ⚠️ **本文件由 `pnpm generate:error-codes` 从
 * `packages/shared/src/contracts/errors/codes.ts` 生成，请勿手改。**
 * 改码表请改契约包那份，然后重跑生成；`check:error-codes` 会拦住手改与忘记重生成。
 *
 * 为什么要有这份副本：product-api 的 client 面是运行时独立加载的 module-loader bundle，
 * 取不到契约包源码，而 27 个 `dsh-client-*` 也要抛带契约码的失败。
 */

/** 契约码（键是 ASCII 名，值是线上码字符串）。 */
export const ELECKOI_FAILURE_CODES = {
  internal:                'eleckoi/internal',
  contractInvalidRequest:  'eleckoi/contract/invalid-request',
  contractInvalidResponse: 'eleckoi/contract/invalid-response',
  dataShapeInvalid:        'eleckoi/data/shape-invalid',
  dataLegacyMismatch:      'eleckoi/data/legacy-mismatch',
  inputInvalid:            'eleckoi/input/invalid',
  inputUnsupported:        'eleckoi/input/unsupported',
  lookupNotFound:          'eleckoi/lookup/not-found',
  lookupDuplicate:         'eleckoi/lookup/duplicate',
  characterNotFound:       'eleckoi/character/not-found',
  creatorProjectNotFound:  'eleckoi/creator-project/not-found',
  agentPresetNotFound:     'eleckoi/agent-preset/not-found',
  creatorProjectNameTaken: 'eleckoi/creator-project/name-taken',
  conflictStaleRevision:   'eleckoi/conflict/stale-revision',
  stateMismatch:           'eleckoi/state/mismatch',
  statePrecondition:       'eleckoi/state/precondition',
  safetyRefused:           'eleckoi/safety/refused',
  securityDenied:          'eleckoi/security/denied',
  senderUntrusted:         'eleckoi/sender/untrusted',
  lifecycleNotReady:       'eleckoi/lifecycle/not-ready',
  lifecycleDisposed:       'eleckoi/lifecycle/disposed',
  pluginLoadFailed:        'eleckoi/plugin/load-failed',
  ioFailed:                'eleckoi/io/failed',
  netOperationFailed:      'eleckoi/net/operation-failed',
  shellOpenFailed:         'eleckoi/shell/open-failed',
  timeoutExpired:          'eleckoi/timeout/expired',
  storageCorrupt:          'eleckoi/storage/corrupt',
  dbSchemaMismatch:        'eleckoi/db/schema-mismatch',
  modelConfigInvalid:      'eleckoi/model/config-invalid',
  mediaInvalid:            'eleckoi/media/invalid',
  ipcCallFailed:           'eleckoi/ipc/call-failed'
} as const

/** 契约码的联合类型。 */
export type ClientFailureCode = typeof ELECKOI_FAILURE_CODES[keyof typeof ELECKOI_FAILURE_CODES]
