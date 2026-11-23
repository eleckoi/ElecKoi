import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
import sharp from 'sharp'
import showdown from 'showdown'

const source = new URL('../docs/tutorial/', import.meta.url)
const output = new URL('../build/tutorial/', import.meta.url)
const markdown = await readFile(new URL('README.md', source), 'utf8')
const stylesheet = await readFile(new URL('site.css', source))
const preferencesScript = await readFile(new URL('preferences.js', source))
const stylesheetVersion = createHash('sha256').update(stylesheet).digest('hex').slice(0, 12)
const preferencesVersion = createHash('sha256').update(preferencesScript).digest('hex').slice(0, 12)
const converter = new showdown.Converter({ ghCompatibleHeaderId: true, tables: true })
const sourcePage = new JSDOM(`<article>${converter.makeHtml(markdown)}</article>`)
const sourceArticle = sourcePage.window.document.querySelector('article')
const windowsScreenshots = 'assets/screenshots/windows/'
const screenshotPaths = new Set([...sourceArticle.querySelectorAll('img[src^="assets/screenshots/"]')]
  .map(image => image.getAttribute('src')))
for (const path of [...screenshotPaths]) {
  if (!path.startsWith(windowsScreenshots)) continue
  const androidPath = path.replace(windowsScreenshots, 'assets/screenshots/android/')
  if (existsSync(new URL(androidPath, source))) screenshotPaths.add(androidPath)
}
const screenshotAssets = new Map(await Promise.all([...screenshotPaths].map(async path => {
  const bytes = await readFile(new URL(path, source))
  const { width, height } = await sharp(bytes).metadata()
  const revision = createHash('sha256').update(bytes).digest('hex').slice(0, 12)
  return [path, { width, height, url: `${path}?v=${revision}` }]
})))
const title = sourceArticle.querySelector(':scope > h1')
const image = sourceArticle.querySelector(':scope > h1 + p > img:only-child')
if (!title || !image) throw new Error('教程需要一级标题和紧随其后的封面图片。')
title.remove()
image.parentElement.remove()

