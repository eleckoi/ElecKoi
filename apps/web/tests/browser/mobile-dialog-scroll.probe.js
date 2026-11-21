async page => {
  const fixtureUrl=page.url(),only=new URL(fixtureUrl).searchParams.get('only');
  const report={cases:[],errors:[],failures:[]};
  page.on('pageerror',error=>report.errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1});
  const wait=async expression=>{
    for(let i=0;i<100;i++){if(await page.evaluate(expression))return;await page.waitForTimeout(20);}
    throw Error('Timed out: '+expression);
  };
  const drag=async(x,y,distance)=>{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
    for(let step=1;step<=12;step++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+distance*step/12}]});
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await page.waitForTimeout(100);
  };
  const inspect=()=>page.evaluate(()=>{
    const dialog=document.querySelector('[role=dialog]'),outer=dialog.querySelector('.product-dialog-content,.editor-management-content,.app-error-content,.mobile-overlay-scroll');
    const surface=dialog.querySelector('.editor-search-pane-results')||outer;
    const r=surface.getBoundingClientRect(),x=r.left+r.width/2,y=surface===outer?
      Math.min(innerHeight-90,Math.max(r.top+60,Math.min(r.bottom-45,r.top+200))):r.top+r.height/2;
    const hit=document.elementFromPoint(x,y),chain=[];
    for(let n=hit;n&&n!==document.body;n=n.parentElement){const css=getComputedStyle(n);chain.push({tag:n.tagName,cls:n.className,overflowY:css.overflowY,overscrollY:css.overscrollBehaviorY,height:n.clientHeight,scrollHeight:n.scrollHeight,scrollTop:n.scrollTop});}
    const search=dialog.querySelector('input[type=search]'),file=[...dialog.querySelectorAll('button')].find(button=>button.textContent.trim()==='从本地文件');
    return {x,y,chain,outer:outer.scrollTop,searchTop:search?.getBoundingClientRect().top,fileTop:file?.getBoundingClientRect().top,
      scroll:chain.reduce((sum,n)=>sum+n.scrollTop,0),selected:window.dialogScrollFixture.selected};
  });
  const show=async(kind,theme,width,height)=>{
    await page.setViewportSize({width,height});
    await page.goto(fixtureUrl);
    await wait('Boolean(window.dialogScrollFixture)');
    await page.evaluate(`document.body.toggleAttribute('data-ds-dark-theme',${theme==='dark'});window.dialogScrollFixture.show(${JSON.stringify(kind==='library-picker'?'library':kind)});`);
    if(kind==='library'||kind==='library-picker'){
      await wait(`document.querySelectorAll('.editor-picker-row').length===40`);
      if(kind==='library-picker'){
        await page.evaluate(`document.querySelector('.editor-picker-row:not(:disabled)').click()`);
        await wait(`Boolean(document.querySelector('.setting-library-import-rows'))`);
      }
    }
    if(kind==='bug')await wait(`document.querySelectorAll('.bug-report-failures li').length>0`);
    await wait(`Boolean(document.querySelector('[role=dialog]'))`);
    await page.waitForTimeout(80);
  };
  // The original list styles provide a negative control using the same real gesture.
  await show('model','dark',390,844);
  await page.evaluate(`(()=>{const style=document.createElement('style');style.id='old-scroll-control';style.textContent='.mobile-model-picker-list{overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none}';document.head.append(style);})()`);
  report.negativeBefore=await inspect();await drag(report.negativeBefore.x,report.negativeBefore.y,-180);report.negativeAfter=await inspect();
  if(report.negativeAfter.scroll!==report.negativeBefore.scroll)report.failures.push('Original model style no longer reproduces the blocked gesture');
  const scenarios=[];
  for(const kind of ['model','bug','library','library-picker'])for(const theme of ['light','dark'])for(const [width,height] of [[390,844],[800,1280],[390,320]])scenarios.push({kind,theme,width,height});
  for(const kind of ['mobile','confirm','confirmation','unsaved','error','versions','illustration','author','sheet','page'])for(const theme of ['light','dark'])scenarios.push({kind,theme,width:390,height:480});
  for(const scenario of scenarios.filter(value=>!only||value.kind===only)){
    const row={...scenario};report.cases.push(row);
    try{
      await show(scenario.kind,scenario.theme,scenario.width,scenario.height);
      row.before=await inspect();
      await drag(row.before.x,row.before.y,-Math.min(180,row.before.y-30));row.after=await inspect();
      if(row.after.scroll-row.before.scroll<40)throw Error('Middle touch gesture did not scroll');
      if(scenario.kind==='model'&&row.after.selected!==row.before.selected)throw Error('Touch scroll selected a model');
      await drag(row.before.x,row.before.y,Math.min(120,scenario.height-row.before.y-30));row.back=await inspect();
      if(row.after.scroll-row.back.scroll<20)throw Error('Reverse touch gesture did not scroll back');
      if(scenario.kind==='library'&&scenario.height===320){
        await page.evaluate(`document.querySelector('.editor-search-pane-results').scrollTop=1e9`);
        await page.evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        row.edgeBefore=await inspect();await drag(row.edgeBefore.x,row.edgeBefore.y,-150);row.edgeAfter=await inspect();
        if(row.edgeAfter.outer!==0||row.edgeAfter.searchTop!==row.before.searchTop||row.edgeAfter.fileTop!==row.before.fileTop)
          throw Error('Search or file action moved while scrolling to the end of the list');
      }
      row.passed=true;
    }catch(error){row.failure=error.message;report.failures.push(`${scenario.kind}/${scenario.theme}/${scenario.width}x${scenario.height}: ${error.message}`);}
  }
  await show('model','light',390,844);
  await page.evaluate(`(()=>{const input=document.querySelector('[aria-label="搜索模型"]');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'synthetic-model-099');input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await wait(`document.querySelectorAll('.mobile-model-choice').length===1`);
  await page.evaluate(`document.querySelector('.mobile-model-choice').click()`);
  await wait(`window.dialogScrollFixture.selected==='synthetic-model-099'&&!window.dialogScrollFixture.open`);report.searchAndSelectLast=true;
  await page.evaluate('window.dialogScrollFixture.reset()');await wait(`Boolean(document.querySelector('.mobile-model-remove'))`);
  await page.evaluate(`document.querySelector('.mobile-model-remove').click()`);await wait('window.dialogScrollFixture.count===99');report.delete=true;
  await page.evaluate(`document.querySelector('[aria-label="关闭"]').click()`);await wait('!document.querySelector("[role=dialog]")');report.close=true;
  await cdp.detach();report.passed=report.failures.length===0&&report.errors.length===0;return report;
}
