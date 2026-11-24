# Thread 2: VaultEvent for the watch, and SortedVaultDB (2026-11-23)

Branch `20261123-feed_wrapper`, PR #868, stacked on #867. Proved after the rework (2026-11-24): `pnpm justify`, see
the PR's **Tests:** line; safebyok 1771 passed.

The words: a vaultDB's verbs are **watch**, **notify** and **notice** (a caller watches, the vaultDB notifies each
watcher, what arrives is a notice, a `VaultEvent`); a minder's are listen, tell and hear. A front door is `foo`, and a
captive lower-level method only it calls is `doFoo` (the Coach, 2026-11-24).

* **Built**:
  * **`ThingNotice` is gone**, no alias. `VaultDB.watch(scope, onNotice, onBadNews)`'s `onNotice` is notified of a
    `VaultItemEvent` (`vault-db.ts`, built by `itemEventOf` in `adapter-vault-db.ts`): scope, `modelkind`,
    `recordkind`, `record`, and `agerank`/`agerankWas` undefined. Same records, same moments, same order.
  * **`Minder`'s handler** (`minder.ts`, `hello()`) sends `event.record` of an `item` event to its cache, and ignores
    other eventkinds (and a void's null record, which no watch notifies today).
  * **`SortedVaultDB`** (`src/storage/sorted-vault-db.ts`): `static make({ vaultDB })`, a private constructor that
    parses its options (`bad_record`), frozen, one `#vaultDB`; each of the five verbs returns the wrapped vaultDB's own
    answer, and `watch` passes the caller's handlers through and returns the wrapped stop. Exported from
    `safebyok/storage` only.
  * **Device** makes one `SortedVaultDB` in its constructor, as a local, and hands it to `BankMinder.make` and
    `VaultMinder.make`.
  * **`Bank` and `Gate` hold no vaultDB** (the Coach, 2026-11-24, "yes change gate and bank to not use the vaultdb"):
    the `#vaultDB` field, the `vaultDB` getter and the `vaultDB` option of `Bank.make` and `Gate.make` are gone, with
    the entry in `bankMakeArgs` and `gateMakeArgs`, the member in `BankOpts` and `GateOpts`, and the words in the `make`
    doc blocks. `#attachWorld` and `birthBank` pass none. `BirthGatingFriend` carried no vaultDB, so it is untouched.
    Tests that spied on a bank's store read `bank.device.vaultDB`; `bank.test.ts`'s "refuses a vaultDB that is not a
    VaultDB, and no opts at all" is now "refuses no opts at all", and `gate.test.ts` no longer expects `gate.vaultDB`.
  * **`AdapterVaultDB`'s watchers** (rework): `type ThingWatcher = { scope, notify, onBadNews }` in a
    `#watchers` set, where there was `Feed` with `tell` and `notify`. `notify(val)` takes a Thing already checked
    (whole or sparse), builds the event and calls `onNotice`, sending a throw to `onBadNews`. There is no `doNotify`.
    Where a record is classified: the datastore's own feed (`doWatch`'s receive) classifies its raw record against its
    watcher's scope, then calls that watcher's `notify`; `#queueNotices` (tracked records, dbhas) collects the bank's
    watchers when the verb queues, and in one microtask classifies the record once (the first watcher's scope: every
    watcher of one bank checks alike) and notifies each with a clone of its own, or sends each one's `onBadNews` the
    refusal; `#queueListedNotices` notifies each watcher, a microtask and a clone each, unchecked as before.
  * **`isLifepathDeep` and `isParityRight`** exported from `shapes-thing.ts`; feed-sorter.ts imports them.
  * **Tests**: `tests/storage/sorted-vault-db.test.ts` runs the vaultDB battery over a SortedVaultDB on a
    MemoryVaultDB, plus forwarding, watch pass-through, nothing asked at make, and three refusals. `TH.itemEventOf(record,
    recordkind = 'full')` builds an expected event (in `vaultdb-world.ts`, so `safebyok/testing` has it too).
    `adapter-vault-db.test.ts` gains one case: two watches of a bank each get their own copy of a dbhas, each one's
    `onBadNews` a dbhas that fails its checks, and a watch of another bank nothing. It passes over the old `Feed` code
    too, so it pins what the rework had to keep.
* **Decisions made**:
  * **Microtasks in `#queueNotices`**: one per record, where there was one per watcher. The handlers run in the same
    order (every microtask a verb queues is queued before any runs), and a watcher that stops in between is still
    notified of what was queued, as before. Each watcher now shares one refusal object for a bad record, where each made
    its own.
  * **`ThingWatcher`**, not `Watcher`: `memory-vault-db.ts` exports a `Watcher` for a concrete adapter's
    registrations, which receive raw records; this one is a caller's watch of checked Things, beside `ThingWatchScope`.
  * **Recordkind by `Thing.isGone`, then `Thing.isSparse`** (`recordkindOf` in adapter-vault-db.ts), so a sparse
    tombstone is `gone`, as FeedSorter has it. Thread 3 replaces this path.
  * **The parameter is still `onNotice`.**
  * **Minder tests**: `noticeOf`/`sparseNoticeOf` became `watchEventOf`/`sparseWatchEventOf` (a listed record is
    `soon`).
* **Deviations, set aside**: the first build made `device.sortedVaultDB` a hidden prop and gave the wrapper to the
  Gate and Bank too, so `bank.vaultDB` returned the wrapper and tests moved to `bank.device.vaultDB`. The Coach ruled it
  out (2026-11-24): the Gate and Bank call no verb, so it bought nothing and was the only thing a host could see change.
  All of it is undone; the tests moved to `bank.device.vaultDB` again when the getter went (see Built).
  `SortedVaultDB` left `safebyok/core` with it (the forgotten-exports check no longer asks for it).
* **Discoveries**:
  * **How thread 3 gets the bank's scope**: from the `watch(scope, …)` call, which `Minder.hello` makes with
    `this.scope` (one sorter per watched bank, made at `watch`), or a friend `Pick<Device, 'scope'>` passed to
    `SortedVaultDB.make` and read per call (the scope is null until a user is known).
  * **A void's lifepath** must come from the parent: the root box's record, or `Kids.parentlife` of a listing (thread
    1's file). A `gotvoid` answer carries no lifepath.
* **For the Coach**:
  * **Rename `onNotice` to `onEvent`?** Recommend no, now that the watch's word for what arrives is a notice.
  * Nothing open on `vaultDB` on `Bank` and `Gate`: ruled and done.
