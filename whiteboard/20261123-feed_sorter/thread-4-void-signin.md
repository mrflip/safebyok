# Thread 4 rework: a vaultDB says where a void is; the SortedVaultDB is made at sign-in (2026-11-24)

For the Coach, and for whoever picks up thread 4: Changes C and D on the Coach's rulings of 2026-11-24, commit
`b69164e44` on `20261124-sorted_feed`. The seven Minder tests still fail, unchanged (same assertions).

## Change C: a vaultDB says where a void is

A `gotvoid` answer now reads (`packages/safebyok/src/storage/vault-db.ts`):

```ts
  | (GoodAnswer<null, 'gotvoid'> & { dbhas: VoidSentinel })
  | BadAnswer<ThingRecord | VoidSentinel | null>
```

Its `dbhas` is the void sentinel: the parent's lifepath as the step read it, then the shell's lifeseq; where the parent
is not stored, the shell's lifeseq in its place (`-000000001/-000000001`); a root's is the shell's lifeseq alone.

* **Built in the classifier.** `classifyGetThing(ask, raw, roots: BankRootsFetched)` takes the bank's three roots fetched
  in the step (was the world alone). Where nothing is stored it reports the sentinel as `record` (`voidAt`): a Thing's
  parent is the main gate or the root box, since labelpaths are at most two deep (the ask check refuses deeper ones).
  A parent that fails its checks refuses the get `damaged_row` (`storedCitedOf`). New type `GotActual` (exported);
  `Actual` takes a second parameter for its record. `AdapterVaultDB.answerOf` refuses `storage_issue` for a good get
  with no record, `gotvoid` included now.
* **Each adapter reads the parent in its existing step**: `MemoryVaultDB` passes `#rootsOf(ask)`; `IdbVaultDB`
  `rootsFetchedIn` in its one transaction; `PostgresVaultDB`'s get statement already read the root box for `tracked`,
  and now also returns it (`SELECT thing, world, root, ...`). No second round trip anywhere.
* **The lifepath patterns widened**: a void lifepath may now hold void lifeseqs from the first void one to its end
  (`VoidLifepathPattern`, `AnyLifepathPattern` in `shapes-thing.ts`); before, only the last could be void, and the
  parent-not-stored sentinel would have failed `FeedSorter`'s check. This also lets a write cite such a lifepath.
