import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { isAbsolute, join, relative } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach, describe, expect, it, vi } from 'vitest'
import productDataPlugin from '@eleckoi/dsh-product-data'
import { creatorCapabilities, creatorToolsets } from '../src/domain/creatorStudio/capabilities'
import { VARIABLE_INITIALIZATION_OBJECT_ID } from '../../../shared/src/contracts/variables/schemas'

const cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs() })
async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'eleckoi-creator-authoring-'))
  cleanups.push(() => { const child = relative(tmpdir(), root); if (!child || child.startsWith('..') || isAbsolute(child)) throw new Error('Unexpected cleanup path'); rmSync(root, { recursive: true, force: true }) })
  vi.stubEnv('ELECKOI_DATABASE_PATH', join(root, 'product.sqlite')); vi.stubEnv('ELECKOI_MEDIA_ROOT', join(root, 'media'))
  const ctx = new Context(); cleanups.push(() => ctx.fiber.dispose()); await ctx.plugin(productDataPlugin)
  const data = ctx.eleckoiProductData, characterId = 'synthetic-authoring-character'
  data.createCharacter({ id: characterId, name: '合成编辑目标' })
  data.createCharacter({ id: 'synthetic-other-character', name: '合成其他目标' })
  data.saveSettingLibrary(characterId, data.readSettingLibrary(characterId))
  const operations = creatorCapabilities(data)
  const call = (id: string, input: unknown = {}) => operations.find(item => item.id === id)!.execute(characterId, input) as any
  const saveOpenings = (patch: Record<string, unknown>) => {
    const { characterId: _id, ...current } = call('character.read_openings')
    return call('character.save_openings', { ...current, ...patch })
  }
  return { ctx, data, call, operations, characterId, saveOpenings }
}

