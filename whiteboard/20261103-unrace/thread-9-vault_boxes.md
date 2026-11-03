# Thread 9: vault_boxes (2026-11-03)

Branch `20261103-vault_boxes`, PR #TBD, stacked on #456. Justify: **green**. Root scripts 302; safebyok 4695 | 37 skipped; indexeddb 167 | 11; postgres 322 | 15; fastkey 49; react 326; demo-react 230 | 17; convex 375 | 9; graphql 345 | 15; e2e 107 | 116 skipped. Size budgets unmoved. No `eslint-disable`, no `ts-expect-error`.

* **Built**:
  * `vault.ts`, a new section, *Box verbs*: `hello`; `getBox`, `fetchBox`, `putBox`, `delBox`, each with its `try` form; `demandReadyForBoxes`. The first box call runs `hello`, once it has succeeded no more.
  * `box.ts`: `extractWhisper` and `tryExtractWhisper` (renamed from `unsealWhisper`). `send` takes either half: a sidecar left out is the record's, a whisper left out is unsealed and resealed, as the box stamp binds the sidecar. `noWhisperToKeep`.
  * `box-listing.ts`: `hello(listed?)`, `damaged_records`, `damagedAt`, a `del` that clears the entry, and `create(input, opts)`, for `ifPresent`.
  * `vault-listing.ts`: `fetchListed(vault)`, `vault.hello`'s get, delivered as a fetch and answering the list. `listing.ts`: `#deliver` is now `protected deliver`, for that.
  * `models-shapes.ts`: `boxPatch` halves optional, refusing a patch naming neither; `boxPut`, `boxesListed`, `boxlabelArg`. `phrases.ts`: `PatchNamesNeitherHalf`, `BoxPatchAdvice` rewritten.
  * **Removed**: `unsealWhisper`, and the tests that both halves are required.
* **Decisions taken**:
  * **The list drop is at `boxListing.hello`.** A held instance under a listed damaged row is vacated. A held instance whose row goes bad later refuses `damaged_record` on its next get and stays until the next `hello`, as the refusal cannot tell a box row from its vault row (thread 8 says the same). A host re-running `vault.hello` is the way to list it.
  * **`delBox` takes a label**, the entry found by `damagedAt`, or else the sentinel. Set aside: a verb for damaged rows; a union argument of label or entry.
  * **`hello` needs no unlock**: it holds only sparse fields. Box verbs demand it.
  * **`#isGreeted` is a flag, no join.** Overlapping first calls each say hello; the second build receives what the first made.
  * **A rebirth keeps no sidecar**: with a whisper only over a tombstone the sidecar is `{}`; a sidecar only is `no_whisper`.
* **Deviations** (spec disagreements settled):
  * **`extractWhisper` answers the holder `{ val }`,** not the spec's "whisper text": it round-trips with `putBox`, and a text field in it can grow.
  * **Box verbs demand the unlock and do not call `ensureUnlocked`.** The spec's *Preconditions* say "every 🎬 call while locked: guard throws"; the README's "asks first" is not followed.
  * **"No box listed makes the record over the sentinel prior; `born` or `reborn`"**: `hello` lists tombstones, so a rebirth reaches `reborn` through the instance holding the tombstone. A birth over a tombstone not listed hears `stale_write`, the tombstone delivered, and the retry is a rebirth.
  * **The vault's snapshot `boxes, trouble`, in the spec's row, is not added.** A host has `vault.boxListing.getSnapshot`, and `.damaged_records`. Thread 12 or 13 may want it on the vault.
* **Discoveries**:
  * Crossing: a `lock()` landing during `getBox`, or during `hello`, refuses `vault_locked`; pinned in `halpimonfire.test.ts`.
  * Crossing: a `lock()` landing during `putBox`'s or `delBox`'s store call lands anyway, past the window, as `send` does; the box reads locked after.
  * Crossing: two sessions' births of one label: the second hears `stale_write` with the first delivered.
  * `TH.eventually` takes a check returning a boolean; a check that `expect`s never passes.
  * The world's helper now hands back `vaultDB`, typed as the memory DB, for `_cheat_boxRowsOf`.
* **For the Coach**:
  * **The whisper is cleartext in a local during a sidecar-only send**, as a JS string that cannot be zeroed, from unseal to reseal. Security entry written.
