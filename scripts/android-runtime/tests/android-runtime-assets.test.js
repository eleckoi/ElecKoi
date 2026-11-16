import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const repo = fileURLToPath(new URL('../../..', import.meta.url))
const setup = String.raw`
import importlib.util, io, json, tarfile, tempfile
from pathlib import Path
spec = importlib.util.spec_from_file_location('packager', 'scripts/android-runtime/package-runtime.py')
packager = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packager)
prefix = 'node_modules/.eleckoi-packages/shared-assets@1.0.0'
inventory = {'packages': [{'name': packager.SHARED_ASSET_PACKAGE, 'directory': prefix}]}
def package(root):
    root = Path(root)
    (root / 'assets/nested').mkdir(parents=True)
    (root / 'dist/assets/nested').mkdir(parents=True)
    (root / 'package.json').write_text(json.dumps({'name': packager.SHARED_ASSET_PACKAGE, 'exports': {
        './assets/*': './assets/*', './html/*': './dist/*'}}))
    for name, value in [('library.js', b'synthetic browser library'), ('nested/model.json', b'{"synthetic":true}')]:
        (root / 'assets' / name).write_bytes(value)
        (root / 'dist/assets' / name).write_bytes(value)
    (root / 'dist/html-libraries.global.js').write_text('synthetic libraries')
    return root
`
function python(body) {
  const result = spawnSync('python', ['-c', setup + body], { cwd: repo, encoding: 'utf8', windowsHide: true, timeout: 30_000 })
  expect(result.error, result.error?.message).toBeUndefined()
  expect(result.status, result.stderr || result.stdout).toBe(0)
}