* **Elsewhere**: a get refused `void` (`ifAbsent: 'fail'`) carries the sentinel too (same function). **Left**: a write
  refused over nothing stored (`void`, `ahead`) keeps `dbhas: null` (it would widen `WriteThingAnswer`, the exported
  `classifyWriteThing` / `unwrittenWriteOf` signatures and Postgres's write statement); a listing refused `void` keeps
  `dbhas: []`; a birth never refuses over nothing; a thrown answer's null is not "nothing stored".
* **Consumers**: `Minder.#fetchRecord` compares a null answer as `answer.dbhas` (`nullCitedOf`, which defaulted null to
  `Shell.Cited`, is gone). Behaviour change in one corner: a `gotvoid` under a newer life of the parent than a cached
  record's no longer refuses `stale_read`. The Minder's class doc and `#fetchRecord`'s doc say "the void sentinel it
  carries". `GotAnswer` (the minder's cached answer) is unchanged: its `gotvoid` keeps `dbhas: null`.
* **The SortedVaultDB stops guessing**: a get's notices are its roots and its own record, the sentinel included;
  `voidsAt` and `FeedSorter.lifepathAt` are gone. A void is always notified.
* **Not changed**: `notes/answer-contract.md` (big's tables) still says a `gotvoid`'s `dbhas` is null.

## Change D: the SortedVaultDB is made at sign-in, for one bank

* **`SortedVaultDB.make(scope: BankScope, opts: { vaultDB })`** makes its `FeedSorter` and starts its one watch of the
  wrapped vaultDB (its stop wrapped in es-toolkit's `once`). No refcount, no "not watched yet" refusal
  (`Throwers.feedNotWatched` and `Phrases.FeedNotWatched` are gone). `watch` of another bank refuses `bad_record`. A
  record learned while no one watches is sorted and reaches no one, then or later (said in the class doc).
* **Its ending is `sweep()`**: it stops the wrapped watch, once however often called, returns `this`, and throws what
  the host's stop throws. Named `sweep` because `Device.sweep` hosts it (device -> bank -> vault cascade); the minders'
  `goodbye` pairs with a `hello` that can start them again, and the SortedVaultDB never starts again.
* **`Device`** makes its minders with no vaultDB; `#bringUp` makes the SortedVaultDB before its first await (so still
  synchronously within `signIn`, and a watch that throws lands in its existing catch, showing `failed`), keeps it in
  `#sortedVaultDB`, and hands it to both `hello`s. `Device.sweep` calls `sweep()` on it after the bank's, telling
  `onBadNews` what it throws. `device.vaultDB` stays the host's.
* **`Minder`**: `MinderOpts` loses `vaultDB`; `hello(vaultDB)` checks it, then (if not minding) keeps and watches it;
  `vaultDB` is a protected getter refusing `disabled` (`minderNotStarted`) before the first hello. Gets, lists and
  writes refused before hello as before. `BankMinder.tryBirthBank` before the first hello now rejects `disabled` (it
  asked the vaultDB before); nothing calls it then.

## Tests whose meaning changed

* `sorted-vault-db.test.ts`: "watches the vaultDB it wraps once, while anyone watches it" and "asks nothing and watches
  nothing when made" become "watches its bank in the vaultDB it wraps once, from when it is made, whoever watches it,
  asking nothing"; new "stops its watch ... at its sweep, and still notifies an answer's records" and "calls the wrapped
  watch's stop once, however often swept"; bad options gain a bad scope. "notifies of nothing from an answer it passed
  through before its first watch" becomes "sorts an answer's records while no one watches it, so that they reach no
  one, then or later". bell's "refuses before its first watch" is gone. "notifies of nothing for the void ... under a
  parent it has not seen" becomes "notifies of the void sentinel ... under a parent it has not seen, and under one not
  stored". Eight cases that wrote beside it before watching now stand over a quiet MemoryVaultDB (its feed would now
  be sorted before the watch). The stub vaultDB answers objects with an `ask`.
* Battery (`vaultdb-battery-writes.ts`): a get of nothing at a root, refused at a root and under a live parent, under a
  live parent (box and gate), under a tombstone parent, under a parent not stored. `adapter-vault-db.test.ts`: a good
  get with no record refuses for `gotvoid` too; `gotvoid` answers the sentinel reported.
* `vault.test.ts`: a device's sweep now stops two host watches (the vault beside's and the SortedVaultDB's), a bank's
  one; a throwing stop tells `onBadNews` twice on a device's sweep.
* Minder tests: "refuses a vaultDB without the brand" moved from `VaultMinder.make` to `hello`, BankMinder's likewise.
  `device.test.ts` "asks its vaultDB nothing, and watches nothing, until it signs in" holds unchanged, as do the React
  counts (`react-giver.test.tsx`).

## Approaches set aside

* Building the sentinel in `AdapterVaultDB` from a parent row the adapter hands over: every adapter would have to
  pick the parent itself; the classifier knows the parent is the main gate or root box.
* Keeping the Minder's stale-read comparison at `Shell.Cited` for a void: it would ignore the given lifepath.
* Making the SortedVaultDB in `signIn` itself: a host watch that throws would throw out of `signIn`, which never rejects.
* Making it just before the minders' `hello` (after the restores): avoids the window below, but the directive said at
  sign-in, synchronously.

## Discoveries

* **A notice during the restore is lost to the minders**: the SortedVaultDB watches from `signIn`, the minders from
  their `hello` after the persisters restore. A record another tab writes in between is sorted with no watcher, and a
  later answer carrying the same revision in the same 65.536-second span is a repeat. The minders' own gets still land
  their answers directly, so it costs a notice, not a record. Open matter.

## For the Coach (PR open questions 8 to 11)

* **Restore window**: recommend making the SortedVaultDB just before the two `hello`s, after the restores.
* **Writes refused over nothing stored** keep `dbhas: null`: recommend leaving them unless a consumer needs the sentinel.
* **Minder's stale-read compare for a void** uses the sentinel: recommend keeping it (one line restores `Shell.Cited`).
* **`notes/answer-contract.md`** says a `gotvoid`'s `dbhas` is null: recommend a line for the new core, or the note's rewrite.
* **VOCABULARY.md**: no entry added; the void sentinel's row could say its lifepath stands under the parent's.
