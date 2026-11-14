# Thread 1: storable_send (2026-11-03)

Branch `20261103-storable_send`, PR #449, cut from `38caeae2`. **Justify: green**: lint, typecheck,
build and size budget; `safebyok` 4599 passed, 37 skipped (83 files); root 302; no size budget moved.

* **Built**: all of `src/` for the thread, and its tests:
  * `Storable` loses `PatchT`, `#staged`, `combined`, `#cache`, `edit`, `send`, `reconcileStaged`.
  * `Box.send(patch, opts)` and `#edit(patch, ante)`: the record is made, returned, held nowhere.
    `Box.seal` goes.
  * `listing.put(duck, ante)`: `ante` is **required**; null, or a revision at `NeverStoredSeq`, is over no record.
  * `listing.create(dna)` on both listings, with `tryCreate`, over a protected `putDraft`.
    `listing.build` takes a record only.
  * `Vault.send`, `Vault.edit`, `VaultPatch`, `vaultPatch`, `GateStaging` gone; `#sendGate` is a direct
    `listing.put`; `ensureReadyToChangeGate` replaces `ensureReadyToEdit`.
  * Device cache of records gone: `Cache`, `Cacheable`, `buildableRecord(s)`, `vaultCache`, `VaultCache`, `BoxCache`.
  * Also obsoleted and gone: `receivedAct`, `stagedAct`, `stagedForms`, `StagedForms`, `EditOpts`,
    `movedUnderEditError`, `Phrases.MovedUnderEdit`, `Phrases.ClosureWithRecord`, `closureWithRecord`,
    `hasRevision`, `draftOf`, `holdDraft`, `lastSaveOf`, `_cheat_staged`.
  * Tests moved, all green: `models-shapes`, `vault`, `vault-gate`, `vault-unlock`, `vault-life`,
    `box-seal`, `box-listing`, `box`, `listing`, `storable`, and `tests/loosened/*`; helpers
    `models-world.ts` (`fakeSealBoxListingOf` fakes at the lease, with `duringSeal`) and `vault-world.ts`.
    Sends over a built record need `held.mw.seedStore(record)` first (the fake store's CAS); `box.test`'s
    `builtOf` and `storable.test`'s `builtBoxOf` do it.
  * New `tests/models/halpimonfire.test.ts`: a lock during the seal refuses `vault_locked` and puts
    nothing; a lock during the put lands the record anyway.
  * Deleted, not ported (their subjects are gone): `reconcileStaged` tables, the cacheable copy, the staged
    edit and `makeStaged` races, the settle saves, the device cache's loads/malformed/other-vault copies,
    `isFullPatch` in box.test; in `tests/loosened`, the three `reconcileStaged` pins, the del-staged
    tombstone and ouch-carry pins, and `vault.edit`/`vault.send`'s refusals. Two pins were rewritten:
    registered_at over a rebirth (edit and send are one instant now), and the store-answers-the-buried-
    registered_at pin, whose box now follows the answer, as the staged copy that kept the rebirth's time is gone.
  * `listing.build` is `async` with no `await`, under an `eslint-disable-line` (below); `Promise.try`
    is not in the lib target.
* **Decisions taken**:
  * *No held draft at birth.* `listing.create` makes the draft and puts it over no record; the
    answer builds and holds the instance through `#buildOrReceive`. It solves bank.ts's GAP: a
    `stale_write` at birth holds only what storage delivered. `create`, not `build`, as STYLE.md's
    `build` promises to store nothing. Set aside: central = the draft at revision 0 with a
    never-stored flag (a branch at the prior tok and at `cmpRevisions`, and another device's revision 0
    throws); `build(dna)` dropping the whisper over a never-stored tombstone (the dna means nothing);
    a `#draft` field (`#staged` under another name).
  * `send` hydrates: the tables' ⏳ 💯 rows over `noted.md`'s "`send` does not hydrate", as the
    tables outrank it. Thread 5 reworks hydrate.
  * `#sendGate` hydrates first, so a gate moved while proving is still refused against `ante`, as
    before, and its `meta` drops `staged_revision`, since nothing is minted before the refusal.
  * `del` shows gone only once landed, per the spec.
  * `BoxPatch` stays both-required: the plan gives the sidecar-only send to thread 9.
* **Deviations**:
  * The handoff's "one protected stopgap over `listing.put`" is `listing.create` plus `#sendGate`'s
    `listing.put`, with no method on the vault: a held draft would be staging again. The Coach's quote
    says `send({ whisper?, sidecar? })`; both halves stay required here, per the plan's thread 9.
  * `hydrateAll` stays, though the spec's Gone list names it: thread 5's.
* **Suppressions**: one `eslint-disable-line @typescript-eslint/require-await` on `listing.build`, so that a
  refusal in `sparseOf` rejects instead of throwing; `Promise.try` would do but the lib target lacks it.
* **Discoveries**:
  * `errors.ts`'s `RefusalMeta.staged_revision` is now dead; left, being outside `models/`.
  * Crossing: a lock during `listing.put` lands anyway, past the window; `send` checks the lock at
    both ends of the seal. `del` guards only at entry.
  * `boxDna` is strict about `revision_seq`: it is no factory prop, and refuses 'bad_option'.

* **For the Coach**: the Coach's `send({ whisper?, sidecar? })` versus the plan's thread 9: optional
  halves wait for thread 9, recommended, as `#unseal` exists there to reseal.
