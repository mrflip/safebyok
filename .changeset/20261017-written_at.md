---
'safebyok': minor
'safebyok-convex': minor
'safebyok-postgres': minor
'safebyok-graphql': minor
'safebyok-react': patch
---

**Stored shape: a lockbox's `changed_at` becomes `written_at`, stamped by every store.** It says when the lockbox was last written, never whether its whisper changed: storing the same whisper again moves it too. `store()` no longer compares the new whisper with the old. The lockbox's format is `safebyok-lockbox-v4`. No lockbox written before this reads: no compatibility before 1.0. A `safebyok-lockbox-v3` lockbox lists as damaged (`{ boxlabel, damaged: true, revision_id }`) and `read()` refuses it as `damaged_lockbox`; `erase()` it, or `store()` over it, which writes it afresh, carrying neither its public bag nor its `registered_at`. The bundle, the unlock envelopes and the device records are unchanged, so a vault still opens and unlocks.

- **`safebyok`**: `Lockbox` and `LockboxSummary` carry `written_at` in place of `changed_at`; a snapshot's `boxes` say `box.written_at`.
- **`safebyok-convex`**: the component's lockbox validator takes `safebyok-lockbox-v4` only, with `written_at` in place of `changed_at`, so a deployment holding lockboxes written before this no longer matches its schema: delete the component's lockbox rows (or clear its tables) before deploying it.
- **`safebyok-postgres`**: `safebyok_lockboxes` has `written_at bigint NOT NULL` in place of `changed_at`. A database made before this release drops the tables and lets `VaultTablesSql` make them afresh, as this release's entry "The vocabulary reform, in one place" says.
- **`safebyok-graphql`**: `SafebyokLockbox`, `SafebyokLockboxInput` and `SafebyokListedLockbox` have `written_at: Float!` in place of `changed_at`. A host serving the recipe's SDL deploys the new one with its server.

**New kind, `storage_blocked`**, a condition: this device's own store refused for a reason that holds until something outside the app changes -- the browser withholding storage from the page (a `SecurityError`: site data blocked, a sandboxed frame), no room in it (a `QuotaExceededError`: a quota of zero, as some private windows give, or a full disk), or no IndexedDB at all. `idbDeviceDB` now refuses at its first use with a `NotSupportedError` where there is no IndexedDB, rather than a `ReferenceError` or `TypeError`. Every other failure of the device store is still `storage_unavailable`, which a retry may mend. A host meets `storage_blocked` where it met `storage_unavailable` before -- most often from `openVault`, which reads the device's mark of the vault -- and should stop offering a retry: tell the user, and, if it likes, open the vault with `memoryDeviceDB()`, which remembers no unlock on this device. A host switching exhaustively on kinds adds a case.

**A write's catch-up passes the real refusal through.** When storage refuses a write as stale and the catch-up that follows is refused as `identity_revoked`, `rolled_back` or `newer_format`, the write (`store()`, `erase()`, a change to the ways in, `destroy()`) now throws that refusal as it came, rather than `stale_write` with it as the `cause`: the user signs in again, storage wants looking at, or the app wants updating. Any other failed catch-up is still `stale_write`, its failure the `cause`.

**`erase()` into a vault deleted and made anew elsewhere** is still `stale_write`, and now says what happened: the lockbox's contents could not be erased because the vault it was in is gone. The adapter's refusal is its `cause`.

- **`safebyok-react`**: its README says a `storage_blocked` open error is not one to offer `retryOpen()` for.
