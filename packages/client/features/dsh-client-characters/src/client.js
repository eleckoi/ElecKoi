window.__ModuleLoader__.load({
  id: '@eleckoi/dsh-client-characters',
  factory(require) {
    const React = require('react')
    // 边界⑥ 的信封拆解只有一份实现（@eleckoi/dsh-product-api 的 client 面）。
    const { unwrapOrFail, failureAlreadyPublished, productFailure, ELECKOI_FAILURE_CODES } = require('@eleckoi/dsh-product-api')
    const CharacterPage = React.lazy(() => import(new URL('eleckoi-page-character.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
      .then(module => ({ default: module.CharacterPage })))
    class CharacterCatalog {
      constructor(remote) {
        this.remote = remote
        this.snapshot = {
          status: 'loading',
          collection: { active_character_id: '', groups: [], items: [] },
          error: ''
        }
        this.listeners = new Set()
        this.generation = 0
        this.disposed = false
        this.changeAbort = null
      }

      getSnapshot = () => this.snapshot

      subscribe = listener => {
        this.listeners.add(listener)
        return () => this.listeners.delete(listener)
      }

      publish(next) {
        this.snapshot = next
        for (const listener of this.listeners) listener()
      }

      start() {
        void this.refresh().catch(failureAlreadyPublished)
        this.changeAbort = new AbortController()
        void this.consumeChanges(this.changeAbort.signal)
      }

      async consumeChanges(signal) {
        try {
          const stream = this.remote.eleckoiCharacters.changes.$stream
            ? await this.remote.eleckoiCharacters.changes.$stream(signal)
            : this.remote.eleckoiCharacters.changes(signal)
          for await (const change of stream) {
            if (signal.aborted || this.disposed) break
            if (change?.kind === 'snapshot' || change?.domain === 'characters') {
              await this.refresh().catch(failureAlreadyPublished)
            }
          }
        } catch (error) {
          if (!signal.aborted && !this.disposed) console.error('角色变更流已中断。', error)
        }
      }

      assertCollection(value) {
        if (!value || typeof value.active_character_id !== 'string'
          || !Array.isArray(value.groups) || !value.groups.every(group => typeof group === 'string')
          || !Array.isArray(value.items) || value.items.some(item => !item || typeof item.id !== 'string')) {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '角色列表返回的数据格式不正确。', { what: '角色列表' })
        }
        const active = value.items.find(item => item.id === value.active_character_id) || value.items[0]
        return active?.id === value.active_character_id
          ? value
          : { ...value, active_character_id: active?.id || '' }
      }

      adopt(collection) {
        if (this.disposed) return
        this.generation += 1
        this.publish({ status: 'ready', collection: this.assertCollection(collection), error: '' })
      }

      async refresh() {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 角色列表已关闭。', { what: 'ElecKoi 角色列表' })
        const generation = ++this.generation
        try {
          const result = await this.remote.eleckoiCharacters.list()
          const collection = this.assertCollection(unwrapOrFail(result, '读取角色列表失败。'))
          if (!this.disposed && generation === this.generation) {
            this.publish({ status: 'ready', collection, error: '' })
          }
          return collection
        } catch (error) {
          if (!this.disposed && generation === this.generation) {
            this.publish({
              status: 'error',
              collection: this.snapshot.collection,
              error: typeof error?.message === 'string' && error.message.trim() ? error.message : String(error)
            })
          }
          throw error
        }
      }

      async mutate(method, args, failure) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 角色列表已关闭。', { what: 'ElecKoi 角色列表' })
        const result = await this.remote.eleckoiCharacters[method](...args)
        const collection = this.assertCollection(unwrapOrFail(result, failure))
        this.adopt(collection)
        return collection
      }

      create(character) {
        return this.mutate('create', [character], '新建角色失败。')
      }

      async duplicate(characterId) {
        if (this.disposed) throw productFailure(ELECKOI_FAILURE_CODES.lifecycleDisposed, 'ElecKoi 角色列表已关闭。', { what: 'ElecKoi 角色列表' })
        const result = unwrapOrFail(await this.remote.eleckoiCharacters.duplicate(characterId), '复制角色卡失败。')
        if (!result || typeof result.characterId !== 'string' || !result.collection?.items?.some(item => item.id === result.characterId)) {
          throw productFailure(ELECKOI_FAILURE_CODES.dataShapeInvalid, '角色副本返回的数据格式不正确。', { what: '角色副本' })
        }
        this.adopt(result.collection)
        return result
      }

      update(character) {
        return this.mutate('update', [character], '保存角色失败。')
      }

      select(characterId) {
        return this.mutate('select', [characterId], '切换角色失败。')
      }

      saveGroups(groups, assignments = []) {
        return this.mutate('saveGroups', [groups, assignments], '保存角色分组失败。')
      }

      delete(characterIds) {
        return this.mutate('delete', [characterIds || []], '删除角色失败。')
      }

      async prepareImport(source, files) {
        const result = await this.remote.eleckoiCharacters.prepareImport(files, source)
        return unwrapOrFail(result, '角色卡无法读取。')
      }

      async commitImport(token) {
        const result = await this.remote.eleckoiCharacters.commitImport(token)
        const value = unwrapOrFail(result, '导入角色卡失败。')
        this.adopt(value.collection)
        return value
      }

      async discardImport(token) {
        const result = await this.remote.eleckoiCharacters.discardImport(token)
        unwrapOrFail(result, '无法清理角色卡导入。')
      }

      async exportCharacters(characterIds, format) {
        const written = []
        const failures = []
        for (const characterId of [...new Set(characterIds || [])]) {
          try {
            const value = unwrapOrFail(await this.remote.eleckoiCharacters.export(characterId, format), '导出失败。')
            const saved = await downloadExport(value)
            if (saved?.cancelled) return { canceled: true, directory: '所选保存位置', written, failures }
            written.push({ characterId, fileName: value.fileName })
          } catch (error) {
            failures.push({ characterId, message: typeof error?.message === 'string' && error.message.trim() ? error.message : '导出失败。' })
          }
        }
        return { canceled: false, directory: '所选保存位置', written, failures }
      }

      dispose() {
        if (this.disposed) return
        this.disposed = true
        this.generation += 1
        this.changeAbort?.abort()
        this.changeAbort = null
        this.listeners.clear()
      }
    }

    function apply(ctx) {
      const catalog = new CharacterCatalog(ctx.remote)
      ctx.provide('eleckoiCharacters', catalog)
      ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: 'character', registrant: '@eleckoi/dsh-client-characters' },
        () => React.createElement(CharacterPage)))
      const NavigationIcon = React.lazy(() => import(new URL('eleckoi-page-character.js', new URL(globalThis.__ELECKOI_CLIENT_ASSETS__.script, location.href)).href)
        .then(module => ({ default: module.NavigationIcon })))
      ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
        name: 'sidebar.panellist', id: 'character', order: -30, label: '角色列表', registrant: '@eleckoi/dsh-client-characters'
      }, () => React.createElement(NavigationIcon)))
      ctx.effect(() => {
        catalog.start()
        const stopReset = ctx.on('connection/reset', () => { void catalog.refresh().catch(failureAlreadyPublished) })
        return () => {
          stopReset()
          catalog.dispose()
        }
      }, 'eleckoi: character catalog')
    }

    return { inject: ['slots', 'remote', 'remote.eleckoiCharacters'], apply }
  }
})

async function downloadExport(file) {
  const bytes = Uint8Array.from(atob(file.base64), character => character.charCodeAt(0))
  if (window.ElecKoiPlatform?.saveBytes) {
    return window.ElecKoiPlatform.saveBytes(file.fileName, bytes, file.mimeType)
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: file.mimeType }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  link.style.display = 'none'
  try {
    document.body.append(link)
    link.click()
  } finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
