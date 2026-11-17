# 2026-10-14: Convex adapter designed; whisper cap in PR #7 -- nothing waiting on you

Two PRs, stacked: #7 (`20261014-whisper-cap`) on #6, then #8 (`20261014-convex`) on #7. Each was
built in its own worktree (`/workspace/safebyok-whisper-cap`, `/workspace/safebyok-convex`), so the
agent in `/workspace/safebyok` was undisturbed.

* **#7**: `openVault({ maxWhisperBytes })`, default `MaxWhisperBytes = 40_444`, checked on write
  only; every VaultDB declares `maxRecordBytes`, and openVault refuses a `maxWhisperBytes` over half
  of it; `VaultProvider` passes every openVault option through as given.
* **#8**: the Convex design (`winboard/20261014-convex/design.md`), the `safebyok-convex` package
  scaffold (dependencies only), and TODOs.

## Settled in chat

* `MaxWhisperBytes = 40_444 // searchable: 40444`.
* `localVaultDB` declares 1 MiB per record; `idbVaultDB` declares `Infinity`.
* The vault_id hole (a box from a destroyed vault landing in its recreation) is the storage
  thread's to close.
* `VaultProvider`'s swallowed openVault rejection becomes the error-families TODO: misuse is
  thrown loud, during render, to an error boundary; conditions go through the context.

## For whoever picks these up

* The `rememberForMs` rename (rulings) must also rename the `VaultProvider` prop: the provider's
  `satisfies Record<keyof OpenVaultOpts, unknown>` fails the build until it does.
* The storage rework (adapter-implemented verbs) and #7's `maxRecordBytes` both touch
  `src/vault-db.ts`; whichever lands second rebases.
