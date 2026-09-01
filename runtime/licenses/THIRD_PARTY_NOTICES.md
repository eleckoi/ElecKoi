# ElecKoi local runtime third-party notices

This directory is packaged into the APK. It covers the native host plus the pinned Linux and Agent Harness components shipped with ElecKoi. It does not select or change the license of ElecKoi itself.

## Native host shipped in the APK

### PRoot 5.1.107.84

- License: GPL-2.0
- Upstream: https://github.com/termux/proot/tree/v5.1.107.84
- Verified source SHA-256: `a44ddbf18bc72c9780d56948b03aeda6d285392503ece0cae17cfc02e7bc7928`
- License text: `proot-GPL-2.0.txt`
- ElecKoi modification: the packaged `libtalloc.so.2` dependency string is shortened to `libtalloc.so`; its runtime loader and temporary-directory fallbacks are overridden with app-owned paths.

### talloc 2.4.3 shared library

- Upstream library license: LGPL-3.0-or-later
- Upstream: https://www.samba.org/ftp/talloc/talloc-2.4.3.tar.gz
- Verified source SHA-256: `dc46c40b9f46bb34dd97fe41f548b0e8b247b77a918576733c528e83abd854dd`
- License text: `talloc-LGPL-3.0.txt`
- Incorporated GNU GPL version 3 text: `GPL-3.0.txt`
- The audited Termux package recipe declares GPL-3.0. ElecKoi records that package declaration separately from the license stated by the library source itself.
- ElecKoi modification: the ELF SONAME is shortened from `libtalloc.so.2` to `libtalloc.so` for Android APK packaging.

### libandroid-shmem 0.7

- License: BSD-3-Clause
- Upstream: https://github.com/termux/libandroid-shmem/tree/v0.7
- Verified source SHA-256: `1e5ff8459bc0a8c229dd8a94b27d119987e09ef3414331c2b5ebfff20b98e867`
- License text: `libandroid-shmem-BSD-3-Clause.txt`
- ElecKoi modification: rebuilt with the pinned patch `runtime/host/patches/libandroid-shmem-runtime-dir.patch`, which resolves key files through an app-provided writable directory instead of embedding Termux's private package path.

The exact Termux package-recipe commit, source and binary hashes, patch hash, NDK version, reproducible build script, and generated output hashes live under `runtime/host/` in the corresponding ElecKoi source tree. Anyone distributing an APK must publish that matching source tree and build material with the release; a binary-only APK is not the complete GPL/LGPL distribution package.

## Packaged Linux and Agent Harness components

### DeepSeek Harness 0.1.1-rc.2

- License: MIT
- Source commit: `b150a551b8d465e31e418e1b2eaf5e79bbb7d28e`
- Upstream: https://github.com/deepseek-ai/deepseek-harness
- ElecKoi bundle: `deepseek-harness-0.1.1-rc.2-eleckoi.3-arm64.egruntime`
- ElecKoi source patch: `runtime/deepseek/patches/0001-sdk-session-control.patch` (SHA-256 `38e15ec5bd3ec8d0b6e9ea801b469386ced8d4d007097e6c9ed483b45075ae17`)
- License text: `deepseek-harness-MIT.txt`; the upstream license and complete upstream dependency notice are also retained inside the Harness bundle under `licenses/deepseek-harness/`.
- Packaging: built with upstream `scripts/build-exe-for-python-sdk.ts`, using ElecKoi's stdout-clean Cordis composition and pinned ARM64 build inputs.

### Node.js 24.19.0 embedded in the DeepSeek Harness executable

- License: MIT for Node.js itself, with separately licensed bundled dependencies listed in Node.js's complete `LICENSE` file.
- Source tag: `v24.19.0`
- Upstream: https://github.com/nodejs/node/tree/v24.19.0
- Download: https://nodejs.org/download/release/v24.19.0/node-v24.19.0-linux-arm64.tar.gz
- Verified archive SHA-256: `d28c8a5bf0a808f0ed434a1dce8c54ae98f0371c0bd86ac58abc613f73e6643f`
- The complete license record from that exact archive is retained inside the Harness bundle at `licenses/node/LICENSE`.

