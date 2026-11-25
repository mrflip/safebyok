# Thread 32: valedictory (2026-11-25)

Branch `20261125-valedictory`, PR #PRNUM, on `main`. **Blocked on V2 step 3**, parked on the local branch
`20261125-valedictory-step3` (not pushed, not in the PR). Proved: PROVED.

Built by hand (no /sprint), from the orchestrator's brief. The last thread of the feed_sorter line.

* **Built**:
  * **V1** (`f9811a4a5`): `Checks.passphraseMakeArgs` / `passkeyMakeArgs` (`src/models/proving.ts`) refine the parts
    by `isStoredOfHeader`: `stored` is null, or `isEqual(stored.toJSON(), header)`. Phrase `WayinOfOtherHeader`. Two
    rows in `MakeRefusalCases` (a stored wayin of the other kind; of its kind with another header), under the same
    quotes-nothing check as thread 31's. Every earlier test passes unchanged.
  * **V2 step 1** (`a3e9b141d`): a Thing has no `read_at`. `ThingCar.read_tc` follows `#readAtAfter`'s rule (the newest
    revision's time: a newer one brings its own, the same one the later, an older one leaves it; any record over a
    vacant Thing). `ThingCar.inspectable()` (last member) answers a root's `MaskedRow`; `Device.inspectable` builds its
    three rows from the cars; `Thing.inspectable()` is gone (less code than keeping a masked-record-only one). The
    vault TSQ's `itemQueryOptions` dates its seed by `readAtOf(car.read_tc)`.
  * **V2 step 2** (`34630dc12`): `ThingCar.citable`, started from what the Thing holds; the minder's `#citableAt` and
    `Vault.#donorAt` read it. `Vault.#boxAt` became `#boxCarAt` (a car whose Thing is a `Box`, by `isBoxCar`).
  * **V4 pair 8** (`e15c0b1f7`): `itemEventOf(seen, { sourcelabel, read_tc, banktok })` in `src/storage/agerank.ts`,
    frozen; the adapter (`noticeOf`), the minder's `#receiveAtThing`, the world's `shelvedEventOf` and the test helper
    `TH.itemEventOf` call it.
  * **V4 pair 6** (`2b81892d7`): `BaseThing.revisionAfter(cited, written_at)` beside `nextLifeOf`; `BaseBox.nextRevisionOf`,
    `tombstoneOf` and `Gate.makeNextRecord` call it, keys in the same order.
  * **V4 pair 3** (`9b1d0d670`): `Shell.citedInParentLivesOf(seen)` beside `childCited`; `#citableAt` is the car's
    `citable ?? Shell.citedInParentLivesOf(record)`.
  * **V3** (`01497c195`): `TODO.md`, "A bare-record form of `make`".
  * **V5** (`09bbca6da`, sonnet subagent): an `amended` line under thread 31's proving entry (its "Not checked: ...
    that a stored wayin agrees with the header" no longer holds), and a new entry: an answer carries no `world`.

