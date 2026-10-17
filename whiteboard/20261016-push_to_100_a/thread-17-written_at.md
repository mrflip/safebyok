# Thread 17: written_at (2026-10-17)

Branch `20261017-written_at`, PR [#141](https://github.com/mrflip/safebyok/pull/141), stacked on
[#142](https://github.com/mrflip/safebyok/pull/142) (line main → #128 → #133 → #127 → #132 → #137
→ #136 → #126 → #129 → #134 → #130 → #131 → #139 → #142 → this): built from `9eb576a7`, rebased
onto thread 16's filed tip `23743f18` at filing. Justify green: core 2044, IDB 129, Postgres 247,
GraphQL 238, Convex 257, React 190, fastkey 49, demo 184, e2e 81 (Postgres suites skip without
`SAFEBYOK_PG_URL`), root 212. Size: `openVault` 27.31 of 30 kB, everything 34.5 of 40 kB,
`browserOpts` 18.07 of 20 kB, `VaultProvider` 4.53 of 4.7 kB; every line within budget.

**Review**: fixed -- four commits (twoDeviceWorld's doc block, a v3 lockbox in DamagedListings,
VOCABULARY's format tag, cipherBinding's tag), in the PR; its minors went to thread 9.

## The four rulings

1. **`changed_at` becomes `written_at`, no change-compare** -- **met**. `store()` stamps
   `written_at` on every write and compares nothing (`vault.ts`, `store`). Renamed in `Lockbox`
   and `LockboxSummary` (`types.ts`), `vault-db.ts`'s listing, the Convex validator, the Postgres
   column (`vault-tables.ts`, `vault-tables.sql`, `columns.ts`), the GraphQL types (`fields.ts`,
   `vault-schema.ts`), VOCABULARY.md (**writtenAt**), the READMEs' "in the open" lists, and the
   demo (KnockKnock's slot says "saved <date>"; the dashboard's column "written"). Format bumped
   to `safebyok-lockbox-v4`; its JSON Schema snapshot written anew, v3's dropped. An old v3 record
   fails validation, lists as **damaged** and reads as `damaged_lockbox` (the changeset says so).
2. **A kind of its own for a device store that cannot succeed until something outside changes**
   -- **met**: `storage_blocked` (`errors.ts`), beside `storage_unavailable`. The branch is in
   `asCondition` (`vault.ts`), by the browser error's `name`: `SecurityError`,
   `QuotaExceededError`, `NotSupportedError` → blocked; anything else (`InvalidStateError`,
   `UnknownError`, `AbortError`, a plain `Error`) → unavailable. Where the device store opens,
   `idbDeviceDB`'s shelf (`idb.ts`) throws a `NotSupportedError` DOMException when the context has
   no `indexedDB` (undefined or null), rather than a `ReferenceError`/`TypeError`.
   `DeviceTroubleSaid` now holds `{ failed, retry }` per verb, so both kinds keep the per-verb
   message. The kind's doc in `errors.ts` says which cases are which.
3. **`erase()` into a reborn vault keeps `stale_write`, and says what happened** -- **met**
   (`vault.ts`, `erase`): "The contents of that lockbox could not be erased, because the vault it
   was in is gone: it was deleted, or deleted and made anew, on another device...", the adapter's
   refusal its cause. It quotes no boxlabel, by the errors' standing rule (a host's boxlabel check
   may admit any text, a mistaken paste among it). Said only once caught up; a failed catch-up
   keeps the catch-up's own message.
4. **A store's catch-up passes `identity_revoked`, `rolled_back`, `newer_format` through** --
   **met**; thread 13 had not done it. `catchUp` throws those three as they came
   (`CatchUpPassesThrough`, `vault.ts`), for every write's catch-up, not only `store()`'s:
   `erase()`, the ways-in changes and `destroy()` share `refreshOnStale`.

## Decisions taken

* **The carry-forward decipher stays** (thread 2's rule), renamed `recordOpens` and returning a
  boolean: the old whisper is deciphered and dropped unread, only to vouch for the bag and
  `registered_at` it carries forward. Its purpose is integrity, not comparison; dropping it would
  either seal a planted bag under the vault's key or stop "a bag left out keeps the one it has".
  An alternative a reviewer may prefer: unwrap only the old lockboxKey, whose binding already
  covers the whole header, so `store()` never deciphers an old whisper at all. Not taken: it
  changes what "a record that opens" means. In `notes/security.md`.
* Kind name `storage_blocked`, not `device_storage_blocked`: it pairs with `storage_unavailable`,
  and a browser-storage vault adapter (`safebyok-indexeddb`) could say it too later.
* A quota error counts as blocked: retrying cannot help until the user frees room or leaves the
  private window. `InvalidStateError` does not (Safari closes connections under a store).
* The catch-up passthrough still logs its warning (the snapshot does lag: `syncing: false`).

## Discoveries

* An erase into a vault deleted (not reborn) elsewhere is `absent_box`, not `stale_write`:
  `checkStandingBoxlabel` reads storage first. Only a box under the same label in a reborn vault,
  or a delete racing the erase, reaches the stale path. Tested.
* Before this thread, storage could read from `changed_at` standing still that the same whisper
  was stored again: a one-bit plaintext signal, now gone.
* The React lint warning (unused `eslint-disable` in `vault-provider.test.tsx:499`) is at base.

## For the Coach

* `safebyok-indexeddb`'s vault store, `idbVaultDB`, still says a blocked browser as
  `storage_unavailable`: the ruling named the device store. Same branch would serve it.
* The `storage_blocked` name list rests on the spec names; which name each browser gives for
  "site data blocked" is not tested in a real browser here.
