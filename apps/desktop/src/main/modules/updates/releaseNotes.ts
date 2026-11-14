import { micromark } from 'micromark'
import { gfm, gfmHtml } from 'micromark-extension-gfm'

/** Render release notes without enabling raw HTML or unsafe URL protocols. */
export function renderUpdateReleaseNotes(markdown: string): string {
  return micromark(markdown, { extensions: [gfm()], htmlExtensions: [gfmHtml()] })
}
