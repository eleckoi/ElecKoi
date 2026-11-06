/** Supply the current ModuleLoader asset face to isolated installed-bundle tests. */
export function withDshAssets(requireModule) {
  return Object.assign(requireModule, { asset: name => new URL(name, 'http://localhost/dsh-test-assets/').href })
}
