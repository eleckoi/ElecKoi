const { app, BrowserWindow } = require('electron');
const { createServer } = require('node:http');
const { readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const directory = process.argv[2];
app.setPath('userData', join(directory, 'profile'));
app.whenReady().then(async () => {
  const errors = [];
  const files = new Set(['index.html', 'encodeCropPng.js', 'cropPng.worker.js']);
  const server = createServer((request, response) => {
    const name = request.url.slice(1) || 'index.html';
    if (!files.has(name)) { response.writeHead(404); response.end(); return; }
    response.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : 'text/html');
    response.end(readFileSync(join(directory, name)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, backgroundThrottling: false } });
  window.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message); });
  try {
    await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
    const images = await window.webContents.executeJavaScript(`(async()=>{
      const rows=[];
      for(const portrait of [false,true])for(const rotation of [0,90,270]) {
        const canvas=document.createElement('canvas');canvas.width=portrait?900:420;canvas.height=portrait?1200:420;
        const g=canvas.getContext('2d');g.translate(canvas.width/2,canvas.height/2);g.rotate(rotation*Math.PI/180);
        const gradient=g.createLinearGradient(-170,-130,180,160);gradient.addColorStop(0,'#ad316780');gradient.addColorStop(1,'#29a6bd07');g.fillStyle=gradient;g.fillRect(-170,-130,350,290);
        g.fillStyle='#ffffff';g.beginPath();g.arc(37,28,71,0,Math.PI*2);g.fill();
        const original=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
        const start=performance.now(),worker=await window.encodeCropPng(canvas),duration=performance.now()-start;
        const read=async blob=>{const bitmap=await createImageBitmap(blob);const c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();const result=ctx.getImageData(0,0,c.width,c.height).data;c.width=c.height=0;return result;};
        const expected=await read(original),actual=await read(worker);let pixelDifferences=0;for(let i=0;i<expected.length;i++)if(expected[i]!==actual[i])pixelDifferences++;
        const originalBytes=new Uint8Array(await original.arrayBuffer()),workerBytes=new Uint8Array(await worker.arrayBuffer());
        rows.push({portrait,rotation,width:canvas.width,height:canvas.height,workerMs:duration,originalSize:original.size,workerSize:worker.size,pixelDifferences,samePngBytes:originalBytes.length===workerBytes.length&&originalBytes.every((value,index)=>value===workerBytes[index])});
        canvas.width=canvas.height=0;
      }
      return rows;
    })()`);
    writeFileSync(join(directory, 'report.json'), JSON.stringify({ images, errors }, null, 2));
  } catch (error) { console.error(error); process.exitCode = 1; }
  finally { window.destroy(); await new Promise(resolve => server.close(resolve)); app.quit(); }
});
