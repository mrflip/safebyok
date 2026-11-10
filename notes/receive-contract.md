# Receive contract: what a storage answer does to the instance listed

Nov 10, 2026 · a draft, for the Coach to mark up

A listing keeps one instance, a Vault or a Box, for each scope. Every row the vaultDB hands back is **received**: compared with the record the instance has, then adopted or not. The row may come in the answer to a get, put, del or list, or in a watch notice. This note is the contract of that step, in the manner of `notes/answer-contract.md`: tests that make tags, a preflight for what is generic or impossible, and a small table for each decision.

It says what the code should do. *Where this differs from the code today* lists each place the code does not do it yet.

Receiving is local. It asks storage nothing and writes nothing to the vaultDB.

## The steps

An answer is delivered in five steps, each with one job.

1. **The world.** If the answer carries a vault row beside a box, the vault takes it first (*takeWorld*).
2. **What the answer carries.** Its `act` says which: a record, the news that nothing is stored, or nothing to receive.
3. **Preflight.** The generic and the impossible are refused before any table is read.
4. **Selecting the instance.** The one listed at the record's scope, or a new one where none is. Nothing else is decided here.
5. **The receive table.** The tags pick a verdict, and the verdict is all the instance acts on.

A refused answer's refusal is thrown once its row has been through these steps.

## Tests

Each test is made once, from the record received (`rcvd`) and the record the instance has (`held`). The tables read only the tags.

