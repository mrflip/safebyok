# 20261014-convex: resolution

The Convex VaultDB adapter's design and the whisper size cap: [#7](https://github.com/mrflip/safebyok/pull/7) (`maxWhisperBytes`, adapters declare `maxRecordBytes`) and [#8](https://github.com/mrflip/safebyok/pull/8) (the design, the `safebyok-convex` scaffold and TODOs), stacked. Gripes from its whiteboard files, its -human reports and its PRs, as consolidated in `whiteboard/20261016-gripes_boogaloo/` (2026-10-16).

8 gripes: 2 unresolved, 6 resolved.

## Unresolved

- G251 Run Convex codegen against a real deployment (`ComponentApi` is derived, `_generated/` from templates) — old_gripes, whiteboard_gripes
- G259 Update whiteboard/20261014-convex/design.md's header, which still says "Intent, not yet code." — old_gripes

## Resolved

- G077 Close the vault_id hole (a box from a destroyed vault landing in its recreation) → `vault_id` expectations on writes and erases (PR#18)
- G081 Name the storage-trouble kinds, list every kind (vault_full included) with a family, split misuse from conditions → done (PR#18, PR#50, PR#54, PR#61)
- G219 Give the component a publishable `dist/` per module with `convex.config` and `_generated/`, `.claude/` kept out of the tarball → `files: [dist, src]`, released as 0.1.0 (PR#41)
- G220 Codegen and Convex skills without a deployment; nothing should run `npx convex dev` → templates run offline, skills vendored and edited (PR#17, PR#19)
- G309 VaultProvider drops an `openVault` rejection → thrown to the error boundary (PR#32), conditions handed down as `openError` with `retryOpen()` (PR#61)
- G470 Land the renames that break after 0.1.0 before it: `keyDeriver` required, `rememberForMs` to `forcePassphraseReentryHours` (VaultProvider prop too), `expiresAt` to `askPassphraseAt` → done (PR#40)