const beginnerSteps = new Map([
  ['模型配置', 'model'],
  ['导入角色卡', 'import'],
  ['创作角色卡', 'create'],
  ['许愿式-agent-写卡', 'agent'],
  ['角色卡导出', 'export'],
])
const pageFiles = new Map([
  ['下载与安装', 'install.html'],
  ['windows-电脑端', 'install-windows.html'],
  ['android-手机端', 'install-android.html'],
  ['软件使用', 'usage.html'],
  ['新手玩家-windows-电脑端', 'usage-beginner-windows.html'],
  ['新手玩家-android-手机端', 'usage-beginner-android.html'],
  ['默认-deepseek-配置', 'usage-beginner-windows-model-deepseek.html'],
  ['dsh-内置提供商配置', 'usage-beginner-windows-model-catalog.html'],
  ['自定义提供商配置', 'usage-beginner-windows-model-custom.html'],
  ['基础资料', 'usage-beginner-windows-create-profile.html'],
  ['开场白', 'usage-beginner-windows-create-openings.html'],
  ['设定库', 'usage-beginner-windows-create-settings.html'],
  ['设定', 'usage-beginner-windows-create-settings-entry.html'],
  ['变量', 'usage-beginner-windows-create-variables.html'],
  ['正则', 'usage-beginner-windows-create-regex.html'],
  ['脚本', 'usage-beginner-windows-create-scripts.html'],
  ['前端', 'usage-beginner-windows-create-frontend.html'],
  ['资产库', 'usage-beginner-windows-create-assets.html'],
  ['分支设定', 'usage-beginner-windows-create-branches.html'],
  ['酒馆玩家-windows-电脑端', 'usage-tavern-windows.html'],
  ['酒馆玩家-android-手机端', 'usage-tavern-android.html'],
  ['概念词库', 'glossary.html'],
  ['设计理念', 'design.html'],
])
const entryLabels = new Map([
  ['usage-beginner-windows.html', '流程总览'],
  ['usage-beginner-android.html', '流程总览'],
  ['usage-tavern-windows.html', '使用总览'],
  ['usage-tavern-android.html', '使用总览'],
])
const walkthroughLabels = new Map([
  ['模型配置', '配置总览'],
  ['创作角色卡', '创作总览'],
  ['设定库', '设定库总览'],
])
const chapters = []
const tutorialPages = []
const pageByAnchor = new Map()
let currentPage = null
for (const element of sourceArticle.children) {
  const step = element.matches('h4') ? beginnerSteps.get(element.id) : null
  const configuredFile = step ? `usage-beginner-windows-${step}.html` : pageFiles.get(element.id)
  if (element.matches('h2') || (configuredFile && element.matches('h3, h4, h5, h6'))) {
    const level = Number(element.tagName[1])
    while (currentPage && currentPage.level >= level) currentPage = currentPage.parent
    if (level > 2 && !currentPage) throw new Error(`教程选项页缺少上级：${element.id}`)
    const file = tutorialPages.length === 0
      ? 'index.html'
      : configuredFile ?? `chapter-${encodeURIComponent(element.id)}.html`
    const entry = { file, level, anchor: element.id, title: element.textContent, parent: currentPage, children: [], content: [] }
    const siblings = currentPage?.children ?? chapters
    siblings.push(entry)
    tutorialPages.push(entry)
    currentPage = entry
  }
  if (!currentPage) throw new Error('教程正文需要以二级章节标题开头。')
  currentPage.content.push(element)
  for (const node of [element, ...element.querySelectorAll('[id]')]) {
    if (node.id) pageByAnchor.set(node.id, currentPage)
  }
}
if (!chapters.length) throw new Error('教程缺少章节。')
const windowsGuide = pageByAnchor.get('新手玩家-windows-电脑端')
const androidGuide = pageByAnchor.get('新手玩家-android-手机端')
const tavernWindowsGuide = pageByAnchor.get('酒馆玩家-windows-电脑端')
const tavernAndroidGuide = pageByAnchor.get('酒馆玩家-android-手机端')
const modelGuide = pageByAnchor.get('模型配置')
const settingsGuide = pageByAnchor.get('设定库')
const usagePage = pageByAnchor.get('软件使用')
const installPage = pageByAnchor.get('下载与安装')
const installDevices = new Map([
  [pageByAnchor.get('windows-电脑端'), 'windows'],
  [pageByAnchor.get('android-手机端'), 'android'],
])
const tutorialDevices = [...installDevices].map(([page, value]) => ({ value, label: page.title, file: page.file }))
const tutorialPlayers = [
  { value: 'beginner', label: '新手玩家' },
  { value: 'tavern', label: '酒馆使用者' },
]
if (!windowsGuide || !androidGuide || windowsGuide.children.map(entry => entry.anchor).join('\n') !== [...beginnerSteps.keys()].join('\n')) {
  throw new Error('新手教程步骤缺少或顺序有误。')
}
if (!tavernWindowsGuide || !tavernAndroidGuide || !modelGuide || !settingsGuide) throw new Error('教程缺少酒馆玩家入口、模型配置或设定库。')
androidGuide.content = [androidGuide.content[0], ...windowsGuide.content.slice(1)]
function addGuidePages(guide, sourcePages) {
  const copies = new Map()
  const prefix = guide.file.slice(0, -'.html'.length)
  function addPage(windowsPage, parent) {
    const file = windowsPage.file.replace(/^usage-beginner-windows-/, `${prefix}-`)
    const entry = { ...windowsPage, file, parent, children: [] }
    parent.children.push(entry)
    tutorialPages.push(entry)
    copies.set(windowsPage, entry)
    for (const child of windowsPage.children) addPage(child, entry)
  }
  for (const page of sourcePages) addPage(page, guide)
  return copies
}
const tavernPages = [modelGuide, settingsGuide]
const guidePages = new Map([
  [windowsGuide, new Map()],
  [androidGuide, addGuidePages(androidGuide, windowsGuide.children)],
  [tavernWindowsGuide, addGuidePages(tavernWindowsGuide, tavernPages)],
  [tavernAndroidGuide, addGuidePages(tavernAndroidGuide, tavernPages)],
])
const guidePreferences = new Map([
  [windowsGuide, { device: 'windows', player: 'beginner' }],
  [androidGuide, { device: 'android', player: 'beginner' }],
  [tavernWindowsGuide, { device: 'windows', player: 'tavern' }],
  [tavernAndroidGuide, { device: 'android', player: 'tavern' }],
])
pageByAnchor.set(title.id, chapters[0])

const glossary = new Map()
for (const heading of pageByAnchor.get('概念词库')?.content ?? []) {
  if (!heading.matches('h3')) continue
  const summary = heading.nextElementSibling
  if (!summary?.matches('p')) throw new Error(`词库条目缺少简短解释：${heading.textContent}`)
  glossary.set(heading.id, { title: heading.textContent, summary: summary.textContent })
}

function addTermPopover(link, term, id) {
  const document = link.ownerDocument
  const trigger = document.createElement('button')
  trigger.type = 'button'
  trigger.className = 'term-trigger'
  trigger.setAttribute('popovertarget', id)
  trigger.setAttribute('aria-label', `${link.textContent}，查看术语解释`)
  const mark = document.createElement('span')
  mark.className = 'term-mark'
  mark.setAttribute('aria-hidden', 'true')
  mark.textContent = '?'
  trigger.append(link.textContent, mark)

  const popover = document.createElement('span')
  popover.className = 'term-popover'
  popover.id = id
  popover.setAttribute('popover', 'auto')
  popover.setAttribute('role', 'group')
  popover.setAttribute('aria-label', `${term.title}的简短解释`)
  const name = document.createElement('strong')
  name.textContent = term.title
  const summary = document.createElement('span')
  summary.textContent = term.summary
  const more = link.cloneNode(false)
  more.textContent = '查看完整解释'
  more.setAttribute('aria-label', `查看完整解释：${term.title}`)
  popover.append(name, summary, more)

  link.classList.add('term-fallback')
  link.after(trigger, popover)
}

