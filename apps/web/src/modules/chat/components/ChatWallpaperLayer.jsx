import { assetSrc } from '../../../app/services/assets.js';
import { CHAT_WALLPAPER_DEFAULTS } from '../../appearance/index.js';

export function ChatWallpaperLayer({ wallpaper }) {
  if (!wallpaper?.image) return null;
  return (
    <div
      className="chat-shell-backdrop"
      aria-hidden="true"
      style={{
        "--wallpaper-opacity": wallpaper.opacity,
        "--wallpaper-blur": `${wallpaper.blur}px`,
        "--wallpaper-scrim": wallpaper.scrim,
        "--roleplay-wallpaper-opacity": wallpaper.opacity === CHAT_WALLPAPER_DEFAULTS.opacity ? 1 : wallpaper.opacity,
        "--roleplay-wallpaper-blur": `${wallpaper.blur === CHAT_WALLPAPER_DEFAULTS.blur ? 0 : wallpaper.blur}px`,
        "--roleplay-wallpaper-wash": wallpaper.scrim === CHAT_WALLPAPER_DEFAULTS.scrim
          ? 'light-dark(rgb(244 246 249 / .16), rgb(10 16 22 / .25))'
          : 'rgb(var(--chat-wallpaper-scrim-rgb) / var(--wallpaper-scrim))',
      }}
    >
      <img src={assetSrc(wallpaper.image)} alt="" draggable="false" />
      <i />
    </div>
  );
}
