async page => {
  const report = { cases: [], errors: [], externalRequests: [] };
  page.on('pageerror', error => report.errors.push(error.stack));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (/^https?:/.test(url) && !url.startsWith('http://127.0.0.1:4318/')) { report.externalRequests.push(url); return route.abort(); }
    return route.continue();
  });
  const check = (value, message) => { if (!value) throw Error(message); };
  const pause = () => page.waitForTimeout(380);
  const tab = title => page.locator('.mobile-bottom-nav').getByRole('button', { name: title, exact: true }).click();
  const geometry = () => page.evaluate(() => {
    const side = document.querySelector('.official-mobile-sidebar'), frame = side.parentElement.parentElement;
    const rect = node => node?.getBoundingClientRect().toJSON();
    return { viewport: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth,
      hidden: getComputedStyle(side.parentElement).visibility === 'hidden', collapsed: frame.hasAttribute('data-sidebar-collapsed'),
      main: rect(side.parentElement.nextElementSibling), nav: rect(document.querySelector('.mobile-bottom-nav')) };
  });
  const dialogFits = async () => {
    const box = await page.getByRole('dialog').boundingBox();
    const size = page.viewportSize();
    check(box && box.x >= -1 && box.y >= -1 && box.x+box.width <= size.width+1 && box.y+box.height <= size.height+1, 'Dialog escapes viewport: '+JSON.stringify(box));
    return box;
  };
  for (const theme of ['light', 'dark']) for (const [width,height] of [[800,1280],[1280,800]]) {
    const row = { theme,width,height };
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4318/fixture.html?theme='+theme);
    await tab('消息'); await pause();
    row.messages = await geometry();
    check(row.messages.hidden && row.messages.main.x===0 && !row.messages.overflow, 'Messages expose sidebar or overflow');
    const mounted = await page.locator('.mobile-message-open').count();
    check(mounted > 3 && mounted < 30, 'Message list lost virtualization');
    await page.locator('.mobile-message-open').nth(1).click({button:'right'}); row.messageDialog = await dialogFits();
    await page.getByRole('button',{name:'置顶会话',exact:true}).click();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='chat.pin')), 'Pin did not reach synthetic owner');
    const messageScroll = page.locator('.mobile-message-list');
    await messageScroll.evaluate(node => { node.scrollTop=20000; }); await pause();
    await page.locator('.mobile-message-open').nth(4).scrollIntoViewIfNeeded();
    row.messageOffset = await messageScroll.evaluate(node=>node.scrollTop);
    await page.locator('.mobile-message-open').nth(4).click();
    await page.locator('[contenteditable=true]').waitFor(); await pause();
    check(await page.getByRole('button',{name:'打开右侧边栏',exact:true}).isVisible(),'Missing official rightbar entry');
    check(await page.getByRole('button',{name:'对话操作',exact:true}).isVisible(),'Missing product conversation actions');
    check(await page.getByRole('button',{name:'更多插件',exact:true}).isVisible(),'Missing conversation plugin entry');
    await page.getByRole('tab',{name:'轨迹',exact:true}).click(); await page.locator('.trajectory-host').waitFor();
    await page.getByRole('tab',{name:'对话',exact:true}).click();
    await page.locator('[contenteditable=true]').fill('平板合成草稿');
    const scroll = page.locator('[data-conversation-scroll]');
    await scroll.evaluate(node => { node.scrollTop=0;node.dispatchEvent(new Event('scroll'));node.dispatchEvent(new Event('scrollend')); });
    await page.locator('[data-chat-to-bottom] button').waitFor(); await pause();
    row.bottom = await page.evaluate(() => {
      const box = node=>node.getBoundingClientRect().toJSON();
      return { button:box(document.querySelector('[data-chat-to-bottom] button')), composer:box(document.querySelector('[data-composer-card]')) };
    });
    check(row.bottom.button.right <= row.bottom.composer.right+1, 'Bottom control escapes composer width');
    check(row.bottom.composer.top-row.bottom.button.bottom >= 8 && row.bottom.composer.top-row.bottom.button.bottom <= 24, 'Bottom control is not above composer');
    await page.locator('[data-chat-to-bottom] button').click(); await pause();
    check(await scroll.evaluate(node=>Math.abs(node.scrollHeight-node.clientHeight-node.scrollTop)<2),'Bottom control does not reach tail');
    await page.getByRole('button',{name:'打开右侧边栏',exact:true}).click(); await pause();
    check(await page.getByRole('button',{name:'收起右侧边栏',exact:true}).isVisible(),'Rightbar fails to open');
    await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click(); await pause();
    if(theme==='light') await page.screenshot({path:`build/tablet-layout-check/message-${width}-checked.png`});
    await page.getByRole('button',{name:'返回',exact:true}).click(); await pause();
    check(Math.abs(await messageScroll.evaluate(node=>node.scrollTop)-row.messageOffset)<2,'Conversation return loses message list position');
    await tab('预设'); await pause(); row.presets=await geometry();
    check(row.presets.hidden && !row.presets.overflow, 'Presets expose sidebar or overflow');
    await page.getByRole('tab',{name:'创作',exact:true}).click();
    check(await page.locator('.mobile-preset-card').count()===20, 'Creator purpose has wrong synthetic entries');
    await page.getByRole('tab',{name:'扮演',exact:true}).click();
    await page.locator('.mobile-preset-actions').nth(1).click();
    await page.getByRole('menuitem',{name:'使用此预设',exact:true}).click(); await pause();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='preset.activate')), 'Preset activation failed');
    await page.locator('.mobile-preset-open').first().click();
    await page.locator('.preset-basic-card input').first().waitFor();
    await page.getByLabel('名称',{exact:true}).fill('平板合成预设修改');
    await page.locator('.mobile-preset-save').click(); await pause();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='preset.save')), 'Preset save failed');
    await page.locator('.character-editor-navigation').getByRole('button',{name:'预设提示词',exact:true}).click(); await pause();
    check(!(await geometry()).overflow,'Preset prompt editor overflows');
    await page.locator('.character-editor-navigation').getByRole('button',{name:'基础资料',exact:true}).click(); await pause();
    if(theme==='light') await page.screenshot({path:`build/tablet-layout-check/preset-${width}-checked.png`});
    await page.getByRole('button',{name:'返回',exact:true}).click();
    await tab('模型'); await pause(); row.models=await geometry();
    row.group = await page.locator('.mobile-model-group').first().evaluate(node => ({left:node.getBoundingClientRect().left,icon:node.querySelector('svg').getBoundingClientRect().left,justify:getComputedStyle(node).justifyContent}));
    check(Math.abs(row.group.icon-row.group.left-17)<1,'Model group header is centered');
    await page.getByRole('button',{name:'通用大模型',exact:true}).click();
    check(await page.locator('#mobile-model-group-general').isHidden(),'Model section does not collapse');
    await page.getByRole('button',{name:'通用大模型',exact:true}).click();
    await page.getByRole('button',{name:'新建模型配置',exact:true}).click(); row.modelCreate=await dialogFits();
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    const modelScroll=page.locator('.mobile-model-list'); await modelScroll.evaluate(node=>{node.scrollTop=600;});
    row.modelOffset=await modelScroll.evaluate(node=>node.scrollTop);
    await page.locator('.mobile-provider-row').nth(12).click();
    await page.getByLabel('配置名称',{exact:true}).fill('平板合成模型修改');
    await page.getByRole('button',{name:'保存',exact:true}).click(); await pause();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='model.save')),'Model save failed');
    await page.locator('.model-picker-value').click(); row.modelPicker=await dialogFits();
    await page.getByRole('searchbox',{name:'搜索模型',exact:true}).fill('synthetic');
    check(await page.locator('.mobile-model-choice').count()===1,'Model picker filtering failed');
    await page.getByRole('button',{name:'关闭',exact:true}).click();
    check(!(await geometry()).overflow,'Model configuration overflows');
    if(theme==='light') await page.screenshot({path:`build/tablet-layout-check/model-${width}-checked.png`});
    await page.getByRole('button',{name:'返回',exact:true}).click(); await pause();
    check(Math.abs(await modelScroll.evaluate(node=>node.scrollTop)-row.modelOffset)<2,'Model return loses list position');
    await page.getByRole('button',{name:'打开侧边栏',exact:true}).click(); await pause();
    await page.getByRole('button',{name:'收起侧边栏',exact:true}).click(); await pause();
    check((await geometry()).hidden,'Page navigation leaves sidebar visible');
    report.cases.push(row);
  }
  check(!report.errors.length,report.errors.join('\n'));
  check(!report.externalRequests.length,'Preview contacted external service: '+report.externalRequests.join(','));
  return report;
}
