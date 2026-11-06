import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const expectedVersion = '1.7.0'
const packageNames = ['@headless-tree/core', '@headless-tree/react']
const noticePath = resolve(root, 'apps', 'desktop', 'resources', 'licenses', 'headless-tree-MIT.txt')

const expectedNotice = `MIT License

Copyright (c) 2023 Lukas Bach

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`

for (const packageName of packageNames) {
  const metadataPath = resolve(root, 'node_modules', ...packageName.split('/'), 'package.json')
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  if (metadata.version !== expectedVersion) {
    throw new Error(`${packageName} 版本应为 ${expectedVersion}，实际为 ${metadata.version}`)
  }
  if (metadata.license !== 'MIT') {
    throw new Error(`${packageName} 许可证应为 MIT，实际为 ${metadata.license || '未声明'}`)
  }
}

const notice = await readFile(noticePath, 'utf8')
if (notice.replaceAll('\r\n', '\n') !== expectedNotice) {
  throw new Error('Headless Tree MIT 许可证文本缺失或已变更')
}

console.log('Desktop third-party license notice is current.')

const ejsRoot = resolve(root, 'apps/web/node_modules/ejs')
const ejsMetadata = JSON.parse(await readFile(resolve(ejsRoot, 'package.json'), 'utf8'))
if (ejsMetadata.version !== '3.1.10' || ejsMetadata.license !== 'Apache-2.0') throw new Error('EJS 版本或许可证与锁定合同不一致')
const ejsLicense = await readFile(resolve(ejsRoot, 'LICENSE'), 'utf8')
const bundledEjsLicense = await readFile(resolve(root, 'apps/web/public/licenses/ejs/LICENSE.txt'), 'utf8')
if (ejsLicense.replaceAll('\r\n', '\n') !== bundledEjsLicense.replaceAll('\r\n', '\n')) throw new Error('EJS 随网页分发的许可证缺失或已变更')

const updateSources = resolve(root, 'apps/desktop/src/main/modules/updates/dsh')
const provenance = JSON.parse(await readFile(resolve(updateSources, 'provenance.json'), 'utf8'))
const digest = text => createHash('sha256').update(text.replaceAll('\r\n', '\n')).digest('hex')
if (digest(await readFile(resolve(root, provenance.licenseFile), 'utf8')) !== provenance.licenseSha256) {
  throw new Error('DSH Desktop 更新模块随包许可证与来源记录不一致')
}
for (const file of provenance.files) {
  if (digest(await readFile(resolve(updateSources, file.path), 'utf8')) !== file.localSha256) {
    throw new Error(`DSH Desktop 更新模块与锁定来源记录不一致：${file.path}`)
  }
}

for (const manifestPath of [
  'apps/desktop/src/main/platform/electron/dsh/provenance.json',
  'apps/desktop/src/main/platform/electron/dsh/capabilities.provenance.json',
  'apps/desktop/installer/provenance.json'
]) {
  const manifest = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'))
  for (const file of manifest.files) {
    if (digest(await readFile(resolve(root, file.path), 'utf8')) !== file.localSha256) {
      throw new Error(`DSH Desktop 来源记录与实现不一致：${file.path}`)
    }
  }
}
