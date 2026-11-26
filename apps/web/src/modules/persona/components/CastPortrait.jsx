import { useState } from 'react';
import { ImageSquare } from '@phosphor-icons/react';
import { avatarCropStyle } from '../../../ui/ui/avatarCropStyle.js';
export { CROP_SIZE } from '../../../ui/ui/avatarCropStyle.js';

export function CastPortrait({ src, name = '', crop, className = '', iconSize = 24 }) {
  const [geometry, setGeometry] = useState(null);
  const size = geometry?.src === src ? geometry : null;

  const transform = avatarCropStyle(crop, size);

  return (
    <span className={`character-cast-art ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          loading="lazy"
          decoding="async"
          draggable="false"
          className={transform ? 'is-cropped' : undefined}
          style={transform}
          onLoad={event => setGeometry({
            src,
            width: event.currentTarget.naturalWidth,
            height: event.currentTarget.naturalHeight,
          })}
        />
      ) : (
        <ImageSquare size={iconSize} weight="light" aria-hidden="true" />
      )}
    </span>
  );
}