function renderChapterLinks(document, activePath, entry, guide, installDevice) {
  const list = document.createElement('ul')
  for (const chapter of chapters) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.textContent = chapter.title
    link.href = chapter.file
    if (activePath.has(chapter)) {
      link.setAttribute('aria-current', chapter === entry ? 'page' : 'location')
      if (chapter === usagePage && guide) link.href = guide.file
      if (chapter === installPage && installDevice) link.href = entry.file
    } else if (chapter === installPage || chapter === usagePage) {
      link.dataset.preferredDestination = chapter === installPage ? 'install' : 'usage'
    }
    item.append(link)
    list.append(item)
  }
  return list
}

function renderContents(document, entries, currentPage, activePath, depth = 0) {
  const list = document.createElement('ul')
  if (depth) list.style.setProperty('--nav-depth', depth)
  for (const entry of entries) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    const isCurrent = entry === currentPage
    link.href = entry.file
    const parentTitle = entry.parent ? `${entry.parent.title} ` : ''
    const label = entry.title.startsWith(parentTitle) ? entry.title.slice(parentTitle.length) : entry.title

    if (entry.children.length) {
      const disclosure = document.createElement('details')
      disclosure.open = activePath.has(entry)
      const toggle = document.createElement('summary')
      toggle.textContent = label
      const childList = renderContents(document, entry.children, currentPage, activePath, depth + 1)
      if (isCurrent) link.setAttribute('aria-current', 'page')
      const entryItem = document.createElement('li')
      link.textContent = walkthroughLabels.get(entry.anchor) ?? '本节入口'
      entryItem.append(link)
      childList.prepend(entryItem)
      disclosure.append(toggle, childList)
      item.append(disclosure)
    } else {
      link.textContent = label
      if (isCurrent) link.setAttribute('aria-current', 'page')
      item.append(link)
    }
    list.append(item)
  }
  return list
}

function styleStepLinks(list) {
  list.classList.add('step-options')
  for (const item of list.children) {
    const link = item.firstElementChild
    const document = link.ownerDocument
    const text = document.createElement('span')
    text.className = 'step-option-copy'
    const title = document.createElement('strong')
    title.textContent = link.textContent
    const description = document.createElement('span')
    description.textContent = item.textContent.slice(link.textContent.length).trim().replace(/^：\s*/, '')
    text.append(title, description)
    const indicator = document.createElement('span')
    indicator.className = 'step-indicator'
    indicator.setAttribute('aria-hidden', 'true')
    indicator.textContent = '进入'
    link.replaceChildren(text, indicator)
    item.replaceChildren(link)
  }
}

function renderPreferencePicker(article, destination) {
  const fallback = article.querySelector(':scope > ul')
  fallback.classList.add('tutorial-preference-fallback')
  const form = article.ownerDocument.createElement('form')
  form.className = 'tutorial-preferences'
  form.dataset.destination = destination
  form.hidden = true
  form.innerHTML = `
    <fieldset>
      <legend>您想要在哪个设备上玩？</legend>
      <div class="tutorial-preference-options">
        <label><input type="radio" name="device" value="windows" required> Windows 电脑端</label>
        <label><input type="radio" name="device" value="android"> Android 手机端</label>
      </div>
    </fieldset>
    <fieldset>
      <legend>您用过酒馆或类似软件吗？</legend>
      <div class="tutorial-preference-options">
        <label>
          <input type="radio" name="player" value="beginner" required>
          <span><strong>新手玩家</strong><small>没玩过</small></span>
        </label>
        <label>
          <input type="radio" name="player" value="tavern">
          <span><strong>酒馆使用者</strong><small>有一定了解</small></span>
        </label>
      </div>
    </fieldset>
    <button type="submit">${destination === 'install' ? '查看下载与安装' : '查看教程'}</button>`
  fallback.before(form)
}

function renderVersionOptions(name, title, options, selected) {
  return `<fieldset>
    <legend>${title}</legend>
    ${options.map(({ value, label }) => `
      <label><input type="radio" name="${name}" value="${value}" ${value === selected ? 'checked' : ''}>${label}</label>
    `).join('')}
  </fieldset>`
}

