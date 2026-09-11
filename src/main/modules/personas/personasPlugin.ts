import type { Context, Plugin } from '@deepseek-ai/cordis'
import { APP_DEFAULT_CHAT_BACKGROUND } from '@shared/contracts/characters/chatBackground'
import { CharacterRepository } from './CharacterRepository'
import { PersonaRepository } from './PersonaRepository'

export const personasPlugin = {
  name: 'eleckoi-personas',
  inject: ['database', 'desktopGateway', 'conversations', 'mediaAssets', 'userSettings', 'settingLibraries'],
  provide: ['characters', 'personas'],
  apply(ctx: Context) {
    const characters = new CharacterRepository(
      ctx.database,
      ctx.conversations,
      ctx.mediaAssets,
      () => ctx.userSettings.read('appearance.ui').new_character_background === 'app'
        ? APP_DEFAULT_CHAT_BACKGROUND
        : ''
    )
    const personas = new PersonaRepository(ctx.database, ctx.conversations, ctx.mediaAssets)
    const withPrimaryOpenings = (collection: ReturnType<CharacterRepository['get']>) => ({
      ...collection,
      items: collection.items.map((character) => ({
        ...character,
        primaryOpening: ctx.settingLibraries.primaryOpening(character.id),
      })),
    })
    ctx.provide('characters', characters)
    ctx.provide('personas', personas)

    return [
      ctx.desktopGateway.register('query.persona.read', () => personas.get()),
      ctx.desktopGateway.register('command.persona.save', (input) => {
        const saved = personas.save(input)
        ctx.desktopGateway.broadcast('records.changed', { module: 'personas' })
        return saved
      }),
      ctx.desktopGateway.register('query.characters.list', () => withPrimaryOpenings(characters.get())),
      ctx.desktopGateway.register('command.characters.create', (input) => {
        const saved = withPrimaryOpenings(characters.create(input))
        ctx.desktopGateway.broadcast('records.changed', { module: 'personas' })
        return saved
      }),
      ctx.desktopGateway.register('command.characters.update', (input) => {
        const saved = withPrimaryOpenings(characters.update(input))
        ctx.desktopGateway.broadcast('records.changed', { module: 'personas' })
        return saved
      }),
      ctx.desktopGateway.register('command.character_groups.save', ({ groups, assignments }) => {
        const saved = withPrimaryOpenings(characters.saveGroups(groups, assignments))
        ctx.desktopGateway.broadcast('records.changed', { module: 'personas' })
        return saved
      }),
      ctx.desktopGateway.register('command.characters.delete', ({ characterIds }) => {
        const saved = withPrimaryOpenings(characters.delete(characterIds))
        ctx.desktopGateway.broadcast('records.changed', { module: 'personas' })
        return saved
      })
    ]
  }
} satisfies Plugin.Object
