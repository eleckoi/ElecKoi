/** Main-owned copy and responses; Escape is cancellation, never acceptance. */
const api = window.dshUpdateDialog
let view
let responding = false
function respond(index) {
  if (responding || view === undefined || view.busyButton !== undefined) return
  responding = true
  void api.respond(view.revision, index).catch(() => { responding = false })
}
document.getElementById('close').addEventListener('click', () => { respond(view.cancelId) })
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && view !== undefined) { event.preventDefault(); respond(view.cancelId) }
  if (event.key !== 'Tab') return
  const controls = [...document.querySelectorAll('button, #content, #release-notes a[href], details:not([hidden]) > summary, details[open]:not([hidden]) > pre')]
  const current = controls.indexOf(document.activeElement)
  const next = current < 0 ? (event.shiftKey ? controls.length - 1 : 0)
    : (current + (event.shiftKey ? -1 : 1) + controls.length) % controls.length
  event.preventDefault()
  controls[next].focus()
})
function render(state) {
  if (state === null) {
    responding = true
    document.body.classList.remove('visible')
    return
  }
  if (view !== undefined && state.revision < view.revision) return
  const initial = view === undefined
  const choicesChanged = initial || state.buttons.join('\0') !== view.buttons.join('\0')
  responding = false
  view = state
  document.documentElement.lang = state.locale
  document.title = state.title
  document.getElementById('title').textContent = state.message
  document.getElementById('detail').textContent = state.detail
  document.getElementById('detail').hidden = state.detail === ''
  const notes = document.getElementById('release-notes')
  const notesChanged = notes.innerHTML !== state.releaseNotesHtml
  if (notesChanged) notes.innerHTML = state.releaseNotesHtml
  notes.hidden = state.releaseNotesHtml === ''
  document.getElementById('dialog').classList.toggle('has-release-notes', !notes.hidden)
  for (const link of notes.querySelectorAll('a[href]')) {
    link.target = '_blank'
    link.rel = 'noreferrer noopener'
  }
  document.getElementById('close').setAttribute('aria-label', state.closeLabel)
  document.getElementById('technical-details').hidden = state.technicalDetails === ''
  document.getElementById('technical-details-label').textContent = state.technicalDetailsLabel
  document.getElementById('technical-details-content').textContent = state.technicalDetails
  if (initial) document.getElementById('technical-details').open = false
  if (choicesChanged) document.getElementById('actions').replaceChildren()
  for (const [index, label] of choicesChanged ? state.buttons.entries() : []) {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = label
    button.className = index === 0 ? 'primary' : 'secondary'
    button.addEventListener('click', () => { respond(index) })
    document.getElementById('actions').append(button)
  }
  document.getElementById('close').disabled = state.busyButton !== undefined
  for (const [index, button] of [...document.getElementById('actions').children].entries()) {
    button.disabled = state.busyButton !== undefined
    button.setAttribute('aria-busy', String(state.busyButton === index))
  }
  document.querySelector('main').hidden = false
  if (initial || choicesChanged || notesChanged) document.getElementById('content').scrollTop = 0
  document.body.classList.add('visible')
  if (initial || choicesChanged) document.getElementById('dialog').focus()
}
let received = false
const unsubscribe = api.subscribe(state => { received = true; render(state) })
window.addEventListener('pagehide', unsubscribe, { once: true })
void api.status().then(state => { if (!received) render(state) })
