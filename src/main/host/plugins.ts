import type { Context, Plugin } from '@deepseek-ai/cordis'
import { DesktopGateway } from '@main/gateway/DesktopGateway'
import { AppPaths } from '@main/platform/filesystem/AppPaths'
import { createAppLog } from '@main/platform/logging/AppLog'
import { credentialCipher } from '@main/platform/electron/CredentialCipher'
import { ConversationFiles } from '@main/platform/filesystem/ConversationFiles'
import { LocalMediaStore } from '@main/platform/filesystem/LocalMediaStore'
import { join } from 'node:path'
import { SqliteDatabase } from '@main/platform/sqlite/SqliteDatabase'
import './desktopContext'

export const platformPlugin = {
  name: 'eleckoi-platform',
  provide: ['appPaths', 'appLog', 'credentialCipher', 'conversationFiles', 'mediaAssets'],
  apply(ctx: Context) {
    ctx.provide('appPaths', new AppPaths())
    ctx.provide('appLog', createAppLog())
    ctx.provide('credentialCipher', credentialCipher)
    ctx.provide('conversationFiles', new ConversationFiles([ctx.appPaths.workspace, join(ctx.appPaths.dshRuntime, 'sessions')]))
    ctx.provide('mediaAssets', new LocalMediaStore(ctx.appPaths.media))
  }
} satisfies Plugin.Object

export const sqlitePlugin = {
  name: 'eleckoi-sqlite',
  inject: ['appPaths'],
  provide: 'database',
  apply(ctx: Context) {
    const database = new SqliteDatabase(ctx.appPaths.database)
    database.open()
    ctx.provide('database', database)
    return () => database.close()
  }
} satisfies Plugin.Object

export const gatewayPlugin = {
  name: 'eleckoi-gateway',
  provide: 'desktopGateway',
  apply(ctx: Context) {
    const gateway = new DesktopGateway()
    gateway.start()
    ctx.provide('desktopGateway', gateway)
    return () => gateway.dispose()
  }
} satisfies Plugin.Object