function renderVersionSwitcher(document, device, player) {
  const deviceLabel = tutorialDevices.find(option => option.value === device).label
  const playerLabel = tutorialPlayers.find(option => option.value === player)?.label
  const switcher = document.createElement('details')
  switcher.className = 'sidebar-version'
  switcher.innerHTML = `
    <summary aria-label="切换教程版本，当前 ${deviceLabel}${playerLabel ? `，${playerLabel}` : ''}">
      <span class="sidebar-version-device">${deviceLabel}${playerLabel ? `<small>${playerLabel}</small>` : ''}</span>
    </summary>`
  if (player) {
    switcher.insertAdjacentHTML('beforeend', `
      <form class="sidebar-version-panel" action="${usagePage.file}" data-switch-usage>
        ${renderVersionOptions('device', '设备', tutorialDevices, device)}
        ${renderVersionOptions('player', '使用经验', tutorialPlayers, player)}
        <button type="submit">切换教程</button>
      </form>`)
  } else {
    const nav = document.createElement('nav')
    nav.className = 'sidebar-version-panel'
    nav.setAttribute('aria-label', '切换安装设备')
    for (const { value, label, file } of tutorialDevices) {
      const link = document.createElement('a')
      link.href = file
      link.dataset.switchInstall = value
      const text = document.createElement('span')
      text.textContent = label
      link.append(text)
      if (value === device) {
        link.setAttribute('aria-current', 'page')
        const check = document.createElement('span')
        check.className = 'sidebar-version-check'
        check.setAttribute('aria-hidden', 'true')
        link.append(check)
      }
      nav.append(link)
    }
    switcher.append(nav)
  }
  return switcher
}

const screenshotAnnotations = new Map([
  ['assets/screenshots/windows/setting-library-entry-optional.png', {
    regions: [{ box: [265, 350, 143, 74] }, { box: [770, 385, 365, 88] }],
  }],
  ['assets/screenshots/windows/setting-library-placement-workspace.png', {
    regions: [{ box: [577, 99, 67, 36] }, { box: [964, 389, 106, 34] }],
  }],
  ['导入角色卡:assets/screenshots/windows/character-create-library.png', {
    regions: [{ box: [1063, 51, 120, 46] }],
  }],
  ['assets/screenshots/windows/model-overview.png', {
    regions: [
      { label: '模型入口', box: [13, 600, 48, 48], position: 'beside', circle: true },
      { label: '新建配置', box: [428, 137, 55, 55], position: 'below-end', circle: true },
      { label: '默认 DeepSeek', box: [81, 281, 408, 90], position: 'below-start' },
      { label: '右侧配置区', box: [501, 65, 1722, 1374], position: 'inside' },
    ],
  }],
  ['assets/screenshots/common/deepseek-api-keys.png', {
    regions: [{ box: [1237, 272, 179, 68] }],
  }],
  ['assets/screenshots/windows/model-deepseek-key.png', {
    regions: [{ box: [45, 708, 1668, 106] }],
  }],
  ['assets/screenshots/windows/model-custom-example.png', {
    crop: { top: 508, height: 352 },
    regions: [
      { box: [57, 681, 820, 46], value: 'https://api.deepseek.com' },
      { box: [57, 796, 820, 46], value: 'demo-key-123456' },
    ],
  }],
  ['assets/screenshots/windows/model-catalog-key.png', {
    crop: { top: 472, height: 502 },
    regions: [{ box: [46, 744, 1653, 62] }],
  }],
  ['assets/screenshots/windows/setting-library-merge-file.png', {
    crop: { left: 345, width: 215, top: 486, height: 59 },
    regions: [],
  }],
  ['assets/screenshots/windows/setting-library-merge-entries.png', {
    crop: { top: 0, height: 277 },
    regions: [],
  }],
])

const screenshotDetails = new Map([
  ['assets/screenshots/windows/model-create-menu.png', { top: 127 }],
  ['assets/screenshots/windows/model-dsh-directory.png', { top: 310 }],
])

