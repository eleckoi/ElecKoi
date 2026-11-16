"""Assemble verified Linux ARM64 assets without executing or compiling guest binaries."""
import argparse
import base64
import copy
import gzip
import hashlib
import io
import json
import os
import posixpath
import re
import struct
import subprocess
import tarfile
import time
from contextlib import contextmanager
from pathlib import Path, PurePosixPath

REPO = Path(__file__).resolve().parents[2]
SHARED_ASSET_PACKAGE = "@eleckoi/dsh-client-html-resources"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify(path, algorithm, expected):
    digest = hashlib.new(algorithm)
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    actual = base64.b64encode(digest.digest()).decode() if algorithm == "sha512" else digest.hexdigest()
    if actual != expected:
        raise ValueError(f"Locked checksum mismatch: {path.name}")


def safe_name(name):
    name = name.removeprefix("./").rstrip("/")
    if name in ("", "."):
        return ""
    if name.startswith("/") or "\\" in name or ".." in PurePosixPath(name).parts:
        raise ValueError(f"Unsafe archive member: {name}")
    return name


@contextmanager
def archive(path, *, compresslevel=6):
    with path.open("wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=compresslevel) as zipped:
        with tarfile.open(fileobj=zipped, mode="w", format=tarfile.PAX_FORMAT) as output:
            yield output


def file_digest(path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for block in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def path_digest(paths):
    records = []
    for path in paths:
        if not path.exists():
            return None
        files = sorted(path.rglob("*")) if path.is_dir() else [path]
        for file in files:
            if file.is_symlink():
                raise ValueError(f"Unexpected cache input symlink: {file}")
            if file.is_file():
                records.append([str(file), file_digest(file)])
    return hashlib.sha256(json.dumps(records, separators=(",", ":")).encode()).hexdigest()


def build_archive(path, inputs, producer, *, reuse=False, extras=()):
    """Reuse only byte-identical inputs and verified outputs; publish successful builds atomically."""
    started = time.perf_counter()
    receipt = path.with_name(path.name + ".cache.json")
    signature = path_digest(inputs) if reuse else None
    if reuse and signature is None:
        raise ValueError(f"Missing archive input: {path.name}")
    if reuse and receipt.is_file() and path.is_file():
        try:
            previous = read_json(receipt)
        except (ValueError, OSError):
            previous = {}
        if (previous.get("inputs") == signature
                and previous.get("outputs") == path_digest([path, *extras])):
            print(f"Reused {path.name} ({time.perf_counter() - started:.2f}s)", flush=True)
            return True
    temporary = path.with_name(path.name + ".building")
    try:
        producer(temporary)
        temporary.replace(path)
        if reuse:
            receipt.write_text(json.dumps({"inputs": signature, "outputs": path_digest([path, *extras])}) + "\n", encoding="utf-8")
        elif receipt.exists():
            receipt.unlink()
    finally:
        if temporary.exists():
            temporary.unlink()
    print(f"Built {path.name} ({time.perf_counter() - started:.2f}s)", flush=True)
    return False


def normalized(member, name):
    member = copy.copy(member)
    member.name = name
    member.uid = member.gid = member.mtime = 0
    member.uname = member.gname = ""
    member.pax_headers = {}
    return member


def transfer(source, output, rename, *, guest_root=False):
    for member in source:
        name = safe_name(member.name)
        if not name:
            continue
        destination = rename(name)
        if destination is None:
            continue
        item = normalized(member, safe_name(destination))
        if guest_root:
            item.uid, item.gid, item.mtime = member.uid, member.gid, member.mtime
        if member.islnk():
            # Android app-private storage does not support these rootfs hard links.
            target = source.getmember(member.linkname)
            while target.islnk():
                target = source.getmember(target.linkname)
            item.type, item.size, item.linkname = tarfile.REGTYPE, target.size, ""
            with source.extractfile(target) as data:
                output.addfile(item, data)
        elif member.isfile():
            with source.extractfile(member) as data:
                output.addfile(item, data)
        elif member.issym():
            if not guest_root:
                resolved = posixpath.normpath(posixpath.join(posixpath.dirname(item.name), item.linkname))
                if item.linkname.startswith("/") or resolved.startswith("../"):
                    raise ValueError(f"Nonportable app symlink: {item.name} -> {item.linkname}")
            output.addfile(item)
        elif member.isdir():
            output.addfile(item)
        else:
            raise ValueError(f"Unsupported runtime entry: {member.name}")


def add_bytes(output, name, value, mode=0o644):
    item = tarfile.TarInfo(safe_name(name))
    item.size, item.mode = len(value), mode
    output.addfile(item, io.BytesIO(value))


def check_elf(value, name):
    if value[:4] != b"\x7fELF" or value[4:6] != b"\x02\x01" or int.from_bytes(value[18:20], "little") != 183:
        raise ValueError(f"Expected Linux ARM64 ELF: {name}")


def deb_members(path):
    value = path.read_bytes()
    if value[:8] != b"!<arch>\n":
        raise ValueError(f"Invalid Debian archive: {path.name}")
    cursor, members = 8, {}
    while cursor < len(value):
        header = value[cursor:cursor + 60]
        if len(header) != 60 or header[58:60] != b"`\n":
            raise ValueError(f"Invalid Debian member: {path.name}")
        length = int(header[48:58].decode("ascii").strip())
        name = header[:16].decode("ascii").strip().rstrip("/")
        if name in members or cursor + 60 + length > len(value):
            raise ValueError(f"Invalid Debian member bounds: {path.name}")
        members[name] = value[cursor + 60:cursor + 60 + length]
        cursor += 60 + length + length % 2
    return members


def deb_tar(members, prefix):
    names = [name for name in members if name.startswith(prefix + ".tar.")]
    if len(names) != 1:
        raise ValueError(f"Debian archive requires exactly one {prefix} tar")
    name, = names
    value = members[name]
    if name.endswith(".zst"):
        # Asset preparation already requires the locked Node 24 toolchain.
        value = subprocess.run(["node", "-e", "process.stdout.write(require('node:zlib').zstdDecompressSync(require('node:fs').readFileSync(0)))"],
                               input=value, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True).stdout
    return tarfile.open(fileobj=io.BytesIO(value), mode="r:*")


def package_git(downloads, destination):
    lock = read_json(REPO / "scripts/android-runtime/git-tools-lock.json")
    if (lock["schemaVersion"], lock["architecture"], lock["distribution"]) != (1, "arm64", "ubuntu-noble"):
        raise ValueError("Android Git distribution identity mismatch")
    records, roots, certificates = {}, [], {}
    for spec in lock["packages"]:
        source = downloads / spec["file"]
        verify(source, "sha256", spec["sha256"])
        members = deb_members(source)
        with deb_tar(members, "control") as control:
            text = control.extractfile("./control").read().decode()
            fields = dict(line.split(": ", 1) for line in text.splitlines() if ": " in line and not line.startswith(" "))
        if [fields[key] for key in ("Package", "Version", "Architecture")] != [spec[key] for key in ("name", "version", "architecture")]:
            raise ValueError(f"Debian Git dependency identity mismatch: {spec['name']}")
        packed = deb_tar(members, "data")
        roots.append(packed)
        for item in packed:
            name = safe_name(item.name)
            if not name:
                continue
            if name in records:
                previous = records[name][1]
                if not item.isdir() or not previous.isdir():
                    raise ValueError(f"Git dependencies contain duplicate files: {name}")
                continue
            records[name] = (packed, item)
            if name.startswith("usr/share/ca-certificates/") and name.endswith(".crt"):
                certificates[name] = packed.extractfile(item).read()
    required = ("usr/bin/git", "usr/bin/ssh", "usr/bin/ssh-keygen", "usr/lib/git-core/git-remote-https")
    missing = [name for name in required if name not in records]
    if not certificates or missing:
        raise ValueError(f"Android Git archive lacks transports or certificate authorities: {missing}")
    with archive(destination) as output:
        for name in sorted(records):
            source, member = records[name]
            # Copy individual entries while expanding only official hard links.
            item = normalized(member, name)
            if member.islnk():
                target = source.getmember(member.linkname)
                while target.islnk():
                    target = source.getmember(target.linkname)
                item.type, item.size, item.linkname = tarfile.REGTYPE, target.size, ""
                output.addfile(item, source.extractfile(target))
            elif member.isfile():
                output.addfile(item, source.extractfile(member))
            elif member.isdir() or member.issym():
                output.addfile(item)
            else:
                raise ValueError(f"Unsupported Git dependency member: {name}")
        # Debian's post-install trigger normally concatenates this package's PEM roots.
        add_bytes(output, "etc/ssl/certs/ca-certificates.crt", b"".join(certificates[name] for name in sorted(certificates)))
        add_bytes(output, "usr/share/eleckoi/git-tools-lock.json", (json.dumps(lock, indent=2) + "\n").encode())
    for source in roots:
        source.close()
    licenses = REPO / "apps/android/app/src/main/assets/licenses/git-tools"
    licenses.mkdir(parents=True, exist_ok=True)
    (licenses / "provenance.json").write_text(json.dumps(lock, indent=2) + "\n", encoding="utf-8")
    with tarfile.open(destination) as packed, tarfile.open(downloads / read_json(REPO / "scripts/android-runtime/runtime-base-lock.json")["rootfs"]["file"]) as base:
        combined = {item.name: (base, item) for item in base}
        combined.update({item.name: (packed, item) for item in packed})
        def license_bytes(name):
            for _ in range(12):
                parts = PurePosixPath(name).parts
                link = next((("/".join(parts[:i]), combined["/".join(parts[:i])][1]) for i in range(1, len(parts) + 1)
                             if "/".join(parts[:i]) in combined and combined["/".join(parts[:i])][1].issym()), None)
                if link:
                    prefix, member = link
                    name = safe_name(posixpath.normpath(posixpath.join(posixpath.dirname(prefix), member.linkname, *parts[len(PurePosixPath(prefix).parts):])))
                    continue
                source, item = combined[name]
                return source.extractfile(item).read()
            raise ValueError("Git copyright symlink cycle")
        for spec in lock["packages"]:
            (licenses / (spec["name"] + ".copyright")).write_bytes(license_bytes(f"usr/share/doc/{spec['name']}/copyright"))


def elf_dependencies(value):
    """Read DT_NEEDED from the ELF64 program headers, including stripped executables."""
    phoff = struct.unpack_from("<Q", value, 32)[0]
    size, count = struct.unpack_from("<HH", value, 54)
    segments = [struct.unpack_from("<IIQQQQQQ", value, phoff + index * size) for index in range(count)]
    needed, strings = [], None
    for segment in segments:
        if segment[0] != 2:
            continue
        for offset in range(segment[2], segment[2] + segment[5], 16):
            tag, entry = struct.unpack_from("<QQ", value, offset)
            if tag == 0:
                break
            if tag == 1:
                needed.append(entry)
            if tag == 5:
                strings = entry
    if not needed:
        return []
    owner = next(segment for segment in segments if segment[0] == 1 and segment[3] <= strings < segment[3] + segment[5])
    start = owner[2] + strings - owner[3]
    return [value[start + entry:value.index(b"\0", start + entry)].decode("utf-8") for entry in needed]


def patch_session_publication(value):
    """Replace only the two audited exclusive publications in the Android distribution."""
    spec = read_json(REPO / "native/android-runtime/session-publication-lock.json")
    if hashlib.sha256(value).hexdigest() != spec["sourceSha256"]:
        raise ValueError("Android Session publication source differs from the locked package")
    for replacement in spec["replacements"]:
        before, after = replacement["before"].encode(), replacement["after"].encode()
        if value.count(before) != 1:
            raise ValueError("Android Session publication requires one exact match per audited call")
        value = value.replace(before, after)
    return f'import {{ publishAndroidFile }} from "./{spec["helper"]}";\n'.encode() + value


def patch_attachment_storage(value):
    """Apply the locked Android directory boundary and exclusive publications."""
    spec = read_json(REPO / "native/android-runtime/attachment-storage-lock.json")
    if hashlib.sha256(value).hexdigest() != spec["sourceSha256"]:
        raise ValueError("Android attachment source differs from the locked package")
    for replacement in spec["replacements"]:
        before, after = replacement["before"].encode(), replacement["after"].encode()
        if value.count(before) != 1:
            raise ValueError("Android attachment storage requires one exact match per audited call")
        value = value.replace(before, after)
    return (b'import { publishAndroidFile } from "./android-file-publication.mjs";\n'
            b'import { androidAttachmentBoundary, publishAndroidAlias } from "./android-attachment-storage.mjs";\n' + value)


def validate_shared_asset_copies(source):
    """Verify both declared resource paths before storing one physical copy."""
    manifest = read_json(source / "package.json")
    exports = manifest["exports"]
    if (manifest["name"] != SHARED_ASSET_PACKAGE
            or exports.get("./assets/*") != "./assets/*"
            or exports.get("./html/*") != "./dist/*"):
        raise ValueError("Review the shared resource package exports before packaging")
    def inventory(root):
        if not root.is_dir() or root.is_symlink():
            raise ValueError(f"Shared resource directory is missing or linked: {root}")
        files = {}
        for path in root.rglob("*"):
            if path.is_symlink():
                raise ValueError(f"Unexpected shared resource symlink: {path}")
            if path.is_file():
                files[path.relative_to(root).as_posix()] = path
        if not files:
            raise ValueError(f"Shared resource directory is empty: {root}")
        return files
    original, built = inventory(source / "assets"), inventory(source / "dist/assets")
    if original.keys() != built.keys():
        raise ValueError("Built shared resource inventory differs from its source; rebuild the package")
    for name, path in original.items():
        if path.read_bytes() != built[name].read_bytes():
            raise ValueError(f"Built shared resource differs from its source: {name}; rebuild the package")


def verify_shared_asset_layout(packed, inventory):
    """Reject duplicate resource bytes while retaining both public load paths."""
    owners = [record for record in inventory["packages"] if record["name"] == SHARED_ASSET_PACKAGE]
    if len(owners) != 1:
        raise ValueError("Android requires exactly one shared resource package")
    owner = safe_name(owners[0]["directory"])
    resources = posixpath.join(owner, "assets")
    alias = posixpath.join(owner, "dist/assets")
    members = packed.getmembers()
    links = [item for item in members if item.name == alias]
    if len(links) != 1 or not links[0].issym() or links[0].linkname != "../assets":
        raise ValueError("Shared built resources must link to the single canonical asset directory")
    if any(item.name.startswith(alias + "/") for item in members):
        raise ValueError("Duplicate shared resources in the Android archive")
    if not any(item.isfile() and item.name.startswith(resources + "/") for item in members):
        raise ValueError("Canonical shared resources are missing from the Android archive")


def verify_workspace_entrypoints(packed, inventory):
    """Check declared workspace runtime files in the final archive, not the source tree."""
    members = {safe_name(item.name): item for item in packed.getmembers()}
    for record in inventory["packages"]:
        if not isinstance(record.get("workspace"), bool):
            raise ValueError(f"Packaged dependency lacks workspace classification: {record['name']}")
        if not record["workspace"]:
            continue
        owner = safe_name(record["directory"])
        manifest_path = posixpath.join(owner, "package.json")
        manifest = json.load(packed.extractfile(manifest_path))
        if (manifest["name"], manifest["version"]) != (record["name"], record["version"]):
            raise ValueError(f"Packaged workspace identity differs: {record['name']}")
        targets = set()

        def collect(value):
            if isinstance(value, str):
                targets.add(value)
            elif isinstance(value, list):
                for entry in value:
                    collect(entry)
            elif isinstance(value, dict):
                for condition, entry in value.items():
                    if condition != "types":
                        collect(entry)

        collect(manifest.get("exports"))
        collect(manifest.get("bin"))
        for field in ("main", "module"):
            if isinstance(manifest.get(field), str):
                targets.add(manifest[field])
        for target in sorted(targets):
            path = posixpath.join(owner, safe_name(target))
            if "*" in path:
                pattern = re.compile("^" + ".*".join(re.escape(part) for part in path.split("*")) + "$")
                present = any(item.isfile() and pattern.fullmatch(name) for name, item in members.items())
            else:
                present = path in members and members[path].isfile()
            if not present:
                raise ValueError(f"Missing packaged workspace runtime entry: {record['name']} -> {target}")


def add_directory(output, source, prefix, record_name=None):
    if os.name == "nt":
        absolute = str(source.resolve())
        if not absolute.startswith("\\\\?\\"):
            source = Path("\\\\?\\UNC\\" + absolute[2:] if absolute.startswith("\\\\") else "\\\\?\\" + absolute)
    publication = read_json(REPO / "native/android-runtime/session-publication-lock.json")
    attachment = read_json(REPO / "native/android-runtime/attachment-storage-lock.json")
    android_session = record_name == publication["package"]
    android_attachment = record_name == attachment["package"]
    shared_assets = record_name == SHARED_ASSET_PACKAGE
    if shared_assets:
        validate_shared_asset_copies(source)
    if android_session:
        manifest = read_json(source / "package.json")
        if (manifest["name"], manifest["version"]) != (publication["package"], publication["version"]):
            raise ValueError("Android Session publication package identity mismatch")
        if not (source / publication["file"]).is_file():
            raise ValueError("Android Session publication source is missing")
        helper_path = posixpath.join(posixpath.dirname(publication["file"]), publication["helper"])
        if (source / helper_path).exists():
            raise ValueError("Android Session publication source already contains an unverified helper")
        add_bytes(output, posixpath.join(prefix, helper_path),
                  (REPO / "native/android-runtime" / publication["helper"]).read_bytes())
    if android_attachment:
        manifest = read_json(source / "package.json")
        if (manifest["name"], manifest["version"]) != (attachment["package"], attachment["version"]):
            raise ValueError("Android attachment package identity mismatch")
        if not (source / attachment["file"]).is_file():
            raise ValueError("Android attachment source is missing")
        for helper in attachment["helpers"]:
            helper_path = posixpath.join(posixpath.dirname(attachment["file"]), helper)
            if (source / helper_path).exists():
                raise ValueError("Android attachment source already contains an unverified helper")
            add_bytes(output, posixpath.join(prefix, helper_path),
                      (REPO / "native/android-runtime" / helper).read_bytes())
    for directory, dirs, files in os.walk(source, followlinks=False):
        local = Path(directory).relative_to(source)
        if record_name == "@eleckoi/web-client" and local == Path("."):
            # This package exports its compiled dist; source assets are build inputs.
            dirs[:] = [name for name in dirs if name == "dist"]
        if shared_assets and local == Path("dist"):
            dirs[:] = [name for name in dirs if name != "assets"]
        dirs[:] = sorted(name for name in dirs if name not in ("node_modules", ".git", ".gradle", ".cache")
                         and not (record_name == "better-sqlite3" and local == Path(".") and name in ("build", "bin"))
                         and not (record_name == "@deepseek-ai/libreoffice-kit" and local == Path("frame-forwarding/prebuilds") and name != "linux-arm64")
                         and not (record_name == "node-pty" and local == Path("prebuilds") and name != "linux-arm64"))
        for name in sorted(files):
            if record_name == "@eleckoi/web-client" and local == Path(".") and name != "package.json" and not name.upper().startswith(("LICENSE", "NOTICE", "README")):
                continue
            file = Path(directory) / name
            if file.is_symlink():
                raise ValueError(f"Unexpected package file symlink: {file}")
            if file.suffix.lower() in (".exe", ".dll", ".pdb", ".lib", ".obj", ".cmd", ".bat"):
                continue
            relative = file.relative_to(source).as_posix()
            if android_session and relative == publication["file"]:
                add_bytes(output, posixpath.join(prefix, relative), patch_session_publication(file.read_bytes()))
                continue
            if android_attachment and relative == attachment["file"]:
                add_bytes(output, posixpath.join(prefix, relative), patch_attachment_storage(file.read_bytes()))
                continue
            if prefix == "" and relative == "production-closure.json":
                continue
            item = tarfile.TarInfo(posixpath.join(prefix, relative))
            item.size, item.mode = file.stat().st_size, 0o644
            with file.open("rb") as data:
                header = data.read(64)
                if header[:4] == b"\x7fELF":
                    check_elf(header, item.name)
                    item.mode = 0o755
                elif file.suffix == ".node" or ".so" in file.suffixes:
                    raise ValueError(f"Foreign native binary in closure: {item.name}")
                elif header.startswith(b"#!"):
                    item.mode = 0o755
                data.seek(0)
                output.addfile(item, data)
    if shared_assets:
        item = tarfile.TarInfo(posixpath.join(prefix, "dist/assets"))
        item.type, item.mode, item.linkname = tarfile.SYMTYPE, 0o777, "../assets"
        output.addfile(item)


def canonicalize_native_records(records, overlays):
    """Replace installed platform copies by their exact verified overlay identities."""
    registered = {}
    for _, _, _, record in overlays:
        identity = (record["name"], record["version"])
        if identity in registered:
            raise ValueError("Duplicate native overlay identity")
        registered[identity] = record
    replaced = {}
    for record in records:
        canonical = registered.get((record["name"], record["version"]))
        if canonical is not None and canonical["directory"] != record["directory"]:
            replaced[record["directory"]] = canonical["directory"]
    records[:] = [record for record in records if record["directory"] not in replaced]
    for record in records:
        for edge in record["dependencies"]:
            edge["directory"] = replaced.get(edge["directory"], edge["directory"])


def resolve_native_dependencies(records, overlays):
    """Resolve duplicate identities through the explicitly registered Android overlays."""
    native_directories = {record["directory"] for _, _, _, record in overlays}
    for _, _, manifest, record in overlays:
        dependency_names = {**manifest.get("dependencies", {}), **manifest.get("optionalDependencies", {})}
        for name in dependency_names:
            candidates = [candidate for candidate in records if candidate["name"] == name]
            if not candidates and name in manifest.get("optionalDependencies", {}):
                continue
            if len({candidate["version"] for candidate in candidates}) > 1:
                raise ValueError(f"Regenerate closure for ambiguous native dependency: {record['name']} -> {name}")
            canonical = [candidate for candidate in candidates if candidate["directory"] in native_directories]
            if canonical:
                candidates = canonical
            if len(candidates) != 1:
                raise ValueError(f"Regenerate closure for ambiguous native dependency: {record['name']} -> {name}")
            record["dependencies"].append({"name": name, "directory": candidates[0]["directory"]})


def package_app(closure, downloads, output, lock, *, compresslevel=6):
    inventory = read_json(closure / "production-closure.json")
    records = inventory["packages"]
    publication = read_json(REPO / "native/android-runtime/session-publication-lock.json")
    owners = [record for record in records if record["name"] == publication["package"]]
    if len(owners) != 1 or owners[0]["version"] != publication["version"]:
        raise ValueError("Android requires exactly one locked JSONL Session package")
    by_directory = {record["directory"]: record for record in records}
    plan = read_json(downloads / "native-plan.json")
    overlays = []
    for component in plan:
        source = downloads / component["file"]
        algorithm, expected = component["integrity"].split("-", 1)
        if algorithm != "sha512":
            raise ValueError("Native package requires locked SHA-512 integrity")
        verify(source, algorithm, expected)
        with tarfile.open(source) as packed:
            manifest = json.load(packed.extractfile("package/package.json"))
        if (manifest["name"], manifest["version"]) != (component["name"], component["version"]):
            raise ValueError("Native package identity mismatch")
        directory = f'node_modules/.eleckoi-packages/linux-arm64/node_modules/{component["name"]}'
        record = {"name": component["name"], "version": component["version"], "directory": directory, "workspace": False, "dependencies": []}
        if directory in by_directory:
            raise ValueError("Duplicate native overlay directory")
        records.append(record)
        by_directory[directory] = record
        for owner in component["owners"]:
            parent = by_directory[owner["directory"]]
            if (parent["name"], parent["version"]) != (owner["name"], owner["version"]):
                raise ValueError("Native package owner mismatch")
            parent["dependencies"] = [edge for edge in parent["dependencies"] if edge["name"] != component["name"]]
            parent["dependencies"].append({"name": component["name"], "directory": directory})
        overlays.append((source, directory, manifest, record))
    canonicalize_native_records(records, overlays)
    by_directory = {record["directory"]: record for record in records}
    resolve_native_dependencies(records, overlays)
    sqlite = [record for record in records if record["name"] == "better-sqlite3"]
    if len(sqlite) != 1 or sqlite[0]["version"] != lock["sqlite"]["version"]:
        raise ValueError("SQLite closure differs from pinned ARM64 binary")
    attachment = read_json(REPO / "native/android-runtime/attachment-storage-lock.json")
    owners = [record for record in records if record["name"] == attachment["package"]]
    dependency = attachment["helperDependency"]
    helpers = [record for record in records if record["name"] == dependency["name"]]
    if (len(owners) != 1 or owners[0]["version"] != attachment["version"]
            or len(helpers) != 1 or helpers[0]["version"] != dependency["version"]):
        raise ValueError("Android attachment helper dependency differs from the lock")
    owners[0]["dependencies"].append({"name": dependency["name"], "directory": helpers[0]["directory"]})
    with archive(output, compresslevel=compresslevel) as packed:
        for record in inventory["packages"]:
            source = closure / record["directory"]
            if source.is_dir():
                add_directory(packed, source, record["directory"], record["name"])
        for source, directory, manifest, _ in overlays:
            unsupported = {
                "@koromix/koffi-linux-arm64": "musl_arm64",
                "@deepseek-ai/node-addon-system-linux-arm64": "bin/musl",
            }.get(manifest["name"])
            def native_name(name):
                relative = name.removeprefix("package/")
                if unsupported and (relative == unsupported or relative.startswith(unsupported + "/")):
                    return None
                return posixpath.join(directory, relative)
            with tarfile.open(source) as native:
                transfer(native, packed, native_name)
        with tarfile.open(downloads / lock["sqlite"]["file"]) as native:
            transfer(native, packed, lambda name: posixpath.join(sqlite[0]["directory"], name))
        links = {}
        for record in records:
            for edge in record["dependencies"]:
                if edge["directory"] not in by_directory:
                    raise ValueError(f"Unresolved packaged dependency: {edge}")
                links[posixpath.join(record["directory"], "node_modules", edge["name"])] = edge["directory"]
        # Koffi 3.1.1 resolves its platform package adjacent to the real package directory.
        for record in records:
            if record["name"] != "koffi":
                continue
            if record["version"] != "3.1.1":
                raise ValueError("Review the exact Koffi loader contract before changing its ARM64 version")
            edge = next(edge for edge in record["dependencies"] if edge["name"] == "@koromix/koffi-linux-arm64")
            sibling = posixpath.join(posixpath.dirname(record["directory"]), edge["name"])
            if sibling in links and links[sibling] != edge["directory"]:
                raise ValueError("Koffi native platform path has conflicting versions")
            links[sibling] = edge["directory"]
        names = {}
        for record in records:
            names.setdefault(record["name"], []).append(record)
        for name, candidates in names.items():
            path = posixpath.join("node_modules", name)
            if path not in links and len(candidates) == 1:
                links[path] = candidates[0]["directory"]
        # Import the application through its own package exports at the installation root.
        links["node_modules/@eleckoi/android-host"] = ""
        for name, target in sorted(links.items()):
            item = tarfile.TarInfo(name)
            item.type, item.mode = tarfile.SYMTYPE, 0o777
            item.linkname = posixpath.relpath(target or ".", posixpath.dirname(name))
            packed.addfile(item)
        resources = REPO / "apps/desktop/resources/dsh"
        for file in sorted(resources.rglob("*")):
            if not file.is_file() or file.parent.name == "node-bin":
                continue
            name = file.relative_to(resources).as_posix()
            value = file.read_bytes()
            if name == "agent-preset-template/agent.cordis.yml":
                value = value.replace(b"tool-pwsh", b"tool-bash")
            elif name == "runtime-manifest.json":
                manifest = json.loads(value)
                manifest["androidProfile"] = manifest.pop("desktopProfile")
                manifest["androidProfile"]["name"] = "android"
                manifest["presetPlugins"] = [name.replace("tool-pwsh", "tool-bash") for name in manifest["presetPlugins"]]
                manifest["capabilities"].pop("powershell")
                manifest["capabilities"]["bash"] = True
                value = (json.dumps(manifest, indent=2) + "\n").encode()
            add_bytes(packed, "resources/dsh/" + name, value)
        add_bytes(packed, "bin/eleckoi-host.mjs", b"import '@eleckoi/android-host/host'\n")
        add_bytes(packed, "bin/android-node-bootstrap.cjs", (REPO / "native/android-runtime/glibc-node-bootstrap.cjs").read_bytes())
        add_bytes(packed, "production-closure.json", (json.dumps(inventory, indent=2) + "\n").encode())


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--build-dir", type=Path, default=REPO / "build/android-runtime")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--development", action="store_true")
    args = parser.parse_args()
    base = args.build_dir.resolve()
    downloads, closure, output = base / "downloads", base / "closure", base / "archives"
    output.mkdir(parents=True, exist_ok=True)
    if args.verify_only:
        verify_archives(output)
        return
    lock = read_json(REPO / "scripts/android-runtime/runtime-base-lock.json")
    for kind in ("rootfs", "node", "sqlite"):
        verify(downloads / lock[kind]["file"], "sha256", lock[kind]["sha256"])
    recipe = [Path(__file__), REPO / "scripts/android-runtime/runtime-base-lock.json"]
    provenance_path = REPO / "apps/android/app/src/main/assets/licenses/glibc/execution-provenance.json"
    glibc = base / "glibc-probe/portable"
    def rootfs(destination):
        with tarfile.open(downloads / lock["rootfs"]["file"]) as source, archive(destination) as packed:
            transfer(source, packed, lambda name: name, guest_root=True)
            provenance = read_json(provenance_path)
            expected = {record["path"]: record for record in provenance["outputs"]}
            for file in sorted((glibc / "usr/glibc/lib").glob("*")):
                record = expected[file.relative_to(REPO).as_posix()]
                verify(file, "sha256", record["sha256"])
                add_bytes(packed, file.relative_to(glibc).as_posix(), file.read_bytes(), 0o755)
            if len(list((glibc / "usr/glibc/lib").glob("*"))) != 9:
                raise ValueError("Android glibc requires eight locked libraries and its execution helper")
    build_archive(output / "rootfs.tar.gz", [*recipe, downloads / lock["rootfs"]["file"], provenance_path, glibc],
                  rootfs, reuse=args.development)
    prefix = f'node-v{lock["node"]["version"]}-linux-arm64'
    def node_name(name):
        if name == prefix:
            return "usr"
        if not name.startswith(prefix + "/"):
            raise ValueError(f"Unexpected Node archive root: {name}")
        return "usr/" + name[len(prefix) + 1:]
    def node(destination):
        with tarfile.open(downloads / lock["node"]["file"]) as source, archive(destination) as packed:
            transfer(source, packed, node_name)
    build_archive(output / "node.tar.gz", [*recipe, downloads / lock["node"]["file"]], node, reuse=args.development)
    build_archive(output / "app.tar.gz", [], lambda destination:
                  package_app(closure, downloads, destination, lock, compresslevel=1 if args.development else 6))
    git_lock_path = REPO / "scripts/android-runtime/git-tools-lock.json"
    git_inputs = [*recipe, git_lock_path, downloads / lock["rootfs"]["file"],
                  *[downloads / spec["file"] for spec in read_json(git_lock_path)["packages"]]]
    build_archive(output / "git.tar.gz", git_inputs, lambda destination: package_git(downloads, destination),
                  reuse=args.development, extras=[REPO / "apps/android/app/src/main/assets/licenses/git-tools"])
    verify_archives(output)


def verify_archives(output):
    provided, requirements = set(), []
    for path in [output / name for name in ("app.tar.gz", "node.tar.gz", "rootfs.tar.gz", "git.tar.gz")]:
        native_count = 0
        with tarfile.open(path) as packed:
            if path.name == "app.tar.gz":
                spec = read_json(REPO / "native/android-runtime/session-publication-lock.json")
                inventory = json.load(packed.extractfile("production-closure.json"))
                verify_workspace_entrypoints(packed, inventory)
                verify_shared_asset_layout(packed, inventory)
                owners = [record for record in inventory["packages"] if record["name"] == spec["package"]]
                if len(owners) != 1 or owners[0]["version"] != spec["version"]:
                    raise ValueError("Packaged Android Session identity differs from the lock")
                owner = owners[0]["directory"]
                source = output.parent / "closure" / owner / spec["file"]
                actual = packed.extractfile(posixpath.join(owner, spec["file"])).read()
                if actual != patch_session_publication(source.read_bytes()):
                    raise ValueError("Packaged Android Session publication patch differs from its locked source")
                helper = posixpath.join(owner, posixpath.dirname(spec["file"]), spec["helper"])
                if packed.extractfile(helper).read() != (REPO / "native/android-runtime" / spec["helper"]).read_bytes():
                    raise ValueError("Packaged Android Session publication helper differs from its source")
                spec = read_json(REPO / "native/android-runtime/attachment-storage-lock.json")
                owners = [record for record in inventory["packages"] if record["name"] == spec["package"]]
                if len(owners) != 1 or owners[0]["version"] != spec["version"]:
                    raise ValueError("Packaged Android attachment identity differs from the lock")
                owner = owners[0]["directory"]
                source = output.parent / "closure" / owner / spec["file"]
                if packed.extractfile(posixpath.join(owner, spec["file"])).read() != patch_attachment_storage(source.read_bytes()):
                    raise ValueError("Packaged Android attachment patch differs from its locked source")
                dependency = spec["helperDependency"]
                helpers = [record for record in inventory["packages"] if record["name"] == dependency["name"]]
                if (len(helpers) != 1 or helpers[0]["version"] != dependency["version"]
                        or {"name": dependency["name"], "directory": helpers[0]["directory"]} not in owners[0]["dependencies"]):
                    raise ValueError("Packaged Android attachment helper dependency differs from the lock")
                for name in spec["helpers"]:
                    helper = posixpath.join(owner, posixpath.dirname(spec["file"]), name)
                    if packed.extractfile(helper).read() != (REPO / "native/android-runtime" / name).read_bytes():
                        raise ValueError("Packaged Android attachment helper differs from its source")
            for item in packed:
                provided.add(posixpath.basename(item.name))
                if item.islnk():
                    raise ValueError(f"Hard link in final archive: {item.name}")
                if item.isfile():
                    with packed.extractfile(item) as data:
                        header = data.read(64)
                        if header[:4] == b"\x7fELF":
                            check_elf(header, item.name)
                            native_count += 1
                            requirements.extend((item.name, library) for library in elf_dependencies(header + data.read()))
        print(f"Verified {path.name}: {path.stat().st_size} bytes, {native_count} ARM64 ELF files", flush=True)
    missing = [(owner, library) for owner, library in requirements if library not in provided]
    if missing:
        raise ValueError(f"Guest ELF shared libraries missing from distribution: {missing}")


if __name__ == "__main__":
    main()