describe('Android shared resource distribution', () => {
  it('reuses identical archives but rebuilds changed inputs, damaged outputs and missing side outputs', () => python(String.raw`
import os
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    source, output, license = root / 'input', root / 'runtime.tar.gz', root / 'license'
    source.write_bytes(b'first')
    calls = []
    def produce(destination):
        calls.append(True)
        with packager.archive(destination) as archive:
            packager.add_bytes(archive, 'payload', source.read_bytes())
        license.write_bytes(b'synthetic license')
    def build():
        return packager.build_archive(output, [source], produce, reuse=True, extras=[license])
    assert build() is False
    original = output.read_bytes()
    assert build() is True and len(calls) == 1
    timestamp = source.stat()
    source.write_bytes(b'other')
    os.utime(source, ns=(timestamp.st_atime_ns, timestamp.st_mtime_ns))
    assert build() is False and len(calls) == 2
    with tarfile.open(output) as archive:
        assert archive.extractfile('payload').read() == b'other'
    current = output.read_bytes()
    output.write_bytes(b'!' + current[1:])
    assert build() is False and output.read_bytes() == current
    license.unlink()
    assert build() is False and license.read_bytes() == b'synthetic license'
    assert build() is True
    def broken(destination):
        destination.write_bytes(b'partial archive')
        raise RuntimeError('synthetic build failure')
    try:
        packager.build_archive(output, [source], broken, reuse=False)
    except RuntimeError:
        pass
    else:
        raise AssertionError('Failed build accepted')
    assert output.read_bytes() == current
    assert not output.with_name(output.name + '.building').exists()
    assert build() is True
`))

  it('keeps the same complete payload with development compression', () => python(String.raw`
with tempfile.TemporaryDirectory() as temporary:
    root = Path(temporary)
    payload = bytes(range(256)) * 4096
    results = []
    for level in (1, 6):
        path = root / f'runtime-{level}.tar.gz'
        with packager.archive(path, compresslevel=level) as archive:
            packager.add_bytes(archive, 'nested/payload', payload, 0o755)
        with tarfile.open(path) as archive:
            member = archive.getmember('nested/payload')
            results.append((archive.extractfile(member).read(), member.mode, member.size))
    assert results[0] == results[1] == (payload, 0o755, len(payload))
`))

  it('keeps Office runtime exports while excluding foreign frame prebuilds and checking ARM64 binaries', () => python(String.raw`
with tempfile.TemporaryDirectory() as temporary:
    source = Path(temporary)
    (source / 'package.json').write_text(json.dumps({'name': '@deepseek-ai/libreoffice-kit'}))
    (source / 'frame-forwarding').mkdir()
    (source / 'frame-forwarding/index.mjs').write_bytes(b'export const synthetic = true')
    for platform in ['darwin-arm64', 'darwin-x64', 'win32-arm64', 'win32-x64', 'linux-arm64']:
        folder = source / 'frame-forwarding/prebuilds' / platform
        folder.mkdir(parents=True)
        header = bytearray(64)
        if platform == 'linux-arm64':
            header[:6] = b'\x7fELF\x02\x01'
            header[18:20] = (183).to_bytes(2, 'little')
        else:
            header[:4] = b'MACH'
        (folder / 'frame-forwarding.node').write_bytes(header)
    def packed():
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w') as archive:
            packager.add_directory(archive, source, 'synthetic-office', '@deepseek-ai/libreoffice-kit')
        output.seek(0)
        return tarfile.open(fileobj=output)
    with packed() as archive:
        assert archive.extractfile('synthetic-office/frame-forwarding/index.mjs').read() == b'export const synthetic = true'
        binaries = [item for item in archive if item.name.endswith('.node')]
        assert [item.name for item in binaries] == ['synthetic-office/frame-forwarding/prebuilds/linux-arm64/frame-forwarding.node']
        assert binaries[0].mode == 0o755
    (source / 'frame-forwarding/prebuilds/linux-arm64/frame-forwarding.node').write_bytes(b'MACH')
    try:
        packed()
    except ValueError as error:
        assert 'Foreign native binary' in str(error)
    else:
        raise AssertionError('Invalid ARM64 binary was accepted')
`))

  it('stores resource bytes once and retains the built resource path as a portable directory link', () => python(String.raw`
with tempfile.TemporaryDirectory() as temporary:
    source = package(temporary)
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        packager.add_directory(archive, source, prefix, packager.SHARED_ASSET_PACKAGE)
    output.seek(0)
    with tarfile.open(fileobj=output) as archive:
        packager.verify_shared_asset_layout(archive, inventory)
        link = archive.getmember(prefix + '/dist/assets')
        assert link.issym() and link.linkname == '../assets'
        assert not any(m.name.startswith(prefix + '/dist/assets/') for m in archive)
        assert archive.extractfile(prefix + '/assets/library.js').read() == b'synthetic browser library'
        assert archive.extractfile(prefix + '/dist/html-libraries.global.js').read() == b'synthetic libraries'
        assert not any(m.name.endswith('/tavern-runtime.global.js') for m in archive)
    assert (source / 'dist/assets/library.js').read_bytes() == (source / 'assets/library.js').read_bytes()
`))

  it('rejects stale or missing built resources before substituting their directory', () => python(String.raw`
with tempfile.TemporaryDirectory() as temporary:
    source = package(temporary)
    built = source / 'dist/assets/library.js'
    built.write_bytes(b'stale synthetic browser library')
    try:
        with tarfile.open(fileobj=io.BytesIO(), mode='w') as archive:
            packager.add_directory(archive, source, prefix, packager.SHARED_ASSET_PACKAGE)
    except ValueError as error:
        assert 'differs from its source' in str(error)
    else:
        raise AssertionError('Stale resource accepted')
    built.unlink()
    try:
        packager.validate_shared_asset_copies(source)
    except ValueError as error:
        assert 'inventory differs' in str(error)
    else:
        raise AssertionError('Missing resource accepted')
`))

  it('rejects the original duplicate archive and invalid or missing canonical resource paths', () => python(String.raw`
def check(build, message):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w') as archive:
        build(archive)
    output.seek(0)
    with tarfile.open(fileobj=output) as archive:
        try:
            packager.verify_shared_asset_layout(archive, inventory)
        except ValueError as error:
            assert message in str(error), str(error)
        else:
            raise AssertionError('Invalid resource layout accepted')
def link(archive, target='../assets'):
    item = tarfile.TarInfo(prefix + '/dist/assets')
    item.type, item.linkname = tarfile.SYMTYPE, target
    archive.addfile(item)
def duplicate(archive):
    packager.add_bytes(archive, prefix + '/assets/library.js', b'synthetic')
    packager.add_bytes(archive, prefix + '/dist/assets/library.js', b'synthetic')
check(duplicate, 'must link')
check(lambda archive: (link(archive), duplicate(archive)), 'Duplicate shared resources')
check(lambda archive: link(archive), 'Canonical shared resources are missing')
check(lambda archive: (link(archive, '../../wrong'), packager.add_bytes(archive, prefix + '/assets/library.js', b'synthetic')), 'must link')
`))
})