const screenshotPreviewSizes = new Map([
  ['assets/screenshots/common/deepseek-key-copy.png', 'compact'],
  ['assets/screenshots/common/deepseek-key-create.png', 'compact'],
  ['assets/screenshots/common/setting-library-folders-collapsed.png', 'layout'],
  ['assets/screenshots/common/setting-library-folders-expanded.png', 'layout'],
  ['assets/screenshots/windows/character-cover-crop.png', 'overview'],
  ['assets/screenshots/windows/character-create-library.png', 'overview'],
  ['assets/screenshots/windows/character-create-menu.png', 'compact'],
  ['assets/screenshots/windows/character-edit-context-menu.png', 'compact'],
  ['assets/screenshots/windows/character-edit-profile.png', 'overview'],
  ['assets/screenshots/windows/character-editor-overview.png', 'overview'],
  ['assets/screenshots/windows/character-export-selection.png', 'overview'],
  ['assets/screenshots/windows/character-import-preview.png', 'compact'],
  ['assets/screenshots/windows/character-import-source.png', 'compact'],
  ['assets/screenshots/windows/character-new-card.png', 'overview'],
  ['assets/screenshots/windows/character-opening-create.png', 'compact'],
  ['assets/screenshots/windows/character-opening-overview.png', 'overview'],
  ['assets/screenshots/windows/model-create-menu.png', 'compact'],
  ['assets/screenshots/windows/model-dsh-directory.png', 'compact'],
  ['assets/screenshots/windows/model-overview.png', 'overview'],
  ['assets/screenshots/windows/setting-library-always-options.png', 'layout'],
  ['assets/screenshots/windows/setting-library-create-menu.png', 'compact'],
  ['assets/screenshots/windows/setting-library-entry-optional.png', 'layout'],
  ['assets/screenshots/windows/setting-library-import-options.png', 'compact'],
  ['assets/screenshots/windows/setting-library-import-tavern.png', 'compact'],
  ['assets/screenshots/windows/setting-library-placement-workspace.png', 'overview'],
])

function annotateScreenshot(media, image, { width, height, regions, crop }) {
  const cropWidth = crop?.width ?? width
  const cropHeight = crop?.height ?? height
  const cropLeft = crop?.left ?? 0
  const cropTop = crop?.top ?? 0
  if (crop) {
    media.style.aspectRatio = `${cropWidth} / ${cropHeight}`
    image.classList.add('tutorial-screenshot-crop')
    image.style.marginBlockStart = `${-cropTop / cropWidth * 100}%`
    if (crop.width) {
      image.style.width = `${width / cropWidth * 100}%`
      image.style.maxWidth = 'none'
      image.style.left = `${-cropLeft / cropWidth * 100}%`
    }
  }
  const document = media.ownerDocument
  for (const [index, { label, box, position, circle, value }] of regions.entries()) {
    const [left, top, boxWidth, boxHeight] = box
    const outline = document.createElement('span')
    outline.className = 'screenshot-annotation'
    if (circle) outline.classList.add('screenshot-annotation-circle')
    outline.setAttribute('aria-hidden', 'true')
    outline.style.left = `${(left - cropLeft) / cropWidth * 100}%`
    outline.style.top = `${(top - cropTop) / cropHeight * 100}%`
    outline.style.width = `${boxWidth / cropWidth * 100}%`
    outline.style.height = `${boxHeight / cropHeight * 100}%`

    if (value) {
      outline.classList.add('screenshot-example-value')
      outline.textContent = value
    } else if (label) {
      outline.dataset.position = position
      const caption = document.createElement('span')
      caption.className = 'screenshot-annotation-label'
      const marker = document.createElement('b')
      marker.textContent = String.fromCharCode(65 + index)
      const text = document.createElement('span')
      text.textContent = label
      caption.append(marker, text)
      outline.append(caption)
    }
    media.append(outline)
  }
}

function formatScreenshots(article, isAndroid, pageAnchor) {
  const document = article.ownerDocument
  for (const image of article.querySelectorAll('p > img:only-child[src^="assets/screenshots/"]')) {
    const paragraph = image.parentElement
    if (paragraph.textContent.trim()) continue
    const useAndroidImage = isAndroid && image.getAttribute('src').startsWith(windowsScreenshots)
    if (useAndroidImage) {
      const androidImage = image.getAttribute('src').replace(windowsScreenshots, 'assets/screenshots/android/')
      if (!screenshotAssets.has(androidImage)) {
        const placeholder = document.createElement('p')
        placeholder.className = 'tutorial-screenshot-placeholder'
        const caption = image.getAttribute('title')
        placeholder.textContent = caption ? `Android 截图待补充 · ${caption}` : 'Android 截图待补充'
        paragraph.replaceWith(placeholder)
        continue
      }
      image.setAttribute('src', androidImage)
    }
    const path = image.getAttribute('src')
    const { width, height, url } = screenshotAssets.get(path)
    const annotations = screenshotAnnotations.get(`${pageAnchor}:${path}`) ?? screenshotAnnotations.get(path)
    const detail = screenshotDetails.get(path)
    const displayWidth = annotations?.crop?.width ?? width
    const displayHeight = detail ? width * 4 / 7 : annotations?.crop?.height ?? height
    const figure = document.createElement('figure')
    figure.className = 'tutorial-screenshot'
    const previewSize = screenshotPreviewSizes.get(path)
    if (previewSize) figure.classList.add(`tutorial-screenshot-${previewSize}`)
    if (useAndroidImage) figure.classList.add('tutorial-screenshot-android')
    figure.style.setProperty('--image-width', `${displayWidth}px`)
    figure.style.setProperty('--image-ratio', displayWidth / displayHeight)

    const media = document.createElement('a')
    media.className = 'tutorial-screenshot-media'
    media.href = url
    media.target = '_blank'
    media.rel = 'noopener'
    media.setAttribute('aria-label', `查看原图：${image.alt}`)
    media.title = '查看原图'
    image.setAttribute('src', url)
    image.setAttribute('width', width)
    image.setAttribute('height', height)
    image.setAttribute('loading', 'lazy')
    paragraph.replaceWith(figure)
    figure.append(media)
    media.append(image)
    if (annotations) {
      figure.classList.add('tutorial-screenshot-annotated')
      annotateScreenshot(media, image, { ...annotations, width, height })
    }
    if (detail) {
      const offset = detail.top / (height - displayHeight) * 100
      image.classList.add('tutorial-screenshot-detail')
      image.style.objectPosition = `center ${offset}%`
    }

    const captionText = image.getAttribute('title')
    if (captionText) {
      const caption = document.createElement('figcaption')
      const label = document.createElement('span')
      label.textContent = captionText
      caption.append(label)
      image.removeAttribute('title')
      figure.prepend(caption)

      if (detail) {
        const hint = document.createElement('span')
        hint.className = 'tutorial-screenshot-hint'
        hint.textContent = '点击图片查看原图'
        caption.append(hint)
      }

      const previous = figure.previousElementSibling
      if (previous?.matches('.tutorial-screenshot-group')) {
        previous.append(figure)
      } else if (previous?.matches('.tutorial-screenshot:has(> figcaption)')) {
        const group = document.createElement('div')
        group.className = 'tutorial-screenshot-group'
        previous.before(group)
        group.append(previous, figure)
      }
    }
  }
}

