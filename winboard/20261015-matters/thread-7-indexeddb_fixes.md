# Thread 7: indexeddb_fixes (2026-10-16)

Branch `20261016-indexeddb_fixes`, PR [#109](https://github.com/mrflip/safebyok/pull/109), stacked on [#108](https://github.com/mrflip/safebyok/pull/108). Justify: green, every package (indexeddb 121 tests); `pnpm size` within budget.

* **Built**, all in `packages/safebyok-indexeddb`:
  * `src/ckeys.ts`: `boxRange(scope)` replaces `isBoxCkeyOf`. It is `IDBKeyRange.bound(Ckeys.boxPrefix(scope), prefix + '\u{FFFF}')`; every ckey under the prefix goes on with a `"`, which sorts below it, so the range holds exactly the scope's lockboxes (tested against lookalike users, `u12`, and a user named `u1","main`).
  * `src/idb-vault-db.ts`: `doListBoxes` reads `getAllKeys(range)` and `getAll(range)` in one readonly transaction; `doEraseVault` does `store.delete(boxRange)` then the bundle, in the one erase transaction; `doReadBundle`/`doReadBox` read through the shelf, not `idb-keyval`'s `get`.
  * `src/shelf.ts`: `settle(request)` wraps `promisifyRequest` and never rejects with null. A transaction one of whose requests failed rejects with that request's real error (a ConstraintError, an AbortError): it bubbles to the transaction while `transaction.error` is still null, and `settle` listens for it. Only a failure the browser gave no error for at all (a transaction aborted from outside) becomes the Error "The IndexedDB request failed for an unknown reason: the browser gave no error." The adapter's reads, `rowAt` and the transaction's commit go through it, so the core's `storage_unavailable` never gets `cause: null`.
  * `src/bell.ts`: the channel is closed when its database's last listener leaves (a vault's `close()` is that), and a write with no listener in the tab opens a channel, posts, and closes it. A later `onBell` reopens it.
  * A changeset (`safebyok-indexeddb` patch), README lines for ckeys and the bell.
* **Decisions taken**:
  * The null-cause fix lives in the adapter (a `settle` helper), not the core: the core's `asStorageTrouble` is right to wrap what it is handed, and an Error is what the adapter should hand it. The message says "request", not "write", because the same helper covers reads.
  * `ringBell` closes the channel straight after `postMessage` when nothing here listens. By the HTML spec the message is queued to the other tabs at post time, so closing ends only this tab's end; tested with a second channel hearing it.
  * `inspectIdbVaultDB` still uses `idb-keyval`'s `entries`/`clear` directly (a debug window, its errors do not become a VaultError cause); not touched, to keep to the thread.
  * The old test "erases a whole vault or none of it" still passes unchanged: its first mocked `delete` is now the range delete, so it proves the rollback of the lockboxes as before.
* **Discoveries**: vitest's `rejects.toThrow(/regex/)` passes when the promise rejects with `null`; the null-cause tests assert `instanceOf(Error)` and the message instead, and were checked to fail without the fix. The `readonly` transaction of `idb-keyval`'s `UseStore` is `shelf('readonly', cb)`; no new dependency was needed.
* **For the Coach**: nothing blocking. The Coach's question on the key range ("anything deeper?"): no. Stored ckeys are unchanged, so every vault already written reads as before. The one thing a thread-5 auditor may want: `doListBoxes` now lists in ckey order from the range, where `entries()` listed in key order too (same order), so no visible change.

## Review

Fixed in `settle` (the review's commit): a failed request's real error is kept, not replaced by the unknown-failure Error. Minor findings left:

* `settle` replaces any non-Error rejection with the unknown-failure Error, not only null (a recorded choice).
* `doListBoxes` makes two requests over the range (`getAllKeys` and `getAll`); one cursor would do.
* A listenerless tab opens and closes a channel per write.
* Close-after-post is tested under Node only; the HTML spec is the browser guarantee.
* The first commit's prefix `indexeddb:` would be `storage:` by PROCESS.md; left as pushed.
