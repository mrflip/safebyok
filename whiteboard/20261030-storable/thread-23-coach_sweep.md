# Thread 23: The Coach's fingerpaints and Closer Look marks (2026-10-31)

Branch `20261031-coach_sweep`, PR #406, stacked on #405. Justify: green (safebyok 4499 passed,
37 skipped; every package and the size budget green, no budget moved). Changeset empty.

* **Built**, a commit per family:
  * *Fingerpaints* (c42012ec), ported by intent, never applied:
    * `tattoo`/`tattooProp`/`TattooOpts` exported from `src/helpers.ts`, with tests. Tattoo is
      kept for the immutable scope and `vault_tok`.
    * `revision_tok`, `revision_seq`, `written_at` and `registered_at` are plain assignments to
      `declare`d fields (the Coach's ruling). `assign(record)` takes one argument.
    * `isFullRecord` answers false for a tombstone in Box and Vault. `full` and `isFull` read
      `combined` alone.
    * `isWholeRecord` and `isTombstoneRecord` are honest type guards. `isTombstone` names `'d'`
      and `'x'`.
    * `#minted` is now `#memoizedNextRevision`.
    * The `tell` plumbing is gone: the timer's refusal and the cache save's go to
      `listing.tellBadNews`.
  * *Renames and the send guards* (e6c4ff59):
    * `priorRevisionTok` replaces `priorTok` everywhere: the Store contract, the listing's
      `priorRevisionTokOf` and `fitsPriorRevisionTok`, and the fake store.
    * `#saveCopy` is now `#cacheOnDevice`.
    * `cacheLoaded`/`cacheable` are now `buildableRecords`/`buildableRecord`.
    * `ensureReadyToSend`/`demandReadyToSend` are back on Storable. `send` checks its opts and
      `isFullPatch`, then `ensureReadyToSend`, then `edit`.
  * *Docs* (6934338e):
    * New doc blocks on `demandReadyToUnsealWhisper`, `demandReadyToSeal`, the whisper getter
      and setter, `expose` (from the spec) and `settle`.
    * guarantees.md *Open items* 2: the exposed whisper, in the Coach's words.
  * *Rulings* (79d1dd04):
    * `MSX.MinRefreshMillis = 50`. `hydrate` uses it as the horizon where it forced one at 0.
    * The `Cache` type's doc block says `save` is best effort, kept in call order, with the
      last call winning, and that a host may debounce it.
  * *becomeNotifiable* (467d9426): `Storable.becomeNotifiable()` makes the snapshot. The
    listing's `#hold` calls it. One commit, as hoped.
* **Decisions taken**:
  * **`tellBadNews` made public on Listing.** This was the narrowest way to follow "just call
    listing.tellBadNews". It is unvalidated, as a storable is its only caller.
  * **`assign` runs before `adopt` replaces `#central`.** `registered_at` still moves only at
    birth and over a tombstone held. Running it after the swap would have changed which
    central it is judged on.
  * **`isWholeRecord` returns `record is RecordT | Tombstone<SparseT>`.** The fingerpaints'
    `record is RecordT` would lie for a tombstone.
  * **Alive moved into each `isFullRecord`.** Vault's answered true for a tombstone.
  * **The constant is `MinRefreshMillis`, PascalCase.** It follows `NeverStoredSeq` and
    `consts.ts`. It lives in models-shapes, as only the models use it.
  * **`send` hydrates twice.** It hydrates in `ensureReadyToSend`, then again in `edit`'s own
    guard. The second hydrate is a no-op while timely.
* **Deviations**:
  * **The Coach's text for `demandReadyToUnsealWhisper` named `'needs_fetch'`.** No such
    refusal kind exists. The doc says what `demandFull` refuses: `'bad_option'`.
  * **The plain assignments** landed with the fingerpaints, not in a commit of their own: the
    port needed them.
  * **`tattooProp` is exported but unused in `src/`.** It is the fingerpaints' API.
  * **`fieldOf`'s doc** lost "as it stands" (a banned word) while I was in helpers.ts.
* **Discoveries**:
  * **`LOCKED` was already a frozen bag** (`isLockedFUBag`) since #403. No name says symbol,
    so nothing was renamed.
  * **`Storable.edit`'s doc was left as it is.** The Coach said "lgtm", and the Box override
    went in thread 18.
  * **A sparse answer to a fetch notes no success.** So `MinRefreshMillis` only bites after a
    full fetch: within 50 ms of it, a hydrate of a box gone sparse since (a newer sparse
    notice, say) does not fetch. An `unsealWhisper` then refuses `'bad_option'` until 50 ms
    pass. `tests/models/storable.test.ts` *shares the last fetch with a hydrate of a sparse
    central within MinRefreshMillis* pins this.
* **For the Coach** (open matters):
  * **needs_fetch**: write `'bad_option'` as the doc does, or mint `'needs_fetch'` for
    `demandFull`. Recommend leaving it `'bad_option'` until a host needs to tell the two apart.
  * **MinRefreshMillis after a newer sparse**: accept the 50 ms window, or have a newer sparse
    receive reset the trigger's last success, which is thread 24's ground (the trigger's
    verdict). Recommend thread 24 takes it.
  * **tellBadNews public**: keep it public and unvalidated, or narrow it to a
    storable-facing method. Recommend keeping it.
