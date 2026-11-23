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
} else if (picker) {
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
  document.querySelector('.tutorial-preference-fallback').hidden = true
  picker.hidden = false
}

const searchButton = document.querySelector('.tutorial-search-button')
const searchDialog = document.querySelector('.tutorial-search')
const searchInput = searchDialog.querySelector('input')
const searchStatus = searchDialog.querySelector('.tutorial-search-status')
const searchResults = searchDialog.querySelector('.tutorial-search-results')
const searchDevice = document.body.dataset.device || device || 'windows'
const searchPlayer = document.body.dataset.player || player || 'beginner'
let searchIndex
let searchRevision = 0

function normalizeSearch(text) {
  return text.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ')
}

function loadSearchIndex() {
  searchIndex ??= fetch('search-index.json', { cache: 'no-cache' }).then(async response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const pages = await response.json()
    return pages.filter(page =>
      (!page.device || page.device === searchDevice) && (!page.player || page.player === searchPlayer)
    )
  }).catch(error => {
    searchIndex = undefined
    throw error
  })
  return searchIndex
}

async function updateSearch() {
  const revision = ++searchRevision
  const query = normalizeSearch(searchInput.value)
  searchResults.replaceChildren()
  searchStatus.textContent = ''
  if (!query) return

  let pages
  try {
    searchStatus.textContent = '正在读取教程…'
    pages = await loadSearchIndex()
  } catch {
    if (revision === searchRevision) searchStatus.textContent = '搜索资料加载失败，请重新输入或打开搜索重试。'
    return
  }
  if (revision !== searchRevision) return

  const words = query.split(' ')
  const matches = []
  for (const page of pages) {
    const pageTitle = normalizeSearch(page.title)
    for (const section of page.sections) {
      const title = normalizeSearch(section.title)
      const body = normalizeSearch(section.text)
      const sectionText = `${title} ${body}`
      if (!words.every(word => `${pageTitle} ${sectionText}`.includes(word))) continue
      if (section.id && !words.some(word => sectionText.includes(word))) continue
      const rank = title === query ? 3 : title.includes(query) ? 2 : body.includes(query) ? 1 : 0
      matches.push({ page, section, body, rank })
    }
  }

  matches.sort((first, second) => second.rank - first.rank)
  searchStatus.textContent = matches.length ? `找到 ${matches.length} 条结果` : '没有找到匹配的教程。'
  for (const { page, section, body } of matches) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = section.id ? `${page.file}#${encodeURIComponent(section.id)}` : page.file
    const title = document.createElement('strong')
    title.textContent = section.title
    link.append(title)
    if (section.id) {
      const pageLabel = document.createElement('span')
      pageLabel.className = 'tutorial-search-page'
      pageLabel.textContent = page.title
      link.append(pageLabel)
    }
    if (section.text) {
      const snippet = document.createElement('span')
      const match = words.map(word => body.indexOf(word)).find(position => position >= 0) ?? 0
      const start = Math.max(0, match - 16)
      const end = start + 104
      snippet.className = 'tutorial-search-snippet'
      snippet.textContent = `${start ? '…' : ''}${section.text.slice(start, end)}${end < section.text.length ? '…' : ''}`
      link.append(snippet)
    }
    item.append(link)
    searchResults.append(item)
  }
}

function openSearch() {
  if (searchDialog.open) return
  searchDialog.showModal()
  searchInput.focus()
  searchInput.select()
  updateSearch()
}

if (/Mac/i.test(navigator.platform)) searchButton.querySelector('kbd').textContent = '⌘ K'
searchButton.hidden = false
searchButton.addEventListener('click', openSearch)
searchDialog.querySelector('.tutorial-search-close').addEventListener('click', () => searchDialog.close())
searchInput.addEventListener('input', updateSearch)
searchDialog.addEventListener('close', () => searchButton.focus())
searchResults.addEventListener('click', event => {
  if (event.target.closest('a')) searchDialog.close()
})
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    openSearch()
  }
})
searchDialog.addEventListener('keydown', event => {
  if (event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    searchDialog.close()
    return
  }
  const first = searchResults.querySelector('a')
  if (event.key === 'Enter' && event.target === searchInput && first) {
    event.preventDefault()
    first.click()
  } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    const links = [...searchResults.querySelectorAll('a')]
    const index = links.indexOf(event.target)
    if (!first || (index < 0 && event.target !== searchInput)) return
    const next = event.key === 'ArrowDown' ? links[index + 1] : links[index - 1] ?? searchInput
    if (next) {
      event.preventDefault()
      next.focus()
    }
  }
})

const tabs = document.querySelector('.chapter-tabs')
const currentTab = tabs.querySelector('[aria-current]')
if (currentTab) {
  const rightEdge = currentTab.getBoundingClientRect().right
  const overflow = rightEdge - tabs.getBoundingClientRect().right
  if (overflow > 0) tabs.scrollLeft += overflow
}
