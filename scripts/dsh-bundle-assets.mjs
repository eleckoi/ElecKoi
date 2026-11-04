import { access, readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

/** Collect actual bundle resources; bundles without dictionaries need no locale files. */
export async function dshBundleAssets(directory) {
  const declaration = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'))
  const patches = declaration.dsh?.bundle?.patch
  if (!patches) throw new Error(`Plugin has no bundle declaration: ${declaration.name}`)
  const files = ['package.json', ...(Array.isArray(patches) ? patches : [patches])]
  const client = declaration.exports?.['./client']
  if (declaration.dsh?.client) {
    const entry = typeof client === 'string' ? client : client?.default
    if (typeof entry !== 'string') throw new Error(`Plugin has no client entry: ${declaration.name}`)
    files.push(entry)
  }
  let locales
  try { locales = await readdir(join(directory, 'locale'), { withFileTypes: true }) }
  catch (error) { if (error.code !== 'ENOENT') throw error; locales = [] }
  for (const locale of locales) {
    if (locale.isFile() && locale.name.endsWith('.json')) files.push(`locale/${locale.name}`)
  }
  async function skills(path = 'skills') {
    let entries
    try { entries = await readdir(join(directory, path), { withFileTypes: true }) }
    catch (error) { if (error.code !== 'ENOENT') throw error; return }
    for (const entry of entries) {
      const child = `${path}/${entry.name}`
      if (entry.isDirectory()) await skills(child)
      else if (entry.isFile()) files.push(child)
    }
  }
  await skills()
  for (const file of files) await access(join(directory, file))
  return files
}

export async function verifyDshBundleAssets(directory, files) {
  for (const file of files) await access(join(directory, file))
}