describe('Creator authoring matches the native setting, schema, script and regex contracts', { timeout: 30_000 }, () => {
  it('replaces one chapter literally while retaining surrounding text, metadata, other entries and inactive versions across reopen', async () => {
    const f = await fixture()
    const prefix = '第一幕：原样保留𠮷。\r\n'.repeat(2000), suffix = '\r\n第五幕：仍然保留𠮷。'.repeat(2000)
    const old_string = '第四幕\r\n旧段落：$& 与 $1 按文字处理。', new_string = '第四幕\r\n新段落：$& $$ $1 𠮷。'
    const entry = f.call('settings.create', { title: 'Synthetic long story', content: prefix + old_string + suffix, agentReadStrategy: 'keyword', keywords: ['retained'], enabled: false })
    f.call('settings.create', { title: 'Synthetic untouched', content: 'Other entry remains unchanged' })
    const library = f.data.readSettingLibrary(f.characterId)
    f.data.saveSettingLibrary(f.characterId, { ...library, versions: [...library.versions, { ...library.versions[0]!, id: 'synthetic-inactive-version', name: 'Synthetic untouched version' }] })
    const before = f.data.readSettingLibrary(f.characterId), other = f.data.saveSettingLibrary('synthetic-other-character', f.data.readSettingLibrary('synthetic-other-character'))
    expect(f.call('settings.edit', { id: entry.id, old_string, new_string })).toEqual({ id: entry.id, changed: true, replacements: 1 })
    const saved = f.data.readSettingLibrary(f.characterId), edited = saved.entries.find(item => item.id === entry.id)!
    expect(edited).toEqual({ ...before.entries.find(item => item.id === entry.id), content: prefix + new_string + suffix, updatedAt: edited.updatedAt })
    expect(saved.entries.filter(item => item.id !== entry.id)).toEqual(before.entries.filter(item => item.id !== entry.id))
    expect(saved.groups).toEqual(before.groups); expect(saved.promptPositions).toEqual(before.promptPositions)
    expect(saved.versions.find(version => version.id === 'synthetic-inactive-version')).toEqual(before.versions.find(version => version.id === 'synthetic-inactive-version'))
    expect(saved.versions.find(version => version.id === saved.activeVersionId)!.entries.find(item => item.id === entry.id)!.content).toBe(edited.content)
    expect(f.data.readSettingLibrary('synthetic-other-character')).toEqual(other)
    await f.ctx.fiber.dispose()
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin)
    expect(reopened.eleckoiProductData.readSettingLibrary(f.characterId)).toEqual(saved)
  })
  it('rejects missing, ambiguous, empty and unchanged source fragments without writing', async () => {
    const f = await fixture(), entry = f.call('settings.create', { title: 'Synthetic repeated text', content: '相同片段\n中间\n相同片段' })
    const before = f.data.readSettingLibrary(f.characterId), update = vi.spyOn(f.data, 'updateSettingLibraryEntries')
    cleanups.push(() => update.mockRestore())
    for (const input of [
      { id: entry.id, old_string: '不存在的原文', new_string: '替换' },
      { id: entry.id, old_string: '相同片段', new_string: '替换' },
      { id: entry.id, old_string: '', new_string: '替换' },
      { id: entry.id, old_string: '中间', new_string: '中间' },
      { id: 'synthetic-missing', old_string: '中间', new_string: '替换' },
      { id: entry.id, old_string: '中间', new_string: '替换', characterId: 'synthetic-other-character' },
    ]) {
      expect(() => f.call('settings.edit', input)).toThrow()
      expect(f.data.readSettingLibrary(f.characterId)).toEqual(before)
    }
    expect(update).not.toHaveBeenCalled()
  })
  it('supports explicit replacement of every match and deletion without expanding replacement markers', async () => {
    const f = await fixture(), entry = f.call('settings.create', { title: 'Synthetic literal edit', content: '旧文字 / 旧文字 / 旧文字' })
    expect(f.call('settings.edit', { id: entry.id, old_string: '旧文字', new_string: '$& $1 $$', replace_all: true })).toMatchObject({ replacements: 3 })
    expect(f.call('settings.read', { id: entry.id }).content).toBe('$& $1 $$ / $& $1 $$ / $& $1 $$')
    expect(f.call('settings.edit', { id: entry.id, old_string: '$& $1 $$', new_string: '', replace_all: true })).toMatchObject({ replacements: 3 })
    expect(f.call('settings.read', { id: entry.id }).content).toBe(' /  / ')
  })
  it.each(['versions', 'activeVersionId', 'characterId'])('rejects unsupported opening field %s before saving', async field => {
    const f = await fixture(), before = f.data.readCharacterOpenings(f.characterId)
    const save = vi.spyOn(f.data, 'saveCharacterOpenings')
    cleanups.push(() => save.mockRestore())
    const { characterId: _owner, ...value } = f.call('character.read_openings')
    expect(() => f.call('character.save_openings', { ...value, [field]: field === 'versions' ? [] : 'synthetic-unrecognized' })).toThrow()
    expect(save).not.toHaveBeenCalled()
    expect(f.data.readCharacterOpenings(f.characterId)).toEqual(before)
  })

  it('does not expose or accept independent opening initial values in creator operations', async () => {
    const f = await fixture(), value = f.call('character.read_openings')
    expect(value.openingMessages[0]).not.toHaveProperty('initialVariableStateJson')
    const before = f.data.readCharacterOpenings(f.characterId)
    expect(() => f.saveOpenings({ openingMessages: [{ ...value.openingMessages[0], initialVariableStateJson: '{"synthetic":99}' }] })).toThrow()
    expect(f.data.readCharacterOpenings(f.characterId)).toEqual(before)
    const operation = f.operations.find(item => item.id === 'character.save_openings')!
    expect(JSON.stringify(operation.inputSchema)).not.toContain('initialVariableStateJson')
  })

  it('imports only supported opening fields from a card and never writes retired fields back', async () => {
    const f = await fixture()
    const saved = f.saveOpenings({ openingMessages: [{ id: 'synthetic-opening', title: 'Synthetic', content: 'Synthetic opening' }], defaultOpeningMessageId: 'synthetic-opening' })
    const card = JSON.parse(Buffer.from(f.data.exportCharacter(f.characterId, 'json').base64, 'base64').toString('utf8'))
    card.character_openings = JSON.stringify({ ...saved, openingMessages: saved.openingMessages.map((message: object) => ({ ...message,
      initialVariableStateJson: '{"discarded":99}', futureFileMetadata: 'ignored',
    })) })
    const preview = f.data.prepareCharacterImports([{ displayName: 'synthetic-card.json', mimeType: 'application/json', base64: Buffer.from(JSON.stringify(card)).toString('base64') }], 'eleckoi')
    const id = f.data.commitCharacterImports(preview.token).importedCharacterIds[0]!
    expect(f.data.readCharacterOpenings(id).openingMessages).toEqual(saved.openingMessages)
    const exported = JSON.parse(Buffer.from(f.data.exportCharacter(id, 'json').base64, 'base64').toString('utf8'))
    expect(exported.character_openings).not.toContain('initialVariableStateJson')
    expect(exported.character_openings).not.toContain('futureFileMetadata')
  })

  it('writes all independent openings, preserves every alternate and round-trips the complete card', async () => {
    const f = await fixture(), config = f.data.readVariableConfig(f.characterId);
    const indexes = [0, 5_000, 10_000];
    const messages = Array.from({ length: 10_001 }, (_, index) => ({ id: `synthetic-opening-${index}`, title: `合成开场-${index}`,
      content: `他在开场-${index}。${indexes.includes(index) ? '合成长正文他𠮷'.repeat(20_000) : ''}末尾他-${index}`,
      ...(index % 2 ? { variableVersionId: config.activeVersionId } : {}) }));
    f.saveOpenings({ enabled: true, openingMessages: messages,
      defaultOpeningMessageId: messages[5_000]!.id });
    const other = f.data.readCharacterOpenings('synthetic-other-character');
    const settings = f.data.readSettingLibrary(f.characterId);
    const desired = messages.map(message => ({ ...message, content: message.content.replaceAll('他', '她') }));
    const updated = f.saveOpenings({ openingMessages: desired });
    expect(updated.openingMessages).toEqual(desired);
    expect(updated.defaultOpeningMessageId).toBe(messages[5_000]!.id);
    expect(f.data.readSettingLibrary(f.characterId)).toEqual(settings);
    expect(f.data.readCharacterOpenings('synthetic-other-character')).toEqual(other);
    expect(Object.hasOwn(updated, 'versions')).toBe(false);
    for (const index of indexes) expect(updated.openingMessages[index].content.endsWith(`末尾她-${index}`)).toBe(true);
    const chat = f.data.createConversation({ metadata: { characterId: f.characterId } });
    expect(chat.messages[0]!.content).toBe(desired[5_000]!.content);
    expect(chat.messages[0]!.openingOptions).toHaveLength(desired.length);
    for (const format of ['json', 'png'] as const) {
      const exported = f.data.exportCharacter(f.characterId, format);
      const preview = f.data.prepareCharacterImports([{ displayName: exported.fileName, mimeType: exported.mimeType, base64: exported.base64 }], 'eleckoi');
      const imported = f.data.commitCharacterImports(preview.token).importedCharacterIds[0]!;
      expect(f.data.readCharacterOpenings(imported).openingMessages).toEqual(desired);
    }
    const earlyCard = JSON.parse(Buffer.from(f.data.exportCharacter(f.characterId, 'json').base64, 'base64').toString('utf8'));
    const oldSnapshot = { id: 'synthetic-early-current', name: '合成旧结构', enabled: updated.enabled,
      openingMessages: desired.map(message => ({ ...message, initialVariableStateJson: '' })), defaultOpeningMessageId: updated.defaultOpeningMessageId, createdAt: '', updatedAt: '' };
    earlyCard.character_openings = JSON.stringify({ ...updated, openingMessages: oldSnapshot.openingMessages, activeVersionId: oldSnapshot.id, name: oldSnapshot.name,
      versions: [oldSnapshot, { ...oldSnapshot, id: 'synthetic-early-other', openingMessages: [{ ...desired[0]!, initialVariableStateJson: '', content: '合成早期文件中的另一条正文' }], defaultOpeningMessageId: desired[0]!.id }] });
    const earlyPreview = f.data.prepareCharacterImports([{ displayName: 'synthetic-early-card.json', mimeType: 'application/json',
      base64: Buffer.from(JSON.stringify(earlyCard)).toString('base64') }], 'eleckoi');
    const earlyId = f.data.commitCharacterImports(earlyPreview.token).importedCharacterIds[0]!;
    const recovered = f.data.readCharacterOpenings(earlyId);
    expect(recovered.openingMessages.slice(0, desired.length)).toEqual(desired);
    expect(recovered.openingMessages).toHaveLength(desired.length + 1);
    expect(recovered.openingMessages.at(-1)).toMatchObject({ content: '合成早期文件中的另一条正文' });
    expect(Object.hasOwn(recovered, 'versions')).toBe(false);
    await f.ctx.fiber.dispose();
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin);
    expect(reopened.eleckoiProductData.readCharacterOpenings(f.characterId)).toEqual(updated);
  }, 60_000);

  it('adds and removes alternates, preserves settings and rejects invalid opening saves atomically', async () => {
    const f = await fixture(), opening = f.call('character.read_openings');
    const initial = opening.openingMessages[0];
    f.saveOpenings({ openingMessages: [{ ...initial, content: '合成主开场白' }], enabled: true });
    let current = f.call('character.read_openings');
    const alternate = { id: 'synthetic-alternate', title: '合成备用', content: '合成备用正文' };
    f.saveOpenings({ openingMessages: [...current.openingMessages, alternate], defaultOpeningMessageId: alternate.id });
    current = f.call('character.read_openings');
    const settings = f.data.readSettingLibrary(f.characterId);
    for (const changes of [{ openingMessages: [{ ...alternate, variableVersionId: 'synthetic-missing-variable-version' }] },
      { openingMessages: [alternate, alternate] }, { openingMessages: [] }, { defaultOpeningMessageId: 'synthetic-missing-opening' }]) {
      expect(() => f.saveOpenings(changes)).toThrow();
      expect(f.call('character.read_openings')).toEqual(current);
      expect(f.data.readSettingLibrary(f.characterId)).toEqual(settings);
    }
    f.saveOpenings({ openingMessages: [{ ...alternate, content: '' }] });
    expect(f.call('character.read_openings')).toMatchObject({ openingMessages: [{ ...alternate, content: '' }], defaultOpeningMessageId: alternate.id });
  });

  it('changes and clears opening variable-version bindings without activating an unbound configuration', async () => {
    const f = await fixture()
    f.call('variables.create', { title: 'synthetic', objectId: '', enabled: true, type: 'number', defaultValue: '11', description: '', updateRule: '', readMode: 'required', order: 1, treeViewOrder: 1 })
    const config = f.data.readVariableConfig(f.characterId)
    const secondVersionId = 'synthetic-opening-variable-version'
    f.data.saveVariableConfig(f.characterId, { ...config, versions: [...config.versions,
      { ...config.versions[0]!, id: secondVersionId, name: '合成备用变量版本', variables: config.variables.map(variable => ({ ...variable, defaultValue: '22' })) },
    ] })
    expect(f.call('variables.list')).toMatchObject({ activeVersionId: config.activeVersionId, versions: [...config.versions.map(({ id, name }) => ({ id, name })), { id: secondVersionId, name: '合成备用变量版本' }] })
    const opening = f.call('character.read_openings')
    const message = { ...opening.openingMessages[0], content: '合成绑定开场', variableVersionId: config.activeVersionId }
    f.saveOpenings({ enabled: true, openingMessages: [message] })
    f.saveOpenings({ openingMessages: [{ ...message, variableVersionId: secondVersionId }] })
    let saved = f.call('character.read_openings')
    expect(saved.openingMessages[0]).toMatchObject({ variableVersionId: secondVersionId })
    expect(saved.openingMessages[0]).not.toHaveProperty('initialVariableStateJson')
    const bound = f.data.createConversation({ metadata: { characterId: f.characterId } })
    expect(JSON.parse(bound.messages[0]!.variableStateJson)).toEqual({ synthetic: 22 })
    expect(bound.messages[0]!.openingOptions![0]!.variableVersionId).toBe(secondVersionId)
    expect(JSON.parse(bound.messages[0]!.openingOptions![0]!.initialVariableStateJson)).toEqual({ synthetic: 22 })
    f.saveOpenings({ openingMessages: [{ ...saved.openingMessages[0], variableVersionId: '' }] })
    saved = f.call('character.read_openings')
    expect(saved.openingMessages[0]).toMatchObject({ variableVersionId: '' })
    const unbound = f.data.createConversation({ metadata: { characterId: f.characterId } })
    expect(JSON.parse(unbound.messages[0]!.variableStateJson)).toEqual({})
    expect(unbound.messages[0]!.openingOptions![0]).toMatchObject({ variableVersionId: '', initialVariableStateJson: '{}' })
    expect(f.data.readAuthorConversationState(unbound.conversation.id).variableConfig).toBeNull()
    expect(f.data.prepareConversationRuntime(unbound.conversation.id, 'Synthetic input').variableContext).toBeUndefined()
    expect(f.data.readConversationDetails(bound.conversation.id).messages[0]!.openingOptions).toEqual(bound.messages[0]!.openingOptions)
    await f.ctx.fiber.dispose()
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin)
    expect(reopened.eleckoiProductData.readCharacterOpenings(f.characterId).openingMessages).toEqual(
      saved.openingMessages)
  })

  it('saves and reopens every object in a variable configuration larger than one SQL parameter budget', async () => {
    const f = await fixture(), config = f.data.readVariableConfig(f.characterId)
    const objects = Array.from({ length: 10_001 }, (_, index) => ({
      id: `synthetic-object-${index}`, name: `合成变量组-${index}`, parentId: '', enabled: true,
      description: `合成说明-${index}`, updateRule: '', dynamicKey: false, order: index + 1, treeViewOrder: index,
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    }))
    const saved = f.data.saveVariableConfig(f.characterId, { ...config, objects: [...config.objects, ...objects] })
    expect(saved.objects.filter(object => object.id.startsWith('synthetic-object-'))).toHaveLength(objects.length)
    await f.ctx.fiber.dispose()
    const reopened = new Context()
    cleanups.push(() => reopened.fiber.dispose())
    await reopened.plugin(productDataPlugin)
    expect(reopened.eleckoiProductData.readVariableConfig(f.characterId)).toEqual(saved)
  })

  it('enables and disables keyword matching in an atomic batch, preserving content, keywords, versions and other characters', async () => {
    const f = await fixture(), other = f.data.saveSettingLibrary('synthetic-other-character', f.data.readSettingLibrary('synthetic-other-character'))
    const entries = ['first', 'second'].map(title => f.call('settings.create', { title, content: `Synthetic ${title}`, keywords: ['synthetic-trigger'], keywordIgnoreCase: false }))
    const before = f.data.readSettingLibrary(f.characterId)
    f.call('settings.update_many', { updates: entries.map(entry => ({ id: entry.id, changes: { agentReadStrategy: 'keyword' } })) })
    let library = f.data.readSettingLibrary(f.characterId)
    for (const entry of entries) {
      expect(f.call('settings.read', { id: entry.id })).toMatchObject({ content: entry.content, keywords: ['synthetic-trigger'], keywordIgnoreCase: false, agentReadStrategy: 'keyword' })
      expect(library.versions.find(version => version.id === library.activeVersionId)!.entries.find(item => item.id === entry.id)!.agentReadStrategy).toBe('keyword')
    }
    expect(f.call('settings.list').entries.filter((entry: { keywordMatch: boolean }) => entry.keywordMatch)).toHaveLength(2)
    expect(f.data.readSettingLibrary('synthetic-other-character')).toEqual(other)
    expect(library.activeVersionId).toBe(before.activeVersionId)
    const unchanged = library
    for (const updates of [
      [{ id: entries[0].id, changes: { enabled: false } }, { id: 'synthetic-missing', changes: { enabled: false } }],
      [{ id: entries[0].id, changes: { enabled: false } }, { id: entries[1].id, changes: { agentReadStrategy: 'required', contentMode: 'ejs' } }],
      [{ id: entries[0].id, changes: { enabled: false } }, { id: entries[0].id, changes: { enabled: true } }],
    ]) {
      expect(() => f.call('settings.update_many', { updates })).toThrow()
      expect(f.data.readSettingLibrary(f.characterId)).toEqual(unchanged)
    }
    f.call('settings.update', { id: entries[0].id, changes: { agentReadStrategy: 'normal' } })
    library = f.data.readSettingLibrary(f.characterId)
    expect(library.entries.find(item => item.id === entries[0].id)).toMatchObject({ agentReadStrategy: 'normal', keywords: ['synthetic-trigger'], content: entries[0].content })
    expect(library.entries.find(item => item.id === entries[1].id)!.agentReadStrategy).toBe('keyword')
  })

  it('renames and moves setting folders without changing entry identities, rejects cycles and removes exactly the requested subtree', async () => {
    const f = await fixture(), group = (name: string, parentId = '') => f.call('settings.create_group', { name, parentId, order: 1, treeViewOrder: 1 })
    const root = group('Synthetic root'), child = group('Synthetic child', root.id), sibling = group('Synthetic sibling')
    const entry = f.call('settings.create', { title: 'Synthetic nested entry', groupId: child.id, content: 'Synthetic content' })
    const other = f.call('settings.create', { title: 'Synthetic retained entry', groupId: sibling.id, content: 'Synthetic retained content' })
    expect(f.call('settings.update_group', { id: root.id, changes: { name: 'Synthetic renamed root', parentId: sibling.id } })).toMatchObject({ id: root.id, parentId: sibling.id })
    let library = f.data.readSettingLibrary(f.characterId)
    expect(library.entries.find(item => item.id === entry.id)).toMatchObject({ groupId: child.id, content: entry.content })
    expect(library.versions.find(version => version.id === library.activeVersionId)!.groups.find(item => item.id === root.id)!.name).toBe('Synthetic renamed root')
    for (const input of [{ id: sibling.id, changes: { parentId: child.id } }, { id: root.id, changes: { parentId: 'synthetic-missing' } }, { id: 'synthetic-missing', changes: { name: 'Synthetic name' } }]) {
      expect(() => f.call('settings.update_group', input)).toThrow()
      expect(f.data.readSettingLibrary(f.characterId)).toEqual(library)
    }
    expect(f.call('settings.remove_group', { id: root.id })).toEqual({ removedGroupIds: [root.id, child.id], removedEntryIds: [entry.id] })
    library = f.data.readSettingLibrary(f.characterId)
    expect(library.groups.map(item => item.id)).toEqual([sibling.id])
    expect(library.entries.find(item => item.id === other.id)).toMatchObject({ groupId: sibling.id, content: other.content })
    expect(library.entries.some(item => item.id === entry.id)).toBe(false)
  })

  it('updates only the selected character group and preserves other characters and profile fields', async () => {
    const f = await fixture(), before = f.data.readCharacters()
    const selected = before.items.find(item => item.id === f.characterId)!
    expect(f.call('character.update', { group: 'Synthetic selected group' })).toMatchObject({ group: 'Synthetic selected group', persona: selected.persona })
    expect(f.data.readCharacters().items.filter(item => item.id !== f.characterId)).toEqual(before.items.filter(item => item.id !== f.characterId))
    expect(f.call('character.update', { group: '' }).group).toBe('')
  })

  it('edits variable groups, preserves variable identities, rejects invalid parents and protects runtime configuration', async () => {
    const f = await fixture(), group = (name: string, parentId = '') => f.call('variables.create_object', { name, parentId, enabled: true, description: '', updateRule: '', dynamicKey: false, order: 1, treeViewOrder: 1 })
    const root = group('SyntheticRoot'), child = group('SyntheticChild', root.id), sibling = group('SyntheticSibling')
    const variable = f.call('variables.create', { title: 'score', objectId: child.id, enabled: true, type: 'number', defaultValue: '20', description: '', updateRule: '', readMode: 'required', order: 1, treeViewOrder: 1 })
    expect(f.call('variables.update_object', { id: root.id, changes: { name: 'SyntheticRenamed', description: 'Synthetic description' } })).toMatchObject({ id: root.id, name: 'SyntheticRenamed' })
    const config = f.data.readVariableConfig(f.characterId)
    expect(config.variables.find(item => item.id === variable.id)).toEqual(variable)
    expect(JSON.parse(config.initialStateJson)).toMatchObject({ SyntheticRenamed: { SyntheticChild: { score: 20 } } })
    expect(config.versions.find(version => version.id === config.activeVersionId)!.objects.find(item => item.id === root.id)!.name).toBe('SyntheticRenamed')
    for (const input of [{ id: root.id, changes: { parentId: child.id } }, { id: root.id, changes: { parentId: 'synthetic-missing' } },
      { id: root.id, changes: { parentId: VARIABLE_INITIALIZATION_OBJECT_ID } }, { id: VARIABLE_INITIALIZATION_OBJECT_ID, changes: { name: 'Synthetic forbidden name' } }]) {
      expect(() => f.call('variables.update_object', input)).toThrow()
      expect(f.data.readVariableConfig(f.characterId)).toEqual(config)
    }
    expect(() => f.call('variables.remove_object', { id: VARIABLE_INITIALIZATION_OBJECT_ID })).toThrow('不能删除')
    expect(f.call('variables.remove_object', { id: root.id })).toEqual({ removedObjectIds: [root.id, child.id], removedVariableIds: [variable.id] })
    expect(f.data.readVariableConfig(f.characterId).objects.map(item => item.id)).toEqual([VARIABLE_INITIALIZATION_OBJECT_ID, sibling.id])
    expect(f.data.readVariableConfig(f.characterId).variables).toEqual([])
  })




  it('saves empty disabled script drafts and refuses to enable them without altering valid data', async () => {
    const f = await fixture()
    const draft = f.call('scripts.create', { expectedRevision: 0, name: '合成空白草稿', content: '' })
    expect(draft.item).toMatchObject({ content: '', enabled: false })
    const before = f.call('scripts.read', { id: draft.item.id })
    expect(() => f.call('scripts.update', { id: draft.item.id, expectedRevision: before.revision, changes: { enabled: true } })).toThrow('源码为空')
    expect(f.call('scripts.read', { id: draft.item.id })).toEqual(before)
    const presetId = f.data.readAgentPresetCatalog().activePresetIds.roleplay
    const library = f.call('presetScripts.read', { presetId })
    const saved = f.call('presetScripts.save', { presetId, expectedRevision: library.revision, enabled: false, variables: {}, trees: [draft.item] })
    expect(saved.trees[0]).toMatchObject({ content: '', enabled: false })
    expect(() => f.call('presetScripts.save', { presetId, expectedRevision: saved.revision, enabled: true, variables: {}, trees: [{ ...draft.item, enabled: true }] })).toThrow('源码为空')
    expect(f.call('presetScripts.read', { presetId })).toEqual(saved)
  })
  it('creates a blank character without a selected target and preserves existing character identities', async () => {
    const f = await fixture(), before = f.data.readCharacters()
    const create = f.operations.find(item => item.id === 'character.create')!
    expect(create.target).toBe('new-character')
    const created = create.execute('', { name: '合成新角色', group: '合成新分组' }) as { id: string }
    const after = f.data.readCharacters()
    expect(after.items).toHaveLength(before.items.length + 1)
    expect(after.active_character_id).toBe(before.active_character_id)
    expect(after.items.find(item => item.id === created.id)).toMatchObject({ name: '合成新角色', group: '合成新分组', avatar: '',
      persona: { opening: '', assistant_avatar: '', assistant_square: '', assistant_cover: '', show_opening: true } })
    expect(after.items.filter(item => item.id !== created.id)).toEqual(before.items)
    for (const input of [{ name: '' }, { name: '   ' }, { name: '合成新角色', characterId: f.characterId }, {}]) {
      expect(() => create.execute('', input)).toThrow()
    }
    expect(f.data.readCharacters()).toEqual(after)
    expect(() => f.operations.find(item => item.id === 'character.update')!.execute('', { name: '不能改到其他角色' })).toThrow('重新选择角色')
  })
  it('advertises two reading policies and refuses executable required/reference entries without saving', async () => {
    const f = await fixture()
    const schema = f.operations.find(item => item.id === 'settings.create')!.inputSchema as any
    expect(schema.properties.agentReadStrategy.enum).toEqual(['required', 'keyword', 'normal'])
    const before = f.data.readSettingLibrary(f.characterId)
    expect(() => f.call('settings.create', { title: '合成必读', agentReadStrategy: 'required', contentMode: 'ejs', content: '<%= 1 %>' })).toThrow('选读')
    expect(() => f.call('settings.create', { title: '合成引用', dynamicMode: 'ejs_reference', contentMode: 'ejs' })).toThrow('纯文字')
    expect(() => f.call('settings.create', { title: '合成错误档位', agentReadStrategy: 'unsupported' })).toThrow()
    expect(f.data.readSettingLibrary(f.characterId)).toEqual(before)
    const reference = f.call('settings.create', { title: '合成素材', dynamicMode: 'ejs_reference', content: '合成文字' })
    const controller = f.call('settings.create', { title: '合成控制器', contentMode: 'ejs', content: '<%- await getwi("合成素材") %>' })
    expect(f.call('settings.list').entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: reference.id, readStrategy: '选读', dynamicMode: 'ejs_reference', contentMode: 'plain_text' }),
      expect.objectContaining({ id: controller.id, readStrategy: '选读', contentMode: 'ejs' }),
    ]))
    expect(() => f.call('settings.update', { id: controller.id, changes: { agentReadStrategy: 'required' } })).toThrow('选读')
    expect(f.call('settings.read', { id: controller.id }).contentMode).toBe('ejs')
  })
  it('evaluates the documented Zod example and retains the previous code on invalid output', async () => {
    const f = await fixture()
    f.call('variables.create', { title: 'score', objectId: '', enabled: true, type: 'number', defaultValue: '20', description: '', updateRule: '', readMode: 'required', order: 1, treeViewOrder: 1 })
    const example = creatorToolsets.find(item => item.id === 'variables')!.examples[0]
    expect(f.call('variables.validate_schema', { schemaCode: example.schemaCode, state: example.state }).state).toEqual({ score: 20, flags: { ready: true }, level: 3 })
    f.call('variables.update_schema', { schemaCode: example.schemaCode })
    const before = f.data.readVariableConfig(f.characterId)
    expect(() => f.call('variables.update_schema', { schemaCode: 'z.object({ score: z.number().max(1) })' })).toThrow()
    expect(() => f.call('variables.validate_schema', { schemaCode: 'z.object({}).transform(() => undefined)' })).toThrow('JSON')
    expect(f.data.readVariableConfig(f.characterId)).toEqual(before)
  })
  it('stores native modules as files, uses exact revisions and keeps other libraries unchanged', async () => {
    const f = await fixture(), source = creatorToolsets.find(item => item.id === 'scripts')!.examples[0].content
    const global = f.data.readScriptLibrary('global', ''), other = f.data.readScriptLibrary('character', 'synthetic-other-character')
    const folder = f.call('scripts.create_folder', { name: '合成分组', expectedRevision: 0 })
    const created = f.call('scripts.create', { name: '合成计算脚本', folderId: folder.item.id, content: source, expectedRevision: folder.revision })
    expect(created.item).toMatchObject({ enabled: false, runtime: { kind: 'eleckoi-module', apiVersion: 1 } })
    expect(f.call('scripts.list').enabled).toBe(false)
    const workspace = f.data.readScriptWorkspace('character', f.characterId)
    const file = join(workspace.path, workspace.entries.find(item => item.id === created.item.id)!.file)
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(() => f.call('scripts.update', { id: created.item.id, expectedRevision: folder.revision, changes: { content: 'export default () => {}' } })).toThrow('重新读取')
    expect(readFileSync(file, 'utf8')).toBe(source)
    expect(() => f.call('scripts.remove_folder', { id: folder.item.id, expectedRevision: created.revision })).toThrow('空脚本文件夹')
    const updated = f.call('scripts.update', { id: created.item.id, expectedRevision: created.revision, changes: { enabled: true, data: { multiplier: 2 } } })
    const moved = f.call('scripts.move', { id: created.item.id, expectedRevision: updated.revision, folderId: '' })
    const configured = f.call('scripts.configure', { expectedRevision: moved.revision, changes: { enabled: true } })
    expect(configured.enabled).toBe(true)
    const removed = f.call('scripts.remove', { id: created.item.id, expectedRevision: configured.revision })
    expect(existsSync(file)).toBe(false)
    f.call('scripts.remove_folder', { id: folder.item.id, expectedRevision: removed.revision })
    expect(f.data.readScriptLibrary('global', '')).toEqual(global)
    expect(f.data.readScriptLibrary('character', 'synthetic-other-character')).toEqual(other)
  })
  it('previews HTML display replacement using the real processor without writing or changing prompt content', async () => {
    const f = await fixture(), collection = f.call('regex.list')
    const created = f.call('regex.create', { expectedRevision: collection.revision, rule: {
      name: '合成展示', pattern: '/<meter>(\\d+)<\\/meter>/g', replacement: '<div>数值：$1</div>', targets: ['AiOutput'], enabled: true,
      displayOnly: true, promptOnly: false, runOnEdit: false, order: 0, minDepth: null, maxDepth: 2,
    } })
    const before = f.data.readRegexRules(f.characterId)
    const preview = (surface: string, depth = 0, isEdit = false) => f.call('regex.test', { text: '<meter>25</meter>', rule: created.rule, target: 'AiOutput', surface, depth, isEdit })
    expect(await preview('Display')).toMatchObject({ output: '<div>数值：25</div>', changed: true })
    expect(await preview('Prompt')).toMatchObject({ output: '<meter>25</meter>', appliesToSurface: false })
    expect((await preview('Display', 3)).changed).toBe(false)
    expect((await preview('Display', 0, true)).changed).toBe(false)
    expect(() => f.call('regex.update', { id: created.rule.id, expectedRevision: created.revision, changes: { pattern: '/(/g' } })).toThrow()
    expect(f.data.readRegexRules(f.characterId)).toEqual(before)
    const changed = f.call('regex.update', { id: created.rule.id, expectedRevision: created.revision, changes: { replacement: '<p>$1</p>' } })
    expect(changed.rule.targets).toEqual(['AiOutput'])
    f.call('regex.remove', { id: created.rule.id, expectedRevision: changed.revision })
    expect(f.call('regex.list').rules).toEqual([])
  })
  it('saves regex EJS, awaits preview variables, rejects preview errors and preserves source across disk reopen', async () => {
    const f = await fixture(), collection = f.call('regex.list')
    const created = f.call('regex.create', { expectedRevision: collection.revision, rule: {
      name: '合成异步显示', pattern: 'TOKEN', replacement: '<p><%= await Promise.resolve(getvar("score") * 2) %></p>',
      targets: ['AiOutput'], enabled: true, displayOnly: true, promptOnly: false, runOnEdit: false, order: 0,
    } })
    const before = f.data.readRegexRules(f.characterId)
    const input = { text: 'TOKEN', rule: created.rule, target: 'AiOutput', surface: 'Display' }
    expect(await f.call('regex.test', { ...input, variables: { score: 12 } })).toEqual({ output: '<p>24</p>', changed: true, appliesToSurface: true })
    expect(await f.call('regex.test', { ...input, surface: 'Prompt' })).toEqual({ output: 'TOKEN', changed: false, appliesToSurface: false })
    await expect(f.call('regex.test', input)).rejects.toThrow()
    await expect(f.call('regex.test', { ...input, rule: { ...created.rule, replacement: '<% if ( %>' } })).rejects.toThrow()
    expect(f.data.readRegexRules(f.characterId)).toEqual(before)
    await f.ctx.fiber.dispose()
    const reopened = new Context(); cleanups.push(() => reopened.fiber.dispose()); await reopened.plugin(productDataPlugin)
    const read = creatorCapabilities(reopened.eleckoiProductData).find(operation => operation.id === 'regex.read')!
    expect(read.execute(f.characterId, { id: created.rule.id })).toEqual(created)
  })
})
