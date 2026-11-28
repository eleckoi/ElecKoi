import { useLayoutEffect, useRef } from 'react';
import { Button, IconCloseOutlineRegular, Modal } from '@deepseek-ai/dsh-client-ui-primitives';
import { useProductTranslation } from '../../app/i18n/ProductLocaleContext.jsx';
import '../styles/catalog-card-dialog.css';

const motion = { duration: 400, easing: 'ease' };

function readOrigin(trigger, artworkSelector) {
  if (!trigger?.isConnected) return null;
  const artwork = trigger.querySelector(artworkSelector) || trigger;
  const bounds = artwork.getBoundingClientRect();
  if (!bounds.width || !bounds.height || bounds.bottom <= 0 || bounds.top >= window.innerHeight
    || bounds.right <= 0 || bounds.left >= window.innerWidth) return null;
  return { artwork, bounds };
}

function openingTransform(origin, bounds) {
  if (!origin) return 'scale(.96)';
  const scale = Math.min(origin.width / bounds.width, origin.height / bounds.height, 1);
  const x = origin.left - bounds.left + (origin.width - bounds.width * scale) / 2;
  const y = origin.top - bounds.top + (origin.height - bounds.height * scale) / 2;
  return `translate(${x}px, ${y}px) scale(${scale})`;
}

function artworkCorners(trigger, artwork, bounds, scale) {
  const style = getComputedStyle(artwork);
  const edge = trigger.getBoundingClientRect();
  const cardStyle = getComputedStyle(trigger);
  const top = Math.abs(edge.top - bounds.top) < 2 ? cardStyle : style;
  const bottom = Math.abs(edge.bottom - bounds.bottom) < 2 ? cardStyle : style;
  const unscaled = radius => radius.split(' ').map(value => value.endsWith('px') ? `${parseFloat(value) / scale}px` : value).join(' ');
  return {
    borderTopLeftRadius: unscaled(top.borderTopLeftRadius), borderTopRightRadius: unscaled(top.borderTopRightRadius),
    borderBottomRightRadius: unscaled(bottom.borderBottomRightRadius), borderBottomLeftRadius: unscaled(bottom.borderBottomLeftRadius),
  };
}

function coveredImageSize(image, width, height) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  return [image.naturalWidth * scale, image.naturalHeight * scale];
}

function animateArtworkCrop(art, artwork, bounds, exit) {
  const image = art.querySelector('img');
  const thumbnail = artwork.querySelector('img');
  if (!image?.naturalWidth || !thumbnail?.naturalWidth) return;

  const source = thumbnail.getBoundingClientRect();
  const size = [bounds.width, bounds.height];
  const sourceSize = [source.width, source.height];
  const sourceOffset = [source.left - bounds.left, source.top - bounds.top];
  const sourcePosition = getComputedStyle(thumbnail).objectPosition.split(' ');
  const sourcePaint = coveredImageSize(thumbnail, ...sourceSize);
  const endPaint = coveredImageSize(image, ...size);
  // The thumbnail image box can extend beyond its clipping box. Match the painted crop.
  const position = size.map((length, axis) => {
    const offset = sourceOffset[axis] + (sourceSize[axis] - sourcePaint[axis]) * parseFloat(sourcePosition[axis]) / 100;
    const room = length - endPaint[axis];
    return `${room < -.01 ? Math.min(100, Math.max(0, offset / room * 100)) : 50}%`;
  }).join(' ');
  const start = getComputedStyle(image).objectPosition;
  if (start !== position) return image.animate({ objectPosition: [start, position] }, exit);
}

