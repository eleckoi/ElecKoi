const assert = require('node:assert/strict')

async function withNativeCharacterDrag(window, source, action) {
  const client = window.webContents.debugger
  client.attach('1.3')
  let timeout, onMessage
  try {
    const send = (method, args) => client.sendCommand(`Input.${method}`, args)
    await send('setInterceptDrags', { enabled: true })
    const intercepted = new Promise(resolve => {
      onMessage = (_event, method, params) => {
        if (method === 'Input.dragIntercepted') resolve(params.data)
      }
      client.on('message', onMessage)
      timeout = setTimeout(() => resolve(null), 3000)
    })
    await send('dispatchMouseEvent', { type: 'mouseMoved', ...source })
    await send('dispatchMouseEvent', { type: 'mousePressed', ...source, button: 'left', buttons: 1, clickCount: 1 })
    await send('dispatchMouseEvent', { type: 'mouseMoved', x: source.x + 12, y: source.y + 12, button: 'left', buttons: 1 })
    const data = await intercepted
    assert.ok(data, 'Moving the mouse did not start a native character drag')
    await action((type, point) => send('dispatchDragEvent', { type, ...point, data }))
    await send('dispatchMouseEvent', { type: 'mouseReleased', ...source, button: 'left', clickCount: 1 })
  } finally {
    clearTimeout(timeout)
    if (onMessage) client.removeListener('message', onMessage)
    client.detach()
  }
}

