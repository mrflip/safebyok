# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR [#470](https://github.com/mrflip/safebyok/pull/470), off main at b83afc28. Justify: green at the tip (core 4877 passed, 37 skipped; every package green), and at each commit but 90cf9b74 (see Discoveries).

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout (untracked there).

* **Built**:
  * Commit 1, void sentinels: `VoidRevision`, `VoidRevisionSeq`, `VoidRevisionTok`, `VoidLifeTok`, `VoidTime`. `#neverStoredOf` is gone, so a new instance's central is the one stable void revision. `BoxProps` is `BoxHalves`.
  * Commit 2, `demandNotHeld` out, its tests re-made by hand from stash 0. `create` holds a temporary `this.scopeOf(dna)`, since `demandNotHeld` was what checked the scope; `puttable` takes that over in commit 6.
  * Commit 3, the VaultDB's `ifAbsent`: `VS.putIfAbsent`, on `putOpts` and `putVaultOpts`, defaulting `'add'`. `PutTerms` gains `mayAdd`, enforced by `MemoryVaultDB` beside `mayReplaceLive`. The table is pinned in `tests/storage/vault-db-new.test.ts`.
  * Commit 4, `listing.put(record, { prior, ifAbsent, ifPresent })` answers the instance held. `putDraft`, `priorOf`, the `Thing` form and the `ante` parameter are gone; `#buildOrReceive` takes only a record.
  * Commit 5, nothing depends on `hello`: `#isGreeted` and `#ensureGreeted` are gone, `boxListing.get` owns what `vault.getBox` did, and `getBox` is sugar.
  * Commit 6, split in two. The rename: `box.send` is `box.put`, with `tryPut`, `ensurePuttable`, `demandPuttable`, `MSX.boxPutOpts`. The chute: `boxListing.puttable`, `boxListing.create`/`tryCreate` and `MSX.boxCreateOpts`, `box.put` sealing over the revision it took on entry and answering the box listed, `vault.putBox` as sugar. Refusals `Phrases.boxNotListed`, `Phrases.RecordForNewBox`.
  * Commit 7, plain demands in `box.expose`, `vault.unlock`, `vault.hello`; `ensureExposable` and `ensureAttachable` had no callers left and are gone.
  * Probes confirmed on the real build and pinned in `tests/models/vault-boxes.test.ts` ("a void instance, then a put"): every row of the plan's table held. An ending or a lock crossing `box.expose`'s unseal is pinned in `halpimonfire.test.ts`. No suppression added: no `@ts-expect-error`, no `eslint-disable-line`.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`: the plan's ruling says "a zero tok".
  * The 2008 date's constant is `VS.VoidTime`, beside the other sentinels, not in `consts.ts`: nothing outside the vaultDB's shapes names it.
  * The changeset is empty: no entry point exports `models/` or the new vaultDB.
  * `put`'s forced branch is the one line: `throw new VaultError('unexpected_error', Phrases.PutAnsweredNothing)`.
  * `#demandRecordOfScope` moved out of `#buildOrReceive` into `deliver`'s two paths, the only place the scope asked can differ from the record's: `build`'s and `#onNotice`'s check was vacuous.
  * The put's checker is `putIfAbsent` in both `VS` and `MSX`, beside the get's `ifAbsent`. `meetsTerms` and `putTermsOf` are module helpers in the adapter and the base.
  * `boxListing.demandUsable()` asks `world.demandBoxesUsable()` first, then `demandEnabled()`, so `vault_gone` still beats `vault_locked` and the listing's `disabled`. `BoxWorld` grew `demandBoxesUsable`. Set aside: a demand in the vault's sugar (ruled: no logic there), and taking `vault_locked` on a deleted vault (misleading, since a listing never made is enabled).
  * One checker, `MSX.boxPutOpts`, for `box.put` and `puttable`: timely options strip. No separate `puttableOpts`. Lint forbids the name `createOpts`, hence `boxCreateOpts`, which keeps the timely options since `put` takes them.
  * `demandBoxesUsable`'s `bag` parameter went, with no caller left.
  * VOCABULARY.md is untouched: `send` was never in it, and `puttable`, `void` and upcreate are not exported terms of the cast until an entry point exports `models/`.
* **Deviations**:
  * The plan handles a null answer in `fetch` (`this.at(scope)?.receive(null)`). It is in `#receiveNothing`, reached from `deliver`'s good path, because a del's `void` answer also delivers null, and `del` is out of this thread.
  * `puttable` also demands `demandUsable()`, which the plan's pseudo code does not, so `putBox` keeps `vault_gone` and `vault_locked`.
  * `create` keeps `boxDna.parse` (both halves required, sealed parts refused), unlike the pseudo code. So for `create` `boxDna` refuses a record first, and `puttable`'s record check matters for `putBox(…, { ifPresent: 'fail' })` and a direct `puttable`. `puttable` gets the raw input.
  * `{ ...patch, ...this.scope }`, not the plan's `{ ...this.scope, ...patch }`: a patch may hold `undefined` scope props, and this leaves a wrong-vault patch to `box.put`'s `bad_option`, as today. The cost is a harmless void shell.
  * The plan expects `create`-over-held tests to become `stale_write` tests. Under `create`'s `ifPresent: 'fail'` a live row answers `camped`; over a tombstone held, a `create` lands at the next seq. `stale_write` is a `repl` put missing its `prior`, which is what a void instance over an unlisted row hears.
* **Discoveries**:
  * 90cf9b74 was pushed with one test red (`refuses 'bad_scope' a dna naming another vault`): my scratch justify wrapper's exit status was its filter's, so `&&` went on past a red run. The wrapper is fixed; the next commit repairs the test. No commit after it is red.
  * `vault.putBox` of a sidecar alone over a box stored but not listed hears `no_whisper`, no fetch; the sentence now says "listed" and names `vault.hello()`. Over a damaged row not listed it hears the same: damaged rows are the host's, as ruled.
  * `vault.delBox` of a stored box not held now goes over the sentinel and hears `stale_write`, frontier delivered, a retry landing. Pinned in `vault-boxes.test.ts`; see *For the Coach*.
  * A refused put leaves a void shell in the slot: in `things`, not the snapshot, as the plan expects. The next `create` reuses it.
  * The chute needs nothing further from `hello`.
* **Races, each a row and no fix**:
  * The central moving during `box.put`'s seal: `prior` was taken on entry, so the CAS answers `stale_write`. Pinned in `box.test.ts`.
  * `lock()` during the seal: `demandPuttable` after it refuses `vault_locked`, nothing stored. Pinned.
  * A sweep, vacate or lock crossing `box.expose`'s unseal: refused, nothing exposed. Pinned.
  * Two puts on one void shell: one lands, the other hears `stale_write` or `camped`. A vault deleted during a seal: its boxes are disabled, so the put hears `disabled`.
* **`newdesign-models.md` stale lines** (the Coach is editing it, so not touched): 94, 95 and 312 say `box.send`; 97 and 313 say `box.del=>listing.del`; 131 has `vault.hello` as the first box call.
* **For the Coach**:
  * **`delBox` over a box not held.** `stale_write` then a retry, or a fetch first as `getBox` does? `del` is out of this thread and redesigned later, so I left it. Recommend settling it with `del`'s thread.
  * **Doc blocks.** Those marked `SLOPDOC` I renamed through but did not rewrite. Every one I wrote is one line of purpose; none refused to describe that way.
