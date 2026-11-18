import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { AvatarCropModal } from '../../src/ui/ui/AvatarCropModal.jsx';
import { installBrowserIconSprite } from '../helpers/browserIconSprite.js';
import '../../src/app/windows/styles/index.css';
import '../../src/mobile/mobile.css';
import '../../src/mobile/mobile-settings.css';

installBrowserIconSprite();
const canvas = document.createElement('canvas'); canvas.width = 600; canvas.height = 800;
const paint = canvas.getContext('2d');
paint.fillStyle = '#667788'; paint.fillRect(0, 0, 600, 800);
paint.fillStyle = '#cc8855'; paint.fillRect(0, 0, 300, 400);
paint.fillStyle = '#55aa88'; paint.fillRect(300, 400, 300, 400);
const bytes = Uint8Array.from(atob(canvas.toDataURL('image/png').split(',')[1]), char => char.charCodeAt(0));
const file = new File([bytes], 'synthetic-crop.png', { type: 'image/png' });
const root = createRoot(document.getElementById('root'));
window.renderCrop = (portrait = true) => {
  window.savedCrop = null;
  flushSync(() => root.render(<AvatarCropModal key={String(portrait)} file={file} title="裁剪合成图片"
    cropWidth={portrait ? 210 : 250} cropHeight={portrait ? 280 : 250} cropRadius="8px" outputShape="square" outputWidth={420}
    onCancel={() => {}} onSave={async saved => {
      const image = await createImageBitmap(saved);
      window.savedCrop = { width: image.width, height: image.height, type: saved.type, size: saved.size };
      image.close();
    }} />));
};
