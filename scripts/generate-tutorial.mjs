import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { JSDOM } from 'jsdom'
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
  ['酒馆玩家-windows-电脑端', 'usage-tavern-windows.html'],
  ['酒馆玩家-android-手机端', 'usage-tavern-android.html'],
  ['概念词库', 'glossary.html'],
])
const entryLabels = new Map([
  ['usage-beginner-windows.html', '流程总览'],
  ['usage-beginner-android.html', '流程总览'],
  ['usage-tavern-windows.html', '使用总览'],
  ['usage-tavern-android.html', '使用总览'],
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
const usagePage = pageByAnchor.get('软件使用')
const installPage = pageByAnchor.get('下载与安装')
const installDevices = new Map([
  [pageByAnchor.get('windows-电脑端'), 'windows'],
  [pageByAnchor.get('android-手机端'), 'android'],
])
if (!windowsGuide || !androidGuide || windowsGuide.children.map(entry => entry.anchor).join('\n') !== [...beginnerSteps.keys()].join('\n')) {
  throw new Error('新手教程步骤缺少或顺序有误。')
}
if (!tavernWindowsGuide || !tavernAndroidGuide || !modelGuide) throw new Error('教程缺少酒馆玩家入口或模型配置。')
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
const guidePages = new Map([
  [windowsGuide, new Map()],
  [androidGuide, addGuidePages(androidGuide, windowsGuide.children)],
  [tavernWindowsGuide, addGuidePages(tavernWindowsGuide, [modelGuide])],
  [tavernAndroidGuide, addGuidePages(tavernAndroidGuide, [modelGuide])],
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

function renderContents(document, entries, currentPage, activePath, guide) {
  const list = document.createElement('ul')
  for (const entry of entries) {
    const item = document.createElement('li')
    const link = document.createElement('a')
    const overview = entry === usagePage && guide ? guide : entry
    const onInstallPage = entry === installPage && currentPage.parent === installPage
    const isCurrent = overview === currentPage || onInstallPage
    link.href = onInstallPage ? currentPage.file : overview.file
    const parentTitle = entry.parent ? `${entry.parent.title} ` : ''
    const label = entry.title.startsWith(parentTitle) ? entry.title.slice(parentTitle.length) : entry.title
    const children = entry === installPage || (entry === usagePage && !guide) ? [] : overview.children

    if (children.length) {
      const disclosure = document.createElement('details')
      disclosure.open = activePath.has(entry)
      const toggle = document.createElement('summary')
      toggle.textContent = label
      const childList = renderContents(document, children, currentPage, activePath, guide)
      if (overview === guide && isCurrent) {
        toggle.setAttribute('aria-current', 'page')
      } else {
        if (isCurrent) link.setAttribute('aria-current', 'page')
        const entryItem = document.createElement('li')
        link.textContent = entryLabels.get(overview.file) ?? (entry.anchor === '模型配置' ? '配置总览' : '本节入口')
        entryItem.append(link)
        childList.prepend(entryItem)
      }
      disclosure.append(toggle, childList)
      item.append(disclosure)
    } else {
      link.textContent = label
      if (isCurrent) link.setAttribute('aria-current', 'page')
      else if (entry === installPage) link.dataset.preferredDestination = 'install'
      else if (entry === usagePage) link.dataset.preferredDestination = 'usage'
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

function renderPreferencePicker(article) {
  const fallback = article.querySelector(':scope > ul')
  fallback.classList.add('tutorial-preference-fallback')
  const form = article.ownerDocument.createElement('form')
  form.className = 'tutorial-preferences'
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
    <button type="submit">查看教程</button>`
  fallback.before(form)
}

const screenshotAnnotations = new Map([
  ['assets/screenshots/windows/model-overview.png', {
    width: 2240,
    height: 1452,
    regions: [
      { label: '模型入口', box: [13, 600, 48, 48], position: 'beside', circle: true },
      { label: '新建配置', box: [428, 137, 55, 55], position: 'below-end', circle: true },
      { label: '默认 DeepSeek', box: [81, 281, 408, 90], position: 'below-start' },
      { label: '右侧配置区', box: [501, 65, 1722, 1374], position: 'inside' },
    ],
  }],
  ['assets/screenshots/common/deepseek-api-keys.png', {
    width: 1482,
    height: 348,
    regions: [{ box: [1237, 272, 179, 68] }],
  }],
  ['assets/screenshots/windows/model-deepseek-key.png', {
    width: 1732,
    height: 992,
    regions: [{ box: [45, 708, 1668, 106] }],
  }],
  ['assets/screenshots/windows/model-custom-example.png', {
    width: 1728,
    height: 1425,
    crop: { top: 508, height: 352 },
    regions: [
      { box: [57, 681, 820, 46], value: 'https://api.deepseek.com' },
      { box: [57, 796, 820, 46], value: 'demo-key-123456' },
    ],
  }],
  ['assets/screenshots/windows/model-catalog-key.png', {
    width: 1746,
    height: 1395,
    crop: { top: 472, height: 502 },
    regions: [{ box: [46, 744, 1653, 62] }],
  }],
  ['assets/screenshots/windows/character-import-library.png', {
    width: 2241,
    height: 1457,
    crop: { top: 0, height: 810 },
    regions: [
      { box: [14, 179, 47, 47], circle: true },
      { box: [429, 136, 55, 55], circle: true },
    ],
  }],
  ['assets/screenshots/windows/character-import-menu.png', {
    width: 536,
    height: 424,
    regions: [{ box: [234, 244, 242, 51] }],
  }],
])

const screenshotDetails = new Map([
  ['assets/screenshots/windows/model-create-menu.png', { width: 527, height: 765, top: 127 }],
  ['assets/screenshots/windows/model-dsh-directory.png', { width: 525, height: 1241, top: 310 }],
])

function annotateScreenshot(figure, image, { width, height, regions, crop }) {
  figure.classList.add('tutorial-screenshot-annotated')
  if (crop) {
    figure.style.aspectRatio = `${width} / ${crop.height}`
    image.classList.add('tutorial-screenshot-crop')
    image.style.marginBlockStart = `${-crop.top / width * 100}%`
  }
  const document = figure.ownerDocument
  for (const [index, { label, box, position, circle, value }] of regions.entries()) {
    const [left, top, boxWidth, boxHeight] = box
    const outline = document.createElement('span')
    outline.className = 'screenshot-annotation'
    if (circle) outline.classList.add('screenshot-annotation-circle')
    outline.setAttribute('aria-hidden', 'true')
    outline.style.left = `${left / width * 100}%`
    outline.style.top = `${(top - (crop?.top ?? 0)) / (crop?.height ?? height) * 100}%`
    outline.style.width = `${boxWidth / width * 100}%`
    outline.style.height = `${boxHeight / (crop?.height ?? height) * 100}%`

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
    figure.append(outline)
  }
}

function formatScreenshots(article, isAndroid) {
  const windowsPrefix = 'assets/screenshots/windows/'
  const commonPrefix = 'assets/screenshots/common/'
  for (const image of article.querySelectorAll(`p > img:only-child:is([src^="${windowsPrefix}"], [src^="${commonPrefix}"])`)) {
    const paragraph = image.parentElement
    if (paragraph.textContent.trim()) continue
    const useAndroidImage = isAndroid && image.getAttribute('src').startsWith(windowsPrefix)
    if (useAndroidImage) {
      const androidImage = `assets/screenshots/android/${image.getAttribute('src').slice(windowsPrefix.length)}`
      if (!existsSync(new URL(androidImage, source))) {
        const placeholder = article.ownerDocument.createElement('p')
        placeholder.className = 'tutorial-screenshot-placeholder'
        const caption = image.getAttribute('title')
        placeholder.textContent = caption ? `Android 截图待补充 · ${caption}` : 'Android 截图待补充'
        paragraph.replaceWith(placeholder)
        continue
      }
      image.setAttribute('src', androidImage)
    }
    const figure = article.ownerDocument.createElement('figure')
    figure.className = 'tutorial-screenshot'
    if (useAndroidImage) figure.classList.add('tutorial-screenshot-android')
    image.setAttribute('loading', 'lazy')
    paragraph.replaceWith(figure)
    figure.append(image)
    const annotations = screenshotAnnotations.get(image.getAttribute('src'))
    if (annotations) {
      image.setAttribute('width', annotations.width)
      image.setAttribute('height', annotations.height)
      annotateScreenshot(figure, image, annotations)
    }

    const captionText = image.getAttribute('title')
    if (captionText) {
      const caption = article.ownerDocument.createElement('figcaption')
      const label = article.ownerDocument.createElement('span')
      label.textContent = captionText
      caption.append(label)
      image.removeAttribute('title')
      figure.prepend(caption)

      const detail = screenshotDetails.get(image.getAttribute('src'))
      if (detail) {
        const cropHeight = detail.width * 4 / 7
        const offset = detail.top / (detail.height - cropHeight) * 100
        image.classList.add('tutorial-screenshot-detail')
        image.style.objectPosition = `center ${offset}%`
        const original = article.ownerDocument.createElement('a')
        original.href = image.getAttribute('src')
        original.target = '_blank'
        original.rel = 'noopener'
        original.setAttribute('aria-label', `查看原图：${captionText}`)
        original.textContent = '查看原图'
        caption.append(original)
      }

      const previous = figure.previousElementSibling
      if (previous?.matches('.tutorial-screenshot-group')) {
        previous.append(figure)
      } else if (previous?.matches('.tutorial-screenshot:has(> figcaption)')) {
        const group = article.ownerDocument.createElement('div')
        group.className = 'tutorial-screenshot-group'
        previous.before(group)
        group.append(previous, figure)
      }
    }
  }
}

function formatModelWalkthrough(article) {
  const document = article.ownerDocument
  const steps = document.createElement('ol')
  steps.className = 'model-walkthrough'
  steps.setAttribute('role', 'list')
  steps.setAttribute('aria-label', '模型配置步骤')
  let step
  for (const block of [...article.children]) {
    if (block.matches('h2')) {
      step = document.createElement('li')
      const marker = document.createElement('span')
      marker.className = 'walkthrough-number'
      marker.setAttribute('aria-hidden', 'true')
      marker.textContent = String(steps.childElementCount + 1)
      block.textContent = block.textContent.replace(/^\d+\.\s+/, '')
      step.append(marker)
      steps.append(step)
    }
    if (step) step.append(block)
  }
  steps.querySelector(':scope > li:first-child > ul')?.classList.add('screenshot-legend')
  steps.querySelector(':scope > li:last-child > ul')?.classList.add('tutorial-options')
  article.append(steps)
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
  <main class="tutorial">
    <header class="cover"></header>
    <div class="reading-layout">
      <details class="contents-panel compact-contents">
        <summary>目录</summary>
        <nav aria-label="教程目录"></nav>
      </details>
      <aside class="wide-contents">
        <details class="contents-panel" open>
          <summary>目录</summary>
          <nav aria-label="教程目录"></nav>
        </details>
      </aside>
      <article></article>
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
  } else {
    cover.remove()
    for (const heading of article.querySelectorAll('h2, h3, h4, h5, h6')) {
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
    formatScreenshots(article, guidePreference.device === 'android')
  } else if (installDevice) {
    document.body.dataset.device = installDevice
  }
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
  if (entry.anchor === '模型配置') formatModelWalkthrough(article)

  const hasOptions = entry.children.length > 0
  if (hasOptions) article.querySelector(':scope > ul')?.classList.add('tutorial-options')
  if (entry === windowsGuide || entry === androidGuide) styleStepLinks(article.querySelector(':scope > ol'))
  if (entry === usagePage) renderPreferencePicker(article)
  if (entry === installPage) {
    for (const [platform, device] of installDevices) {
      article.querySelector(`a[href="${platform.file}"]`).dataset.installChoice = device
    }
  }
  if (guidePreference || installDevice) {
    const action = document.createElement('p')
    action.className = 'tutorial-preference-action'
    const change = document.createElement('a')
    change.href = usagePage.file
    change.textContent = '更改教程偏好'
    action.append(change)
    article.querySelector('h1').after(action)
  }

  const contents = renderContents(document, chapters, entry, activePath, guide)
  document.querySelector('.wide-contents nav').append(contents)
  document.querySelector('.compact-contents nav').append(contents.cloneNode(true))

  const pagination = document.createElement('nav')
  pagination.className = 'chapter-pagination'
  const neighbors = []
  const currentStep = guide?.children.find(step => activePath.has(step))
  if (currentStep) {
    const index = guide.children.indexOf(currentStep)
    pagination.setAttribute('aria-label', '步骤翻页')
    const previous = entry === currentStep
      ? [guide.children[index - 1] ?? guide, 'prev', '上一步']
      : [entry.parent, 'prev', '返回']
    neighbors.push(previous, [guide.children[index + 1], 'next', '下一步'])
  } else if (entry.parent) {
    pagination.setAttribute('aria-label', '返回上一步')
    neighbors.push([entry.parent, 'prev', '上一步'])
  } else if (!hasOptions) {
    pagination.setAttribute('aria-label', '章节翻页')
    const chapterIndex = chapters.indexOf(entry)
    neighbors.push([chapters[chapterIndex - 1], 'prev', '上一章'], [chapters[chapterIndex + 1], 'next', '下一章'])
  }
  for (const [neighbor, rel, label] of neighbors) {
    if (!neighbor) continue
    const link = document.createElement('a')
    link.href = neighbor.file
    if (neighbor === installPage && isHome) link.dataset.preferredDestination = 'install'
    link.rel = rel
    link.textContent = `${label} · ${neighbor.title}`
    pagination.append(link)
  }
  if (pagination.childElementCount > 0) article.append(pagination)
  return page.serialize()
}

const pages = tutorialPages.map(entry => ({ file: entry.file, html: renderPage(entry) }))
await mkdir(output, { recursive: true })
await Promise.all([
  ...pages.map(({ file, html }) => writeFile(new URL(file, output), html, 'utf8')),
  writeFile(new URL('site.css', output), stylesheet),
  writeFile(new URL('preferences.js', output), preferencesScript),
  cp(fileURLToPath(new URL('assets/', source)), fileURLToPath(new URL('assets/', output)), { recursive: true }),
])
console.log(`教程网页已生成到 ${fileURLToPath(output)}`)
