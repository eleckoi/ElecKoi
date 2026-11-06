export const HTML_RESOURCES_BUNDLE = '@eleckoi/dsh-client-html-resources'
const obsoleteBundles = ['@eleckoi/dsh-client-tavern-shared', '@eleckoi/dsh-compatibility-host']

// RETIRE WHEN: supported desktop and Android profiles, including restored backups,
// no longer select either obsolete bundle. Remove this replacement, its callers
// inside the profile upgrades, obsoleteBundles and replacement-only tests together.
// Keep HTML_RESOURCES_BUNDLE and current initialization and user bundle selections.
/** Replace the retired pair only when both halves were enabled; preserve user-disabled resources. */
export function replaceHtmlResourceBundles(selected: readonly string[]): string[] {
  const enabled = obsoleteBundles.every(name => selected.includes(name))
  const result: string[] = []
  for (const name of selected) {
    if (obsoleteBundles.includes(name)) {
      if (enabled && !result.includes(HTML_RESOURCES_BUNDLE)) result.push(HTML_RESOURCES_BUNDLE)
    } else if (!result.includes(name)) result.push(name)
  }
  return result
}