/** Exercise the character page served by the real Desktop Client and Host. */
module.exports = async function checkCharacterHome({ window, remoteCall, waitFor }) {
  const run = source => window.webContents.executeJavaScript(source)
  const cardCount = 32
  const name = index => `Synthetic character ${String(index).padStart(2, '0')}`
  const introduction = 'Synthetic introduction.\n'.repeat(100).trim()
  for (let index = 1; index <= cardCount; index++) {
    await remoteCall('eleckoiCharacters/create', { character: {
      id: `sidebar-card-${index}`, name: name(index), authorName: 'Synthetic author',
      group: index <= 3 ? '合成分组甲' : '合成分组乙',
      profileLike: introduction,
    } })
  }

  const rail = '[data-navigation-id="character"]'
  const sidebar = '.character-home-sidebar-scroll'
  const detail = '.character-home-detail'
  await waitFor(`!!document.querySelector('${rail}')`, 'Character navigation did not load')
  await run(`document.querySelector('${rail}').click()`)
  await waitFor(`!!document.querySelector('.character-home-card [data-masonry-id], [data-masonry-id] .character-home-card')`, 'Character feed did not load')
  await waitFor(`!document.documentElement.hasAttribute('data-pc-motion')`, 'Page transition did not finish')
  await run(`document.querySelector('.character-home-sidebar .character-group-row').click()`)
  await waitFor(`document.querySelectorAll('${sidebar} .character-contact-row').length === ${cardCount}`, 'Character group did not expand')
  const scrollPoint = await run(`(() => {
    const row = document.querySelector('${sidebar} .character-contact-row');
    const rect = row.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`)
  await run(`document.querySelector('.character-home-card [data-masonry-id], [data-masonry-id] .character-home-card').closest('[data-masonry-id]').querySelector('button').click()`)
  await waitFor(`!!document.querySelector('${detail}')`, 'Character detail did not open')

  const layout = await run(`(() => {
    const measure = selector => {
      const node = document.querySelector(selector);
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      return { client: node.clientHeight, scroll: node.scrollHeight, visibility: style.visibility,
        hitElement: hit?.outerHTML.slice(0, 140),
        background: style.backgroundColor, hit: node.contains(hit), overflow: style.overflowY,
        top: rect.top, bottom: rect.bottom, width: rect.width, inert: node.hasAttribute('inert') };
    };
    return {
      sidebar: measure('${sidebar}'), sidebarSlot: measure('.official-product-sidebar-target'),
      sidebarRoot: measure('.character-home-sidebar'),
      feed: measure('.character-home-feed'), detail: measure('${detail}'),
      author: measure('.character-home-detail-author'), introduction: measure('.character-home-detail-intro'),
      actions: measure('.character-home-detail-actions'),
    };
  })()`)
  assert.ok(layout.feed.inert && layout.feed.visibility === 'hidden', `The feed is still visible behind the detail: ${JSON.stringify(layout)}`)
  assert.ok(layout.author.hit && layout.introduction.hit && layout.actions.hit, `The detail right column is covered: ${JSON.stringify(layout)}`)
  assert.ok(layout.introduction.scroll > layout.introduction.client, 'The long introduction does not scroll independently')
  assert.ok(layout.sidebar.scroll > layout.sidebar.client && layout.sidebar.bottom <= layout.sidebarSlot.bottom + 1,
    `The character list extends past the sidebar without scrolling: ${JSON.stringify(layout)}`)
  assert.equal(await run(`document.querySelector('${detail} .character-home-detail-author > span:last-child').textContent`), 'Synthetic author')
  assert.equal(await run(`document.querySelector('${detail} p').textContent`), introduction)
  assert.equal(await run(`document.querySelectorAll('${detail} footer button').length`), 2)

  window.webContents.sendInputEvent({ type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: -300 })
  await waitFor(`document.querySelector('${sidebar}').scrollTop > 0`, 'Mouse wheel did not scroll the sidebar with the detail open')

  const scrollbar = '.character-home-sidebar .sidebar-scrollbar'
  await waitFor(`!!document.querySelector('${scrollbar}')`, 'The long sidebar has no scrollbar')
  await run(`document.querySelector('${scrollbar}').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`)
  await waitFor(`(() => { const node = document.querySelector('${sidebar}'); return node.scrollTop >= node.scrollHeight - node.clientHeight - 1; })()`,
    'The sidebar cannot reach its last card')
  const bottom = await run(`(() => {
    const node = document.querySelector('${sidebar}');
    const card = [...node.querySelectorAll('.character-contact-row')].at(-1);
    const name = card.querySelector('strong').textContent;
    card.click();
    return { name, top: node.scrollTop };
  })()`)
  await waitFor(`document.querySelector('${detail} h1')?.textContent === ${JSON.stringify(bottom.name)}`, 'The last sidebar card did not open its own detail')
  await run(`document.querySelector('${detail} .character-home-detail-back').click()`)
  await waitFor(`!document.querySelector('${detail}') && !document.querySelector('.character-home-feed').inert`, 'Returning did not restore the feed')
  assert.equal(await run(`document.querySelector('${sidebar}').scrollTop`), bottom.top)

  window.webContents.sendInputEvent({ type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 300 })
  await waitFor(`document.querySelector('${sidebar}').scrollTop < ${bottom.top}`, 'Mouse wheel did not scroll the sidebar after returning')
  process.stdout.write('Built Desktop Client showed the complete character detail, kept the introduction scrollable, and scrolled the sidebar in both views.\n')

  const sortButton = '.character-home-sidebar button[aria-label="角色卡排序"]'
  const allRows = `${sidebar} .character-group-block .character-contact-row`
  assert.deepEqual(await run(`Array.from(document.querySelectorAll('.character-home-sidebar .sidebar-section-controls button'), button => button.getAttribute('aria-label'))`),
    ['搜索角色名称', '角色卡排序', '新建分组'])
  async function chooseSort(label) {
    const option = `Array.from(document.querySelectorAll('[role^="menuitem"]')).find(item => item.textContent.trim() === ${JSON.stringify(label)})`
    await run(`document.querySelector('${sortButton}').click()`)
    await waitFor(`!!(${option})`, `Sort option did not open: ${label}`)
    await run(`(${option}).click()`)
  }
  await chooseSort('最近导入')
  await waitFor(`document.querySelector('${allRows} strong')?.textContent === ${JSON.stringify(name(cardCount))}`, 'Newest imported card did not move to the top')
  assert.equal(await run(`document.querySelector('${allRows}').draggable`), false)
  await chooseSort('默认顺序')
  await waitFor(`document.querySelector('${allRows}').draggable`, 'Default character order did not enable dragging')

  await run(`Array.from(document.querySelectorAll('${sidebar} .character-group-row'), button => button.click())`)
  const groupA = `${sidebar} .character-group-block:nth-of-type(3) .character-contact-row`
  const groupB = `${sidebar} .character-group-block:nth-of-type(4) .character-contact-row`
  await waitFor(`document.querySelectorAll('${groupA}').length === 3 && !!document.querySelector('${groupB}')`, 'Named groups did not expand')
  const pointOf = (selector, index, verticalOffset) => run(`(() => {
    const rect = document.querySelectorAll('${selector}')[${index}].getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height * ${verticalOffset}) };
  })()`)
  const source = await pointOf(groupA, 0, 0.5)
  const wrongGroup = await pointOf(groupB, 0, 0.5)
  const target = await pointOf(groupA, 1, 0.8)
  await run(`window.__probeDragEvents = [];
    for (const type of ['dragstart', 'dragenter', 'dragover', 'drop', 'dragend']) {
      document.addEventListener(type, event => window.__probeDragEvents.push([type, event.target.closest('.character-contact-row')?.textContent, event.clientY]), true);
    }`)
  await withNativeCharacterDrag(window, source, async drag => {
    await drag('dragEnter', wrongGroup)
    await drag('dragOver', wrongGroup)
    assert.equal(await run(`!!document.querySelector('${sidebar} [data-character-drop]')`), false)
    await drag('dragEnter', target)
    await drag('dragOver', target)
    const dragState = await run(`({ marker: document.querySelectorAll('${groupA}')[1].dataset.characterDrop, events: window.__probeDragEvents })`)
    assert.equal(dragState.marker, 'after', JSON.stringify({ source, target, wrongGroup, events: dragState.events }))
    await drag('drop', target)
  })
  await waitFor(`document.querySelector('${groupA} strong').textContent === ${JSON.stringify(name(2))}`, 'Dropping did not reorder the group')
  assert.equal(await run(`document.querySelector('${groupB} strong').textContent`), name(4))
  const settings = await remoteCall('eleckoiDisplayPreferences/read', {})
  assert.deepEqual(settings.ui.desktop_character_sidebar_order.slice(0, 4), ['sidebar-card-2', 'sidebar-card-1', 'sidebar-card-3', 'sidebar-card-4'])

  await chooseSort('最近导入')
  await waitFor(`document.querySelector('${groupA} strong').textContent === ${JSON.stringify(name(3))}`, 'Automatic sort did not override the manual view')
  await chooseSort('默认顺序')
  await waitFor(`document.querySelector('${groupA} strong').textContent === ${JSON.stringify(name(2))}`, 'Returning to default lost the manual order')
  process.stdout.write('Sidebar menu sorted imported cards; dragging used the same-group marker and retained the saved order after changing sort modes.\n')
}
