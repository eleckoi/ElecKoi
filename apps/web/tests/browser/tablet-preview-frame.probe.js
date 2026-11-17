async page => {
  const target = page.url();
  const report = { cases: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  const check = (condition, detail) => { if (!condition) throw Error(detail); };
  await page.goto(target);
  check(await page.getByRole('button',{name:'平板竖屏',exact:true}).getAttribute('aria-pressed')==='true','Preview does not default to the tablet viewport');
  await page.getByRole('button',{name:'手机竖屏',exact:true}).click();
  const phone=page.frames().find(frame=>frame.parentFrame()===page.mainFrame());
  await phone.locator('.mobile-character-card').first().waitFor();
  const samplePhone=()=>phone.evaluate(()=>{
    const side=document.querySelector('.official-mobile-sidebar').parentElement,frame=side.parentElement,center=side.nextElementSibling;
    return {width:innerWidth,drawer:frame.hasAttribute('data-sidebar-drawer'),closed:frame.hasAttribute('data-sidebar-collapsed'),
      visibility:getComputedStyle(side).visibility,side:side.getBoundingClientRect().toJSON(),center:center.getBoundingClientRect().toJSON(),transform:getComputedStyle(center).transform};
  });
  const closed=await samplePhone();
  check(closed.width===390&&closed.drawer&&closed.closed&&closed.visibility==='hidden','Phone sidebar is exposed on the home page');
  await phone.getByRole('button',{name:'打开侧边栏',exact:true}).click();
  await page.waitForTimeout(80);const entering=await samplePhone();
  await page.waitForTimeout(350);const opened=await samplePhone();
  check(entering.center.x>0&&entering.center.x<opened.center.x,'Phone drawer entrance does not animate');
  check(!opened.closed&&opened.visibility==='visible'&&Math.abs(opened.center.width-390*.95)<1,'Phone drawer loses the approved reveal and scale');
  await page.screenshot({path:'build/tablet-layout-check/preview-phone-drawer.png'});
  await phone.getByRole('button',{name:'收起侧边栏',exact:true}).click();
  await page.waitForTimeout(400);const returned=await samplePhone();
  check(returned.closed&&returned.visibility==='hidden'&&returned.transform==='none','Phone drawer does not return to the hidden home state');
  report.phone={closed,entering,opened,returned};
  for (const [width,height] of [[1221,1021],[744,1017],[390,844]]) for (const fraction of [0,.5]) {
    await page.setViewportSize({width,height});
    await page.goto(target);
    if(fraction) await page.addStyleTag({content:'.viewport{width:calc(100% - .5px);height:calc(100% - .5px)}'});
    await page.getByRole('button',{name:'平板竖屏',exact:true}).click();
    let fixed=await page.locator('iframe').boundingBox();
    check(fixed.width===800 && fixed.height===1280,'Portrait viewport dimensions changed');
    await page.getByRole('button',{name:'平板横屏',exact:true}).click();
    fixed=await page.locator('iframe').boundingBox();
    check(fixed.width===1280 && fixed.height===800,'Landscape viewport dimensions changed');
    await page.getByRole('button',{name:'面板宽度',exact:true}).click();
    const samples=await page.evaluate(async()=>{
      const values=[],viewport=document.querySelector('.viewport'),frame=document.querySelector('iframe');
      for(let i=0;i<45;i++) {
        await new Promise(requestAnimationFrame);
        const v=viewport.getBoundingClientRect(),f=frame.getBoundingClientRect();
        values.push({width:f.width,height:f.height,availableWidth:v.width,availableHeight:v.height,
          outerOverflow:document.documentElement.scrollHeight>innerHeight||document.documentElement.scrollWidth>innerWidth});
      }return values;
    });
    const last=samples.at(-1);
    check(Math.abs(last.width-last.availableWidth)<.1 && Math.abs(last.height-last.availableHeight)<.1,'Panel-fit frame does not match the available fractional container size');
    check(!last.outerOverflow,'Panel-fit preview overflows the browser panel');
    check(new Set(samples.slice(10).map(value=>JSON.stringify(value))).size===1,'Panel-fit preview keeps resizing');
    report.cases.push({width,height,fraction,...last});
  }
  check(!report.errors.length,report.errors.join('\n'));
  await page.setViewportSize({width:1221,height:1021});
  await page.goto(target);
  await page.screenshot({path:'build/tablet-layout-check/wrapper-panel-fit.png'});
  return report;
}