function formatWalkthrough(article, title) {
  const document = article.ownerDocument
  const steps = document.createElement('ol')
  steps.className = 'tutorial-walkthrough'
  steps.setAttribute('role', 'list')
  steps.setAttribute('aria-label', `${title}步骤`)
  const stepNumber = /^\d+\.\s+/
  let step
  for (const block of [...article.children]) {
    if (block.matches('h2')) {
      if (!stepNumber.test(block.textContent)) break
      if (!step) block.before(steps)
      step = document.createElement('li')
      steps.append(step)
    }
    if (step) step.append(block)
  }
  return steps
}

function renderSectionLinks(article) {
  const headings = [...article.querySelectorAll('h2, h3')]
  if (headings.length < 2) return

  const document = article.ownerDocument
  const list = document.createElement('ul')
  let parentItem
  for (const heading of headings) {
    const label = heading.textContent.trim()
    if (!heading.id) {
      const slug = label.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '')
      const base = `section-${slug}`
      let id = base
      for (let suffix = 2; document.getElementById(id); suffix++) id = `${base}-${suffix}`
      heading.id = id
    }

    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = `#${encodeURIComponent(heading.id)}`
    link.textContent = label
    item.append(link)
    if (heading.tagName === 'H3' && parentItem) {
      let sublist = parentItem.querySelector('ul')
      if (!sublist) {
        sublist = document.createElement('ul')
        parentItem.append(sublist)
      }
      sublist.append(item)
    } else {
      list.append(item)
      if (heading.tagName === 'H2') parentItem = item
    }
  }
  return list
}

function addPageOutline(article, list) {
  const document = article.ownerDocument
  const outline = document.createElement('nav')
  outline.className = 'page-outline'
  outline.setAttribute('aria-label', '本页目录')
  const label = document.createElement('p')
  label.className = 'page-outline-label'
  label.textContent = '本页目录'
  outline.append(label, list)
  article.after(outline)

  const disclosure = document.createElement('details')
  disclosure.className = 'compact-page-outline'
  const summary = document.createElement('summary')
  summary.textContent = '本页目录'
  const compactLinks = document.createElement('nav')
  compactLinks.setAttribute('aria-label', '本页目录')
  compactLinks.append(list.cloneNode(true))
  disclosure.append(summary, compactLinks)
  article.querySelector('h1, h2').after(disclosure)
}

function indexArticle(article, entry, guidePreference, installDevice) {
  const content = article.cloneNode(true)
  for (const node of content.querySelectorAll('nav, form, details, figure, .term-popover, .term-trigger, .tutorial-screenshot-placeholder')) {
    node.remove()
  }
  const sections = []
  let section = { title: entry.title, id: '', parts: [] }
  sections.push(section)
  for (const node of content.querySelectorAll('h2[id], h3[id], p, li')) {
    if (node.matches('h2, h3')) {
      section = { title: node.textContent.trim(), id: node.id, parts: [] }
      sections.push(section)
    } else if (!node.querySelector('h2, h3, p, li')) {
      section.parts.push(node.textContent.trim())
    }
  }
  return {
    file: entry.file,
    title: entry.title,
    device: guidePreference?.device ?? installDevice,
    player: guidePreference?.player,
    sections: sections.map(({ title, id, parts }) => ({ title, id, text: parts.filter(Boolean).join(' ') })),
  }
}

