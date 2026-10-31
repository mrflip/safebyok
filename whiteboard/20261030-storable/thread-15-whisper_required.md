# Thread 15: A whisper and a sidecar on every update (2026-10-31)

Branch `20261031-whisper_required`, PR #390, stacked on #389. Justify: green (safebyok 4347 passed, 37 skipped; every package green, size budgets unmoved).

* **Built** (all under `packages/safebyok`):
  * **`BoxProps` is `{ whisper: Whisper, sidecar: Sidecar }`, both required** (`src/models/box.ts`). `Box.edit` checks the patch first, through the module-private `namesBoth(patch)` (in *Record forms*), and refuses `bad_option` with `Phrases.WhisperAndSidecarRequired` before any guard or hydrate runs, so nothing is staged and nothing is called. `send` and `seal` come through `edit`, so the check is in one place.
  * **`seal(whisper, sidecar, opts)`**: `edit({ whisper, sidecar }, opts)`.
  * **`makeStaged` is one line**: `stubSeal({ ...base, sidecar }, whisper)`. `base` lends its scope, revision, times and whisper's form; its sidecar and sealed parts are replaced.
  * **`build(dna)`**: `boxDna` (`models-shapes.ts`) requires `whisper` and `sidecar` (no `.optional()`, no `.default({})`), refusing `bad_option` naming the missing field. `BoxDna` (`box-listing.ts`) types both as required. `draftOf` hands the whisper on as it is. `stubSeal` takes a `Whisper`, never null.
  * **The whisper setter exposes, and that is all**: doc blocks on `#exposed`, the getter/setter say nothing seals it. The setter's code is unchanged.
  * **Removed**: `reseal`, `BoxEditOpts`, `Phrases.NoWhisperToCarry`, `Phrases.NoSidecarToCarry`, the sparse-base paths and the `#exposed` fallback in `makeStaged`.
  * **Test world**: `boxDnaOf(scope, overrides?)` at the end of `models-world.ts` (a dna with `whisper: 'sk-test-0000', sidecar: {}`); `fakeSealBoxListingOf`'s `makeStaged` lost its no-whisper branch and its sidecar carry.
  * **Spec** (`whiteboard/20261028-storable_base/storable-spec.md`): both `reseal` entries struck as retired; `box.seal(whisper, sidecar)`; `box.edit({ whisper, sidecar })` states the rule; the getter/setter only expose; the "Must reseal…" musings now read as the rule's consequence. Its own `plan:` commit.
* **Tests**:
  * Restated in place, one mechanical pass: every `edit`/`send`/`tryEdit`/`trySend` of a sidecar alone gains `whisper: 'sk-test-0000'`; of a whisper alone gains `sidecar: {}`; every `build({ ...scope })` became `build(boxDnaOf(scope))` (in `listing.test.ts` through a local `dnaOf`, for the nesting limit). `send({})` after an edit became a send of a full patch (box.test rebirth, loosened rebirth, box-listing "sends as it is built"). Two storable.test expectations (the `edit` row of the reconcileStaged table) now expect the stub's sealed parts, as every edit seals.
  * `MSX.boxDna`'s table (models-shapes.test) rebuilt on a `dna` base with whisper and sidecar; example numbering in titles follows the doc block's new examples.
  * **Appended**: box.test *A whisper and a sidecar on every update* (edit and send of each lacking patch refuse `bad_option`, calling nothing; `seal` without a sidecar; refusal before the lock guard; a refused edit leaves an earlier staged edit; an exposed whisper is no substitute; the setter seals nothing; the sidecar given replaces the one held). box-listing.test *A whisper and a sidecar at birth* (a dna lacking either, or both, refuses naming the fields, holding and calling nothing).
* **Tests deleted, their subject removed by the rule**:
  * box.test `box.send(patch): a sparse box with no whisper` / "refuses 'bad_option' from makeStaged when storage too holds it sparse": the carry from a sparse record; the appended describe covers a send lacking a whisper.
  * box.test "refuses 'bad_option' a live box still sparse once hydrated, given no sidecar": `NoSidecarToCarry`.
  * box.test "seals the whisper exposed, where the edit gives none": the exposed whisper no longer seals; its inverse is appended.
  * box-listing.test "builds a dna whose whisper is undefined as it would one with none": the whisperless dna; its inverse is appended.
  * stub-seal.test "seals a box made with no whisper as it would any other": `stubSeal` takes no null.
  * models-shapes.test "hands back the scope with the defaults filled: an empty sidecar…" folded into the first-example test: the sidecar has no default.
  * Retitled where the old title named a carry or a default: box.test "refuses a sidecar edit with no whisper … before anything is staged" (was "from makeStaged"), "seals a whisper with its sidecar over a full box …" (was "keeping its sidecar"), "seals a deleted box back to life with the sidecar given" (was "an empty sidecar, where none is given"); box-listing.test "calls nothing of the store" (was "a whisper given or not"), "sends as it is built" (was "with no whisper given"); loosened.test "its sidecar the {} given" (was "{} unless given").
* **Decisions taken**:
  * **The check sits in `Box.edit`, not a validator.** Thread 18 puts a duckish validator at every entry; `namesBoth` is a one-line predicate it can fold in or replace. Taken as `Partial<BoxProps>` so a host's untyped patch is judged, not assumed (a direct `patch.whisper === undefined` on `BoxProps` fails lint as always false).
  * **`bad_option` before `vault_locked`**: the check precedes every guard, so a malformed patch refuses the same way locked or not. Tested.
  * **`makeStaged`'s `opts` parameter kept** in `Storable`'s abstract signature, though no implementer reads it now: the vault's gate may need it, and it is the base's surface, not this thread's.
* **Approaches set aside**: a `boxPatch` Checker in `models-shapes.ts` (thread 18's job, and a second shape beside `BoxProps` it would have to reconcile); checking in `makeStaged` (runs after hydrate and guards, so a malformed send would fetch first).
* **Discoveries**: no vault-model test edits; `VaultProps` is untouched. The handoff's "around lines 125, 208, 253-262" in the spec were exact.
* **For the Coach** (also the PR's open questions): `bad_option` precedes `vault_locked` for a malformed patch (recommend keep); `makeStaged`'s unused `opts` kept (recommend keep for the vault's gate).
