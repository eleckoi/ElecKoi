# Model icon provenance

Audit reference: LobeHub `lobe-icons` commit `918a629a17684ed8765993d346def1fbd457c514`, https://github.com/lobehub/lobe-icons. The following files matched the referenced upstream SVGs byte-for-byte during the 2026-07-15 compliance audit:

| Local file | Upstream file | SHA-256 |
| --- | --- | --- |
| `claude.svg` | `packages/static-svg/icons/claude-color.svg` | `a3101f3047a119aa11825ad9369510f0c472428c8c52d420e31bc62db44a8364` |
| `custom.svg` | `packages/static-svg/icons/claudecode-color.svg` | `670b3d8d749d0815ad8f7e62a59d51cb5e2053cb19403f3541a8aed7036a877f` |
| `deepseek.svg` | `packages/static-svg/icons/deepseek-color.svg` | `deba5f98a5c1796e20fcac3149bcd7eb8a32f0bdd04d048819400b1f28bd1439` |
| `gemini.svg` | `packages/static-svg/icons/gemini-color.svg` | `8ab0a9bafec11f7e69bcb9fc4ffd8f1bc927d1ddcbbb6ff36dee5ae8b5a9d602` |
| `grok.svg` | `packages/static-svg/icons/grok.svg` | `9175fc90c22655160231976c849f25a03b888d7cc0e04c5f1b987b659bb07c95` |
| `openai.svg` | `packages/static-svg/icons/openai.svg` | `a595df6b423920c67a7f8f73c063e4bfb72d415948097b6cac063a2366bb5186` |
| `zhipu.svg` | `packages/static-svg/icons/zhipu-color.svg` | `3a0e993946e43e227f10414df38c29b9eae247218dd750815595583485d1beb1` |
| `zai.svg` | `packages/static-svg/icons/zai.svg` | `228b8c96c91242a0cd42ff53880b1b486e60e70294939cd67a6f952d5c389680` |
| `moonshot.svg` | `packages/static-svg/icons/moonshot.svg` | `4b1288c76220e999fa7033a72e4a8f6d477b17b0cb863ada53a40a41220ede61` |

The following provider-identification icons were imported from Lobe Icons commit `4aaf4ee1fb2678a7f989ea570f0f6ce14a9abf75` on 2026-09-04. The local assets normalize the upstream files with one trailing line feed:

| Local file | Upstream file | Local SHA-256 |
| --- | --- | --- |
| `kimi.svg` | `packages/static-svg/icons/kimi.svg` | `adda73bc0201816bae3175003a6b925a227fccacec5ee07c10c7c354c73292ff` |
| `novelai.svg` | `packages/static-svg/icons/novelai.svg` | `ce91ef11bf9a8ca38166a3b6cca7b5afc8c3f9367c6fc70a216aefd66f34c5e5` |

The matching Lobe Icons license is packaged as `lobe-icons.MIT.txt`. Copyright permission for the SVG files is separate from any provider trademark or brand-policy permission.

## ElecKoi whale-maid thinking mascot

The following first-party thinking-indicator frames were generated for ElecKoi on 2026-08-19 with OpenAI's built-in image generation tool, using character references supplied by the project owner. On 2026-08-20 the approved frames were deterministically converted to native 64 x 64 pixel sprites with a shared maximum 24-color palette, no dithering, and hard alpha. The production prompt and transformation notes are archived in `docs/design-assets/whale-maid-thinking-icon.md`.

- `whale-maid-thinking.png`: `10f40a4e521481270041c24e9cb5cf866d67f4e25d8c56b9b8303722a4e43e12`
- `whale-maid-thinking-half.png`: `bfb425950e188a0fdf245f63f0bb2fc276482082e8a02f38480db29ba01f4f44`
- `whale-maid-thinking-closed.png`: `e59365298e01682581f959808e29ef32fc1e6a7ffcd7188b4c832e5cc1f4bc6b`

The following big-head frames are deterministic 54 x 54 crops from `(5, 0)` to `(59, 54)` of the corresponding low-resolution frames above; they introduce no additional generated source:

- `whale-maid-thinking-head.png`: `a2d51b726a95a0d0a2e5fd73116fbc5e073d56f5fcccaecb28d77f687dacf3c3`
- `whale-maid-thinking-head-half.png`: `6d9e48dcf2a837b14b3316c6ceb9de8400eaa45eaa8cff82e52ae72942e8e2fc`
- `whale-maid-thinking-head-closed.png`: `db21bfcb939144c1173d2946e0225d5542bb8cab7118d342e4fa9083db086bc1`
