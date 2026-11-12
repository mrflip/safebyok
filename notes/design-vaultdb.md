# VaultDB invariants, and who keeps them

The act tables, which say what each combination of ask and stored row answers, are in `notes/answer-contract.md`. This note lists what must hold before a verb runs, which coordinates find its rows, and what every answer guarantees.

Every verb of `AdapterVaultDB` is a `try*` form that parses its ask, calls its `do*`, and builds its answer from what the classifier returned. The throwing form returns the good answer, or throws the refusal. A throw anywhere in a verb is made into a refusal by `answerForRefusal`. An adapter's `do*` calls `classifyStoredVault`, `classifyStoredBox`, `classifyStoredVaults` or `classifyStoredBoxes`, which return `VaultStored`, `BoxStored`, `VaultsStored` or `BoxesStored`.

## Preconditions

* all: each ask is validated on entry, as the validator for its verb (`vaultGet`, `vaultPut`, `vaultDel`, `boxGet`, `boxPut`, `boxDel`, `vaultList`, `boxList`) says. An ask is a tagged union on `op`: `get`, `put`, `del` or `list`. The list verbs take `{ op: 'list', ... }`, and `tidyGone` takes `{ op: 'tidy_gone', applabel, user_id }`. A get, put or del ask that fails its checks refuses `bad_record`, and a list ask refuses `bad_scope`
* all: each stored row is checked by the classifier, once, when it is handed over. A row that fails its checks throws (see *Postcondition*), so past the classifier a row is sound and at the address asked for
* **Expected revision**: a get, put or del ask carries `expected`, the row it expects to find: its revision (`revision_tok`, `revision_seq`), its `am` and its life token. For a box, the life token is the `box_tok` and `expected.vault_tok` must be the ask's own `vault_tok`. A mismatch between `expected` and the stored row is an act, never an error: see *Revisions* in `notes/answer-contract.md`
  - A put or del of a void (never-seen) row cites the shell row: a `revision_seq` of -1 and a `revision_tok` of `VoidRevisionTok`. The shell is cited whole or not at all
  - every populated row has a `revision_seq` of 0 or greater
* **Record**: a put or del ask carries `record`, the row it would store, at the ask's address. A put's record is live and a del's is a tombstone. Its `revision_seq` is `expected.revision_seq + 1`, and its `revision_tok` is neither `expected.revision_tok` nor `VoidRevisionTok`. Where `expected` and `record` are both live, their life tokens are equal. Otherwise the record's is new: neither the expected one nor `VoidLifeTok`. A gate verb's record has a passkey wayin for `addPasskey`, and none for `revokePasskey`. A `putBox` record larger than `maxRecordSizeEst` refuses `box_too_large`, before storage is asked
* **`vault_tok` match**: a box ask names its vault's life by `vault_tok`, and a vault row of another life is refused (see *Which coordinates find the row*). `gate_epoch` does not narrow any query: a matched revision already identifies the row, and the classifier compares `gate_epoch` only for a gate verb's put, which refuses `gate_issue` when the record's `gate_epoch` is not one more than the stored one
* **consistent**: wherever records share a field, their values are equal
* **transactional**: each `do*` is one atomic step: the steps take effect together, and either every step succeeded or nothing changed

