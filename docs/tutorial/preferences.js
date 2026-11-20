const preferenceKey = 'eleckoi-tutorial-preferences'

function loadPreferences() {
  try {
    return JSON.parse(localStorage.getItem(preferenceKey)) ?? {}
  } catch {
    return {}
  }
}

function savePreferences(preferences) {
  try {
    localStorage.setItem(preferenceKey, JSON.stringify(preferences))
    return true
  } catch {
    return false
  }
}

const saved = loadPreferences()
const device = ['windows', 'android'].includes(saved.device) ? saved.device : ''
const player = ['beginner', 'tavern'].includes(saved.player) ? saved.player : ''
const hasPreferences = Boolean(device && player)
const picker = document.querySelector('.tutorial-preferences')
const destination = picker?.dataset.destination
const query = new URLSearchParams(window.location.search)

function preferredPage(destination, device, player) {
  return destination === 'install' ? `install-${device}.html` : `usage-${player}-${device}.html`
}

if (hasPreferences) {
  for (const link of document.querySelectorAll('[data-preferred-destination]')) {
    link.href = preferredPage(link.dataset.preferredDestination, device, player)
  }
}

const isPlatformInstallPage = document.body.dataset.device && !document.body.dataset.player
if (isPlatformInstallPage && !hasPreferences && !['beginner', 'tavern'].includes(query.get('player'))) {
  window.location.replace('install.html')
} else if (destination === 'install' && hasPreferences && query.get('change') !== '1') {
  window.location.replace(preferredPage('install', device, player))
} else if (picker && (destination !== 'home' || !hasPreferences)) {
  picker.elements.namedItem('device').value = device
  picker.elements.namedItem('player').value = player
  picker.addEventListener('submit', event => {
    event.preventDefault()
    const selection = new FormData(picker)
    const selectedDevice = selection.get('device')
    const selectedPlayer = selection.get('player')
    const saved = savePreferences({ device: selectedDevice, player: selectedPlayer })
    const page = preferredPage(destination, selectedDevice, selectedPlayer)
    window.location.assign(!saved && destination === 'install' ? `${page}?player=${selectedPlayer}` : page)
  })
  const fallback = document.querySelector('.tutorial-preference-fallback')
  if (fallback) fallback.hidden = true
  picker.hidden = false
}
