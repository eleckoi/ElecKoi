import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import Folder from './vendor/Folder.jsx';
import { MusicNote, FilmStrip, Cube } from '../../ui/icons/interfaceIcons.jsx';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';

export function AssetFolderVisual({ folder, files, onEnter }) {
  const host = useRef(null), tUi = useProductTranslation();
  const [appearance, setAppearance] = useState({ color: '#dedede', dark: false, scale: .6 });
  const papers = useMemo(() => {
    const images = files.filter(item => item.type === 'image').slice(0, 3);
    return (images.length ? images : files.slice(0, 3)).map(item => ({ content: item.type === 'image'
      ? <img src={item.src} alt="" loading="lazy" />
      : <div className="asset-folder-paper">{React.createElement(item.type === 'audio' ? MusicNote : item.type === 'video' ? FilmStrip : Cube, { size: 26 })}<span>{item.name}</span></div> }));
  }, [files]);
  useLayoutEffect(() => {
    const update = () => {
      const style = getComputedStyle(host.current), width = host.current.clientWidth;
      setAppearance({ color: style.getPropertyValue('--folder-color').trim() || '#dedede', dark: style.colorScheme.includes('dark'), scale: Math.max(.3, Math.min(.8, width / 224)) });
    };
    const resize = new ResizeObserver(update), theme = new MutationObserver(update);
    resize.observe(host.current); theme.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'style', 'class'] }); update();
    return () => { resize.disconnect(); theme.disconnect(); };
  }, []);
  useLayoutEffect(() => {
    const stage = host.current.querySelector('.folder-stage');
    stage?.setAttribute('aria-label', tUi('打开文件夹：{name}', { name: folder.name }));
    stage?.removeAttribute('aria-expanded');
  }, [folder.name, tUi]);
  const enter = event => { event.preventDefault(); event.stopPropagation(); onEnter(folder.id); };
  return <div ref={host} className="asset-folder-visual" onClickCapture={enter} onKeyDownCapture={event => { if (event.key === 'Enter' || event.key === ' ') enter(event); }}>
    <Folder items={papers} color={appearance.color} paperColor={appearance.dark ? '#efeff1' : '#ffffff'} theme={appearance.dark ? 'dark' : 'light'}
      mode="flap" variant="solid" size={appearance.scale} tabPosition="right" open={false} openOn="click" peek
      intro={false} draggable={false} zoomOnClick={false} tilt={.35} bounce={.3} speed={1} />
  </div>;
}
