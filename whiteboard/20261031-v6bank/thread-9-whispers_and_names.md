# Thread 9: whispers_and_names (2026-11-01)

Branch `20261101-whispers_and_names`, PR #428, stacked on #426 (`20261101-names_and_refusals`).
Justify: green; safebyok 4820 passed, 37 skipped; every other package green; no size budget moved.

* **Built**:
  * **The whisper verbs**, on the models' `Box` (`src/models/box.ts`, section *The whisper*):
    * `getWhisper(opts)` opens the stored record and hands back the frozen whisper itself, keeping nothing on the box.
    * `tryGetWhisper(opts)` is its Outcome form.
    * `useWhisper(handed, opts)` opens the whisper, hands it to `handed`, and resolves what `handed` resolves. The callback is checked with `HX.callback` (`bad_option`), and a throw from `handed` passes through as it came.
    * All three are built on `unsealWhisper`, so they refuse as it does.
  * **The exposed whisper's docs** (`#exposed`, the `whisper` getter, `expose`) now say plainly that `lock()` does not forget the exposed whisper: while locked, `box.whisper` answers LOCKED in its place, and only setting `box.whisper` null forgets it. A test pins the Coach's ruling through a real vault's lock and unlock (`tests/models/box-seal.test.ts`).
  * **box.ts exports every type its whisper verbs name**: `LOCKED`, `EditOpts`, `LockedBag`, `WhisperHolder`, `Sidecar` and `Whisper`, in a section *Named by the box's verbs*. This is ready for thread 11's `safebyok/v06` export.
  * **`parseJsonOrNull`** is one helper, `src/helpers/parse-json.ts`, with tests. The core's `box.ts` and the models' `box.ts` both import it.
  * **Name parity for the models' Bank** (`src/models/bank.ts`, `models-shapes.ts` `bankOpts`, `src/deriver/basederiver.ts`):
    * A bad applabel or user_id now refuses `bad_scope`, not `bad_option`. `bankOpts` takes both as `unk`, and `bankScope` judges them after. A missing options bag still refuses `bad_option`.
    * A new `checkKeyDeriver` refuses `bad_option` for an `algorithm: 'argon2id'` deriver whose spec Argon2id cannot run, and for any label under the reserved `argon2id_web_` prefix (any case) that is not the supplied spec unchanged.
    * `checkSuppliedSpecUnchanged` takes a `Pick<KeyDeriverSpec, 'key_deriver_label'>` and compares fields with `Reflect.get`, so it needs no cast.
    * New `tests/models/bank.test.ts` (21 tests) ports vault-make's name and deriver cases. 14 of them fail without the change.
  * **Renames**, a commit each:
    * `kept` → `stored`: test-helpers.test's tryGetBox local and vault-wayins' three revocation tests.
    * `kept` → `was`: the row-tampering tables in vault-lease, vault-storage and vault-del.
    * Convex `Reckoning.kept` → `tallyRow`, and `keptTally` → `storedTally`.
    * React `kept` → `liveness`.
    * `mask.test`'s `keptChars`/`kept` → `unmaskedChars`/`unmasked`.
    * In VOCABULARY.md and notes/guarantees.md, `KeptLease` → `CachedLease`, `kept.leaseOn` → `cached.leaseOn`, and "the kept stamp" → "the cached stamp".
  * An empty changeset: nothing here reaches an export a host imports.

* **Decisions taken**:
  * **`getWhisper` never reads the exposed whisper.** It always opens the stored record. An exposed whisper may be one the host set and has not sealed yet, so answering it would hand back something storage does not hold.
  * **"The reserved `test_` namespace"** turned out to be the key deriver's label. Neither the old `src/names.ts` nor its history checks a `test_` name. The old core warns `TestDeriverNotice` for a `test_` deriver label and reserves `argon2id_web_`. The models' Bank already warned. What it lacked was the reserved-prefix check, the Argon2id-spec check, and `bad_scope` for bad names. Boxlabel and vaultlabel already matched the old core through `boxscope` and `vaultBag`.
  * `checkKeyDeriver` lives in `basederiver.ts` beside the checks it composes, not in `bank.ts`, so thread 11's front door can call it too. It runs right after `bankOpts.parse` and before the bank takes anything.
  * `mask.test`'s `kept` became `unmasked` along with `keptChars`, as one name pair. The handoff named only `keptChars`.

* **Deviations**:
  * **`useWhisper` zeroes the opened bytes before the callback runs, not after.** `#unseal` zeroes them in its `finally` before `getWhisper` returns. That is stronger than the plan's "zeroes after the callback". The whisper itself is a JavaScript value and cannot be zeroed. What `useWhisper` adds is that the box keeps no reference to it. The doc block says so, and a test pins that the bytes are zero by the time `handed` runs.
  * Some `kept` locals were left alone because they hold no stored value: `outcome.test.ts`'s `kept` (an Outcome) and `box.test.ts`'s `kept = madeUnderOf(box)`. Likewise prose uses of "kept".

* **Discoveries**:
  * `whisper_codec` (`'json_v1'`) and `whisper_schema_version` (`1`) are literals in the box's sparse form, and `boxStampOf` binds every sparse field. Any other value therefore fails the record's check before it reaches the seal. Neither `whisper-field.ts` nor the React `whisper-field.tsx` touches codec or version: they are UI attributes over an uncontrolled `whisper_text` input. **Nothing more is needed there.**
  * The models' Bank had no test file of its own; `tests/models/bank.test.ts` is the first. Threads 8 and 10 also touch `bank.ts`; my edit is two lines in the constructor and one import.
  * A box's eviction "disarm" stays with thread 4b (plan, line 221).

* **For the Coach**:
  * **useWhisper zeroing**: the bytes are zeroed before the callback, which is stronger than the plan asked. Confirm.
  * **getWhisper and the exposed whisper**: it always opens storage, never the exposed one. Confirm.
  * **guarantees open item on the exposed whisper**: notes/guarantees.md could add that `getWhisper` and `useWhisper` keep nothing on the box. I have not edited it (names-only chore); a later docs pass could.

Approaches set aside:
* A `useWhisper` that wraps `handed` in `try/finally` to "zero" the whisper after the callback. There is nothing to zero: the bytes are already gone, and a JS string cannot be wiped.
* Keeping `applabel`/`user_id` in `bankOpts` and relabelling the refusal. That would catch and relabel, which the ground rules forbid.
