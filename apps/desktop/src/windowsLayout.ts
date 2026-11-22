/** Windows caption height in device-independent pixels. */
export const WINDOWS_TITLEBAR_HEIGHT = 40

export function windowsCaptionFill(dark: boolean): string {
  return dark ? '#1b1b1c' : '#f9fafb'
}
