# Thread 7c: bad_news (2026-11-01)

Branch `20261101-bad_news`, PR #PRNUM, stacked on #438. Justify: green; safebyok 5250 passed, 37 skipped; root scripts 290.

The Coach paused new race-condition work mid-thread (2026-11-01), and the orchestrator withdrew two
carries. Both were already finished and tested, so each stands as its own commit, prefixed
`droppable`, to drop or keep. Each was checked reverting cleanly alone, with the rest of the tests
green. Nothing after them needs them.

* **Built** (`31a1ad53`, the thread proper):
  * **Host default.** `BankOpts.onBadNews` left out sends each piece to `logger.warn` (`{ call: 'onBadNews' }`) and `reportToPlatform`. All news lands in `Bank.#hearBadNews`.
  * **A failing handler.** The listing's isolation stands; a new protected `badNewsHandlerFailed` lets `VaultListing` log it as well, since Node has no `reportError` and the failure would vanish.
  * **Sign-out.** News of kind `identity_revoked` calls `closeVaults`, as it stood, before the handler is told, so a handler that throws cannot skip it. A bank holding no vault hears nothing, documented on `BankOpts.onBadNews`, no probe.
  * **Flood.** `Listing.hydrateAll` tells the first refusal of each `refusalkind` (`uniqBy`, two lines): no coalescer, guard or count. It serves `hello`'s `hydrateAll` too.
  * **`wroteOverDamaged`.** `#keepDeviceRecord` reads the flag and tells `RefusalFuncs.deviceRecordWrittenOver()`. `highest_gate_epochs` goes unread.
  * Tests: `tests/models/bank-bad-news.test.ts`, over a real `StoreFront` subclass (`TroubledFront`).
* **Droppable** (`9abb9007`): `closeVaults` lands on a stored vault an `ensureVault` fetch or hello in flight then holds: `VaultListing.closeAll`, `closeAllSeq`, `#takeUpKeptLease`, `hello(closeAllSeq)`. Tests: `bank-close-in-flight.test.ts`. The pinned won't-fix tests in `bank-close.test.ts` are unedited and green.
* **Droppable** (`8a7a7667`): a `goodbye` during `bank.hello` ends the watch that hello goes on to start and lets go a lease it takes up; the next hello begins anew: `Bank.#latestHello`, `#landHello`. Tests: `bank-goodbye-in-hello.test.ts`.
* **Decisions taken**:
  * The written-over record is told as `corrupt_record`, after `misfiledCachedCopy`: a new refusal kind would be a public contract.
  * The default logs at `warn`, because the call carries on; `error` stays for a failing handler, as in the old surface.
  * Set aside for `goodbye`: a guard in the base `Listing`, as `vault-boxes.test.ts` pins that a goodbye overtaking a box hello does start and end one watch; and a count like `Vault.#boxesGoodbyes`, because Bank clears `#helloing` when a hello lands, so a newer hello already finished would look like none begun. Hence a token.
  * Set aside for `closeVaults`: having `ensure` read the all-count, which would change the pinned won't-fix tests.
* **Deviations**: the plan asks for a count in the vault listing for the goodbye guard; the droppable commit uses a token on Bank, for the reasons above.
* **Discoveries**:
  * Carry 5: a forced refetch tells no `vault_locked`. The hydrate path demands no unlock, and a test pins it with a locked vault holding a box under both watches. Nothing was quieted.
  * `BoxListing`'s news reaches the same hook, through `vault.ts`'s `#makeBoxListing` forwarding to `listing.tellBadNews`; tested.
  * "One" is per listing and per kind: one hiccup on a backend tells once for the vault watch and once for each vault's box watch.
  * Later threads tell through `bank.vaultListing.tellBadNews([news])`: 7d's lost build, 8's `vault_gone`.
* **Races met, left as they are** (the first two only if the droppable commits go):
  * Sign-out or `closeVaults` during an `ensureVault` fetch of a stored vault with a kept lease answers it unlocked, lease kept; during a hello's cache load, it leaves the revived vault held, unlocked, lease kept.
  * `goodbye` during `hello` starts a vault watch nothing ends, and a remount joins the overtaken hello.
  * Kept: a lease kept of a vault neither held nor in flight stays through a `closeVaults`, so sign-out does not reach it.
  * With the goodbye commit: an older refused hello landing after a newer ready one reads `refused` until the next hello.
* **For the Coach**: keep or drop each `droppable` commit. My recommendation is to drop both, as you rank edge-case failsafety far below simplicity; the races above then stand, reported. The goodbye commit is the smaller and closes a real leak, if you keep one.
