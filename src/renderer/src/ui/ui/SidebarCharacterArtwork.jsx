import { Avatar } from "./Avatar.jsx";

export function SidebarCharacterArtwork({ mode, name, avatar, cover, className = "" }) {
  const artworkMode = mode === "avatar" ? "avatar" : "cover";
  const source = artworkMode === "cover" ? cover || avatar : avatar;

  return (
    <Avatar
      src={source}
      name={name}
      className={`sidebar-character-artwork is-${artworkMode}${className ? ` ${className}` : ""}`}
    />
  );
}
