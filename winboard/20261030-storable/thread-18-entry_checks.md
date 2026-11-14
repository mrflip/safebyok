# Thread 18: Validators at every entrypoint (2026-10-31)

Branch `20261031-entry_checks`, PR [#405](https://github.com/mrflip/safebyok/pull/405), stacked on [#404](https://github.com/mrflip/safebyok/pull/404). Justify: green (safebyok 4489 passed, 37 skipped; every package green). Changeset empty. No size budget moved; no `eslint-disable` or `ts-expect-error` added.

The survey of every public method of Box, BoxListing, Storable and Listing, checked before, newly, and left unchecked with the reason, is in [thread-18-entry_checks-survey.md](thread-18-entry_checks-survey.md): read it before adding an entry to any of the four, or reviewing this thread's coverage.

## Built

Under `packages/safebyok/`:

* `src/models/models-shapes.ts`:
  * `boxDna` and `boxPatch`: one `Checkers('bad_option', ...)` call sharing the halves (`{ whisper: whisperHolder, sidecar }`) and the record shapes. `boxPatch` is `boxRecord.omit({ sidecar }).partial().extend(halves).strict()`: every field a box record has may be given, each checked; whisper and sidecar are required; the output keeps the whisper, the sidecar and the four scope fields, the rest stripped. `BoxPatchGiven` is its output type.
  * `whisperHolder` refuses `bad_option`, and LOCKED by name (`Phrases.LockedIsNoWhisper`, "LOCKED is not a whisper: unseal or expose one first").
  * `MSX.watchable`, `MSX.listener`, `boxListingOpts`.
* `src/models/storable.ts`: `protected abstract isFullPatch(patch: unknown): asserts patch is PatchT`, beside `isFullRecord` (the Coach's directive: "rename [namesBoth] to isFullPatch, establish as abstract method"). `edit` calls it first of all.
* `src/models/box.ts`: `isFullPatch` parses `boxPatch` (advice `Phrases.BoxPatchAdvice`), then `verifyConsistent` against `this.scope` (`bad_option`, `Phrases.patchOfOtherScope`, naming the fields). Box's `edit` override is gone; `makeStaged` destructures `{ whisper, sidecar }`, the strip. `BoxPatch` is the patch's type.
* `src/models/vault.ts`: `isFullPatch` the same way, over `vaultPatch` (new in models-shapes: `vaultRecord.partial().strict()`, `bad_option`); `VaultPatch` (VaultProps plus any vault-record field) is its PatchT.
* `src/phrases.ts`: `WhisperAndSidecarRequired` became `BoxPatchAdvice`; `patchOfOtherScope` and `LockedIsNoWhisper` are new.
* `src/models/storable.ts`, `listing.ts`, `box-listing.ts`: the checks the survey lists.

## Decisions taken

* **A malformed whisper refuses `bad_option` at every entry** (the setter, edit, send, seal, build), where the setter and edit refused `bad_whisper`. STYLE's *one input, one validator*: a dna or a patch is checked whole by one check of one kind, and a check embedded in a Checkers call refuses with that call's kind. `bad_whisper` for the whisper alone would take a cascade, or sifting issues by path. The setter's `{ val }` is itself a bag, so `bad_option` reads true there too. The old public box (`putBox`) keeps `bad_whisper`; both are misuse.
* **Thread 15's `namesBoth` folds into `boxPatch`, and becomes `isFullPatch`**: a patch missing its whisper or sidecar, or holding a null one, fails the check; `BoxPatchAdvice` (its old sentence, reworded) is the refusal's advice.
* **How `isFullPatch` and the duckish check divide the work**: the Checker (`boxPatch`, `vaultPatch`) owns the shape: which fields are required, which ride along, each field's check, and the refusal naming the field. `isFullPatch` owns what only the instance knows: it runs the Checker, holds the scope fields to `this.scope`, and is the one door `Storable.edit` calls. It is an assertion, not a boolean: a boolean `false` cannot name the field, and the directive asked for the Checker's refusal wherever that names it. The strip is `makeStaged`'s destructuring.
* **Set aside**: a boolean `isFullPatch` with a second abstract for the refusal (two methods for one check); an abstract `fullPatchOf(patch): PatchT` that returns the parsed, stripped copy (honest and copy-safe, but not the name directed). See *For the Coach*.
* **A scope field naming another box refuses `bad_option`** (the handoff's kind), through `verifyConsistent`, naming the fields that differ; a scope field that fails its own check refuses `bad_option` as any other field.
* **`boxDna` simplified, accepting and refusing exactly as before**: the factory's fields are `boxSparse.pick(...).partial()`, and the strip is `omit(dna, factory.keyof().options)` (es-toolkit), where a hand-written transform destructured six fields.
* **Scope arguments refuse `bad_scope`** (`at`, `absentRefusal`), as `scopeOf` does everywhere else and as STYLE has it; not `bad_option`.
* **The factory fields in a patch are checked, not compared**: a `revision_seq` or `written_at` from an older record passes, and is stripped. Only the scope must agree.

## Tests

* **Restated to their new truth** (`bad_whisper` to `bad_option`, subjects kept):
  * box.test.ts: the `{ ...LOCKED }` setter test; the three BadWhisperCases loops (set, edit, send), their titles too; "refuses 'bad_whisper' before its guards ..." (now 'bad_option').
  * models-shapes.test.ts *MSX.whisperHolder*: the holdsCases kind, the fieldnames and SECRET-marker tests.
* **New, appended at each file's end:**
  * box.test.ts, "Box and Storable entries: arguments checked first of all, before any guard": each entry with a bad argument while locked refuses `bad_option` with no world call and nothing staged; isWatchable and subscribe; LOCKED to edit, send and seal; another box's scope; a factory field failing its check; an unknown field; the round trips of `{ ...record, whisper, sidecar }` through edit and send, factory fields given and stripped.
  * box-listing.test.ts, "BoxListing and Listing entries: ...": build with five bad dnas while locked; a sound dna while locked refuses `vault_locked`; a LOCKED whisper in a dna; the constructor's world; `at` and `absentRefusal` with a bad scope; hydrateAll with bad opts; subscribe(null).
  * models-shapes.test.ts: `whisperHolder` and LOCKED; `boxDna`, `boxPatch` and `vaultPatch` cases, the strip, fieldnames, SECRET markers.
  * box.test.ts, "Storable.edit holds its patch to ... isFullPatch first of all": a patch not full refuses before bad opts and the lock; only whisper and sidecar are laid over the record.

## Discoveries

* **The models Vault has no test world**: no test builds a VaultListing, so `Vault.isFullPatch` is proved only through `vaultPatch`'s tests in models-shapes.test.ts and the types.
* **VaultListing.build checks no dna**: its `draftOf` spreads the dna, and a bad one refuses `bad_scope` at `scopeOf(draft)`. Out of this thread's four classes; a `vaultDna` check would match the box's.
* **The duplicate `hasRevision` calls** (BoxListing.build and Listing.build): neither became redundant. An abstract `dnaOf` (the dna check) called from Listing.build would let BoxListing drop its `build` override. Reported only, per the handoff.
* **`boxListing.absentRefusal` puts the boxlabel into its message**, an echo of a host's input that predates this thread. A boxlabel is no secret, but the rest of the package names a field rather than quoting it.

## For the Coach

* **Whisper kind**: `bad_option` everywhere, as above. The alternative is `bad_whisper` everywhere, at the cost of checking the whisper apart from its patch.
* **`isFullPatch` asserts, so its `is` names a throw.** The guard family that throws is `demand*` (`demandFull`, `demandPresent`); `demandFullPatch` would read true. Recommend the rename; kept as directed.
* **`makeStaged` gets the host's patch, not the parsed copy.** The parsed whisper was a frozen copy; now the host's own object reaches `makeStaged`. Harmless while `stubSeal` never looks at the whisper; when the real seal lands, a host mutating its whisper mid-edit could seal what was never checked. `fullPatchOf` (above) closes that; recommend it then, or now.
