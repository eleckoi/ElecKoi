async (page) => {
  const report = { cases: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  const check = (condition, detail) => { if (!condition) throw Error(detail); };
  const sample = () => page.evaluate(() => {
    const side=document.querySelector('.official-mobile-sidebar'),rail=side.querySelector('.qq-rail'),frame=side.parentElement.parentElement;
    const nav=document.querySelector('.mobile-bottom-nav'),grid=document.querySelector('.mobile-character-grid'),r=node=>node?.getBoundingClientRect().toJSON();
    return {width:innerWidth,height:innerHeight,drawer:frame.hasAttribute('data-sidebar-drawer'),collapsed:frame.hasAttribute('data-sidebar-collapsed'),
      side:r(side),sideVisibility:getComputedStyle(side.parentElement).visibility,center:r(side.parentElement.nextElementSibling),transform:getComputedStyle(side.parentElement.nextElementSibling).transform,expanded:rail.classList.contains('expanded'),navInert:nav.inert,
      columns:getComputedStyle(grid).gridTemplateColumns.split(' ').length,card:r(document.querySelector('.mobile-character-card')),
      overflow:document.documentElement.scrollWidth>innerWidth,buttons:[...side.querySelectorAll('.rail-nav-button,.rail-user-trigger,.rail-settings-trigger')].map(button=>({
        box:r(button),icon:r(button.querySelector('.rail-icon-layer.base svg,.rail-user-avatar')),label:r(button.querySelector('.rail-navigation-label')),
        justify:getComputedStyle(button).justifyContent})),brand:r(side.querySelector('.rail-brand-seat')),wordmark:r(side.querySelector('.eleckoi-wordmark'))};
  });
  for (const theme of ['light', 'dark']) for (const [width,height] of [[390,844],[800,1280],[1280,800],[844,390]]) {
    await page.setViewportSize({width,height});
    await page.goto('http://127.0.0.1:4318/fixture.html?theme='+theme);
    await page.locator('.mobile-character-card').first().waitFor();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const row = {theme,width,height,closed:await sample()};
    if(theme==='light'&&width>=768) await page.screenshot({path:`build/tablet-layout-check/tablet-${width}-closed.png`});
    check(!row.closed.overflow,'Viewport overflow');
    check(row.closed.drawer&&row.closed.collapsed&&row.closed.sideVisibility==='hidden','Tablet sidebar remains exposed on the home page');
    check(row.closed.center.x===0&&row.closed.center.width===width,'Collapsed drawer reserves an icon rail');
    check(width<600 ? row.closed.columns===2 : row.closed.card.width<260,'Cards stretch to tablet width');
    await page.getByRole('button',{name:'打开侧边栏',exact:true}).click();
    await page.locator('.qq-rail.expanded').waitFor();
    await page.waitForTimeout(80);row.entering=await sample();
    // Include the official frame's discrete column transition and the approved drawer spring.
    await page.waitForTimeout(400); row.open=await sample();
    check(row.open.expanded,'Sidebar did not expand');
    check(row.entering.center.x>0&&row.entering.center.x<row.open.center.x,'Tablet drawer does not animate');
    check(Math.abs(row.open.center.width-width*.95)<1,'Tablet drawer does not preserve the approved foreground scale');
    check(row.open.navInert===row.open.drawer,'Persistent sidebar disables main navigation');
    for (const button of row.open.buttons) if(button.label) check(Math.abs(button.label.left-button.box.left-50)<1,'Sidebar label is centered instead of beside its icon');
    check(row.open.wordmark.right<row.open.side.right,'Brand overflows sidebar');
    if (theme==='light') await page.screenshot({path:`build/tablet-layout-check/tablet-${width}-open.png`});
    if (row.open.drawer) {
      await page.mouse.click(width-10,height/2);
    }
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'消息',exact:true}).click();
    await page.locator('[data-mobile-panel="messages"]').waitFor();
    await page.getByRole('navigation',{name:'主导航'}).getByRole('button',{name:'角色',exact:true}).click();
    await page.locator('.mobile-character-card').first().waitFor();
    await page.waitForTimeout(350);
    const returned=await sample();
    check(row.open.drawer ? returned.collapsed : returned.expanded,'Navigation loses sidebar state');
    report.cases.push(row);
  }
  await page.setViewportSize({width:1280,height:800});
  await page.goto('http://127.0.0.1:4318/fixture.html');
  await page.locator('.mobile-character-card').first().waitFor();
  await page.getByRole('button',{name:'打开侧边栏',exact:true}).click();
  await page.waitForTimeout(800);
  const widths=await page.evaluate(async()=>{
    const values=[];
    for(let i=0;i<30;i++) { await new Promise(requestAnimationFrame); values.push(document.querySelector('.official-mobile-sidebar').getBoundingClientRect().width); }
    return values;
  });
  check(Math.max(...widths)-Math.min(...widths)<.1,'Sidebar keeps resizing after its animation');
  report.settledWidth=widths[0];
  report.rotations=[];
  await page.getByRole('button',{name:'收起侧边栏',exact:true}).click();
  await page.waitForTimeout(400);
  for(const [width,height] of [[800,1280],[390,844],[844,390],[1280,800]]) {
    await page.setViewportSize({width,height});
    await page.waitForTimeout(450);
    const state=await sample();
    check(!state.overflow,'Rotation introduces horizontal overflow');
    check(state.drawer&&state.collapsed&&state.sideVisibility==='hidden','Rotation exposes the Android sidebar');
    check(!state.navInert,'Rotation leaves navigation inert');
    report.rotations.push({width,height,drawer:state.drawer,columns:state.columns});
  }
  check(!report.errors.length,report.errors.join('\n'));
  return report;
}
