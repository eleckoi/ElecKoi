const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
process.on('uncaughtException', error => { console.error(error); app.exit(1); });
app.setPath('userData', dirname(htmlPath));
app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 600, show: false,
    webPreferences: { backgroundThrottling: false, sandbox: true, offscreen: true } });
  const errors = [];
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  const evaluate = script => win.webContents.executeJavaScript(script);
  const frames = () => evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
  const waitFor = async expression => {
    for (let attempt = 0; attempt < 250; attempt++) {
      if (await evaluate(expression)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Motion fixture did not reach: ' + expression + '; ' + errors.join('\n'));
  };
  const measure = () => evaluate(`(() => {
    const shell = document.querySelector('.official-native-frame > div'), style = getComputedStyle(shell);
    const panel = document.querySelector('.side-panel-shell');
    const animations = shell.getAnimations().map(animation => ({
      property: animation.transitionProperty, duration: animation.effect.getComputedTiming().duration }));
    return { width: panel.getBoundingClientRect().width,
      contentWidth: document.querySelector('.side-panel-content').getBoundingClientRect().width,
      animating: shell.hasAttribute('data-animating'), animations,
      property: style.transitionProperty, duration: style.transitionDuration, curve: style.transitionTimingFunction,
      rightbarWidth: document.querySelector('[data-rightbar-col]').getBoundingClientRect().width };
  })()`);
  const seek = async time => {
    await waitFor('document.querySelector(".official-native-frame > div").getAnimations().some(animation => animation.transitionProperty === "grid-template-columns")');
    await evaluate(`for (const animation of document.querySelector('.official-native-frame > div').getAnimations()) {
      animation.pause(); animation.currentTime = ${time};
    }`);
    await frames();
    return measure();
  };
  const finish = async () => {
    await evaluate('document.querySelector(".official-native-frame > div").getAnimations().forEach(animation => animation.finish())');
    await waitFor('!document.querySelector(".official-native-frame > div").hasAttribute("data-animating")');
    return measure();
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href + '?motion');
    await waitFor('Boolean(window.captionMotion && document.querySelector(".side-panel-collapse-button"))');
    await frames();
    await win.webContents.debugger.attach('1.3');
    // The runner's screen can be narrower than the window the test asks for (the
    // hosted Windows runner is 1024px wide), and the layout min-widths then clamp
    // the side panel. Emulate the viewport explicitly so the layout does not
    // depend on the host screen.
    const setViewport = (width, height) => win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await setViewport(1400, 600);
    // The runner's OS may report reduced motion; pin no-preference for the default
    // path, then emulate reduce explicitly for the reduced-motion case below.
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'no-preference'}] });
    await frames();
    const report = { initial: await measure() };
    await evaluate('document.querySelector(".side-panel-collapse-button").click()');
    report.collapseMid = await seek(150);
    await evaluate('document.querySelector(".side-panel-expand-button").click()');
    await frames();
    report.reversed = await measure();
    report.expanded = await finish();
    await evaluate('document.querySelector(".side-panel-collapse-button").click()');
    await seek(100);
    report.collapsed = await finish();
    await evaluate('document.querySelector(".side-panel-expand-button").click()');
    report.expandMid = await seek(150);
    report.reopened = await finish();
    win.setContentSize(960, 600);
    await setViewport(960, 600);
    await waitFor('innerWidth < 970');
    await frames();
    report.resized = await measure();
    win.setContentSize(1400, 600);
    await setViewport(1400, 600);
    await waitFor('innerWidth > 1390');
    await frames();
    await evaluate('document.querySelector(".side-panel-collapse-button").click()');
    await seek(100);
    await finish();
    await evaluate('document.querySelector(".side-panel-expand-button").click()');
    report.beforeDrag = await seek(220);
    const handle = await evaluate("(()=>{const r=document.querySelector('[data-side=sidebar]').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()");
    win.webContents.sendInputEvent({type:'mouseMove',...handle});
    win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...handle});
    await frames();
    report.dragStart = await measure();
    win.webContents.sendInputEvent({type:'mouseMove',x:handle.x+20,y:handle.y});
    await frames();
    report.dragMoved = await measure();
    win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:handle.x+20,y:handle.y});
    await waitFor('!document.querySelector(".official-native-frame > div").hasAttribute("data-animating")');
    await evaluate('window.captionMotion.setRightbarTrack(true)');
    report.rightbarMid = await seek(150);
    report.rightbarOpen = await finish();
    await evaluate('window.captionMotion.setInstant(true); window.captionMotion.setRightbarTrack(false)');
    await frames();
    report.instant = await measure();
    await waitFor('!document.querySelector(".official-native-frame > div").hasAttribute("data-animating")');
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [{name:'prefers-reduced-motion',value:'reduce'}] });
    await evaluate('window.captionMotion.setInstant(false); document.querySelector(".side-panel-collapse-button").click()');
    await frames();
    report.reduced = await measure();
    await waitFor('!document.querySelector(".official-native-frame > div").hasAttribute("data-animating")');
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