function canAnimate(sheet) {
  return typeof sheet.animate === 'function' && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function CatalogCardDialog({ title, trigger, artworkSelector, onClose, className, sheetClassName, labelledBy, children }) {
  const t = useProductTranslation();
  const sheetRef = useRef(null);
  const animations = useRef([]);
  const closing = useRef(false);

  useLayoutEffect(() => {
    const sheet = sheetRef.current;
    if (!canAnimate(sheet)) return;
    const dialog = sheet.parentElement;
    animations.current = [
      sheet.animate({ transform: [openingTransform(readOrigin(trigger, artworkSelector)?.bounds, dialog.getBoundingClientRect()), 'none'] }, motion),
      dialog.previousElementSibling.animate({ opacity: [0, 1] }, motion),
    ];
    return () => animations.current.forEach(animation => animation.cancel());
  }, [trigger, artworkSelector]);

  function close() {
    if (closing.current) return;
    closing.current = true;
    const sheet = sheetRef.current;
    if (!canAnimate(sheet)) { onClose(); return; }
    const dialog = sheet.parentElement;
    const mask = dialog.previousElementSibling;
    const style = getComputedStyle(sheet);
    const start = { transform: style.transform, width: style.width, height: style.height, boxShadow: style.boxShadow,
      borderTopLeftRadius: style.borderTopLeftRadius, borderTopRightRadius: style.borderTopRightRadius,
      borderBottomRightRadius: style.borderBottomRightRadius, borderBottomLeftRadius: style.borderBottomLeftRadius };
    const columns = style.gridTemplateColumns;
    const rows = style.gridTemplateRows;
    const opacity = getComputedStyle(mask).opacity;
    const origin = readOrigin(trigger, artworkSelector);
    const art = sheet.querySelector('[data-catalog-card-art]');
    animations.current.forEach(animation => animation.cancel());
    dialog.dataset.closing = 'true';
    const exit = { ...motion, fill: 'forwards' };
    let end = { ...start, transform: 'scale(.96)' };
    let compactArt;
    let crop;
    if (origin && art) {
      const { bounds, artwork } = origin;
      const dialogBounds = dialog.getBoundingClientRect();
      const visual = getComputedStyle(art);
      const artWidth = parseFloat(visual.width);
      const artHeight = visual.height;
      const scale = bounds.width / artWidth;
      end = {
        transform: `translate(${bounds.left - dialogBounds.left}px, ${bounds.top - dialogBounds.top}px) scale(${scale})`,
        width: `${artWidth}px`, height: `${bounds.height / scale}px`, boxShadow: 'none',
        ...artworkCorners(trigger, artwork, bounds, scale),
      };
      // Keep the column tracks in place. The whole sheet moves and narrows to the artwork track.
      sheet.style.gridTemplateColumns = columns;
      // A stacked sheet reaches its collapse size on the vertical axis instead.
      if (art.nextElementSibling?.getBoundingClientRect().top > art.getBoundingClientRect().top + 1) {
        sheet.style.gridTemplateRows = rows;
        compactArt = art.animate({ height: [artHeight, end.height] }, exit);
      }
      crop = animateArtworkCrop(art, artwork, bounds, exit);
    }
    animations.current = [
      sheet.animate([start, end], exit),
      mask.animate({ opacity: [opacity, 0] }, exit),
    ];
    if (compactArt) animations.current.push(compactArt);
    if (crop) animations.current.push(crop);
    animations.current[0].finished.then(onClose, () => {});
  }

  const closeButton = <Button data-dsh-control data-modal-autofocus variant="toolbar" className="catalog-card-dialog-close" aria-label={t('关闭')}
    icon={<IconCloseOutlineRegular size={18} aria-hidden="true" />} onClick={close} />;

  return <Modal open headless backdropBlur={false} title={title} className={`catalog-card-dialog ${className}`} onClose={close}>
    <section ref={sheetRef} className={`catalog-card-dialog-sheet ${sheetClassName}`} aria-labelledby={labelledBy}
      onClickCapture={event => {
        if (!closing.current) return;
        event.preventDefault();
        event.stopPropagation();
      }}>
      {children(closeButton)}
    </section>
  </Modal>;
}
