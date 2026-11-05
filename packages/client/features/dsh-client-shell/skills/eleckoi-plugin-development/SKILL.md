---
name: eleckoi-plugin-development
description: Use whenever creating, reviewing, configuring, installing, or debugging a DSH plugin in this ElecKoi application. Supplements cordis-plugin-development with ElecKoi's public UI Slots, services, Remote APIs, product data ownership, and local development reference. Read this before implementing an ElecKoi extension.
---

# ElecKoi plugin development

Use the shipped `cordis-plugin-development` skill for the official DSH workflow, templates, runtime inspection, and Plugin Manager. This skill adds ElecKoi-specific contracts; it does not replace the official skill or grant extra permissions.

## Read the relevant product reference

The `references/` directory is generated from ElecKoi's maintained `docs/plugins/` documentation. Read files through the Host file-read tool. In a packaged desktop application these files may be inside `app.asar`; shell tools cannot read that archive as an ordinary directory. Do not assume the ElecKoi source repository exists in the selected workspace. Source-relative links in these documents refer to a source checkout; installed runtime inspection and exported declarations remain authoritative.

- Start with `references/README.md`, `references/architecture.md`, and `references/quick-start.md`.
- UI extension: `references/ui-slots.md`, then the exact methods/types in `references/api-client.md` and `references/types-client.md`.
- Host or product operations: `references/services.md`, `references/api-host.md`, and `references/types-host.md`.
- Cross-boundary calls: `references/remote.md` and `references/api-remote.md`.
- Discover product extension points: `references/api-reference.md`. This is an index; verify the exact live API before using it.
- Packaging and lifecycle: `references/manifest.md`, `references/lifecycle-and-data.md`, and `references/testing.md`.
- Preset tools and Studio: `references/preset-tools.md` and `references/creator-studio-tools.md`.

## Product-specific rules

1. Target the bundled DSH version stated by the reference and runtime. Use the current public Cordis, Slots, and generated Remote contracts. Do not inspect private module-loader state, replace services behind the framework, or bundle a second React/Cordis runtime.
2. Keep Host and Client separate. Client UI uses public Slots and `ctx.remote`; it cannot import Electron, Node, SQLite, or a private browser bridge. Host services expose cross-boundary operations through Typert `@Remote` / `@RemoteScope` and generated Client contributions.
3. Product SQLite belongs exclusively to `@eleckoi/dsh-product-data` in the Host. Use existing public product APIs for characters, setting libraries, variables, presets, scripts, and chat indexes. Do not open the database or depend on its schema from a plugin.
4. DSH owns Session logs, Agent lifecycle, Workspace sessions, permissions, credentials, and installed bundle state. Roleplay and ElecKoi Creator Studio are product-specific session flows; creating an ordinary plugin must not bind it to a roleplay chat or rewrite its history.
5. A generic DSH UI can use official navigation slots. Extending an ElecKoi roleplay page, editor, or Studio requires its documented product Slot and owner props. Preserve the existing fallback when adding content rather than replacing that surface.
6. Respect the current permission selection. Author the plugin in the selected workspace and install through the official Plugin Manager. Do not edit profile files or silently switch to Full access.
7. Test the actual installed capability, unload/re-enable and Session restoration where relevant. Installation or successful registration alone does not prove the visible UI or product operation works. Use synthetic data; preserve existing user data.

After reading these rules, inspect the exact live Host services, Client Slots, and Config schemas with `cordis_inspect_list` and targeted `cordis_inspect_query` calls, then follow the official plugin skill's implementation and installation workflow.
