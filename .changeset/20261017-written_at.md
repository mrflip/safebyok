---
'safebyok': minor
'safebyok-convex': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
---

**Stored shape: a lockbox's `changed_at` becomes `written_at`, stamped by every store.** It says when the lockbox was last written, never whether its whisper changed: storing the same whisper again moves it too. `store()` no longer compares the new whisper with the old. The lockbox's format is `safebyok-lockbox-v4`. No lockbox written before this reads: no compatibility before 1.0. A `safebyok-lockbox-v3` lockbox lists as damaged (`{ boxlabel, damaged: true, revision_id }`) and `read()` refuses it as `damaged_lockbox`; `erase()` it, or `store()` over it, which writes it afresh, carrying neither its public bag nor its `registered_at`. The bundle, the unlock envelopes and the device records are unchanged, so a vault still opens and unlocks.

- **`safebyok`**: `Lockbox` and `LockboxSummary` carry `written_at` in place of `changed_at`; a snapshot's `boxes` say `box.written_at`.
- **`safebyok-convex`**: the component's lockbox validator takes `safebyok-lockbox-v4` only, with `written_at` in place of `changed_at`, so a deployment holding lockboxes written before this no longer matches its schema: delete the component's lockbox rows (or clear its tables) before deploying it.
- **`safebyok-postgres`**: `safebyok_lockboxes` has `written_at bigint NOT NULL` in place of `changed_at`. `VaultTablesSql` creates only missing tables, so rename the column of a table made before this (`ALTER TABLE safebyok_lockboxes RENAME COLUMN changed_at TO written_at`), or drop and recreate it; its old lockboxes list as damaged either way.
- **`safebyok-graphql`**: `SafebyokLockbox`, `SafebyokLockboxInput` and `SafebyokListedLockbox` have `written_at: Float!` in place of `changed_at`. A host serving the recipe's SDL deploys the new one with its server.
