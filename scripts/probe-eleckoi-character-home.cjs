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
module.exports = async function checkCharacterHome({ window, remoteCall, waitFor, readCaptionFill }) {
  const run = source => window.webContents.executeJavaScript(source)
  async function checkClosePosition(selector) {
    const position = await run(`(() => {
      const dialog = document.querySelector(${JSON.stringify(selector)});
      const buttons = dialog.querySelectorAll('.catalog-card-dialog-close');
      const button = buttons[0];
      const header = button?.closest('.character-home-detail-author, .preset-summary');
      if (!header) return { count: buttons.length, inHeader: false };
      const rect = button.getBoundingClientRect();
      const bounds = header.getBoundingClientRect();
      const inset = parseFloat(getComputedStyle(header).paddingInlineEnd);
      return { count: buttons.length, inHeader: rect.left >= bounds.left && rect.top >= bounds.top && rect.bottom <= bounds.bottom,
        rightAligned: Math.abs(bounds.right - rect.right - inset) < 1,
        clickable: button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)),
        focused: document.activeElement === button };
    })()`)
    assert.deepEqual(position, { count: 1, inHeader: true, rightAligned: true, clickable: true, focused: true },
      `Close button should be at the right of the detail header: ${selector}`)
  }
  async function checkCloseStart(selector, key) {
    const state = await run(`(() => {
      const dialog = document.querySelector(${JSON.stringify(selector)});
      const button = dialog.querySelector('.catalog-card-dialog-close');
      const sheet = dialog.querySelector('.catalog-card-dialog-sheet');
      ${key ? `document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, bubbles: true, cancelable: true }));` : 'button.click();'}
      return { buttonHidden: button.getClientRects().length === 0,
        sheetAnimating: sheet.isConnected && sheet.getAnimations().length > 0 };
    })()`)
    assert.deepEqual(state, { buttonHidden: true, sheetAnimating: true }, `${selector} close button should disappear as the sheet starts its exit`)
  }
  const cardCount = 32
  const name = index => `Synthetic character ${String(index).padStart(2, '0')}`
  const introduction = 'Synthetic introduction.\n'.repeat(100).trim()
  const portrait = await run(`(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 600;
    const context = canvas.getContext('2d');
    for (let row = 0; row < 20; row++) {
      context.fillStyle = row % 2 ? '#184e77' : '#e7f1f6';
      context.fillRect(0, row * 30, canvas.width, 30);
    }
    return canvas.toDataURL('image/png');
  })()`)
  for (let index = 1; index <= cardCount; index++) {
    await remoteCall('eleckoiCharacters/create', { character: {
      id: `sidebar-card-${index}`, name: name(index), authorName: 'Synthetic author',
      group: index <= 3 ? '合成分组甲' : '合成分组乙',
      profileLike: introduction,
      ...(index === 1 ? { persona: { assistant_name: name(index), assistant_avatar: '', assistant_square: '', assistant_cover: portrait } } : {}),
    } })
  }

  const rail = '[data-navigation-id="character"]'
  const sidebar = '.character-home-sidebar-scroll'
  const detail = '.character-home-detail'
  const dialog = '.character-home-detail-modal'
  const feedButton = '[data-masonry-id] .character-home-card .character-card'
  await waitFor(`!!document.querySelector('${rail}')`, 'Character navigation did not load')
  await run(`document.querySelector('${rail}').click()`)
  await waitFor(`!!document.querySelector('.character-home-card [data-masonry-id], [data-masonry-id] .character-home-card')`, 'Character feed did not load')
  await waitFor(`!document.documentElement.hasAttribute('data-pc-motion')`, 'Page transition did not finish')
  const normalCaption = readCaptionFill?.()
  if (readCaptionFill) assert.ok(normalCaption && normalCaption !== 'rgba(0, 0, 0, 0)', 'The starting window did not have its normal caption fill')
  await run(`document.querySelector('.character-home-sidebar .character-group-row').click()`)
  await waitFor(`document.querySelectorAll('${sidebar} .character-contact-row').length === ${cardCount}`, 'Character group did not expand')
  const scrollPoint = await run(`(() => {
    const row = document.querySelector('${sidebar} .character-contact-row');
    const rect = row.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`)
  const sourcePoint = await run(`(() => {
    const trigger = window.characterDialogTrigger = document.querySelector('${feedButton}');
    const rect = trigger.querySelector('.character-card-cover').getBoundingClientRect();
    addEventListener('click', event => { window.characterDialogTrustedClick = event.isTrusted; }, { once: true, capture: true });
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + Math.min(60, rect.height / 2)) };
  })()`)
  const client = window.webContents.debugger
  client.attach('1.3')
  try {
    await client.sendCommand('Input.dispatchMouseEvent', { type: 'mousePressed', ...sourcePoint, button: 'left', clickCount: 1, buttons: 1 })
    await client.sendCommand('Input.dispatchMouseEvent', { type: 'mouseReleased', ...sourcePoint, button: 'left', clickCount: 1 })
  } finally {
    client.detach()
  }
  await waitFor(`!!document.querySelector('${detail}')`, 'Character detail did not open')
  const opening = await run(`(() => {
    const sheet = document.querySelector('${detail}');
    return { frames: sheet.getAnimations()[0]?.effect.getKeyframes(), opacity: getComputedStyle(sheet).opacity,
      trusted: window.characterDialogTrustedClick };
  })()`)
  assert.ok(opening.trusted, 'The dialog must be opened by trusted pointer input')
  assert.ok(opening.frames?.[0].transform.includes('translate('), `The dialog did not open from its card: ${JSON.stringify(opening)}`)
  assert.ok(opening.frames.every(frame => !Object.hasOwn(frame, 'opacity')) && opening.opacity === '1',
    'The card itself faded during opening')
  await waitFor(`getComputedStyle(document.querySelector('${detail}')).transform === 'none'`, 'Opening animation did not finish')
  await checkClosePosition(dialog)
  await waitFor(`document.querySelector('${detail} img')?.naturalWidth > 0 && window.characterDialogTrigger.querySelector('.character-card-cover img')?.naturalWidth > 0`,
    'The portrait and its catalog thumbnail did not load')

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
    const modal = document.querySelector('${dialog}');
    const rect = modal.getBoundingClientRect();
    const mask = modal.previousElementSibling;
    const maskRect = mask.getBoundingClientRect();
    const centered = Math.abs(rect.left + rect.width / 2 - innerWidth / 2) < 1
      && Math.abs(rect.top + rect.height / 2 - innerHeight / 2) < 1 && rect.width < innerWidth;
    return {
      portaled: modal.parentElement.parentElement === document.body && modal.matches('[role="dialog"][aria-modal="true"]'), centered,
      maskCoversWindow: maskRect.top === 0 && maskRect.bottom >= innerHeight - 1
        && document.elementFromPoint(innerWidth / 2, 2) === mask,
      sidebar: measure('${sidebar}'), sidebarSlot: measure('.official-product-sidebar-target'),
      sidebarRoot: measure('.character-home-sidebar'),
      feed: measure('.character-home-feed'), detail: measure('${detail}'),
      author: measure('.character-home-detail-author'), introduction: measure('.character-home-detail-intro'),
      actions: measure('.character-home-detail-actions'),
    };
  })()`)
  assert.ok(layout.portaled && layout.centered, 'The character detail did not use a centered modal')
  assert.ok(layout.maskCoversWindow, 'The mask did not cover the window caption')
  if (readCaptionFill) assert.equal(readCaptionFill(), 'rgba(0, 0, 0, 0)', 'The native caption backplate is covering the mask')
  assert.ok(layout.feed.inert && layout.feed.visibility === 'visible', `The feed did not remain visible behind the mask: ${JSON.stringify(layout)}`)
  assert.ok(layout.author.hit && layout.introduction.hit && layout.actions.hit, `The detail right column is covered: ${JSON.stringify(layout)}`)
  assert.ok(layout.introduction.scroll > layout.introduction.client, 'The long introduction does not scroll independently')
  assert.ok(layout.sidebar.scroll > layout.sidebar.client && layout.sidebar.bottom <= layout.sidebarSlot.bottom + 1,
    `The character list extends past the sidebar without scrolling: ${JSON.stringify(layout)}`)
  assert.equal(await run(`document.querySelector('${detail} .character-home-detail-author > .avatar + span').textContent`), 'Synthetic author')
  assert.equal(await run(`document.querySelector('${detail} p').textContent`), introduction)
  assert.equal(await run(`document.querySelectorAll('${detail} footer button').length`), 2)
  assert.ok(await run(`(() => {
    const intro = document.querySelector('.character-home-detail-intro');
    const actions = document.querySelector('.character-home-detail-actions');
    const top = actions.getBoundingClientRect().top;
    intro.scrollTop = intro.scrollHeight;
    return intro.scrollTop > 0 && actions.getBoundingClientRect().top === top;
  })()`), 'The buttons moved when scrolling the introduction')

  const closing = await run(`(() => {
    const sheet = document.querySelector('${detail}');
    const mask = document.querySelector('${dialog}').previousElementSibling;
    const source = window.characterDialogTrigger.querySelector('.character-card-cover');
    const cover = source.getBoundingClientRect();
    const thumbnail = source.querySelector('img');
    mask.click();
    const motion = sheet.getAnimations()[0];
    const frames = motion?.effect.getKeyframes();
    if (!motion) return {};
    const artNode = sheet.querySelector('[data-catalog-card-art]');
    const reading = artNode.nextElementSibling;
    const originalReadingWidth = reading.offsetWidth;
    const photo = artNode.querySelector('img');
    const effects = [motion, ...artNode.getAnimations(), ...reading.getAnimations(), ...photo.getAnimations()];
    const seek = progress => effects.forEach(animation => {
      animation.pause(); animation.currentTime = animation.effect.getTiming().duration * progress;
    });
    seek(.75);
    const middle = sheet.getBoundingClientRect();
    const adjacent = Math.abs(artNode.getBoundingClientRect().right - reading.getBoundingClientRect().left) < 1;
    const readsAsOne = reading.offsetWidth === originalReadingWidth && reading.getAnimations().length === 0;
    seek(1);
    const end = sheet.getBoundingClientRect();
    const exact = ['left', 'top', 'width', 'height'].every(key => Math.abs(cover[key] - end[key]) < 1);
    const art = artNode.getBoundingClientRect();
    const covered = Math.abs(art.width - end.width) < 1 && Math.abs(art.height - end.height) < 1;
    const verticalOffset = image => {
      const { width, height, top } = image.getBoundingClientRect();
      const paintedHeight = image.naturalHeight * Math.max(width / image.naturalWidth, height / image.naturalHeight);
      return top + (height - paintedHeight) * parseFloat(getComputedStyle(image).objectPosition.split(' ')[1]) / 100;
    };
    const imageState = image => {
      const { width, height, x, y } = image.getBoundingClientRect();
      const { objectFit, objectPosition } = getComputedStyle(image);
      return { width, height, x, y, objectFit, objectPosition, natural: [image.naturalWidth, image.naturalHeight], verticalOffset: verticalOffset(image) };
    };
    const handoff = [imageState(photo), imageState(thumbnail)];
    const verticalJump = Math.abs(handoff[0].verticalOffset - handoff[1].verticalOffset);
    seek(.99); effects.forEach(animation => animation.play());
    return { frames, exact, covered, adjacent, readsAsOne, verticalJump, handoff, middleWidth: middle.width, originWidth: cover.width,
      maskFrames: mask.getAnimations()[0]?.effect.getKeyframes(), opacity: getComputedStyle(sheet).opacity };
  })()`)
  assert.ok(closing.frames?.at(-1).transform.includes('translate(') && closing.maskFrames?.at(-1).opacity === '0', 'Clicking outside did not animate the return')
  assert.ok(closing.frames.every(frame => !Object.hasOwn(frame, 'opacity')) && closing.opacity === '1', 'The card itself faded during closing')
  assert.ok(closing.exact && closing.covered && closing.adjacent && closing.readsAsOne && closing.middleWidth > closing.originWidth
    && closing.middleWidth < parseFloat(closing.frames[0].width), `The dialog does not morph into the origin cover: ${JSON.stringify(closing)}`)
  assert.ok(closing.verticalJump < 1, `The cover jumps ${closing.verticalJump.toFixed(1)}px vertically at the handoff: ${JSON.stringify(closing.handoff)}`)
  process.stdout.write(`Closing frame matches the original portrait crop within ${closing.verticalJump.toFixed(2)} CSS pixels.\n`)
  await waitFor(`!document.querySelector('${dialog}')`, 'Outside click did not close the modal')
  const restored = await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
    const trigger = window.characterDialogTrigger;
    const active = document.activeElement;
    resolve({ matched: active === trigger, active: active.outerHTML.slice(0, 180), connected: trigger.isConnected,
      outline: getComputedStyle(trigger).outlineStyle, inert: !!trigger.closest('[inert]'), first: trigger === document.querySelector('${feedButton}') });
  })))`)
  assert.ok(restored.matched, `Focus did not return to the clicked card: ${JSON.stringify(restored)}`)
  assert.equal(restored.outline, 'none', 'Focus restoration drew a ring over the returning card')
  if (readCaptionFill) assert.equal(readCaptionFill(), normalCaption, 'The native caption did not restore its fill after closing')

  window.webContents.sendInputEvent({ type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: -300 })
  await waitFor(`document.querySelector('${sidebar}').scrollTop > 0`, 'Mouse wheel did not scroll the sidebar after dismissal')

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
  await checkCloseStart(dialog)
  await waitFor(`!document.querySelector('${detail}') && !document.querySelector('.character-home-feed').inert`, 'Returning did not restore the feed')
  assert.equal(await run(`document.querySelector('${sidebar}').scrollTop`), bottom.top)
  await run(`document.querySelector('${sidebar} .character-contact-row:last-child').click()`)
  await waitFor(`!!document.querySelector('${dialog}')`, 'Could not reopen the detail before pressing Escape')
  await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`)
  await waitFor(`!document.querySelector('${dialog}')`, 'Escape did not close the modal')

  window.webContents.sendInputEvent({ type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 300 })
  await waitFor(`document.querySelector('${sidebar}').scrollTop < ${bottom.top}`, 'Mouse wheel did not scroll the sidebar after returning')
  process.stdout.write('Built Desktop Client opened an opaque, centered character modal, kept actions fixed, and restored the catalog after each dismissal.\n')

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

  async function checkKeyboardRing(selector) {
    const focus = await run(`(() => {
      document.activeElement.blur();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      const card = document.querySelector('${selector}');
      card.focus({ focusVisible: true, preventScroll: true });
      const style = getComputedStyle(card);
      const sample = document.createElement('span');
      sample.style.color = 'var(--dsw-alias-label-primary)';
      card.append(sample);
      const neutral = getComputedStyle(sample).color;
      sample.remove();
      return { visible: card.matches(':focus-visible'), style: style.outlineStyle, color: style.outlineColor, neutral };
    })()`)
    assert.ok(focus.visible && focus.style !== 'none', `Keyboard focus was hidden from ${selector}: ${JSON.stringify(focus)}`)
    assert.equal(focus.color, focus.neutral, `Keyboard focus in ${selector} is not the neutral theme color`)
  }
  await checkKeyboardRing(feedButton)
  const presetsRail = '[data-navigation-id="presets"]'
  const presetCard = '.preset-home-grid .preset-home-card'
  await run(`document.querySelector('${presetsRail}').click()`)
  await waitFor(`!!document.querySelector('${presetCard}') && !document.documentElement.hasAttribute('data-pc-motion')`, 'Preset cards did not load')
  await checkKeyboardRing(presetCard)
  await run(`document.activeElement.click()`)
  await waitFor(`!!document.querySelector('.preset-card-dialog')`, 'Preset dialog did not open')
  await waitFor(`getComputedStyle(document.querySelector('.preset-card-sheet')).transform === 'none'`, 'Preset opening animation did not finish')
  await checkClosePosition('.preset-card-dialog')
  await checkCloseStart('.preset-card-dialog', 'Escape')
  await waitFor(`!document.querySelector('.preset-card-dialog') && document.activeElement === document.querySelector('${presetCard}')`, 'Preset dialog did not restore its trigger')
  assert.equal(await run('getComputedStyle(document.activeElement).outlineStyle'), 'none', 'Preset focus restoration flashed an outline')
  process.stdout.write('Character and preset cards use a neutral ring for keyboard navigation and restore focus without flashing a ring.\n')
}
