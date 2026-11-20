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
  } catch {
    // The selected tutorial can still open when storage is unavailable.
  }
}

const saved = loadPreferences()
const deviceChoice = document.body.dataset.device ?? saved.device
const playerChoice = document.body.dataset.player ?? saved.player
const device = ['windows', 'android'].includes(deviceChoice) ? deviceChoice : ''
const player = ['beginner', 'tavern'].includes(playerChoice) ? playerChoice : ''

for (const link of document.querySelectorAll('[data-preferred-destination]')) {
  if (link.dataset.preferredDestination === 'install' && device) {
    link.href = `install-${device}.html`
  } else if (link.dataset.preferredDestination === 'usage' && device && player) {
    link.href = `usage-${player}-${device}.html`
  }
}

for (const link of document.querySelectorAll('[data-install-choice]')) {
  link.addEventListener('click', () => {
    savePreferences({ device: link.dataset.installChoice, player })
  })
}

const picker = document.querySelector('.tutorial-preferences')
if (picker) {
  picker.elements.namedItem('device').value = device
  picker.elements.namedItem('player').value = player
  picker.addEventListener('submit', event => {
    event.preventDefault()
    const selection = new FormData(picker)
    const selectedDevice = selection.get('device')
    const selectedPlayer = selection.get('player')
    savePreferences({ device: selectedDevice, player: selectedPlayer })
    window.location.assign(`usage-${selectedPlayer}-${selectedDevice}.html`)
  })
  document.querySelector('.tutorial-preference-fallback').hidden = true
  picker.hidden = false
}
