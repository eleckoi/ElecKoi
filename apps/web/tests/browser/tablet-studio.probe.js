async page => {
  const report={cases:[],errors:[],externalRequests:[]};
  page.on('pageerror',error=>report.errors.push(error.stack));
  await page.route('**/*',route=>{const url=route.request().url();if(/^https?:/.test(url)&&!url.startsWith('http://127.0.0.1:4318/')){report.externalRequests.push(url);return route.abort();}return route.continue();});
  const check=(condition,message)=>{if(!condition)throw Error(message);};
  const pause=()=>page.waitForTimeout(400);
  const sample=()=>page.evaluate(()=>{
    const box=node=>node?.getBoundingClientRect().toJSON(),side=document.querySelector('.official-mobile-sidebar');
    return {overflow:document.documentElement.scrollWidth>innerWidth,sideHidden:getComputedStyle(side.parentElement).visibility==='hidden',
      header:box(document.querySelector('.mobile-creator-studio-page > .mobile-header')),composer:box(document.querySelector('[data-composer-card]')),
      phase:document.querySelector('.creator-studio-session-body').dataset.phase,draft:document.querySelector('[contenteditable=true]')?.textContent};
  });
  const checkOverlay=async()=>{
    const boxes=await page.locator('[role=menu]:visible,[role=dialog]:visible').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().toJSON()));
    const size=page.viewportSize();check(boxes.length>0,'Missing overlay');
    for(const box of boxes)check(box.x>=-1&&box.y>=-1&&box.right<=size.width+1&&box.bottom<=size.height+1,'Studio overlay escapes viewport '+JSON.stringify(box));
    return boxes;
  };
  for(const [theme,width,height] of [['light',800,1280],['light',1280,800],['dark',800,1280],['dark',1280,800],['light',390,844]]){
    const row={theme,width,height};await page.setViewportSize({width,height});await page.goto('http://127.0.0.1:4318/fixture.html?theme='+theme);
    await page.locator('.mobile-bottom-nav').getByRole('button',{name:'AI创作',exact:true}).click();
    await page.locator('[contenteditable=true]').waitFor();await pause();row.active=await sample();
    check(row.active.sideHidden&&!row.active.overflow&&row.active.phase==='active','Studio initial layout failed');
    check(await page.locator('[data-message-bubble]').count()>0,'Studio user messages missing');
    await page.locator('[contenteditable=true]').fill('合成工作室保留草稿');
    await page.getByRole('button',{name:'工作室侧边栏',exact:true}).click();await pause();
    check(await page.locator('.mobile-drawer').getByText('合成创作工作区',{exact:true}).isVisible(),'Workspace browser missing');
    check(!(await page.locator('.mobile-drawer').innerText()).includes('brand.localBuild'),'Product sidebar brand is missing');
    if(theme==='light'&&width===800)await page.screenshot({path:'build/tablet-layout-check/studio-800-sidebar-checked.png'});
    await page.getByRole('button',{name:'收起侧边栏',exact:true}).click();await pause();
    check((await sample()).draft==='合成工作室保留草稿','Workspace drawer loses draft');
    await page.getByRole('button',{name:'打开右侧边栏',exact:true}).click();await pause();
    check(await page.getByRole('button',{name:'收起右侧边栏',exact:true}).isVisible(),'Studio rightbar missing');
    await page.getByRole('button',{name:'收起右侧边栏',exact:true}).click();await pause();
    await page.getByRole('button',{name:/^选择模型，当前/}).click();row.modelMenu=await checkOverlay();await page.keyboard.press('Escape');
    await page.getByRole('tab',{name:'轨迹',exact:true}).click();await pause();
    check(await page.locator('.creator-studio-trajectory').isVisible(),'Studio trajectory missing');
    row.trajectory=await sample();check(row.trajectory.draft==='合成工作室保留草稿'&&!row.trajectory.overflow,'Trajectory loses composer or overflows');
    await page.getByRole('tab',{name:'对话',exact:true}).click();
    await page.getByRole('button',{name:'更多插件',exact:true}).click();row.entryMenu=await checkOverlay();await page.keyboard.press('Escape');
    if(theme==='light')await page.screenshot({path:`build/tablet-layout-check/studio-${width}-active-checked.png`});
    await page.getByRole('button',{name:'工作室菜单',exact:true}).click();
    await page.getByRole('menuitem',{name:'选择角色',exact:true}).click();row.characterPicker=await checkOverlay();
    await page.getByRole('searchbox',{name:'搜索角色',exact:true}).fill('0010');
    await page.locator('.creator-studio-character-list').getByRole('button',{name:/示例角色 0010/}).click();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='studio.character'&&item.value==='tablet-card-9')),'Character picker selected the wrong synthetic ID');
    await page.getByRole('button',{name:'工作室菜单',exact:true}).click();await page.getByRole('menuitem',{name:'新建对话',exact:true}).click();
    await page.locator('.creator-studio-session-body[data-phase=hero]').waitFor();await pause();row.hero=await sample();
    check(!row.hero.overflow,'Studio hero overflows');
    await page.locator('.creator-studio-hero-mascot').evaluate(node=>node.decode());
    check(await page.locator('.creator-studio-hero-mascot').evaluate(node=>node.complete&&node.naturalWidth>0),'Studio hero artwork missing');
    check(await page.getByText('人，你会想念我吗？',{exact:true}).isVisible(),'Studio hero missing');
    await page.getByRole('button',{name:'选择工作区',exact:true}).click();row.workspacePicker=await checkOverlay();
    await page.getByRole('menuitem').filter({hasText:'合成创作工作区'}).click();
    await page.getByRole('button',{name:'选择创作预设',exact:true}).click();row.presetPicker=await checkOverlay();
    await page.getByRole('menuitem',{name:'合成预设 006',exact:true}).click();
    check(await page.evaluate(()=>window.tabletFixture.previewActions.some(item=>item.action==='studio.workspace')),'Workspace pick did not reach owner');
    if(theme==='light')await page.screenshot({path:`build/tablet-layout-check/studio-${width}-hero-checked.png`});
    await page.getByRole('button',{name:'返回',exact:true}).click();await page.locator('.mobile-bottom-nav').waitFor();
    report.cases.push(row);
  }
  check(!report.errors.length,report.errors.join('\n'));check(!report.externalRequests.length,'Studio contacted external service');return report;
}
