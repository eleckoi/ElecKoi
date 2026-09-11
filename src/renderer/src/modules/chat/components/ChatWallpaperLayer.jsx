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
      }}
    >
      <img src={wallpaper.image} alt="" draggable="false" />
      <i />
    </div>
  );
}
