# Thread 16: modern_terms (2026-10-18)

Branch `20261018-modern_terms`, PR [#172](https://github.com/mrflip/safebyok/pull/172), stacked on [#170](https://github.com/mrflip/safebyok/pull/170). Documents only. Justify: green -- root 258; core 2161 passed | 35 skipped; react 229; indexeddb 135 | 10; postgres 246 | 14; fastkey 49; convex 258 | 8; graphql 239 | 14; demo 191 | 16; e2e 81 | 89.

* **Built**
  * `TODO.md`: retired words became today's names (`destroy()` → `retire()`, `read()`/`use()` → `readBox()`/`useBox()`, "erasing" a vault → retiring it, `takeUpVaultKey` → `grantLease`, "unlock window" → the lease's expiry, "way in" → wayin, "re-entry" → asking again when a lease runs out). New entries: the section *hello, make and the react lifecycle* (four entries, from #166 thread 8), the section *Accessibility* (the `created_elsewhere` screen-reader check, #167), and under *Soonish* a *"newer, don't touch" state for lockboxes* (#163).
  * `NOTYET.md`: `store()` → `storeBox()`, "way in" → wayin; the pointer to the rotation design is gone.
  * `README.md` (the Coach's architecture sketch): names only, checked against `packages/safebyok`: `app, user_id` → `applabel, userId`; `changePassword` → `changePassphrase`; `view` → `readBox`; `store` → `storeBox`; `retire(boxlabel)` → `retireBox(boxlabel)`; `vault.hello` → `vault.hello()`; the VaultDB verbs → `readVaultProps`, `fetchOrCreateVaultProps`, `updateVaultProps`, `retireVault`, `subscribe`, `listBoxes`; `readBox`, `updateBox`, `retireBox`. The stray "store,d" is fixed.
  * `notes/security.md`: the header's one-time-rename paragraph is extended to this pass. The lockbox's "note" and the "public bag" became the sidecar (`sidecar_json`, `safebyok-lockbox-v5`) wherever an entry describes today's lockbox; "erase" of a vault or lockbox became retire; "way in" became wayin; "window" of a lease became the lease; `changed_at` became `written_at` where it names today's field. Old format tags are marked as an older version's where one could be read as today's: the lease's (`safebyok-lease-v1`; `safebyok-unlock-v1` was 0.3.0's, and a record under it is not read), the vault, lockbox and mark tags of the 2026-10-16 formats, the passkey `info` example, and the `-v3` to `-v4` narration.
  * `whiteboard/20261016-rotation/` removed whole (it held only `rotation-design.md`); the pointers in `NOTYET.md` and `security.md` say it is gone. `whiteboard/20261013-relic` is untouched.
  * `.changeset/20261018-modern_terms.md`, empty.
* **Decisions taken**
  * `security.md` entries that said the vault checks a lockbox's note (a `NoteFloor`, the host's `validators` on the note, "creates the lockbox afresh when only the note is refused") are corrected, not just renamed: the code never checks the sidecar (`validators.ts`: "A lockbox's sidecar is never checked by the vault"), so a blind swap would have asserted a check that does not exist. Those clauses are removed or say the sidecar is the host's to check. This is a change of meaning toward what is true; the header says so.
  * Two 2026-10-15 entries on `changed_at` moving only when the whisper changed are marked "superseded 2026-10-17" with a pointer to the `written_at` entry, not rewritten.
  * "unlock" as a call in progress ("an unlock under way") stays, as in #170: `unlock()` is the verb. `eraseLease`, `eraseMark` and "erase" of a lease or mark stay; those are current names.
  * "Bag" for the validators bag and the options bag stays (a house tag).
  * New TODO sections sit at the top level between *Soonish* and *RAGEBAIT*, as the Coach asked for sections, not under a shelf; the lockbox-format entry is a *Soonish* item because it has a design question (the name and shape of the state).
* **Deviations**
  * The README sketch's `Vault.make({ app, user_id, vaultlabel, requestPasskeyFunc, ... })` named an option that does not exist; it now lists the required options (`applabel, userId, vaultlabel, vaultDB, deviceDB, keyDeriver`). Beyond "names only", but a wrong name is the brief's "any other old or wrong name".
  * The README sketch's lockbox verb "fetchOrCreate" is `readBox` (a VaultDB has no lockbox fetch-or-create).
* **Discoveries**
  * `security.md` carries more superseded behaviour than renamed words (the `changed_at` entries above; entries on a retrying `storeBox()` were marked in #170). A pass that folds superseded entries away, through the `sonnet` writer, would serve "a current advisory" better than renames.
  * The README sketch's "a DeviceDB safely holding and managing access to the lockboxes" is not what `DeviceDB` does (it holds the lease and the device mark; lockboxes live in the `VaultDB`), and "a pantry holding keys" names nothing in the code or `VOCABULARY.md`. Both left as the Coach wrote them.
* **For the Coach**
  * The two README sketch lines just named: say what they should read.
  * Whether the superseded-entries pass above is wanted.
