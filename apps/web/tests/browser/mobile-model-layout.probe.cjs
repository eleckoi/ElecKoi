const { app, BrowserWindow } = require('electron');
const { writeFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const [htmlPath, reportPath] = process.argv.slice(2);
app.setPath('userData', join(dirname(htmlPath), 'browser-profile'));
app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: 390, height: 900, webPreferences: { sandbox: true, backgroundThrottling: false } });
  const evaluate = source => win.webContents.executeJavaScript(source);
  const wait = async source => {
    for (let attempt = 0; attempt < 120; attempt++) {
      if (await evaluate(source)) return;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out: ${source}`);
  };
  try {
    await win.loadURL(pathToFileURL(htmlPath).href);
    await win.webContents.insertCSS('*, *::before, *::after { animation: none !important; transition: none !important; }');
    const reports = [];
    for (const theme of ['light', 'dark']) for (const width of [320, 390, 640]) for (const mode of ['editor']) {
      win.setContentSize(width, 900);
      await evaluate(`document.documentElement.dataset.theme='${theme}'; document.querySelector('nav [data-mode="${mode}"]').click()`);
      await wait(`document.querySelector('main').dataset.mode === '${mode}' && Boolean(document.querySelector('.model-input-capabilities'))`);
      const report = await evaluate(`(() => {
        const root=document.querySelector('${mode === 'editor' ? '.mobile-model-config-detail' : '.mobile-chat-models'}'),
          form=root.querySelector('.model-detail-form'), capabilities=root.querySelector('.model-capabilities'), inputs=root.querySelector('.model-input-capabilities'),
          reasoning=root.querySelector('.model-reasoning-profile'), remove=root.querySelector('[aria-label="删除配置"]');
        const bounds=node=>{const {x,y,width,height,bottom}=node.getBoundingClientRect();return {x,y,width,height,bottom};};
        return {formWidth:form.clientWidth, scrollWidth:form.scrollWidth, capabilities:bounds(capabilities), inputs:bounds(inputs),
          parameterHeadingVisible:root.querySelector('.model-section-heading').getClientRects().length > 0,
          inputBorderRight:getComputedStyle(inputs).borderRightWidth,
          checkboxes:[...inputs.querySelectorAll('input')].map(input=>({...bounds(input),label:bounds(input.closest('label'))})),
          remove:remove?{...bounds(remove),icon:bounds(remove.querySelector('svg'))}:null,
          reasoning:reasoning?{...bounds(reasoning),legend:bounds(reasoning.querySelector('legend')),buttons:[...reasoning.querySelectorAll('button')].map(bounds)}:null};
      })()`);
      if (mode === 'picker') {
        report.save = await evaluate(`(() => {
          const save=document.querySelector('.mobile-chat-models .mobile-overlay-primary');
          const reference=document.createElement('button'); reference.className='mobile-overlay-primary';
          save.parentElement.append(reference);
          const sample=node=>{const css=getComputedStyle(node);return {background:css.backgroundColor,color:css.color,opacity:css.opacity}};
          const disabled={disabled:save.disabled,...sample(save)}, expected=sample(reference);
          save.disabled=false; const enabled=sample(save); save.disabled=disabled.disabled; reference.remove();
          return {disabled,enabled,expected};
        })()`);
      }
      if (mode === 'editor') {
        report.modelActions = await evaluate(`(()=>{const rect=node=>{const r=node.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,right:r.right}},buttons=[...document.querySelectorAll('.mobile-model-connection-actions button')];return buttons.map(button=>({text:button.textContent,...rect(button)}))})()`);
        await evaluate(`document.querySelector('.model-picker-value').click()`);
        await wait(`Boolean(document.querySelector('[aria-label="模型列表"]'))`);
        report.modelList = await evaluate(`(()=>{const dialog=document.querySelector('[aria-label="模型列表"]'), input=dialog.querySelector('input'), css=getComputedStyle(input); return {text:dialog.textContent,inputBorder:css.borderWidth,inputRadius:css.borderRadius}})()`);
        await evaluate(`document.querySelector('[aria-label="模型列表"] [aria-label="关闭"]').click()`);
        await wait(`!document.querySelector('[aria-label="模型列表"]')`);
      }
      reports.push({ theme, width, mode, ...report });
      if (theme === 'light' && width === 390) {
        await evaluate(`document.querySelector('${mode === 'editor' ? '.mobile-model-config-detail' : '.mobile-chat-models'} .model-capabilities').scrollIntoView({ block: 'center' })`);
        await new Promise(resolve => setTimeout(resolve, 80));
        writeFileSync(join(dirname(reportPath), `${mode}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    writeFileSync(reportPath, JSON.stringify(reports, null, 2));
    win.destroy(); app.exit(0);
  } catch (error) { console.error(error); win.destroy(); app.exit(1); }
});