This table lists, for each call, its ask and what it limits its query by (according to the call's semantics).

|     | call                | ask `op` | ok acts                                      | request coordinates                                                      |
| --- | ------------------- | -------- | -------------------------------------------- | ------------------------------------------------------------------------ |
| V0  | `listVaults`        | `list`   | `got`, `gotvoid`                             | bank scope                                                               |
| V1  | `getVault`          | `get`    | `gotlive`, `gotvoid`, `gotgone`              | scope                                                                    |
| V2  | `listBoxes`         | `list`   | `got`, `gotvoid`                             | scope, `vault_tok`                                                       |
| V3  | `getBox`            | `get`    | `gotlive`, `gotvoid`, `gotgone`              | scope, `vault_tok`                                                       |
| V4  | `putBox`            | `put`    | `born`, `reborn`, `replaced`, `passed`       | scope, `vault_tok`, and expected box revision                            |
| V5  | `delBox`            | `del`    | `deleted`                                    | scope, `vault_tok`, and expected box revision                            |
| V6  | `putVault`          | `put`    | `born`, `reborn`, `replaced`, `passed`       | scope and expected vault revision                                        |
| VG1 | `replacePassphrase` | `put`    | `replaced`                                   | scope, `vault_tok`, `registered_at`, and prior vault revision            |
| VG2 | `addPasskey`        | `put`    | `added`                                      | scope, `vault_tok`, `registered_at`, and prior vault revision            |
| VG3 | `revokePasskey`     | `put`    | `revoked`                                    | scope, `vault_tok`, `registered_at`, and prior vault revision            |
| V7  | `delVault`          | `del`    | `deleted`                                    | scope and expected vault revision                                        |
| V10 | `tidyGone`          | `tidy_gone` | `tidied`                                  | bank scope                                                               |

A gate verb's own act (`replaced`, `added`, `revoked`) is what it answers once its put succeeds. The put it makes answers as a `putVault` does.

#### Which coordinates find the row

*Ver?* marks a versioned call: one that carries `expected`.

| Call                                    | Finds the vault row by             | Finds its own row by  | Ver? |
| --------------------------------------- | ---------------------------------- | --------------------- | ---- |
| `listVaults`                            |                                    | bank scope (every vault row) |  |
| `getVault`                              | Scope                              |                       | Y    |
| `listBoxes`                             | Scope, `vault_tok`                 | scope, `vault_tok` (every box row of the life) |      |
| `getBox`                                | Scope, `vault_tok`                 | boxlabel, `vault_tok` | Y    |
| `putBox`, `delBox`                      | Scope, `vault_tok`                 | boxlabel, `vault_tok` | Y    |
| `replacePassphrase`, `addPasskey`, `revokePasskey` | Scope                   |                       | Y    |
| `delVault`                              | Scope                              |                       | Y    |
| `putVault`                              | Scope                              |                       | Y    |
| `tidyGone`                              | Bank scope (every vault and box row) |                     |      |

* **`vault_tok` names a life, and the vault row is found by scope.** `getVault`, `putVault`, `delVault` and the gate verbs find the vault row by scope alone, whatever its life. A get's `expected` is carried but never compared. For a put or del, a stored row whose life token or `am` differs from `expected`'s, under the same `revision_tok`, is a `clash`.
* **A box ask and `listBoxes` check the vault row against `vault_tok` before anything else.** The vault row is fetched by scope in the same step as the box rows. With no vault row, the ask refuses `vault_void`. A vault tombstone refuses `vault_gone`, whatever its `vault_tok`. A live vault under another `vault_tok` refuses `vault_reborn`. In each case the box row is not checked, nothing is stored, and `world` is the vault row met, or the shell for none.
* **`gate_epoch` does not narrow any query.** A matched revision already identifies the row.
* **`prior` is a plain `Revision`**, `{ revision_tok, revision_seq }`, as a gate verb takes it in `{ prior }`. The gate verb makes its put ask from it, with `expected` the live row at `prior` in the record's `vault_tok`.

### Postcondition

Every answer has `ok`, `act`, `ask`, `world`, and `val` where `ok` is true or `err` where it is false. A refusal's answer may also have `dbhas`: the stored row found where the ask was acting, or null for none.

* `ask` is a `LoggableAsk`: every field optional, and a record cut down to its meta, with no payload. A refusal made before its ask was sound carries what of it was, or `{}`.
* `act` is in every answer, whether the call succeeded or was refused. A refused act is also a refusalkind, made by `actRefused`, so an answer and a thrown error read the same way: its `meta.act` is the act.
* A refusal's `meta` has `act`, `oplabel`, `ask`, and for `vault_full` a `capacity` when storage counted one. `oplabel` names the verb that refused, such as `putVault`. `world` and `dbhas` are kept off `meta`, out of a logger's reach: the answer carries them.
* A thrown refusal that was not made from an act (`damaged_row`, `damaged_vault`, `storage_issue`, `gate_issue`, `box_too_large`, `bad_record`, `bad_scope`, a storage backend's own) has its refusalkind as its `act`. Its `world` and `dbhas` are what its thrower attached: `gate_issue` attaches the stored row as both. Otherwise `world` is null.
* A throw that is not a `VaultError` is made `storage_unavailable`, with what was thrown as its cause.

A refused act is made a refusalkind by `actRefused`, which reads it by whose call it was:

| act                                | refusalkind of a box call | refusalkind of a vault call |
| ---------------------------------- | ------------------------- | --------------------------- |
| `void`, `gone`, `dubdel`           | `absent_box`              | `absent_vault`              |
| `stale`, `retcon`                  | `stale_write`             | `stale_write`               |
| `camped`                           | `camped`                  | `camped`                    |
| `clash`, `forked`, `ahead`         | `record_conflict`         | `record_conflict`           |
| `vault_void`, `vault_gone`         | `absent_vault`            | (a box call only)           |
| `vault_reborn`                     | `vault_reborn`            | (a box call only)           |
| `vault_full`                       | `vault_full`              | (a box call only)           |

For every return value,
| #    | call  | act              |     | postcondition                                                                                 |
| ---- | ----- | ---------------- | --- | --------------------------------------------------------------------------------------------- |
| VPA1 | all   | any sane         | *️⃣   | each stored row the classifier was handed is valid, and at the address asked                  |
| VPA2 | all   | any sane         | *️⃣   | `ask`, `world`, `err`, `ok` and any extra fields pass validation                              |
| VPA2 | all   | any sane         | *️⃣   | `world` equal to the stored vault row, or the shell for none, or the bank scope for a bank listing |
| VPA3 | all   | any sane         | *️⃣   | `world` and `val` are read simultaneously: the operation was one atomic step                  |
| VPA4 | all   | ok               | 👍   | `val` passes record validation and equals the actual database record, or what the act says     |
| VPA5 | all   | ok               | 👍   | scope+vault_tok of request, world, database record, and `val` are consistent                  |
| VPA  | put, del | any refused act | 💣 | scope+vault_tok of request, world, database record, `dbhas`, and `val` are consistent         |
| VPA7 | box   | vault_void       | 💣   | database vault row void; `world` the shell; `dbhas` null                                      |
| VPA7 | box   | vault_gone       | 💣   | database vault row a tombstone; `world` equal to it; `dbhas` null                             |
| VPA7 | box   | vault_reborn     | 💣   | database vault row live under another vault_tok; `world` equal to that row; `dbhas` null      |
| VPA7 | `putBox` | vault_full    | 💣   | `ask` and `meta.capacity`, where storage counted one                                          |
| VPA7 | `putBox` | box_too_large | 💣   | `ask` has the address and revisions, and no record payload                                    |
| VPA7 | all   | identity_revoked, storage_unavailable, storage_blocked | 🌀 | `ask` has the address and revisions, and no record payload |
| VPA7 | all   | damaged_row, damaged_vault, storage_issue | 🌀 | the refusal names the failed checks, and quotes nothing of the row                  |
| VPA7 | all   | bad_record, bad_scope, bad_option | 🌀 | `ask` is `{}`, or what of the ask was sound                                              |

* `ifAbsent` and `ifPresent` are named by every ask that takes them, and have no defaults. On a get, `ifAbsent` is `nil` or `fail`: with `fail`, a void or gone row refuses `void` or `gone`; with `nil`, it answers `gotvoid` or `gotgone` (`val` is null for a void row, and the tombstone for a gone one). On a put (`putVault` and `putBox` alike), `ifAbsent` is `add` or `fail`: `add` creates the record over a void row (`born`) or over a tombstone (`reborn`), and `fail` refuses `void` or `gone`. `ifPresent` applies over a live row, and `ifAbsent` over a tombstone or no row
* `ifPresent`, when the row is live: `repl` saves over `expected` when the ask's `expected` is the stored row. `fail` refuses `camped` and includes what it found: `dbhas` is the stored row. It is not a `stale`. `get` saves nothing and returns the live row as `val` in place of the record, with the act `passed`: so does a put whose `expected` is stale, if its `ifPresent` is `get`
* Gate verbs take `(record, { prior })`: the whole next vault record, which the vault listing builds, and the revision it replaces. `{ prior }` is strict: passing an `ifAbsent` or `ifPresent` refuses `bad_option`. The verb makes a put ask tagged with its `gateVerb`, with `ifAbsent: 'fail'` and `ifPresent: 'repl'`, and sends it to `putVault`. The classifier checks the record against the stored gate in the same step that stores it. The stored row must be at `prior`, or the put refuses `stale`. `registered_at` must be unchanged, `gate_epoch` must be one more than the stored one, and only the verb's own wayin may differ, or the verb throws `gate_issue`. An `addPasskey` when a passkey is already stored refuses `camped`. A `revokePasskey` when none is stored stores nothing and answers `revoked` with the stored row
* `tidyGone` is housekeeping for hosts: nothing in the core's models calls it
* `classifyStoredVault` and `classifyStoredBox` decide, inside each adapter's atomic step, whether a put or del writes. Where `isWriteAct(act)` holds, the adapter stores `ask.record` in that step, and the verb answers with it
* A cooperative store, one that reaches some of the classifier's verdict itself, overrides `classifyStoredVault` and `classifyStoredBox`. `PostgresVaultDB` does: a write function in SQL (see `vault-functions.ts`) checks the record against the stored row and stores it in one call. When it stored the record, the adapter checks the result and returns it. When it stored nothing, or the ask is a get, the core's classifier classifies the ask against the rows returned. A put whose policy allows no write over the row it expects is only fetched and classified. A gate verb's put is classified against the fetched row first, and the function stores the record only over that same revision

* Given call, params, ok and act, everything to the right is guaranteed.
* Pre: 📌 here: present, consistent, matched; 🔲 void: row empty; 🪦 gone: row tombstoned, consistent, matched; 🌀 misaligned: preconditions violated, will not return data
* Post: 🟰 no change, 💾 request record saved in whole; 📌 prior stored record; 🟰 🔲 row still void; 🟰 🪦 no change
  -     💾 🪦 request tombstone saved, 💾 📥 request record saved, 💾 🔑 request record saved, its one wayin changed

  Which of the refusals that follow an ask's `expected` is returned (`stale`, `retcon`, `clash`, `forked`, `ahead`) is decided by the get, put and del tables of `notes/answer-contract.md`. The rows here give what each answer holds.

  | #   | call              | pr/ab | act           | ok  | pre | post | Invariant                                                                                              |
  | --- | ----------------- | ----- | ------------- | --- | --- | ---- | ------------------------------------------------------------------------------------------------------ |
  | V0  | `listVaults`      |       | got           | 👍   | 📌   | 🟰 📌  | `world` equals the bank scope; `val.vaults` has each stored vault row that passed its checks, simultaneous, live or tombstone |
  | V0  | `listVaults`      |       | got           | 👍   | 🌀   | 🟰 🌀  | `val.damaged_rows` has an entry (`am: 'd'`) for each vault row failing its checks; a row that is no object, or is at another address, throws `storage_issue` |
  | V0  | `listVaults`      |       | gotvoid       | 👍   | 🔲   | 🟰 🔲  | no vaults for that applabel/user_id: `val.vaults` and `val.damaged_rows` are empty                    |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V2  | `listBoxes`       |       | got           | 👍   | 📌   | 🟰 📌  | `val.boxes` has the sparse box rows of the life `vault_tok`, read in the same step as `world`, the vault row |
  | V2  | `listBoxes`       |       | got           | 👍   | 🌀   | 🟰 🌀  | `val.damaged_rows` has an entry for each box row failing its checks                                    |
  | V2  | `listBoxes`       |       | gotvoid       | 👍   | 📌   | 🟰 📌  | the vault is live under `vault_tok`, and has no box rows                                               |
  | V2  | `listBoxes`       |       | vault_void, vault_gone, vault_reborn | 💣 | 🔲🪦📌 | 🟰 🔲🪦📌 | `world` is the vault row met, or the shell; no `dbhas`      |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V3  | `getBox`          | _any_ | gotlive       | 👍   | 📌   | 🟰 📌  | db row and `val` are equal, request scope+vault_tok match                                              |
  | V3  | `getBox`          | fail  | void          | 💣   | 🔲   | 🟰 🔲  | db row void, `dbhas` is null                                                                           |
  | V3  | `getBox`          | fail  | gone          | 💣   | 🪦   | 🟰 🪦  | db row  and  `dbhas` tombstone equal                                                                   |
  | V3  | `getBox`          | nil   | gotvoid       | 👍   | 🔲   | 🟰 🔲  | db row void, `val` is null                                                                             |
  | V3  | `getBox`          | nil   | gotgone       | 👍   | 🪦   | 🟰 🪦  | db row and `val` are the tombstone                                                                     |
  | V3  | `getBox`          | _any_ | vault_void, vault_gone, vault_reborn | 💣 | *️⃣ | 🟰 *️⃣ | the vault row is not live under `vault_tok`; the box row is unchecked, `dbhas` is null   |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V1  | `getVault`        | _any_ | gotlive       | 👍   | 📌   | 🟰 📌  | db row, `val` and `world` are equal; request scope matches                                             |
  | V1  | `getVault`        | fail  | void          | 💣   | 🔲   | 🟰 🔲  | db row void; `dbhas` is null; `world` is the shell                                                      |
  | V1  | `getVault`        | nil   | gotvoid       | 👍   | 🔲   | 🟰 🔲  | db row void; `val` is null; `world` is the shell                                                        |
  | V1  | `getVault`        | fail  | gone          | 💣   | 🪦   | 🟰 🪦  | db row, `dbhas` and `world` are the unchanged tombstone                                                 |
  | V1  | `getVault`        | nil   | gotgone       | 👍   | 🪦   | 🟰 🪦  | db row, `val` and `world` are the unchanged tombstone                                                   |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V10 | notification      |       | got           | 👍   | 📌   | 🟰 📌  | `val` equals stored record; `world` is its vault row, or null when storage sent none                   |
  | V10 | notification      |       | gone          | 👍   | 🪦   | 🟰 🪦  | `val` equals stored tombstone; `world` as above                                                        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V4  | `putBox`          | repl  | replaced      | 👍   | 📌   | 💾 📥  | db row = `val`  = request          equal                                                               |
  | V4  | `putBox`          | get   | passed        | 👍   | 📌   | 🟰 📌  | db row = `val`                     equal; nothing stored, and `val` is the live row in place of the request |
  | V4  | `putBox`          | fail  | camped        | 💣   | 📌   | 🟰 📌  | db row = `dbhas`                   equal; `expected` is the live row                                    |
  | V4  | `putBox`          | ab:fail | void, gone  | 💣   | 🔲🪦 | 🟰 🔲🪦 | db row unchanged; `dbhas` null or the tombstone                                                      |
  | V4  | `putBox`          | ab:add | born          | 👍   | 🔲   | 💾 📥  | db row = `val`                     equal, revision_seq=0                                               |
  | V4  | `putBox`          | ab:add | reborn        | 👍   | 🪦   | 💾 📥  | db row = `val`                     equal                                                               |
  | V4  | `putBox`          | _any_ | stale, retcon, clash, forked, ahead | 💣 | 📌🪦🔲 | 🟰 📌🪦🔲 | db row unchanged; `dbhas` is the stored row, or null for none     |
  | V4  | `putBox`          | ab:add | vault_full    | 💣   | 🔲   | 🟰 🔲  | a `born` in a vault at its soft cap; nothing stored; `meta.capacity` where counted                     |
  | V4  | `putBox`          | _any_ | vault_void, vault_gone, vault_reborn | 💣 | *️⃣ | 🟰 *️⃣ | the vault row is not live under `vault_tok`; the box row is unchecked, `dbhas` is null   |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V6  | `putVault`        | repl  | replaced      | 👍   | 📌   | 💾 📥  | db row = `val`   = request = world equal                                                               |
  | V6  | `putVault`        | get   | passed        | 👍   | 📌   | 🟰 📌  | db row = `val`             = world equal; nothing stored                                               |
  | V6  | `putVault`        | fail  | camped        | 💣   | 📌   | 🟰 📌  | db row = `dbhas`           = world equal; `expected` is the live row                                    |
  | V6  | `putVault`        | ab:fail | void        | 💣   | 🔲   | 🟰 🔲  | db row void; `dbhas` null; world a shell                                                                |
  | V6  | `putVault`        | ab:fail | gone        | 💣   | 🪦   | 🟰 🪦  | db row and `dbhas` = world equal tombstone                                                             |
  | V6  | `putVault`        | ab:add | born          | 👍   | 🔲   | 💾 📥  | db row = `val`             = world equal, revision_seq=0                                               |
  | V6  | `putVault`        | ab:add | reborn        | 👍   | 🪦   | 💾 📥  | db row = `val`             = world equal                                                               |
  | V6  | `putVault`        | _any_ | stale, retcon, clash, forked, ahead | 💣 | 📌🪦🔲 | 🟰 📌🪦🔲 | db row unchanged; `dbhas` = world: the stored row, or null and a shell for none |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | VG* | gate verbs        |       | _any ok_      | 👍   | 📌   | 💾 🔑  | db row, `val`, world and request are equal; `gate_epoch` and `revision_seq` each one more than the stored row's; a `revokePasskey` when no passkey is stored changes nothing | 
  | VG* | gate verbs        |       | _any ok_      | 👍   | 📌   | 💾 🔑  | db row matches scope, `vault_tok`, `registered_at`, `fmt`; put through `putVault` with `ifAbsent: 'fail'` and `ifPresent: 'repl'` |
  | VG* | gate verbs        |       | stale         | 💣   | 📌   | 🟰 📌  | stored row not at `prior`; `world` and `dbhas` are the stored row                                       |
  | VG* | gate verbs        |       | gate_issue    | 💣   | 📌   | 🟰 📌  | `registered_at` changed, `gate_epoch` not one more, or the other wayin changed; `world` and `dbhas` are the stored row |
  | VG* | gate verbs        | given | bad_option    | 💣   | *️⃣   | 🟰 *️⃣  | an `ifAbsent` or `ifPresent` was passed: `{ prior }` is strict                                            |
  | VG1 | `replacePassphrase` |     | replaced      | 👍   | 📌   | 💾 🔑  | db row = request; `passphrase_wayin` changed, `passkey_wayin` as stored                                  |
  | VG2 | `addPasskey`      |       | added         | 👍   | 📌   | 💾 🔑  | stored row had no passkey; db row = request; `passkey_wayin` set, `passphrase_wayin` as stored     |
  | VG2 | `addPasskey`      |       | camped        | 💣   | 📌   | 🟰 📌  | a passkey is already stored; db row = `dbhas` = world                                                 |
  | VG3 | `revokePasskey`   |       | revoked       | 👍   | 📌   | 💾 🔑  | db row = request; `passkey_wayin` null, `passphrase_wayin` as stored                                   |
  | VG3 | `revokePasskey`   |       | revoked       | 👍   | 📌   | 🟰 📌  | stored row had no passkey: `val` and world are the stored row; nothing changed, and its `gate_epoch` is not checked   |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V5  | `delBox`          |       | deleted       | 👍   | 📌   | 💾 🪦  | db row = request = `val`         -- equal tombstone                                                    | 
  | V5  | `delBox`          |       | void          | 💣   | 🔲   | 🟰 🔲  | db row void; `dbhas` is null                                                                           |
  | V5  | `delBox`          |       | gone, dubdel  | 💣   | 🪦   | 🟰 🪦  | db row = `dbhas` -- the tombstone, unchanged                                                           |
  | V5  | `delBox`          |       | stale, retcon, clash, forked, ahead | 💣 | 📌🪦🔲 | 🟰 📌🪦🔲 | db row unchanged; `dbhas` is the stored row, or null for none  |
  | V5  | `delBox`          | _any_ | vault_void, vault_gone, vault_reborn | 💣 | *️⃣ | 🟰 *️⃣ | the vault row is not live under `vault_tok`; the box row is unchecked, `dbhas` is null   |
  | V7  | `delVault`        |       | deleted       | 👍   | 📌   | 💾 🪦  | db row = request = `val` = world -- equal tombstone                                                    |
  | V7  | `delVault`        |       | void          | 💣   | 🔲   | 🟰 🔲  | db row void; `dbhas` null; world a shell                                                                |
  | V7  | `delVault`        |       | gone, dubdel  | 💣   | 🪦   | 🟰 🪦  | db row = `dbhas` = world -- the tombstone, unchanged                                                    |
  | V7  | `delVault`        |       | stale, retcon, clash, forked, ahead | 💣 | 📌🪦🔲 | 🟰 📌🪦🔲 | db row unchanged; `dbhas` = world: the stored row, or null and a shell for none |
  | V7  | `delVault`        |       | deleted       | 👍   | 📌   | 💾 🪦  | all boxes for that vault_tok are tombstoned or removed, transactionally where the datastore can        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V10 | `tidyGone`        |       | tidied        | 👍   | *️⃣   | 💾 🔲  | Removes the box rows whose vault is missing, tombstoned or reborn                                      |
  | V10 | `tidyGone`        |       | tidied        | 👍   | *️⃣   | 💾 🔲  | `val` is `{ totalCount: <number of box rows remaining after the ask> }`; `world` is the bank scope; `ask` is the `tidy_gone` ask |
  | V10 | `tidyGone`        |       | storage_unavailable | 💣 | *️⃣ | 🤷 🤷 | no `val`: a refusal carries none                                                                     |


## Areas of Concern

Eyebrow raisers from the Coach's replies in the sprint's Closer Look (`whiteboard/20261103-unrace/unrace-closerlook.md`).

* **Damage:** `am: 'd'` and the `damagedVaultOf` and `damagedBoxOf` helpers, which make the `damaged_rows` entries of a listing. "damage is an agent obsession I thought I'd ruled out. We need to remove this."
* **The `do*` seam:** each `do*` is one atomic step in which the classifier runs, and a remote datastore may be unable to run it in one transaction. "Nothing has been contemplated that involved running zod inside a transaction." A cooperative store such as `PostgresVaultDB` classifies its writes in SQL, and the core checks the result.
