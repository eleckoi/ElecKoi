# ElecKoi Android third-party notices

This file covers the libraries and reusable visual assets packaged by the Android app. It does not select or change the license of ElecKoi itself. The exact resolved Maven artifact list and SHA-256 hashes are in `maven-release-runtime-components.txt` beside this file.

## Maven runtime libraries

The following component families are licensed under Apache License 2.0. The complete Apache-2.0 terms are packaged as `Apache-2.0.txt` in the APK's asset root.

- AndroidX, AndroidX Compose, Material Icons and AndroidX lifecycle/navigation/data libraries (`androidx.*`), https://github.com/androidx/androidx
- Kotlin, kotlinx libraries, JetBrains Compose and JetBrains annotations (`org.jetbrains.*`), https://github.com/JetBrains/kotlin and https://github.com/JetBrains/compose-multiplatform
- Coil 3.5.0 (`io.coil-kt.coil3:*`), https://github.com/coil-kt/coil
- Reorderable 3.1.0 (`sh.calvin.reorderable:*`), https://github.com/Calvin-LL/Reorderable
- AndroidSVG 1.4 (`com.caverock:androidsvg-aar`), https://github.com/BigBadaboom/androidsvg
- Okio 3.17.0 (`com.squareup.okio:*`), https://github.com/square/okio
- Google Accompanist (`com.google.accompanist:*`), Guava and its Google annotation helpers (`com.google.*` in the generated inventory), https://github.com/google/guava
- Apache Commons Compress 1.28.0, Codec 1.19.0, IO 2.20.0 and Lang 3.18.0, https://commons.apache.org/; required attributions are in `apache-commons.NOTICE.txt`
- JSpecify 1.0.0 (`org.jspecify:jspecify`), https://github.com/jspecify/jspecify

Exceptions and additional licenses:

- AndroidX DataStore's repackaged Protocol Buffers runtime is BSD-3-Clause; see `androidx-datastore-protobuf.BSD-3-Clause.txt`.
- Checker Framework qualifiers 3.33.0 are MIT; see `checker-framework.MIT.txt`.
- Kotlin Multiplatform LaTeX Renderer 1.4.7 is MIT; see `latex-renderer.MIT.txt`.

## JavaScript and icon assets

- Zod 4.4.3 bundled variable runtime (bundle SHA-256 `25eb39724d74b22b922fb2cf064b63c1a5efe54c22786d3084fec86aac76689e`): MIT; see `variable-runtime/zod.LICENSE.txt`.
- Showdown 2.1.0 Markdown converter: MIT; see `showdown-2.1.0.MIT.txt`.
- DOMPurify 3.3.2 HTML sanitizer: Apache-2.0 OR MPL-2.0; see `dompurify-3.3.2.LICENSE.txt`.
- TanStack Virtual Core 3.17.8 transcript virtualizer: MIT; see `tanstack-virtual-core-3.17.8-MIT.txt`.
- Phosphor icon paths: MIT; see `phosphor-icons.LICENSE.txt`. The exact upstream source revision was not recorded when the paths were imported.
- Lucide-derived icon paths: ISC, with Feather-derived icons under MIT; see `lucide-icons.ISC-MIT.txt`. The exact imported source revision was not recorded; the packaged license text was audited against Lucide commit `b442632ee6fe6250bf24fef026e44244a33812c9` on 2026-07-15.
- Lobe Icons model-provider SVGs: MIT; see `lobe-icons.MIT.txt` and `MODEL_ICON_PROVENANCE.md`.
- GitHub Primer Octicons `mark-github-24`: MIT; see `primer-octicons.MIT.txt`. The GitHub logo is used to identify the GitHub project destination and does not imply endorsement.

Provider names and logos can also be protected trademarks. The Lobe Icons software license does not grant trademark rights or imply endorsement by OpenAI, Anthropic, Google, DeepSeek or xAI.

The packaged Linux and Agent Harness runtimes have their own notice files in the APK asset root. Native GPL/LGPL source-delivery obligations are described there and in the release compliance checklist in the corresponding source tree.
