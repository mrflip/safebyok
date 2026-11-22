# Thread 6: persist (2026-11-22)

Branch `20261122-persist`, PR #848 (draft), stacked on #846. Proved: `pnpm --filter safebyok` lint, typecheck (forgotten-exports
included) and test, 1503 passing; `pnpm justify` at ready (see the PR's **Tests:** line).

* **Built**
  * `packages/safebyok/src/storage/persister.ts`: the plug. `DevicePersisters = { roots, boxes }`, each TanStack's own
    `Persister` (re-exported with `PersistedClient`), `isPersister`, and `MemoryPersister` (stores by structured clone, as
    IndexedDB would). Exported from `core.ts` and `storage.ts`, so from the front door as well.
  * `Minder.persist(queryClient, persister)` (`minding/minder.ts`): TanStack's `persistQueryClientRestore`, then
    `persistQueryClientSubscribe` in a `finally`, so saving goes on after a failed restore. Our defaults:
    `maxAge: Infinity`; `buster: ThingFormat`; `shouldDehydrateQuery` keeps every entry with data (a refused get's
    item too); `shouldDehydrateMutation: () => false`; restore options give each restored entry the
    `FixedQueryCacheOpts` (gcTime Infinity above all), structural sharing by shape (a listing's or a record's), and
    `deepFreeze` as `deserializeData`.
  * `Device`: `opts.persisters` (checked by `isPersister`, phrase `PersisterExpected`). `hello()` is now
    `#started ??= this.#restore()`, at the marked seam. Both clients restore through `Promise.allSettled`, and each
    failure goes to `tellBadNews` as `storageRefusalOf(reason)`. `hello` never rejects. `signIn` already awaits `hello`,
    so the stage stays `'starting'` until the restore lands, and no minder speaks to the vaultDB before.
  * `device.useridsSeen()`, through `useridsCachedIn(queryClient)` in `minding/minder-keys.ts`.
  * Tests:
    * `tests/minding/minder-persist.test.ts`: the round trip, frozen; kept past 24 h; a refused item saved; no
      mutation saved; another buster discarded; a failed restore rejects, and saving goes on.
    * `tests/storage/persister.test.ts`.
    * `tests/models/device.test.ts`, *a device's persisters*: starting until the restore lands; boxes and listings
      restored; a failed restore goes to onBadNews; useridsSeen; a bad persister refused. The
      `deviceWithCachedWorld` cheat is replaced by `bornAndReloaded`, a real reload over shared MemoryPersisters.
* **Decisions made**
  * **The userids seen are read from the roots' client's keys** (`queryKey[1]`), not stored as a second list. The
    roots' client holds every user and bank's entries, so its keys already answer the question.
  * **Two persisters, `{ roots, boxes }`, not one:** each client is a whole TanStack snapshot. Thread 7 can back both
    with one IndexedDB database under two keys.
  * **The peer dependency:** `@tanstack/query-persist-client-core` is a dev and peer dependency, as query-core is. Its
    version is 5.107.1: 5.107.2 is too young under the seven-day rule.
  * **No mutation is persisted.** A mutation's variables may hold a form's cleartexts. TanStack's default saves paused
    mutations.
  * **The persister failures go to `onBadNews`** as `storage_unavailable` (or the VaultError a persister throws), and
    that cache starts empty. TanStack also `console.error`s the error outside production, which I left as it is.
* **Deviations**
  * **`#seedListing` skips a listing already cached.** The minder's `hello` used to overwrite the root listing with an
    empty, bare one, which would clobber a restored listing. The class invariants (*cached from `hello`*, *bare from
    `hello`*) now say "or restored by `persist`". This changes what `hello` promises, but only for a client that
    already holds a listing, which before this thread only a second minder in the same client could leave, and that is
    refused.
  * **A restored entry carries an approximate `structuralSharing` (`restoredSharingOf`) until its first fetch.** Its
    minder's per-kind defaults are set at minder `hello`, after the restore, and TanStack builds a restored entry with
    the options it hydrates with. `setOptions` is internal, so it takes the kind's own at the next fetch.
* **Discoveries**
  * TanStack discards a snapshot whose `timestamp` is falsy. It tells cache subscribers a macrotask late
    (notifyManager), so a save trails the change by a tick, and the tests wait one tick.
  * A saved item keeps its last error. A structured clone turns a VaultError into a plain Error, and `tryAt`'s
    `lastErr` then reads it as `storage_unavailable` (through `storageRefusalOf`) until the next fetch.
  * The roots' client is now at rest in the host's storage: the gate's wrapped bankKeys and wayin headers, by design.
    That is recorded in `notes/security.md` (through a sonnet subagent) and as G3 drift in `notes/guarantees-drift.md`.
    Neither client holds cleartext or an unwrapped key: only the minders write to them, and only stored records.
  * Anything a host caches in `device.queryClient` under its own keys is persisted too (the giver's docs say to set
    nothing there).
* **For thread 7**
  * `persistClient` is called at every cache event, unthrottled, with the whole snapshot. An IndexedDB persister should
    throttle, as TanStack's stock ones do.
  * The snapshot is structured-clone friendly, so it can be stored without JSON. Records are deep-frozen on restore
    (`deserializeData`), so a persister may hand back unfrozen copies.
  * `removeClient` is called on a busted or failed restore.
  * The IdbMinderBridge can go: the device no longer needs a separate cache of the world.
* **For the instance-sync thread**
  * The restored gate is the gate of the last page load until the vaultDB answers, as with the cached world before.
* **End states, for the final report**
  * A sweep or `goodbye` removes a bank's entries from its client, and the next save drops them from the snapshot.
* **For the Coach**
  * Is the `#seedListing` deviation acceptable?
  * Should the plug be named `{ roots, boxes }`?
