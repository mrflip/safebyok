# Thread 4b: Verbs and guards (2026-10-30)

Branch `20261030-verbs_guards`, PR #375, stacked on #371 (restacked onto #374; the restack's push is pending). Justify: green (core 3888 pass, 37 skipped as before, 2 todo).

* **Built**: the Coach's fixes (d) to (g).
  * (d) `ensureReadyToSend` and `demandReadyToSend` are gone, from `Storable` and from Vault's override. `send` is `edit`, then `listing.put`. `edit` no longer calls `demandReadyToEdit()` after `makeStaged`. `demandReadyToDel` is `demandUnlocked()` alone. `demandFull` and `notFullError` stay, because the box's new guard and `#unseal` call them. Vault's two remaining overrides still type: `edit` demands present, and `del` refuses absent on `am` 'x'.
  * (e) `registered_at` leaves the tattoo, which now holds the scope alone, and `assign` sets it like the revision props. `edit`'s base takes `registered_at: now` where the record in hand is a tombstone. `revisionPropsOf` carries it. A box still has nine own keys.
  * (f) `#minted` holds `{ revision, anteTok }`. `nextRevision(ante)` returns the memoized revision while `ante.revision_tok` is `anteTok`. `send` and `del` clear it just before they hand the record to the listing.
  * (g) Box gains a `// == [Guards]` section: `ensureReadyToUnsealWhisper(opts)` calls `hydrate`, then `demandReadyToUnsealWhisper()`, which is `demandUnlocked().demandPresent().demandFull()`. `unsealWhisper` calls the ensure. `ensureReadyToSeal` and `demandReadyToSeal` exist; nothing calls them yet.
  * Tests:
    * `storable.test.ts`: banners `[Edit]`, `[Send]`, `[Del]`, `[Locked]`, `[Try forms]`. 4a's banner is renamed `[Hydrate]`, and its `// --` now closes after the trailing `it.todo`.
    * `box.test.ts`: `[Receive]` (4a's, renamed, plus the props a receive moves), `[The absent contract]`, `[Rebirth]`, `[Sending a sparse box]`, `[The whisper while locked]`.
    * `tests/loosened/loosened.test.ts`, new.
  * `fakeSealBoxListingOf(mw, overrides, duringMakeStaged)`, at the end of `models-world.ts`.
  * The reconcileCentral ouchstone note now covers a thing already held and one not yet held.
  * Comment fixes: `classifyRecordShape` and `sparse` said "payload". `box.ts`'s "[What a storable defines]" banner is now "[Concrete Subclass Required Methods]".

* **Decisions taken**:
  * **A fake seal for rebirth.** A rebirth over a tombstone needs a whisper, and the real seal refuses `unexpected_error`. `fakeSealBoxListingOf` makes boxes whose `makeStaged` turns a whisper into fake ciphered bags. Without a whisper they use the box's own `makeStaged`. Its hook lets a test lock the vault during `makeStaged`.
  * **Del answers.** By default the fake `del` answers a tombstone at the next revision. That reads `gone` and drops the staged tombstone. A scripted answer of the same tombstone reads `same`: `receive` ends before `reconcileStaged`, so the staged tombstone stays held (`hasStaged` true). The test pins this; see *For the Coach*.
  * `notFullError`'s message now fits its callers: "not full, so it cannot be opened: hydrate it". Its kind is still `bad_option`.
  * `#unseal` keeps its `demandFull()`, behind the guard.
  * Tests read central and staged through `box.cacheable`, because the getters are protected.
  * **Lock between `edit` and `put`.** The test subscribes a listener that locks. It asks for `box.snapshot` first, so that `edit`'s settle calls the listener.

* **Deviations**:
  * The box-only cases went to `box.test.ts`: a sparse send refusing `bad_option`, and rebirth.
  * Added beyond the brief: a test that a receive moves `vault_tok`. A loosened pin and an `it.todo`: a whisper exposed reads again after lock then unlock.

* **Discoveries**:
  * The first stored revision is 0 (`NeverStoredSeq` is -1), so a draft's `send` puts `revision_seq` 0.
  * `receive` calls `nextRevision(central)`, so it mints into `#minted` against the new central. The next `edit` uses that revision, which is harmless.
  * **Before this thread, `vault_tok` was already assigned, not tattooed.** The brief's (e) and thread 5 say "scope and `vault_tok` never change". My handoff said the tattoo keeps only the scope, and today a newer record under another `vault_tok` moves it.
  * **Once #372 lands:** if `#deliver` judges `ifAbsent` for `del`'s answer as well as `fetch`'s, every del test here gets `absent_box` under the default `'fail'`. `fetch` alone should pass it. Saves on settle add `save` calls that no test here counts.
  * **Once #373 lands:** it creates `tests/loosened/loosened.test.ts` too, an add/add conflict. Keep one top and both sets of describes. The same-tombstone `del` row (gone over gone, 'same') is not a `record_conflict` row.
  * `listing.ts`, `vault.ts` and `models-shapes.ts` still have "payload" and "What the…" banners, out of my remit.

* **Bad news that reaches no one**:
  * A launch the trigger's timer makes in the background ends where no one hears of it.
  * `setTimeout(() => { void this.tryLaunch() })` runs `#launchAlone`, then `storable.tryFetch()`. `outcomeOf` catches every refusal: the world's `ensureTimely`, the store's answer, a `corrupt_record` from `cmpRevisions`, a rejected cache `save`.
  * On a bad outcome the trigger schedules nothing, and the `void` drops the outcome. `onBadNews`, the listeners and the logger hear nothing. The thing goes quietly untimely, and the next verb's `hydrate` launches on demand, so that caller hears.
  * Once thread 3 passes `'nil'`, absent no longer refuses, but the rest is still lost. `listing.hydrateAll` drops its `tryHydrate` outcomes the same way.

* **For the Coach**:
  * **Same-tombstone del**: a `del` answered with the tombstone already held leaves a staged tombstone that nothing clears until a newer receive. I recommend that a `same` answer to a `del` of a gone thing drops the staged tombstone (thread 2's table).
  * **vault_tok on receive**: a box record under another `vault_tok` is adopted silently. CLAUDE.md calls this drift, which means a reload. I recommend refusing or reloading, and then thread 5's test can say the prop never changes.
  * **Exposed whisper across a lock**: today it reads LOCKED, then reads again once unlocked, against `expose`'s doc and G6. I recommend forgetting it on lock.
  * **Background refusals**: I recommend that the trigger's failed launch tells `onBadNews` (any kind but absent).

## Restacked

Restacked 2026-10-30 onto thread 7 (#377), in the line main → #368 → #374 → #370 → #371 → #373 → #376 → #377 → #375.

* **`send` puts the record it staged** (commit 88da3d5b, right after the verbs commit). Thread 5 makes a locked box's `sidecar` getter answer the LOCKED bag, and `send` handed `listing.put` the box itself, ducking as its record. So a send whose vault locked between `edit` and `put` refused `bad_record` on `sidecar`. `send` now hands over `listing.recordOf(#staged)`. `listing.put` already took a record or a thing, so no signature changed. The test "completes a send whose vault locks between edit and put" passes unchanged. The orchestrator ruled answer A, for the Coach to confirm. The verbs commit 9089ca06 just before it fails that one test.
* **Thread 2's test restated** (`tests/models/storable.test.ts`, reconcileStaged table): "edit: … a new tok each time" now reads "one tok until send or del spends it", and asserts the second edit keeps the first edit's tok. This follows (f), the revision minted once.
* **Merged test files**: `storable.test.ts`, `box.test.ts` and `tests/loosened/loosened.test.ts` each have one import block. Every describe from each thread is kept. In `storable.test.ts`, thread 4b's `// --` closes the Hydrate section before the describes from threads 2 and 5, and its Edit, Send, Del, Locked and Try sections follow. The `box.ts` banner that threads 4b and 5 both renamed keeps thread 5's "[Required by Storable]".
