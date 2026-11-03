# Thread 1: storable_send (2026-11-03)

Branch `20261103-storable_send`, PR #449. **Justify: RED, a checkpoint.** `src/` typechecks;
`tsc` has 316 errors, all in tests; `vitest tests/models tests/loosened`: 299 failed, 861 passed.
Stopped on the orchestrator's order after three compactions: a fresh worker finishes from here.

* **Built**: all of `src/` for the thread, and these tests:
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
  * Tests done, green: `models-shapes`, `vault`, `vault-gate`, `vault-unlock`, `vault-life`, `box-seal`;
    helpers `models-world.ts` (`fakeSealBoxListingOf` now fakes at the lease, `duringSeal`) and `vault-world.ts`.
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
* **Discoveries**:
  * `errors.ts`'s `RefusalMeta.staged_revision` is now dead; left, being outside `models/`.
  * Crossing: a lock during `listing.put` lands anyway, past the window; `send` checks the lock at
    both ends of the seal. `del` guards only at entry.
  * `boxDna` is strict about `revision_seq`: it is no factory prop, and refuses 'bad_option'.

## What remains (for the fresh worker)

Read this, `git log`, and the diff of `src/models/`; `src/` should need little beyond what tests expose.

1. `tests/models/box-listing.test.ts`, nearly done, 3 red and 1 type error:
   * "puts once": the calls are `['put', 'takeWorld']`; fix the expectation.
   * "ignores the props the factory controls": I added `revision_seq: 3`, and `boxDna` refuses it. Drop
     it, and instead assert the refusal.
   * "follows the box through a send": a `fullBoxRecord` built but never seeded meets the fake
     store's CAS, so `held.mw.seedStore` it first. **This hits many tests below too.**
   * Line 568: `box_key_wrapped` in a dna needs a cast, `as never`.
2. `tests/models/box.test.ts`, `listing.test.ts`, `storable.test.ts`, not yet touched. Mechanical:
   * `.build(dna…)` to `.create(…)`, which now stores, so a following `send` goes to revision 1.
   * `listing.put(box)` to `put(box, box)`, and `put(record)` to `put(record, null)`.
   * `box.edit`/`box.seal` to `box.send`; drop `_cheat_staged`, `hasStaged`, `callsOf('save')`,
     `.cached`, `lastSaveOf`, `seedCache`, `willLoad`, `willSave`, and any `cache` opt.
   * Delete, don't port: `storable.test.ts` *reconcileStaged table* (~618), *cacheable* (~918),
     *storable.edit(patch)* (~1084), *central moving while makeStaged runs* (~1155), *cacheable copy*
     (~1543), *staged edit carried past damage* (~1625), *settle saves* (~1649); `listing.test.ts` cache
     settle (~319), cache malformed (~781), copy of another vault_tok (~804), *cached copy's staged*
     (~1053), *settle saves* (~1209); `box.test.ts` `isFullPatch` (~908).
   * Keep and adapt `storable.test.ts`'s `send` tests (~1186), which drive a box, per the handoff.
3. `tests/loosened/{loosened,box,vault}.test.ts`: models pins; delete pins of what's gone
   (`reconcileStaged`, `vault.send`), adapt the rest (`new TestableBox` args). No bar, but justify must pass.
4. Create `tests/models/halpimonfire.test.ts`, one passing test: a lock during the seal refuses
   `vault_locked`, nothing put: `fakeSealBoxListingOf(mw, {}, () => mw.setLockState('locked'))`.
5. Check `pnpm lint`: unused imports in `src/models/`, banners (`[Listing verbs]` etc.), `Dna` imports.
6. `pnpm justify` green; update this file and the PR; `gh pr ready`; report `ready`.

`tests/test-helpers/builders.ts` ~219 and `proving-world.ts` typecheck clean, but check for `vaultCache`.
Scratch tool for block edits: `/tmp/claude-1000/-workspace-byok/4e6e01c2-771d-437d-997a-0afe62dd8cd4/scratchpad/storable_send/tedit.py`
(the `T` class: `sub`, `rx`, `lines`, `block`). `T.lines` drops a whole line: mind a `for` header holding the needle.

* **For the Coach**: the Coach's `send({ whisper?, sidecar? })` versus the plan's thread 9: optional
  halves wait for thread 9, recommended, as `#unseal` exists there to reseal.