| tag    | values                              | the test                                                                                                                                                                                             |
| ------ | ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held` | `void` · `gone` · `sparse` · `full` | The record in hand. `void`: the shell a new instance is made with, at the void revision. `gone`: a tombstone. `sparse`: a live record without a box's sealed whisper or a vault's gate. `full`: a live record with it. |
| `rcvd` | `none` · `gone` · `sparse` · `full` | The same of what storage answered. `none`: it answered that nothing is stored at the scope.                                                                                                          |
| `rev`  | `older` · `same` · `newer` · `forked` | `rcvd`'s `revision_seq` is below, at or above `held`'s. `forked`: the same seq under another `revision_tok`. A `void` shell is below every stored revision.                                          |
| `life` | `same` · `other`                    | `rcvd`'s life token against `held`'s: `vault_tok` for a vault, `box_tok` for a box.                                                                                                                  |

*live* below means `sparse` or `full`. `@` is any value, and `—` is a tag that does not apply.

## Invariants

| #   | Invariant                                                                                                                          | Kept by                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| L1  | A listing has at most one instance for a scope, and makes one only where none is listed.                                           | selecting the instance                    |
| L2  | An instance's scope and `vault_tok` never change. A vault under another `vault_tok` is another instance.                           | preflight F3; the verdict `reborn`        |
| L3  | The record in hand never moves to a lower `revision_seq`.                                                                          | the verdict `older`                       |
| L4  | The record in hand is a row storage answered, or the `void` shell. Nothing made on this device is merged into it.                  | every adopting verdict takes `rcvd` whole |
| L5  | At one `revision_seq` there is one row: one `revision_tok`, one life token, live or gone.                                          | preflight F4 and F5                       |
| L6  | An instance whose record is gone stays listed, and has dropped its secrets: a box its exposed whisper, a vault its lease and its boxes. | the verdict `gone`                    |
| L7  | Each change of the record in hand is followed by a new snapshot, and the listeners are told once.                                  | adopt, then align                         |
| L8  | A listing or an instance that is disabled takes nothing in.                                                                        | preflight F1                              |
| L9  | An instance is marked refreshed only when storage answered a record not older than the one in hand, and the record in hand is then whole: full, or a tombstone. | every verdict but `older` |

## Preflight

Each row is checked before any table. Where two hold, which one answers is not promised.

| #    | Condition                                                                                              | Answer                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| F1   | The listing or the instance is disabled: swept or vacated.                                             | The delivery of an answer refuses `disabled`. A notice is dropped. An instance takes nothing in.        |
| F2   | `rcvd` is not of the scope asked.                                                                      | throws `storage_issue`                                                                                  |
| F3   | `rcvd` is no row of this listing: a box under another `vault_tok` than the listing's vault, or a row of the other kind. | In an answer: throws `storage_issue` (C4, C5). In a notice: dropped, since a watch tells of every row under its scope. |
| F4 🌀 | `rev` is `forked`.                                                                                     | throws `record_conflict`                                                                                |
| F5 🌀 | `rev` is `same`, and the life tokens differ, or one of the two is live and the other gone.             | throws `record_conflict`                                                                                |
| F6 🌀 | `rcvd` is `none`, and `held` is live.                                                                  | throws `record_conflict`                                                                                |
| F7 🌀 | `rev` is `newer` and `life` is `same`, and `rcvd` is live where `held` is `gone`. A row made again takes a new life token (C7, C8). | throws `record_conflict`                                                   |

F4 to F7 are one finding, that storage and this device disagree about the history of one row, and can share one sentence.

## What an answer carries

The acts are the classifier's (`notes/answer-contract.md`). Each says by itself what is received, so nothing here looks at the request again.

| act                                                                                         | carries                 | received as                                                                                           |
| ------------------------------------------------------------------------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `born` · `reborn` · `replaced` · `deleted`                                                  | the record stored       | that record. It is the one sent, scope and revision, else `storage_issue`.                            |
| `gotlive` · `passed`                                                                        | the row stored          | that record                                                                                           |
| `gotgone`                                                                                   | the tombstone           | that record                                                                                           |
| `gotvoid`                                                                                   | null                    | `none`                                                                                                |
| a refusal over the row asked for, with `dbhas`: `*_stale` `*_camped` `*_gone` `*_dubdel` `*_retcon` `*_clash` `*_forked` `*_ahead` | the row stored | that record, and then the refusal is thrown. A preflight throw met on the way is told to the host as bad news, and the caller still hears the answer's own refusal. |
| `box_void`, and a vault op's `vault_void`                                                   | nothing                 | nothing is received                                                                                   |
| a `vault_*` refusal of a box op                                                             | its world               | nothing at the box listing; the world went to takeWorld                                               |
| `*_damaged`                                                                                 | the damaged row's address | nothing is received                                                                                 |

A list is received a row at a time. The instance listed at the address of a row set aside as damaged is vacated, and the row is told to the host as bad news.

## Selecting the instance

Selection answers one question: is an instance listed at this scope? If one is, it is the instance. If none is, a shell is made at the `void` revision and listed, and the record is then received by it like any other. Selection judges nothing about the record.

One verdict comes back to it. On `reborn`, the vault listing vacates the instance it has, which takes it off the list, and selects again.

## The receive table

After preflight, first match wins. The same table serves a box and a vault.

| #   | `rev`   | `life`  | `rcvd`     | `held`          | verdict  | the instance afterwards                                                                                                                     |
| --- | ------- | ------- | ---------- | --------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| R1  | `older` | @       | @          | @               | `older`  | as it was, and not marked refreshed                                                                                                         |
| R2  | `same`  | `same`  | `full`     | `sparse`        | `fill`   | has `rcvd`                                                                                                                                  |
| R3  | `same`  | `same`  | @          | @               | `same`   | as it was                                                                                                                                   |
| R4  | —       | —       | `none`     | `void` · `gone` | `same`   | as it was                                                                                                                                   |
| R5  | `newer` | `other` | @          | @               | `reborn` | A vault is vacated, and a new instance is selected and has `rcvd`. A box has `rcvd` in place, with its `box_tok` and `registered_at`.       |
| R6  | `newer` | `same`  | `gone`     | @               | `gone`   | has the tombstone, and has dropped its secrets (L6)                                                                                         |
| R7  | `newer` | `same`  | *live*     | @               | `adopt`  | has `rcvd`                                                                                                                                  |

Coverage: `rev` has four values. `forked` is F4. `older` is R1, whatever else holds. `same` leaves only pairs of one life that are both gone or both live (F5): R2 is the one that changes anything, and R3 is the rest. `newer` splits on `life`, then on whether `rcvd` is gone, with F7 taken out. `none` has no revision: F6 or R4.

## takeWorld: the vault row a box answer carries

A box answer or notice may carry its vault's row. The vault that owns the box listing takes it before the box row is looked at. There is no selection: the instance is that vault.

| #   | the row carried                                 | verdict                  | the vault afterwards                                                                                                                                 |
| --- | ----------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1  | the sentinel: no vault row is stored            | dropped                  | as it was. The answer's own `vault_void` reaches the caller.                                                                                         |
| W2  | a row under another `vault_tok`, live or gone   | dropped                  | as it was. The answer's own `vault_mismatch` reaches the caller. The vault listing learns of the other life by its own list, get or watch.          |
| W3  | a row of this `vault_tok`                       | by preflight and the receive table | `older`, `same` or `fill`: as the table says. `adopt`: a gate changed on another device arrives here. `gone`: the vault locks, forgets its lease and vacates its boxes, the box listing that brought the answer among them, and the answer's own `vault_gone` reaches the caller. |

`reborn` cannot come up, since W3 is one life; nor can `none`.

## Where this differs from the code today

1. **`fateOver` and `SlotFate` go.** `lose` is R1 and `replace` is R5. `Listing.buildOrReceive` keeps one decision, listed or not.
2. **One table, read once.** Today a vault row is judged by `VaultListing.fateOver`, then by `Storable.reconcileCentral`, and the two do not agree: `reconcileCentral` checks `vault_tok` before age, so an older row of another life is dropped at the listing and throws at `Vault.receiveWorld`.
3. **A row of another `vault_tok`** throws `record_conflict` today, from two places (`otherVaultTok` in `reconcileCentral`, `otherVaultTokAtBirth` in `Listing#makeThingOf`). Here it is `storage_issue` in an answer (F3) and dropped as a world (W2).
4. **W2 does not arise today**, because the vaultDB sends no world with `vault_mismatch`: the other life's row is in `dbhas`, and the box listing drops it as no row of its own. Run against the memory vaultDB, a `fetchBox` under a vault row of another life answers `vault_mismatch`. The answer contract makes that row the world (C12). `Vault.receiveWorld` as it stands would then throw `record_conflict` on it inside `Listing.deliver`, and the caller would hear that in place of `vault_mismatch`.
5. **F4, F5 and F6** are three throwers and three sentences today (`oneRevisionTwoToks`, `oneRevisionTwoLives`, `oneRevisionTwoFates`).
6. **F7 is new as a refusal.** Today a vault is replaced there (`isRebirth` in `fateOver`), and a box adopts.
7. **`shapeUnreconciled` cannot be reached** and goes.
8. **`none` is a tag.** Today `Storable.receive(null)` makes a tombstone at the revision in hand so that `reconcileCentral` has something to compare.
9. **What an answer carries** waits on the classifier's acts. Today `recordOfAnswer` and `Listing#deliverGood` tell the cases apart by the old acts `void`, `declined` and `gone`.

## Not in this note

`lock`, `sweep` and `vacate`; the joining of fetches of one slot; `handleIfAbsent`; and the gate verbs, whose answers are delivered as a put's.
