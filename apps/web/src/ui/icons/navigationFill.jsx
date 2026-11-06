import { ICON_SYMBOLS } from '@deepseek-ai/dsh-client-ui-primitives';

/** Inline geometry lets the existing navigation fill styles reach individual paths. */
export function NavigationFill({ glyph }) {
  return <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: ICON_SYMBOLS[`dsw-icon-${glyph}-regular`] }} />;
}
