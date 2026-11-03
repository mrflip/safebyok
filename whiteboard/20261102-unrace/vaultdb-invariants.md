# VaultDB invariants, and who keeps them

## Preconditions

(correct field names of prior_revision_seq etc)

* all: the database records are trusted as valid and consistent
* all: the input arguments are validated as valid and consistent
* **Revision Match**: The prior_revision_seq and prior_revision_tok must match the current stored value, and the replacement record's revision_seq must be a positive integer exactly one more than prior_revision_tok
  - For writes to an void (never-seen) row, match to a revision seq of -1 and a tok of (whatever deadbeef-like sentinel we use), and the new record's revision_seq of 0
  - every populated row has a revision seq of 0 or greater
* **`vault_tok`/`gate_epoch` match**: only rows that equal the given value match (?? what is the gate epoch guarantee and where is it bumped)
* **consistent** wherever records share a field, their values are equal
* **transactional**: simultaneous and either every step of it succeeded or no change took place.
  - every call is transactional *except* that some backing stores may not support transactional removal of boxes. For such stores, success only means the vault is tombstoned.

This shorthands the items that must be consistent and limit queries (according to the call's semantics)

|     | call                | return        | request coordinates                                                  |
| --- | ------------------- | ------------- | -------------------------------------------------------------------- |
| V1  | `getVault`          | ok            | scope, vault_tok                                                     | 2.4 |
| V3  | `getBox`            | ok            | scope, vault_tok, and prior box revision                             | 2.5 |
| V4  | `putBox`            | ok            | scope, vault_tok, and prior box revision                             | 3.3 |
| V5  | `delBox`            | ok            | scope, vault_tok, and prior box revision                             | 3.4 |
| V6  | ~~`putVault`~~      | ok            | scope, vault_tok, gate_epoch, and prior vault revision               | 3.2 |
| V6  | ~~`putVault`~~      | ok            | scope, vault_tok, gate_epoch, and prior vault revision               | 3.2 |
| VG1 | `replacePassphrase` | ok            | scope, vault_tok, and prior vault revision                           | 3.2 |
| VG2 | `addPasskey`        | ok            | scope, vault_tok, and prior vault revision                           | 3.2 |
| VG3 | `revokePasskey`     | ok            | scope, vault_tok, and prior vault revision                           | 3.2 |
| V10 | creates             | born          | scope; prior revision is NeverStoredTok/Seq, staged revision_seq = 0 |     |
| V7  | `delVault`          | ok            | scope, vault_tok, gate_epoch, and prior vault revision               | 3.5 |
| V10 | `getBank`           | ok            | scope                                                                |     |
| V10 | writes              | `stale_write` | scope, vault_tok                                                     |     |

#### Proposal: which coordinates find the row

*Ver?* marks a versioned call.

| Call                                    | Finds the vault row by             | Finds its own row by  | Ver? |
| --------------------------------------- | ---------------------------------- | --------------------- | ---- |
| `getBank`                               | Bank scope                         |                       |      |
| `getVault`                              | Scope                              |                       |      |
| `getBox`                                | Scope, `vault_tok`                 | boxlabel, `vault_tok` |      |
| `putBox`, `delBox`                      | Scope, `vault_tok`                 | boxlabel, `vault_tok` | Y    |
| `putWayins`, `putPasskey`, `delPasskey` | Scope, `vault_tok`                 |                       | Y    |
| `delVault`                              | Scope, `vault_tok`                 |                       | Y    |
| A birth or rebirth                      | Scope, as its `vault_tok` is fresh |                       | Y    |
| `getCapacity`                           | Scope, `vault_tok`                 |                       |      |

* **`vault_empty` means "nothing of this life", not "nothing in this scope".** An old `vault_tok` finds no row. So
  the refusal itself moves the Vault's Trigger up, and the Trigger's `getVault`, by scope, shows what is there.
* **`gate_epoch` limits no query.** A matched revision already pins the row, and only a gate verb moves it.
* **`prior` is a plain `Revision`**, `{ revision_tok, revision_seq }`, so it needs no new field names.

### Postcondition

Every return value includes { world meta val act ok: true } or { world meta err act ok: false }
a few allow extra fields: dbhas where that's useful and different from what's sent, req_params where that's useful and not clearly dbhas or val.d

`act` is a member of every return value, `{ world, meta, val, act, ok, err, dbhas?, req_params? }`, ok or refused. A refusing `act` (`camped`, `stale_write`, `vault_gone`) is also a keyword in `refusals`, with an exception factory, so it reads the same in an answer and in an error.

For every return value,
| #    | call  | act              |     | postcondition                                                                                 |
| ---- | ----- | ---------------- | --- | --------------------------------------------------------------------------------------------- |
| VPA1 | all   | any sane         | *️⃣   | the database records are trusted as valid and consistent                                      |
| VPA2 | all   | any sane         | *️⃣   | world, meta, err, ok and any extra fields pass validation                                     |
| VPA2 | all   | any sane         | *️⃣   | world equal to stored vault                                                                   |
| VPA3 | all   | any sane         | *️⃣   | world and val are read simultaneously, operation was transactional                            |
| VPA4 | all   | ok               | 👍   | val passes record validation and equals the actual database record                            |
| VPA5 | all   | ok               | 👍   | scope+vault_tok of request, world, database record, and `val`,     are consistent             |
| VPA  | write | stale_write      | 💣   | scope+vault_tok of request, world, database record, `dbhas`, and `val` are consistent |
| VPA7 | all   | vault_gone       | 💣   | database row and `dbhas` equal tombstone                                              |
| VPA7 | all   | vault_empty      | 💣   | database row empty, `dbhas` null, world a sentinel'ed tombstone                       |
| VPA7 | all   | vault_full       | 💣   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | box_too_large    | 💣   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | identity_revoked | 💣   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | storage_error    | 🌀   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | not_permitted    | 🌀   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | damaged_record   | 🌀   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | invalid_input    | 🌀   | `req_params` holds scope, vault_tok, other safe metadata                                      |
| VPA7 | all   | newer_format     | 🌀   | `req_params` holds scope, vault_tok, other safe metadata                                      |

* ifAbsent: 'fail': void or gone refuse; 'nil': void/gone succeed (val = null and dbhas null or tombstone)
* ifPresent, over a live row: 'repl' saves. 'fail' refuses, act `camped`, with the corpse: `dbhas` the stored record, `req_params` the request. It is not a `stale_write`, and not every write is a versioned update (`putPasskey`). 'get' saves nothing and returns the live row as `val` in place of the request, act `declined`

* Given call, params, ok and act, everything to the right is guaranteed.
* Pre: 📌 here: present, consistent, matched; 🔲 void: row empty; 🪦 gone: row tombstoned, consistent, matched; 🌀 misaligned: preconditions violated, will not return data
* Post: 🟰 no change, 💾 request record saved in whole; 📌 prior stored record; 🟰 🔲 row still void; 🟰 🪦 no change
  -     💾 🪦 request tombstone saved, 💾 📥 request record saved, 💾 🔑 request wayin laid on the stored record

  | #   | call              | pr/ab | act           | ok  | pre | post | Invariant                                                                                              | VAULTDB.md |
  | --- | ----------------- | ----- | ------------- | --- | --- | ---- | ------------------------------------------------------------------------------------------------------ | ---------- |
  | V3  | `getBank`         | nil   | got           | 👍   | 📌   | 🟰 📌  | world equals request scope                                                                             | 2.5        |
  | V3  | `getBank`         | nil   | got           | 👍   | 📌   | 🟰 📌  | db vaults and `val.vaults` are equal, simultaneous, either full or tombstone                           | 2.5        |
  | V3  | `getBank`         | nil   | got           | 👍   | 🌀   | 🟰 🌀  | `damaged_records` holds tombstones for any vaultsd failing validation                                  | 2.5        |
  | V3  | `getBank`         | nil   | gotvoid       | 👍   | 🔲   | 🟰 🔲  | no vaults for that applabel/user_id                                                                    | 2.5        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V3  | `getBox`          | _any_ | got           | 👍   | 📌   | 🟰 📌  | db row and `val` are equal, request scope+vault_tok match                                              | 2.5        |
  | V3  | `getBox`          | fail  | void          | 💣   | 🔲   | 🟰 🔲  | db row void, `dbhas` is null                                                                           | 2.5        |
  | V3  | `getBox`          | fail  | gone          | 💣   | 🪦   | 🟰 🪦  | db row  and  `dbhas` tombstone equal                                                                   | 2.5        |
  | V3  | `getBox`          | nil   | gotvoid       | 👍   | 🔲   | 🟰 🔲  | db row void, `dbhas` is null, `val` is null                                                            | 2.5        |
  | V3  | `getBox`          | nil   | gotgone       | 👍   | 🪦   | 🟰 🪦  | db row  and  `dbhas` tombstone equal, `val` is null                                                    | 2.5        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V3  | `getBank`         | _any_ | got           | 👍   | 🌀   | 🟰 🌀  | `damaged_records` holds tombstones for any boxes failing validation                                    | 2.5        |
  | V1  | `getVault`        | _any_ | got           | 👍   | 📌   | 🟰 📌  | db row, request, `val`, world are equal, request scope matche                                          | 2.4        |
  | V1  | `getVault`        | _any_ | got           | 👍   | 📌   | 🟰 📌  | val.boxes has sparse db boxes, simultaneous                                                            | 2.4        |
  | V3  | `getVault`        | fail  | void          | 💣   | 🔲   | 🟰 🔲  | db row void; `dbhas` is null,                                                                          | 2.5        |
  | V3  | `getVault`        | nil   | gotvoid       | 👍   | 🔲   | 🟰 🔲  | db row void; `dbhas` and `val` are null                                                                | 2.5        |
  | V3  | `getVault`        | fail  | gone          | 💣   | 🪦   | 🟰 🪦  | db row and `dbhas` are unchanged equal tombstone                                                       | 2.5        |
  | V3  | `getVault`        | nil   | gotgone       | 👍   | 🪦   | 🟰 🪦  | db row and `dbhas` are unchanged equal tombstone, `val` is null                                        | 2.5        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V10 | notification      |       | got           | 👍   | 📌   | 🟰 📌  | `val` equals stored record; just as corresponding successful read when present                         |
  | V10 | notification      |       | gone          | 👍   | 🪦   | 🟰 🪦  | `val` equals stored record; just as corresponding successful read when tombstoned                      |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V4  | `putBox`          | repl  | replaced      | 👍   | 📌   | 💾 📥  | db row = `val`  = request          equal                                                               | 3.3        |
  | V4  | `putBox`          | get   | declined      | 👍   | 📌   | 🟰 📌  | db row = `val`                     equal; `req_params` has request metadata                            | 3.3        |
  | V4  | `putBox`          | fail  | camped        | 💣   | 📌   | 🟰 📌  | db row = `dbhas`                   equal; `req_params` has request metadata                            | 3.3        |
  | V4  | `putBox`          | _any_ | born          | 👍   | 🔲   | 💾 📥  | db row = `val`                     equal, revision_seq=0                                               | 3.3        |
  | V4  | `putBox`          | _any_ | reborn        | 👍   | 🪦   | 💾 📥  | db row = `val`                     equal                                                               | 3.3        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V4  | ~~`putVault`~~    | repl  | replaced      | 👍   | 📌   | 💾 📥  | db row = `val`   = request = world equal                                                               | 3.3        |
  | V4  | ~~`putVault`~~    | fail  | camped        | 💣   | 📌   | 🟰 📌  | db row = `dbhas`           = world equal; `req_params` has request metadata                            | 3.3        |
  | V4  | `putVault`        | get   | declined      | 👍   | 📌   | 🟰 📌  | db row = `val`             = world equal; `req_params` has request metadata                            | 3.3        |
  | V4  | `putVault`        | _any_ | born          | 👍   | 🔲   | 💾 📥  | db row = `val`             = world equal, revision_seq=0                                               | 3.3        |
  | V4  | `putVault`        | _any_ | reborn        | 👍   | 🪦   | 💾 📥  | db row = `val`             = world equal                                                               | 3.3        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | VG* | gate verbs        |       | _any ok_      | 👍   | 📌   | *️⃣ 🔑  | db row, `val`, world are equal; `gate_epoch` and `revision_seq` each one higher                        | 3.2        |
  | VG* | gate verbs        |       | _any ok_      | 👍   | 📌   | *️⃣ 🔑  | db row matches scope, `vault_tok`, `registered_at`, `fmt`                                              | 3.2        |
  | VG2 | gate verbs        | other | gate_issue    | 💣   | 🔑   | *️⃣ 🔑  | integrity checks failed | 3.2        |
  | VG1 | `putWayins`       | repl  | _any_         | 👍   | 🔑   | *️⃣ 🔑  | (integrity checks + same invariants as putVault:repl)                            | 3.2        |
  | VG1 | `putWayins`       | repl  | replaced      | 👍   | 🔑   | 💾 🔑  | db row = `req.passphrase_wayin`, db row = `req.passkey_wayin` if present                               | 3.2        |
  | VG1 | `putPasskey`      | fail  | _any_         | 👍   | 🔑   | *️⃣ 🔑d  | (integrity checks + same invariants as putVault:fail)                        | 3.2        |
  | VG2 | `putPasskey`      | fail  | added         | 👍   | 🔲   | 💾 🔑  | db row = `req.passkey_wayin`; `req.passphrase_wayin` matches db row, no change; | 3.2        |
  | VG2 | `putPasskey`      | fail  | camped        | 💣   | 🔑   | 🟰 🔑  | db row = `dbhas`; `req_params` has request metadata. req.ifPresent = fail                              | 3.2        |
  | VG1 | `delPasskey`      |       | _any_         | 👍   | 🔑   | *️⃣ 🔑  | (integrity checks + same invariants as putVault:repl)                        | 3.2        |
  | VG3 | `delPasskey`      |       | revoked       | 👍   | 🔑   | 🔲 🔑  | db row has null passkey_wayin, old value nulled                                          | 3.2        |
  | VG3 | `delPasskey`      |       | revoked       | 👍   | 🔲   | 🔲 🔑  | db row has null passkey_wayin                                             | 3.2        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V5  | `delBox`          |       | deleted       | 👍   | 📌   | 💾 🪦  | db row = request = `val`         -- equal tombstone                                                    | 3.4        |
  | V5  | `delBox`          |       | void          | 👍   | 🔲   | 🟰 🔲  | db row = void    ; `val`         -- sentinel tombstone, db vault and world are equal                   | 3.4        |
  | V5  | `delBox`          |       | gone          | 👍   | 🪦   | 🟰 🪦  | db row = same    = `val`         -- tombstone equal. request discarded                                 |
  | V7  | `delVault`        |       | ok            | 👍   | 📌   | 💾 🪦  | db row = request = `val` = world -- equal tombstone                                                    | 3.5        |
  |     | `delVault`        |       | void          | 👍   | 🔲   | 🟰 🔲  | db row = void    ; `val` = world -- sentinel tombstones                                                | 3.4        |
  | V5  | `delVault`        |       | gone          | 👍   | 🪦   | 🟰 🪦  | db row = same    = `val` = world -- tombstone equal, request discarded                                 | 3.4        |
  | V7  | `delVault`        |       | _any_         | 👍   | *️⃣   | *️⃣ *️⃣  | all boxes for that vault_tok are tombstoned (¡May be Non-Transactional!)                               | 3.5        |
  | ..  |                   |       |               | ◽️   | ◽️   | ◽️ ◽️  |                                                                                                        |
  | V9  | ~~`getCapacity`~~ |       | ok            | 👍   | ➖   | 🟰 *️⃣  | capacity count estimates +/- 20% boxes sharing request scope+vault_tok                                 | 4          |
  | V10 | `tidyGone`        |       | tidied        | 👍   | *️⃣   | 💾 🔲  | Removes rows for boxes whose vault scope and vault_tok match no vault or a tombstoned vault            |
  | V10 | `tidyGone`        |       | tidied        | 👍   | *️⃣   | 💾 🔲  | `val` holds `{ totalCount: <number of non-void boxes remaining after request> }`.                      |
  | V10 | `tidyGone`        |       | storage_error | 💣   | *️⃣   | 🤷 🤷  | `val` holds `{ totalCount: <number of non-void boxes remaining after request> }`                       |

