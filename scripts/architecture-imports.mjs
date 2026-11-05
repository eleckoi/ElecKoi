const publicRendererPackages = new Set([
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-api-workspace-controller/default-workspace',
])

/** Read module identities, including re-exports and literal runtime imports. */
export function moduleImports(content) {
  return [...new Set([...content.matchAll(/(?:\bfrom\s+|\bimport\s*(?:\(\s*)?|\brequire\s*\(\s*)['"]([^'"]+)['"]/g)]
    .map(match => match[1]))]
}

export function isForbiddenRendererDshImport(specifier) {
  return specifier.startsWith('@deepseek-ai/') && !publicRendererPackages.has(specifier)
}

export function isDshRuntimeImport(specifier) {
  return /^@eleckoi\/(?:dsh-runtime|desktop-host)(?:\/|$)/.test(specifier)
    || specifier.startsWith('@deepseek-ai/dsh-') && !publicRendererPackages.has(specifier)
}
