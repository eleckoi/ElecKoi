export const CROP_SIZE = 250;

export function avatarCropStyle(crop, size) {
  if (!crop || !size?.width || !size.height) return undefined;
  const scale = crop.zoom * 100 / Math.min(size.width, size.height);
  return {
    position: 'absolute',
    maxWidth: 'none',
    maxHeight: 'none',
    borderRadius: 0,
    width: `${size.width * scale}%`,
    height: `${size.height * scale}%`,
    left: `${50 + crop.offset.x * 100 / CROP_SIZE}%`,
    top: `${50 + crop.offset.y * 100 / CROP_SIZE}%`,
    transform: `translate(-50%, -50%) rotate(${crop.rotation}deg)`,
  };
}