describe('Android packaged workspace entrypoints', () => {
  it('retains dependency resources beyond the Windows ordinary path length in the archive', () => python(String.raw`
import os, shutil
with tempfile.TemporaryDirectory() as temporary:
    source = Path(temporary) / 'source'
    source.mkdir()
    extended = Path('\\\\?\\' + str(source.resolve())) if os.name == 'nt' else source
    first, second = 'synthetic-' + 'a' * 100, 'synthetic-' + 'b' * 100
    resource = extended / first / second / 'description.md'
    try:
        resource.parent.mkdir(parents=True)
        resource.write_bytes(b'synthetic dependency resource')
        assert len(str(resource)) > 260
        output = io.BytesIO()
        with tarfile.open(fileobj=output, mode='w') as archive:
            packager.add_directory(archive, source, 'synthetic')
        output.seek(0)
        with tarfile.open(fileobj=output) as archive:
            member = 'synthetic/' + first + '/' + second + '/description.md'
            assert archive.extractfile(member).read() == b'synthetic dependency resource'
            assert all('\\' not in entry.name and not entry.name.startswith('/') for entry in archive)
    finally:
        assert source.resolve().is_relative_to(Path(temporary).resolve())
        shutil.rmtree(extended)
`))

  it('rejects a missing runtime subpath in the final archive even when its manifest and main entry exist', () => python(String.raw`
def verify(include_media):
    output = io.BytesIO()
    prefix = 'node_modules/.eleckoi-packages/synthetic-data@1.0.0'
    inventory = {'packages': [{'name': 'synthetic-data', 'version': '1.0.0', 'directory': prefix, 'workspace': True}]}
    with tarfile.open(fileobj=output, mode='w') as archive:
        packager.add_bytes(archive, prefix + '/package.json', json.dumps({
            'name': 'synthetic-data', 'version': '1.0.0', 'main': './lib/index.js', 'exports': {
                '.': {'types': './lib/index.d.ts', 'default': './lib/index.js'}, './media': './lib/media.js',
                './assets/*': './assets/*'}}).encode())
        packager.add_bytes(archive, prefix + '/lib/index.js', b'export const data = true')
        packager.add_bytes(archive, prefix + '/assets/example.json', b'{}')
        if include_media:
            packager.add_bytes(archive, prefix + '/lib/media.js', b'export const media = true')
    output.seek(0)
    with tarfile.open(fileobj=output) as archive:
        packager.verify_workspace_entrypoints(archive, inventory)
verify(True)
try:
    verify(False)
except ValueError as error:
    assert 'synthetic-data -> ./lib/media.js' in str(error), str(error)
else:
    raise AssertionError('Missing runtime module accepted')
`))
})

describe('Android locked file publication', () => {
  it('patches the current locked DSH files and rejects changed source bytes without modifying installed packages', () => python(String.raw`
import hashlib, subprocess
upstream = packager.read_json(packager.REPO / 'apps/desktop/resources/dsh/runtime-manifest.json')['upstream']
for filename, transform in [('session-publication-lock.json', packager.patch_session_publication),
                            ('attachment-storage-lock.json', packager.patch_attachment_storage)]:
    lock = packager.read_json(packager.REPO / 'native/android-runtime' / filename)
    source = packager.REPO / 'node_modules' / lock['package']
    manifest = packager.read_json(source / 'package.json')
    assert lock['version'] == manifest['version'] == upstream['version']
    assert lock['upstreamCommit'] == upstream['commit']
    original = (source / lock['file']).read_bytes()
    assert hashlib.sha256(original).hexdigest() == lock['sourceSha256']
    patched = transform(original)
    for replacement in lock['replacements']:
        assert original.count(replacement['before'].encode()) == 1
        assert replacement['before'].encode() not in patched
        assert replacement['after'].encode() in patched
    with tempfile.TemporaryDirectory() as temporary:
        output = Path(temporary) / 'publication.mjs'
        output.write_bytes(patched)
        subprocess.run(['node', '--check', str(output)], check=True, capture_output=True)
    try:
        transform(b'// changed source\n' + original)
    except ValueError as error:
        assert 'locked package' in str(error)
    else:
        raise AssertionError('Unreviewed package bytes accepted')
    assert (source / lock['file']).read_bytes() == original
`))
})
