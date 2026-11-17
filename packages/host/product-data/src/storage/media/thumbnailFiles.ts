import { rmdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const THUMBNAIL_DIRECTORY = '.thumbnails-v1'
export const MEDIA_FILE_PATTERN = /^[a-f0-9]{64}\.(png|jpg|webp|gif)$/

/** Derivatives share their original's owner and slot, including transaction cleanup. */
export function removeImageThumbnails(source: string): void {
  const directory = join(dirname(source), THUMBNAIL_DIRECTORY)
  rmSync(join(directory, source.split(/[\\/]/).at(-1)!), { recursive: true, force: true })
  removeEmptyThumbnailDirectory(directory)
}

export function removeEmptyThumbnailDirectory(directory: string): void {
  // Atomic, non-recursive removal: a concurrent Host save may have filled this
  // directory since the decoder last checked it. Never delete that new media.
  try { rmdirSync(directory) }
  catch (error) {
    if (!['ENOENT', 'ENOTEMPTY', 'EEXIST'].includes((error as NodeJS.ErrnoException).code || '')) throw error
  }
}
