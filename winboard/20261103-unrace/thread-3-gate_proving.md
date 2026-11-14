# Thread 3: gate_proving (2026-11-03)

Branch `20261103-gate_proving`, PR [#451](https://github.com/mrflip/safebyok/pull/451), stacked on #452, in the line main → #449 → #453 → #450 → #454 → #452 → #451. Justify: green; safebyok 4646 passed, 37 skipped.

* **Built**:
  * `models/proving.ts`, rewritten: the statics `Proving.checkStrength`, `PassphraseProving.buildNovel` and `buildStored`, `PasskeyProving.buildNovel` and `buildStored` hear the clears; `buildWayin(NOVEL | proving)` and `buildLease(friend, gate_epoch?)` do not.
  * `models/lease.ts`, rewritten: `Lease.peek(friend, gate_epoch)`, `grant(friend, vaultKey, opts)`, `cache`, `vacate`, `evict`, each `try*`, on a pojo `LeaseFriend`. No `Trigger`; records `gate_epoch`, `proved_at`, `wayinkind`.
  * `models/gate.ts`: `gate_epoch`, `Gate.make` from wayins, `attemptProof`, `demandPasskeyAddable`. `Gate.build` and the three `with*` stay on the statics for `vault.ts` until threads 10 and 11, with the closure code they need (`hearing`, `invokeClosure`, `spendAnswer`).
  * `models-shapes.ts`: the args checkers, `leaseFriend`, `leaseStamp`, `leaseGrantOpts`, `stampedGate`, `gate_epoch` in `gateProps`.
  * `vault.ts`, smallest change: `leaseFriend()` adapts `tryGetLease`, `tryPutLease`, `tryDelLease`; new `leaseCachedOf(proving)`; `#peekLease` fetches a sparse vault to learn its epoch.
  * `tests/test-helpers/proving-world.ts`: `fakeLeaseFriendOf`, `makeGrantedLease`, `provingWorldOf`, `_cheat_vaultKeyBytesOf`.
* **Decisions taken**:
  * `gate_epoch` is at `stored.gate.gate_epoch`, as thread 2 expects.
  * Any other epoch forgets the cached lease, older or newer: one branch.
  * The kind of proving is the existing `wayinkind`. `LeaseFormat` stays 7001: an old row fails the strict check, reads damaged, and is overwritten by the next cache.
  * `provingWorld` requires `strengthChecker`.
  * `buildStored`'s `gate` is the duck checker `stampedGate`, so `proving.ts` imports nothing of `gate.ts`.
  * `gating.ts` is untouched and keeps its own `checkStrength` until thread 10. Until then a passphrase through it is checked twice, harmlessly.
  * The legacy `with*` bump the epoch, so a gate change sends every device, this one's next session included, back to a proof. The session in hand continues. Thread 11 re-caches with `buildLease(friend, newEpoch)`.
* **Deviations**:
  * `leaseMillis` is off the friend, though the spec lists it: nothing reads it without an autolock, and `bank.leaseMillis` serves `bank.tidy`. Extras strip, so thread 7 can add it.
  * `lock` is on the friend, though the spec omits it: a lease that will not open locks its vault. The spec is silent on damaged leases.
  * `Lease.peek` takes `gate_epoch`. The spec's row shows the friend alone; its text says the epoch "is passed where it is wanted".
  * `Proving.checkStrength` answers a verdict, per the spec's row, though STYLE's `check*` returns nothing. `buildNovel` turns weak into the refusal.
  * A damaged cached row refuses `damaged_lease` and the vault tells bad news; it was a warning and no news.
  * A gate with no passkey refuses a passkey attempt `absent_wayin`; it was `wrong_passkey`.
  * Autolock is gone from the models outright, its tests with it. A lease's age is unchecked until `bank.tidy`, thread 12.
  * Outside `tests/models/`, `tests/loosened/` needed adapting: renames, and two pins gone (the autolock deadline; README.md:844's "lease taken up after a revoke", now fixed by the epoch and shown in `vault-unlock.test.ts`).
* **Set aside**:
  * Queueing the cache in `#setLease` through `#leaseChore`: a bigger change to code thread 7 rewrites.
  * `Proving` importing `Gate` to check `instanceof`: a runtime cycle.
  * Closures in `proving.ts`: the spec moves them to the gating, so they sit in `gate.ts` for as long as the `with*` do.
  * `demandOpens`: it is async, so STYLE makes it `checkOpens`.
* **Restacked over the line** (2026-11-03; the tip before it is the local tag `20261103-gate_proving-prerebase`, was `4574144a`):
  * The line's way kept everywhere it overlaps: no staging, no `Cache`, no Store, `send` on `Box` only, births through `listing.create`. `create` now takes thread 3's lease with `vault.leaseCachedOf(proving)` over `putDraft`.
  * The `gate_epoch` settled: `gateProps` requires it, so a `Gate` carries it, and `listing.recordOf(vault)` holds (pinned in `vault.test.ts`). `#draftWithProving` and `#sendGate` no longer write it over what the `Gate` and the `with*` already give; `wayinsOf` in the test world goes with it.
  * `VS.gate` is `uint.positive()`: a stored `gate_epoch` of 0 reads as a damaged row. It was `uint` and the models refused 0 only later, at the `Gate`.
  * Tests that went: the staged-edit and autolock pins in `loosened.test.ts`, each deleted by one side, so its `[The seal]` section; the `Vault.edit`/`send` block and `MSX.vaultPatch`, deleted by the line.
  * `helpers/trigger.ts` and its test are gone, with `MaxTimerHours`, `MaxTimerMillis` and the `ErrorExpected` phrase, which only it read. `one-at-a-time.ts` stays.
  * The first commit alone is red on `tsc` and seven tests, as the line's shapes and its conflicts meet there; the repair commit after the rest of the thread's commits greens them. Each commit between is red the same way.
* **Discoveries**:
  * The crossing: a `lock()` landing while `vault.ensureUnlocked` proves ends unlocked, the lease in the vault and in the cache, as `noted.md` rules; the next `lock()` ends that session. `tests/models/halpimonfire.test.ts` pins it.
  * `vault.leaseCachedOf` is public only because `vault-listing.ts` calls it; thread 7 can fold it in.
* **For the Coach**:
  * The six rows of the PR's open questions; none blocks.
  * The docs for all this (`notes/guarantees.md`, `passkeyClear` in `VOCABULARY.md`, `notes/wontfix.md`) are thread 14's, as the plan says. Nothing went to `notes/security.md`; the epoch rule and the end of autolock belong there once they reach the exported package.
