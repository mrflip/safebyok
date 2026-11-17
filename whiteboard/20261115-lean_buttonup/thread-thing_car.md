# Thread thing_car: the ThingMinder caches ThingCars (2026-11-17)

Branch `20261117-thing_car`, [PR #718](https://github.com/mrflip/safebyok/pull/718), stacked on [#716](https://github.com/mrflip/safebyok/pull/716). Proved: safebyok lint and typecheck clean, its tests 938 passed (922 before the review round, 884 before the thread); `pnpm justify` at the tip (see the PR's **Tests:** line).

The design is complete.md's bullet "The ThingCar, the minder's cache value", agreed with the Coach; VOCABULARY.md's `car` and `am` rows are on the plan branch, not this one.

* **Built**:
  - **`src/minding/thing-car.ts`**, new: `ThingCar<RecordT>` exactly as designed (`fullest` null when gone or void, undefined when bare), `BoxCar` and `GateCar` as aliases, `Tombstone<RecordT>` (`TombstoneOf<RecordT>` or a sparse record with `am: 'x'`), `DeliverableThing` (moved from thing-minder.ts), `carLivenessVals`; `carOf(record)`; the merge **`mergedCarOf(prior | undefined, landed)`**; `isThingCar`, `isVaultDBNewer` (behind or bare), `isWholeRecord` (the kind's record check, a type guard), `cmpRecords` (moved). Its output check is `Checks.thingCar`, a `discrim('liveness', ...)` with a refinement per liveness, refusing `unexpected_error`. The records pass through `custom` checkers so a refinement can compare them by reference.
  - **The merge**: the newer `newest` of the two (a tie keeps prior's); if that car is gone or void it is the answer (a tombstone replaces any older whole record); otherwise the newer whole `fullest` of the two, kept only if it is of the newest's life, gives `bare`, `full` (same revision: the whole record in both fields) or `behind`. `sharedCarOf` then runs `TSQ.replaceEqualDeep(prior, car)`, so equal revisions keep the prior reference and a newer record keeps its unchanged parts; a full car gets one record in both fields. A car of another scope is returned as it landed.
  - **thing-minder.ts**: the cache holds cars only. `#fetchCar` (was `#fetchRecord`) returns `carOf(record)`; `#doDeliverRecord` lands `carOf(record)` for list rows, notices and the seed. `structuralSharing: keptValOf`: a car landing goes to `mergedCarOf` (prior if it is a car, else undefined); anything else to `TSQ.replaceEqualDeep`. `staleTime` in the defaults is a function, `staleTimeOf(car, staleTime)`: 0 for behind or bare; `#doGet` passes the same function per get, and `#isStale` (tryAt, isStaleAt, listen) applies it to its number. `#doDeliverSeed` and its invalidate are gone.
  - **Answers**: `TSQGotAnswer` carries `car` beside `val`; a timely car is full, gone or void, so `val` is the whole record (`gotlive`), the tombstone (`gotgone`) or null. The private `TSQEntryState` is `CarFreshness`.
  - **`entry` swept out of `minding/`**: a TanStack query object is `carQuery`, docs say "car" or "the cache's query for a scope".
  - **Notes**: `notes/wontfix.md` loses "A listener hears a listed sparse box timely, then untimely"; its other rows name `mergedCarOf`. `listen`'s doc loses its line on it.
  - **Tests**: thing-car.test.ts (36: carOf by liveness, ten merges, seven kept-prior cases, sharing and freezing, another scope, eight broken cars refused, `isThingCar`, `isVaultDBNewer`); thing-minder.test.ts reworked to cars, plus: staleTime by liveness, no root seed before birth, list leaves a whole record `behind`, a listener hears a listed box once, untimely, `bare` or `behind`.

* **Decisions made**:
  - **The merge is named `mergedCarOf`**: a pure function named for what it returns (`fooOf`).
  - **A whole record of an earlier life is dropped** (bare, not behind), and the check refuses a behind car whose fullest is of another life. Read from the Coach's ruling that a tombstone replaces the old whole record: a later life means a tombstone came between, heard or not. Without it a reborn box heard by `list` would show the deleted box's body.
  - **A behind or bare car's newest must not be whole**, in the check: the invariant "the fullest record is the fullest known", made checkable.
  - **`get` returns the car** too (the design names `at`, `listen` and observers): after a notice or a list lands mid-get the car may not be full, so a record would mean choosing which.
  - **`isWholeRecordAt` is removed**: `at(scoped)?.liveness === 'full'` says it, and its only callers were tests.
  - **The car's module is its own file**, so the merge is tested as a pure function.
  - **A car's check refuses `unexpected_error`**: a broken car is a bug in the minder.

* **Deviations**:
  - **A minder leaves the bank alone** (the Coach, 2026-11-17, after "go for it on the bank birth"). `MinderFriend` is `scope`, `makeGetAsk`, `makeListAsk` and `tellBadNews`: it has no `rootBox`, so a minder may be made before the bank's birth and `make` refuses nothing for it. `hello` seeds no root car (before: a live root box was seeded `bare`); it sets `gcTime: Infinity` on the root box's key, built from the scope and `RootBoxLabelpath`. A root car comes from the birth's notice, a list or a get of the root box. `#shellAt` takes an empty box's parent from the cached root car's `newest` alone, and refuses `bad_option` (`Phrases.RootNotCached`, which says the root box is not cached yet) where none is cached; the minder never fetches the root box itself, since another part (the Device's `hello`) is to handle that.

* **Set aside**: `TSQ.replaceEqualDeep` on a car of another Thing (it would build an unfrozen copy); dispatching `structuralSharing` on `liveness` alone (the review round: a selected value may carry one, so `isThingCar` is the car's own check); seeding a `full` car from the bank's whole root; a refusal of an unborn bank at `make`, a root read from `bank.rootBox` or the newer of it and the cached root car, and the minder getting the root box itself for a shell (each the Coach turned down for the minder to leave the bank and orchestration alone).

* **For the Coach**:
  - **Earlier-life rule** above: a reading, open to a ruling.
  - **Where the root box is cached now**: nothing in the minder does it. A box minder's first get of an empty box refuses `bad_option` until the root box's notice, a list or a get has landed; the Device's `hello` is to see that it does.

## The review round (2026-11-17)

The birth seam is settled as option (d), build nothing: the vaultDB's watch promises a notice for each Thing a birth writes (`onNotice` gets each changed Thing), so the stored root box lands `full` in every minder watching, one round trip after the send. The minder reads nothing of the bank's state (see *Deviations*). `isVaultDBNewer` narrows its parameter rather than checking it. Detail, with the birth-seam options: [thread-thing_car-review.md](thread-thing_car-review.md).