function renderPage(entry) {
  const page = new JSDOM(`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet" href="site.css?v=${stylesheetVersion}">
  <script defer src="preferences.js?v=${preferencesVersion}"></script>
</head>
<body>
  <a class="skip-link" href="#tutorial-content">跳到正文</a>
  <header class="tutorial-header">
    <div class="tutorial-header-bar">
      <a class="tutorial-brand" href="index.html"><img src="assets/eleckoi-app-icon.png" width="24" height="24" alt="">ElecKoi 教程</a>
      <button type="button" class="tutorial-search-button" aria-label="搜索教程" aria-haspopup="dialog" aria-controls="tutorial-search" hidden>
        <span class="search-icon" aria-hidden="true"></span>
        <span class="search-button-label">搜索教程</span>
        <kbd aria-hidden="true">Ctrl K</kbd>
      </button>
    </div>
    <nav class="chapter-tabs" aria-label="教程章节"></nav>
  </header>
  <dialog id="tutorial-search" class="tutorial-search" aria-label="搜索教程">
    <div class="tutorial-search-input">
      <span class="search-icon" aria-hidden="true"></span>
      <input type="search" aria-label="教程关键词" placeholder="输入关键词" enterkeyhint="search" autocomplete="off" autofocus>
      <button type="button" class="tutorial-search-close" aria-label="关闭搜索">Esc</button>
    </div>
    <p class="tutorial-search-status" role="status"></p>
    <ul class="tutorial-search-results" aria-label="搜索结果"></ul>
  </dialog>
  <main class="tutorial">
    <header class="cover"></header>
    <div class="reading-layout">
      <details class="contents-panel compact-contents">
        <summary>章节目录</summary>
        <nav aria-label="章节目录"></nav>
      </details>
      <aside class="wide-contents">
        <details class="contents-panel" open>
          <summary>章节目录</summary>
          <nav aria-label="章节目录"></nav>
        </details>
      </aside>
      <article id="tutorial-content" tabindex="-1"></article>
    </div>
  </main>
</body>
</html>`)

  const { document } = page.window
  const article = document.querySelector('article')
  const cover = document.querySelector('.cover')
  article.append(...entry.content.map(element => element.cloneNode(true)))
  const isHome = entry === chapters[0]
  document.title = isHome ? title.textContent : `${entry.title} · ${title.textContent}`
  if (isHome) {
    cover.append(title.cloneNode(true), image.cloneNode(true))
    article.prepend(cover)
  } else {
    cover.remove()
    for (const heading of article.querySelectorAll(':scope > :is(h2, h3, h4, h5, h6)')) {
      const level = Number(heading.tagName.slice(1)) - entry.level + 1
      const promoted = document.createElement(`h${level}`)
      for (const name of heading.getAttributeNames()) promoted.setAttribute(name, heading.getAttribute(name))
      promoted.append(...heading.childNodes)
      heading.replaceWith(promoted)
    }
  }

  const activePath = new Set()
  for (let ancestor = entry; ancestor; ancestor = ancestor.parent) {
    activePath.add(ancestor)
  }
  const guide = [...guidePages.keys()].find(device => activePath.has(device))
  const guidePreference = guidePreferences.get(guide)
  const installDevice = installDevices.get(entry)
  if (guidePreference) {
    Object.assign(document.body.dataset, guidePreference)
  } else if (installDevice) {
    document.body.dataset.device = installDevice
  }
  formatScreenshots(article, guidePreference?.device === 'android', entry.anchor)
  const fragmentLinks = [...article.querySelectorAll('a[href^="#"]')]
  for (const [index, link] of fragmentLinks.entries()) {
    const fragment = link.getAttribute('href')
    const anchor = decodeURIComponent(fragment.slice(1))
    const linkedPage = pageByAnchor.get(anchor)
    if (!linkedPage) throw new Error(`教程内链接缺少目标：${fragment}`)
    const targetPage = guidePages.get(guide)?.get(linkedPage) ?? linkedPage
    if (targetPage === entry) continue
    link.href = targetPage.anchor === anchor ? targetPage.file : `${targetPage.file}${fragment}`
    const term = glossary.get(anchor)
    if (term) addTermPopover(link, term, `term-${index}`)
  }
  if (entry.anchor === '开场白' || entry.anchor === '设定库') formatWalkthrough(article, entry.title)
  if (entry.anchor === '模型配置' || entry.anchor === '创作角色卡') {
    const steps = formatWalkthrough(article, entry.title)
    if (entry.anchor === '模型配置') steps.querySelector(':scope > li:first-child > ul')?.classList.add('screenshot-legend')
    const options = steps.lastElementChild.querySelector(':scope > ul')
    options.classList.add('tutorial-options')
    if (entry.anchor === '创作角色卡') {
      const navigation = document.createElement('div')
      navigation.className = 'character-editor-navigation'
      const screenshot = options.previousElementSibling
      screenshot.before(navigation)
      navigation.append(screenshot, options)
    }
  }

  const hasOptions = entry.children.length > 0
  if (hasOptions) article.querySelector(':scope > ul')?.classList.add('tutorial-options')
  if (entry === windowsGuide || entry === androidGuide) styleStepLinks(article.querySelector(':scope > ol'))
  if (entry === usagePage) renderPreferencePicker(article, 'usage')
  if (entry === installPage) renderPreferencePicker(article, 'install')
  const sectionLinks = renderSectionLinks(article)
  if (sectionLinks && !installDevice) addPageOutline(article, sectionLinks)

  document.querySelector('.chapter-tabs').append(renderChapterLinks(document, activePath, entry, guide, installDevice))
  const sidebar = document.querySelector('.wide-contents')
  const compactSidebar = document.querySelector('.compact-contents')
  const contents = guide
    ? renderContents(document, guide.children, entry, activePath)
    : installDevice && sectionLinks
  if (guide) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    link.href = guide.file
    link.textContent = entryLabels.get(guide.file)
    if (entry === guide) link.setAttribute('aria-current', 'page')
    item.append(link)
    contents.prepend(item)
  }
  if (contents) {
    sidebar.querySelector('nav').append(contents)
    compactSidebar.querySelector('nav').append(contents.cloneNode(true))
    if (guidePreference || installDevice) {
      const versionSwitcher = renderVersionSwitcher(document, installDevice ?? guidePreference.device, guidePreference?.player)
      const compactSwitcher = document.createElement('div')
      compactSwitcher.className = 'sidebar-version-compact'
      compactSwitcher.append(versionSwitcher.cloneNode(true))
      sidebar.prepend(versionSwitcher)
      compactSidebar.before(compactSwitcher)
    }
  } else {
    sidebar.remove()
    compactSidebar.remove()
  }

  const pagination = document.createElement('nav')
  pagination.className = 'chapter-pagination'
  const neighbors = []
  const currentStep = guide?.children.find(step => activePath.has(step))
  if (entry.parent?.anchor === '设定库') {
    pagination.setAttribute('aria-label', '返回设定库总览')
    neighbors.push([entry.parent, 'prev', '返回'])
  } else if (currentStep?.anchor === '创作角色卡' && entry.parent === currentStep) {
    pagination.setAttribute('aria-label', '角色编辑器功能翻页')
    const index = currentStep.children.indexOf(entry)
    neighbors.push([currentStep, 'prev', '返回'], [currentStep.children[index + 1], 'next', '下一项'])
  } else if (currentStep) {
    const index = guide.children.indexOf(currentStep)
    pagination.setAttribute('aria-label', '步骤翻页')
    const previous = entry === currentStep
      ? [guide.children[index - 1] ?? guide, 'prev', '上一步']
      : [entry.parent, 'prev', '返回']
    neighbors.push(previous, [guide.children[index + 1], 'next', '下一步'])
  } else if (entry.parent && !installDevice) {
    pagination.setAttribute('aria-label', '返回上一步')
    neighbors.push([entry.parent, 'prev', '上一步'])
  } else if (!isHome && !entry.parent && !hasOptions) {
    pagination.setAttribute('aria-label', '章节翻页')
    const chapterIndex = chapters.indexOf(entry)
    neighbors.push([chapters[chapterIndex - 1], 'prev', '上一章'], [chapters[chapterIndex + 1], 'next', '下一章'])
  }
  for (const [neighbor, rel, label] of neighbors) {
    if (!neighbor) continue
    const link = document.createElement('a')
    link.href = neighbor.file
    link.rel = rel
    link.textContent = `${label} · ${neighbor.title}`
    pagination.append(link)
  }
  if (pagination.childElementCount > 0) article.append(pagination)
  return { file: entry.file, html: page.serialize(), search: indexArticle(article, entry, guidePreference, installDevice) }
}

const pages = tutorialPages.map(renderPage)
await mkdir(output, { recursive: true })
await Promise.all([
  ...pages.map(({ file, html }) => writeFile(new URL(file, output), html, 'utf8')),
  writeFile(new URL('site.css', output), stylesheet),
  writeFile(new URL('preferences.js', output), preferencesScript),
  writeFile(new URL('search-index.json', output), JSON.stringify(pages.map(page => page.search)), 'utf8'),
  cp(fileURLToPath(new URL('assets/', source)), fileURLToPath(new URL('assets/', output)), { recursive: true }),
])
console.log(`教程网页已生成到 ${fileURLToPath(output)}`)