* **Parked: V2 step 3** (`20261125-valedictory-step3`, two commits over this PR's tip, green at 2,034 with the second):
  the car keeps `agerank` and `agekind`, decides news and returns the events; `Thing.receive` adopts a whole record,
  tombstone or void sentinel newer than the held one (`BaseThing.cmp(held, val) > 0`), tells subscribers only then, and
  answers a boolean; `heldAgerankOf` (agerank.ts) starts a car of a Thing holding a record; `ReceivingThing` is
  `receive | pickle | userid | banklabel | labelpath`; the feed table moved to `tests/minding/thing-car.test.ts`.
  **Why parked**: with it alone (`ca7a77305`), 444 tests fail. At signin an unborn bank's three roots arrive as void
  sentinels, each equal to the shell its Thing holds: no newer, so not adopted, so no subscriber is told, so the world
  never realigns and its stage stays `'starting'` (`birthGating` then refuses `signinUnanswered`). The world depended on
  being told of a bookkeeping-only move. The brief says stop and report. Two remedies, both green:
  * **(C), the branch's second commit** (`b9dd57294`): `Device.#doSignin` calls `this.#world.align()` once the roots
    answer. One line in `device.ts`. Thing stays pure. Recommended.
  * **(A)**: `Thing.receive` tells its subscribers, adopting nothing, for a void sentinel over the same void sentinel.
    A special case in Thing that exists for the world.
  * Set aside: the world aligning in `makeThing` (shows `'unborn'` before a live bank's record lands); telling on any
    equal revision (brings back the same-revision tells the brief removes); a second subscription (forbidden).
  * For whoever finishes it: `notes/wontfix.md`'s "The VaultMinder detects no conflict..." and "A `read_tc` from a
    clock running ahead..." say "a Thing's agerank": make them the car's. Rebase the branch onto the PR's tip
    (`git rebase --onto <tip> 4e8119cb1`; it sits on `4e8119cb1` now), drop (C) if (A) is ruled, re-prove.

* **Decisions made**:
  * **V1 compares the whole header** (`isEqual` of `toJSON()` against the parsed header), so a stored wayin of the
    same kind with another salt or credential refuses too, not only one of the other kind.
  * **`read_tc` ties take the later string**: two read_tcs of the same revision compare as text (UUID version 7), as
    tcchunks already do; `read_at` took the later millisecond. The same at millisecond grain.
  * **`Thing.receive` answers a boolean** (step 3): Box, Bank, Gate and the world ignore it; tests read it.
  * **A car over a Thing holding a void sentinel starts vacant**: the shell and a received void are the same record.
    A void again is then news to the car, and its Thing declines it: harmless.
  * **The item event maker is named `itemEventOf`**, as the test helper is; the helper imports it as
    `dispatchedItemEventOf`.

* **Deviations**:
  * Step 3 not in the PR (above).
  * In step 3, the Thing adopts and tells before the car moves its agerank, `read_tc` and `citable`, so that a record
    the Thing refuses leaves the car as it was: a subscriber reading the car finds it as before the record. No reader
    does today.

* **Discoveries**:
  * **The root shelf**: nothing changed. A root is never sparse, so a root's newest revision is always seen whole, and
    the car's `read_tc` (moving on any news before) and `read_at`'s rule agree on every root.
  * **No existing row's outcome changed in steps 1 and 2**: no test pinned the car's old cold-fill `read_tc`.
  * Pairs 2, 4, 5, 7 stay, the brief's reading confirmed: (2) every shell is made by `Shell`; the classifier's `shellAt`
    checks a raw ancestor row, then calls `Shell.under`. (4) every sparse form is `BaseThing.sparseOf` (`listedOf`, the
    car's `citedOf`, `#sealedWriteOf`). (5) a stored row (`storedOf`/`writtenOf`), a sealed revision (`BaseBox.recordOf`)
    and a shelved root (`Checks.shelvedRoot`) are three trust boundaries with three checks; one function would be a
    switch. (7) `Bank.makeRecord` and `Gate.makeRecord` take the stamps `Bank.mintStamps` minted, which the wayins and
    lease bind; the root box is sealed over `Shell.of`: alike, they would change what is bound.

* **Tests**: feed table 190 rows, before and after (in `thing.test.ts` before, in `thing-car.test.ts` on the step-3
  branch). Files: `thing.test.ts` 252, `thing-car.test.ts` 18 before; 248 and 30 on this PR; 48 and 258 on the step-3
  branch. Rows whose outcome changed, all on the step-3 branch: a subscriber is no longer told of a newer sparse
  revision or the same revision a chunk later; "adopts an older whole record after a newer soon" answers `true` where
  it returned `['item', 'aged']` (the events are now pinned at the car).

* **For the Coach**:
  * **Root voids at signin (blocking step 3)**: recommend (C), the device aligning its world once the roots answer.
