/** Events with actual published sources in the common native Host and mounted Client.
 * These are Author event names, independent of the ST/TH compatibility event enums. */
export const AUTHOR_NATIVE_EVENT_NAMES = Object.freeze([
  'chat.changed', 'plugin.event', 'settings.changed', 'messages.changed', 'messages.metadataChanged', 'variables.changed',
  'characters.changed', 'personas.changed', 'models.changed', 'presets.changed', 'regex.changed', 'frontends.changed', 'databank.changed',
  'chats.created', 'chats.deleted', 'chats.renamed', 'groups.changed', 'groups.deleted', 'groups.roundStarted', 'groups.roundFinished', 'groups.speakerChanged',
  'worldbooks.changed', 'worldbooks.bindingsChanged', 'worldbooks.settingsChanged', 'worldbooks.activated', 'worldbooks.timingChanged',
  'plugins.snapshot', 'plugins.changed', 'plugins.status', 'scripts.changed', 'prompts.changed',
  'generation.started', 'generation.delta', 'generation.response', 'generation.packet', 'generation.requestFinished', 'generation.failed', 'generation.completed', 'generation.cancelled',
  'agent.state.changed', 'agent.run.finished', 'agent.run.failed',
  'audio.state.changed', 'audio.settings.changed', 'audio.time.updated', 'tts.started', 'tts.audioReady', 'tts.completed', 'tts.failed',
  'ui.registered', 'ui.unregistered', 'ui.open', 'ui.close'
]);
