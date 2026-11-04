# Thread 1: newput (2026-11-04)

Branch `20261104-newput`, PR [#470](https://github.com/mrflip/safebyok/pull/470), off main at b83afc28. Justify: green at each commit, but for 90cf9b74 (see Discoveries).

Spec: `whiteboard/20261102-newdesign/newput-plan.md` in the base checkout (untracked there).

* **Built**:
  * Commit 1, void sentinels: `VoidRevision`, `VoidRevisionSeq`, `VoidRevisionTok`, `VoidLifeTok`, `VoidTime`. `#neverStoredOf` is gone, so a new instance's central is the one stable void revision. `BoxProps` is `BoxHalves`.
  * Commit 2, `demandNotHeld` out, its tests re-made by hand from stash 0. `create` holds a temporary `this.scopeOf(dna)`, since `demandNotHeld` was what checked the scope; `puttable` takes that over in commit 6.
  * Commit 3, the VaultDB's `ifAbsent`: `VS.putIfAbsent`, on `putOpts` and `putVaultOpts`, defaulting `'add'`. `PutTerms` gains `mayAdd`, enforced by `MemoryVaultDB` beside `mayReplaceLive`. The table is pinned in `tests/storage/vault-db-new.test.ts`.
  * Commit 4, `listing.put(record, { prior, ifAbsent, ifPresent })` answers the instance held. `putDraft`, `priorOf`, the `Thing` form and the `ante` parameter are gone; `#buildOrReceive` takes only a record.
* **Decisions taken**:
  * `VoidRevisionTok` is the zero UUID as well as `VoidLifeTok`: the plan's ruling says "a zero tok".
  * The 2008 date's constant is `VS.VoidTime`, beside the other sentinels, not in `consts.ts`: nothing outside the vaultDB's shapes names it.
  * The changeset is empty: no entry point exports `models/` or the new vaultDB.
  * `put`'s forced branch is the one line: `throw new VaultError('unexpected_error', Phrases.PutAnsweredNothing)`.
  * `#demandRecordOfScope` moved out of `#buildOrReceive` into `deliver`'s two paths, the only place the scope asked can differ from the record's: `build`'s and `#onNotice`'s check was vacuous.
  * The put's checker is `putIfAbsent` in both `VS` and `MSX`, beside the get's `ifAbsent`. `meetsTerms` and `putTermsOf` are module helpers in the adapter and the base.
* **Deviations**:
  * The plan handles a null answer in `fetch` (`this.at(scope)?.receive(null)`). It is in `#receiveNothing`, reached from `deliver`'s good path, because a del's `void` answer also delivers null, and `del` is out of this thread.
* **Discoveries**:
  * 90cf9b74 was pushed with one test red (`refuses 'bad_scope' a dna naming another vault`): my scratch justify wrapper's exit status was its filter's, so `&&` went on past a red run. The wrapper is fixed; the next commit repairs the test. No commit after it is red.
