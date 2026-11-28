const assert = require('node:assert/strict');

exports.checkDesktopSectionMotion = async (webContents, down, up) => {
  webContents.debugger.attach('1.3');
  await webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
  });
  const inspect = async (next, direction) => webContents.executeJavaScript(`(async () => {
    const nav = document.querySelector('.character-editor-navigation');
    const button = [...nav.querySelectorAll('button')].find(item => item.textContent.trim() === ${JSON.stringify(next)});
    const before = nav.getBoundingClientRect();
    const root = document.documentElement;
    button.click();
    let played = false;
    const deadline = performance.now() + 1800;
    do {
      await new Promise(resolve => setTimeout(resolve, 12));
      const names = document.getAnimations().map(animation => animation.animationName);
      const content = document.querySelector('[data-desktop-page-content]');
      const current = nav.querySelector('[aria-current="page"]');
      const rect = nav.getBoundingClientRect();
      if (document.querySelector('.character-editor-navigation') !== nav || rect.x !== before.x || rect.width !== before.width) {
        throw Error('Editor navigation moved or remounted during a section change');
      }
      if (current === button && root.dataset.pcMotion === ${JSON.stringify(direction)}
        && getComputedStyle(nav).viewTransitionName === 'none' && getComputedStyle(content).viewTransitionName === 'pc-content'
        && names.includes('pc-slide-in') && names.includes('pc-slide-out')) played = true;
      if (current === button && !root.dataset.pcMotion) return played;
    } while (performance.now() < deadline);
    return false;
  })()`);

  try {
    assert.equal(await inspect(down, 'forward'), true, `Opening ${down} should animate only the editor workspace`);
    assert.equal(await inspect(up, 'backward'), true, `Returning to ${up} should reverse the editor transition`);
  } finally {
    webContents.debugger.detach();
  }
};