### sharp-libvips Linux ARM64 1.3.2

- Package: `@img/sharp-libvips-linux-arm64@1.3.2`
- License: LGPL-3.0-or-later
- Upstream: https://github.com/lovell/sharp-libvips
- The pinned package integrity is recorded by the patched DeepSeek Harness lockfile.
- The shared library is retained inside the Harness bundle under `lib/sharp/`; the LGPL-3.0 text is retained at `licenses/sharp-libvips/LGPL-3.0.txt` (the same verbatim license text as `talloc-LGPL-3.0.txt`).

### @vscode/ripgrep Linux ARM64 1.18.0

- Package: `@vscode/ripgrep-linux-arm64@1.18.0`
- Archive: `https://registry.npmjs.org/@vscode/ripgrep-linux-arm64/-/ripgrep-linux-arm64-1.18.0.tgz`
- Archive SHA-256: `2d65504a71ea421d1c457177ebefcbe0d2d3a1f60f9709b6337f1d933553064b`
- Packaged `bin/rg` SHA-256: `e152ea689d6e8420357e592f0d8253b96476c164118ca3e6e13074fa1705ddda`
- License: MIT

The runtime uses this pinned executable for both official DSH `glob`/`grep` and ElecKoi virtual-setting search. Its exact package license is retained at `licenses/ripgrep/LICENSE`; DeepSeek Harness' generated dependency notice also records the package.

### Node.js 24.18.0 ARM64

- License: MIT for Node.js itself, with separately licensed bundled dependencies listed in Node.js's complete `LICENSE` file.
- Source tag: `v24.18.0`
- Source commit: `20da4aeadabc5b0a01e3fcf520f91df8285c68a2`
- Upstream: https://github.com/nodejs/node/tree/v24.18.0
- Download: https://nodejs.org/download/release/v24.18.0/node-v24.18.0-linux-arm64.tar.gz
- Verified archive SHA-256: `6b4484c2190274175df9aa8f28e2d758a819cb1c1fe6ab481e2f95b463ab8508`
- The official archive's complete license record is retained after installation at `toolchain/node/LICENSE`; the installer rejects a Node archive that does not provide this file.

### pnpm 11.4.0 ARM64

- License: MIT
- Source tag: `v11.4.0`
- Source commit: `72d997cc34d1390a6300ffbde77b49699e0919e8`
- Upstream: https://github.com/pnpm/pnpm/tree/v11.4.0
- Download: https://github.com/pnpm/pnpm/releases/download/v11.4.0/pnpm-linux-arm64.tar.gz
- Verified archive SHA-256: `cc38ebd5b2610a5744f84576b963c49e6609a8df5aed714ae3de749998d4478c`
- License text: `pnpm-MIT.txt`

### Ubuntu Base 24.04.4 ARM64

- Upstream: https://cdimage.ubuntu.com/ubuntu-base/releases/noble/release/
- Verified archive SHA-256: `04207713ece899c3740823d33690441ad3a7f0ded1101aca744e2b0f37ac7ff2`
- Ubuntu Base contains independently licensed packages. Their package-specific copyright and license records remain inside the installed root filesystem under `/usr/share/doc/*/copyright`.

### Ubuntu ca-certificates 20260601~24.04.1

- Upstream package: https://security.ubuntu.com/ubuntu/pool/main/c/ca-certificates/ca-certificates_20260601~24.04.1_all.deb
- Verified package SHA-256: `6bac2a01979e210d9eac1d4d56747ec709ea60654744d66705dc3c36e7629e50`
- The package's complete copyright and licensing record is retained in the DSH runtime bundle at `runtime-resources/ca-certificates/copyright`.
- ElecKoi deterministically concatenates the package's Mozilla-format root certificates into `ca-certificates.crt`; it does not add a project-specific or developer-specific certificate.

The runtime catalog at `runtime/catalog/runtime-catalog.json` is the authoritative machine-readable record of downloaded artifact versions, URLs and archive hashes. The source commits above identify the corresponding upstream source revisions; an archive SHA-256 identifies the exact distributed binary archive and is not interchangeable with a source commit.
