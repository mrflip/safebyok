# Thread 9: The Coach's rulings of 2026-10-30, the rest (2026-10-30)

Branch `20261030-rulings`, PR #TBD, stacked on #381 (thread 8). Justify green: safebyok 4214
passed, 37 skipped, 1 todo; every other package green; build and size budgets unmoved.

## Built

Each behaviour, as thread 6's guarantees table wants it (all in `packages/safebyok/src/models/`):

* **A record under another `vault_tok` throws.** `reconcileCentral`'s first line: a received
  record of any shape whose `vault_tok` is not the instance's throws `unexpected_error`
  (`Phrases.OtherVaultTok`), over a living central, a tombstone, or a draft's never-stored central
  alike. Thrown to a fetch, put, del or build caller; a notice or timer launch tells it to
  `onBadNews` (routing unchanged). It replaces 4b's `vault_remade` (`vaultRemadeError` is gone).
* **`vault_tok` is fixed at birth.** `assignInitialProps` tattoos it beside the scope,
  `writable: false`; `assign` sets `registered_at` over a tombstone as before (condition untouched)
  and never `vault_tok`.
* **`same | full | ouch` takes `fill`.** A full record at the revision held over a damaged copy
  becomes central; the staged is kept as it was (the `fill` row of `reconcileStaged`).
* **A `del` answered `same` spends its tombstone.** In `receive`: policy `same`, a deletion
  received, and a staged `am: 'x'` → central adopted, staged dropped, settled. A sparse confirm
  while a del is in flight over a living box keeps the staged tombstone; a staged rebirth is kept.
* **`box.whisper = null` (or `LOCKED`) passes while locked**, forgetting the exposed whisper; only
  a new whisper calls `demandUnlocked`.
* **`edit`'s mid-edit `stale_write` carries central** as `meta.box_stored` (box) or
  `meta.vault_stored` (vault), through a new abstract `Listing.staleMetaOf`, and each listing's
  `storedInStaleRefusal` reads it back (tested).
* **`cacheable` is out of a host's reach.** It is now `[ToCacheable]()`, a method keyed by a
  symbol in `models-shapes.ts` that no entry point exports; `Listing.settle` calls it. Tests use
  `cacheableOf` in `tests/test-helpers/models-world.ts`.
* **`boxDna` refuses `revision_seq`.** Its schema omits it (`sparseBase.omit({ revision_seq })`),
  its transform no longer strips it, and its doc says so with an `@example`. `build` already
  sends anything carrying `revision_seq` down the record path, so this is the schema agreeing.
* **`record_conflict` stays a condition**: its README row, `errors.ts` comment and both sentences
  say a fetch again is worth one try, and if it refuses the same way the system is fundamentally
  not working (storage lost or rewrote the record; look at the adapter).
* **Sentences in `phrases.ts`**, section `[Storables]`: `VaultLocked`, `RecordNotFull`,
  `MovedUnderEdit`, `AlreadyHeld`, `NoWhisperToCarry`, `OneRevisionTwoToks`,
  `OneRevisionTwoFates`, `OtherVaultTok`, `ShapeUnreconciled`. Throwers and the storables use them.
* **TODO.md**, end of *Soonish*: "An edit is never saved to the device cache" and "Flush and
  remake every instance of a vault made anew".

## Decisions taken

* **`cacheable`'s mechanism.** Readers surveyed: `Listing.settle` (the one source reader) and the
  box, listing and loosened tests. Set aside: TS `protected` (the listing is not a subclass, so it
  cannot call it); an ES `#` method with a `static {}` block exporting a friend function (needs a
  mutable module binding, and is clever); a public static (a host can reach it). The symbol follows
  the `IsListing` precedent. Caveat: `Object.getOwnPropertySymbols(Storable.prototype)` still finds
  it; it keeps honest hosts out, not determined ones.
* **Item 2 lives in `receive`, not the policy table.** The table judges central only; the staged
  tombstone is the staged's business, and one guarded line said it plainest.
* **Item 8 moved more than the inline thrower sentences**: `AlreadyHeld`, `NoWhisperToCarry`, both
  `record_conflict` sentences and `ShapeUnreconciled` went too, so no storable keeps a sentence of
  its own. `seal`/`unseal is not written yet` stayed inline: placeholders, not sentences.
* **`RefusalMeta` still names the old box and vault forms**, so `staleMetaOf` casts through
  `unknown` with a comment. Retyping `RefusalMeta` is the match-up's.

## Deviations

* **Earlier describes restated** where a ruling changed what they assert, each with a comment:
  4b's `vault_remade` describe in `box.test.ts` (now "registered_at, set over a tombstone; another
  vault_tok throws", covering alive, deleted and damaged boxes × newer, same, older; a draft; a
  fetch; a notice to `onBadNews`); thread 2's pinned `same|full|ouch` test and its `it.todo` in
  `storable.test.ts`; the vault_tok-over-tombstone test (now a throw); the del-same test (now
  drops the tombstone); `models-shapes.test.ts`'s `boxDna` cases (fed without `revision_seq`).
* **Thread 2's changeset edited**: `.changeset/20261030-reconcile_rows.md`'s `record_conflict`
  sentence now says "worth one try", to match the README. Mine is empty.
* **`boxDna` touched minimally** (the `.omit` and its doc) despite "hands off more built on
  boxDna": the doc could not stop listing `revision_seq` truthfully otherwise.
* **Fix-as-you-go**: two banners renamed (`vault-listing.ts`, `vault.ts`), and the
  `storedInStaleRefusal` docs no longer open "What".

## Discoveries

* **A vault draft meeting a stored vault under another `vault_tok` now throws** `unexpected_error`;
  before, it took storage's `vault_tok`. Two devices making the same vaultlabel at once is the case
  that meets it. Item 9 says "a living central or a tombstone alike"; a never-stored central is
  neither, so this is my reading, flagged below.
* **`ShapeUnreconciled` is unreachable** now that every same-revision pair has a row; it is kept as
  the exhaustiveness guard.
* `phrases.ts`'s header still opens "What the checks say"; left, as not mine.

## For the Coach

* Confirm the vault-draft reading above (throw, versus taking storage's `vault_tok` for a central
  never stored).
* Confirm the symbol for `cacheable`, given the `getOwnPropertySymbols` caveat.
