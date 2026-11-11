# Receive contract: what a storage answer does to the instance listed

Nov 10, 2026 · a draft, for the Coach to mark up

A listing keeps one instance, a Vault or a Box, for each scope. Every row the vaultDB hands back is **received**: compared with the record the instance has, then adopted or not. The row may come in the answer to a get, put, del or list, or in a watch notice. This note is the contract of that step, in the manner of `notes/answer-contract.md`: tests that make tags, a preflight for what is generic or impossible, and a small table for each decision.

It says what the code should do. *Where this differs from the code today* lists each place the code does not do it yet.

Receiving is local. It asks storage nothing and writes nothing to the vaultDB.

## The steps

An answer is delivered in five steps, each with one job.

1. **The world.** If the answer carries a vault row beside a box, the bank's vault listing is delivered it first (*deliverWorld*).
2. **What the answer carries.** Its `act` says which: a record, the news that nothing is stored, or nothing to receive.
3. **Preflight.** The generic and the impossible are refused before any table is read.
4. **Selecting the instance.** This step makes sure a receiver is listed: the instance at the record's scope, or a new one.
5. **The receive table.** The record is delivered to that receiver. The tags pick a verdict, and the verdict is all the receiver acts on.

A refused answer's refusal is thrown once its row has been through these steps.

## Tests

Each test is made from the record received (`rcvd`) and the record the instance listed at its scope has (`held`). Where none is listed, `held` is `void`. The tables read only the tags.

| tag    | values                                | the test                                                                                                                                                                                                                   |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held` | `void` · `gone` · `sparse` · `full`   | The held record from the listing. `void`: a stand-in instance at the void revision. `gone`: a tombstone. `sparse`: a live record without a box's sealed whisper or a vault's gate. `full`: a live record with every field. |
| `rcvd` | `none` · `gone` · `sparse` · `full`   | The stored record in the response (via `world`, `val` or `dbhas`). `none`: the sentinel tombstone, which is never stored: storage answered that nothing is at the scope.                                                   |
| `rev`  | `older` · `same` · `newer` · `forked` | `rcvd`'s `revision_seq` is below, at or above `held`'s. `forked`: the same seq under another `revision_tok`. A `void` stand-in is below every stored revision.                                                             |
| `life` | `same` · `other`                      | `rcvd`'s life token against `held`'s: `vault_tok` for a vault, `box_tok` for a box.                                                                                                                                        |

*live* below means `sparse` or `full`; *whole* means `full` or `gone`. `@` is any value, and `—` is a tag that does not apply.

## Invariants

| #   | Invariant                                                                                                                                   | Kept by                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| L1  | A listing has at most one instance for a scope, and makes one only where none is listed.                                                    | selecting the instance                    |
| L2  | An instance's scope and `vault_tok` never change. A vault under another `vault_tok` is another instance.                                    | preflight F3; selection S2                |
| L3  | The record in hand never moves to a lower `revision_seq`.                                                                                   | the verdict `older`                       |
| L4  | The record in hand is a row storage answered, or the `void` stand-in. Nothing made on this device is merged into it.                        | every adopting verdict takes `rcvd` whole |
| L5  | At one `revision_seq` there is one row: one `revision_tok`, one life token, live or gone.                                                   | preflight F4 and F5                       |
| L6  | An instance whose record is gone stays listed, and has dropped its secrets: a box its exposed whisper, a vault its lease and its boxes.     | the verdict `gone`                        |
| L7  | Each change of the record in hand is followed by a new snapshot, and the listeners are told once.                                           | adopt, then align                         |
| L8  | A listing or an instance that is disabled takes nothing in.                                                                                 | preflight F1                              |
| L9  | An instance is marked refreshed only when storage answered a record not older than the one in hand, and the record in hand is then *whole*. | every verdict but `older`                 |

## Preflight

Each row is checked before any table. Where two hold, which one answers is not promised.

| #    | Condition                                                                                                                           | Answer                                                                                                                 |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F1   | The listing or the instance is disabled: swept or vacated.                                                                          | The delivery of an answer refuses `disabled`. A notice is dropped. An instance takes nothing in.                       |
| F2   | `rcvd` is not of the scope asked.                                                                                                   | throws `storage_issue`                                                                                                 |
| F3   | `rcvd` is no row of this listing: a box under another `vault_tok` than the listing's vault, or a row of the other kind.             | In an answer: throws `storage_issue` (C4, C5). In a notice: dropped, since a watch tells of every row under its scope. |
| F4 🌀 | `rev` is `forked`.                                                                                                                  | throws `record_conflict`                                                                                               |
| F5 🌀 | `rev` is `same`, and the life tokens differ, or one of the two is live and the other gone.                                          | throws `record_conflict`                                                                                               |
| F6 🌀 | `rcvd` is `none`, and `held` is live.                                                                                               | throws `record_conflict`                                                                                               |
| F7 🌀 | `rev` is `newer` and `life` is `same`, and `rcvd` is live where `held` is `gone`. A row made again takes a new life token (C7, C8). | throws `record_conflict`                                                                                               |

F4 to F7 are one finding, that storage and this device disagree about the history of one row, and can share one sentence.

## What an answer carries

The acts are the classifier's (`notes/answer-contract.md`). Each says by itself what is received, so nothing here looks at the request again. `result` is the answer contract's.

| act                                        | carries                   | result | received as                                                             |
| ------------------------------------------ | ------------------------- | :----: | ----------------------------------------------------------------------- |
| `gotlive` · `passed`                       | the record stored         |  🫱 🟰   | `val`                                                                   |
| `gotgone`                                  | the tombstone             |   🪦    | `val`                                                                   |
| `born` · `reborn` · `replaced`             | the record stored         |   👍    | `val`; if unequal to the request's record, refuse `storage_issue`       |
| `deleted`                                  | the tombstone stored      |   ❎    | `val`; if unequal to the request's record, refuse `storage_issue`       |
| `gotvoid`                                  | null                      |   🔲    | the sentinel tombstone (not stored): `none`                             |
| a refusal with the stored row in `dbhas` § | the row stored            | 🧨 🔁 🌀  | `dbhas`, then the refusal is thrown. ‡                                  |
| `void`                                     | nothing                   |  🧨 🔁   | nothing is received                                                     |
| a `vault_*` refusal of a box op            | its world                 |  🔁 🌀   | nothing at the box listing, but the world was delivered                 |
| a damaged row, which is thrown             | the damaged row's address |   🌀    | nothing is received, and the instance listed at that address is vacated |

§: `dbhas` comes back with `act` = `stale` `camped` `gone` `dubdel` `retcon` `clash` `forked` `ahead`.
‡: With two refusals, a preflight throw met on the way is told to the host as bad news, and the answer's own refusal is the one thrown.

A list is received a row at a time. A row set aside as damaged is told to the host as bad news.

## Selecting the instance

Selection makes sure a receiver is listed at the record's scope. It delivers nothing. First match wins.

| #   | listed at the scope                                                | the receiver                                                     |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| S1  | no instance                                                        | A stand-in is enlisted at the `void` revision, in `rcvd`'s life. |
| S2  | a Vault of another `vault_tok` than `rcvd`'s, and `rev` is `newer` | That Vault is vacated, which takes it off the list. Then S1.     |
| S3  | any other instance                                                 | that instance                                                    |

S2 is the one judgment selection makes of the record, and only a vault listing makes it: a Vault object is one life of its vault (L2). An older row of another life goes to the Vault listed, and is R1 there (`older`: as it was). The seq at a scope goes on across a rebirth (`notes/answer-contract.md`, *Writing*), so a row of an earlier life that arrives late is `older`, and never replaces the life listed.

## The receive table

After preflight, the record is delivered to the receiver. First match wins. The same table serves a box and a vault. No row of it enlists or replaces an instance: that is selection's.

| #   | `rev`   | `life`  | `rcvd` | `held`          | verdict  | the receiver afterwards                                                                          |
| --- | ------- | ------- | ------ | --------------- | -------- | ------------------------------------------------------------------------------------------------ |
| R1  | `older` | @       | @      | @               | `older`  | as it was, and not marked refreshed                                                              |
| R2  | `same`  | `same`  | `full` | `sparse`        | `fill`   | has `rcvd`                                                                                       |
| R3  | `same`  | `same`  | @      | @               | `same`   | as it was                                                                                        |
| R4  | —       | —       | `none` | `void` · `gone` | `same`   | as it was                                                                                        |
| R5  | `newer` | `other` | @      | @               | `reborn` | A box has `rcvd`, with its new `box_tok` and `registered_at`. A Vault never meets this row (S2). |
| R6  | `newer` | `same`  | `gone` | @               | `gone`   | has the tombstone, and has dropped its secrets (L6)                                              |
| R7  | `newer` | `same`  | *live* | @               | `adopt`  | has `rcvd`                                                                                       |

Coverage: `rev` has four values. `forked` is F4. `older` is R1, whatever else holds. `same` leaves only pairs of one life that are both gone or both live (F5): R2 is the one that changes anything, and R3 is the rest. `newer` splits on `life`, then on whether `rcvd` is gone, with F7 taken out. `none` has no revision: F6 or R4. A stand-in is `void` in `rcvd`'s life, so it meets R6 or R7.

## deliverWorld: the vault row a box answer carries

A box answer or notice typically carries its vault's row as `world`. The bank's vault listing is delivered it before the box row is handled. deliverWorld only dispatches to that listing's `deliver`, so a world goes through selection, preflight and the receive table as any vault row does. The table lists what that comes to, by scenario. `held` is the Vault object listed, whose box listing brought the answer.

| #   | the world                                       | `held` | by     | the vault afterwards                                                                                          | the caller hears     |
| --- | ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| W1  | the sentinel: no vault row is stored            | live   | F6     | as it was, and the finding is told to the host as bad news                                                    | `vault_void`         |
| W1  | the sentinel: no vault row is stored            | `gone` | R4     | as it was                                                                                                     | `vault_void`         |
| W2  | a tombstone under another `vault_tok`, newer    | @      | S2, R6 | This Vault object is vacated, and a new one is enlisted with the tombstone.                                   | `vault_gone`         |
| W2  | a live row under another `vault_tok`, newer     | @      | S2, R7 | This Vault object is vacated, and a new one is enlisted with the world: a new vault, locked.                  | `vault_reborn`       |
| W3  | a row of this `vault_tok`, older                | @      | R1     | as it was                                                                                                     | the answer's own act |
| W3  | a row of this `vault_tok`, at the same revision | @      | R2, R3 | as it was, or filled where it was `sparse`                                                                    | the answer's own act |
| W3  | a live row of this `vault_tok`, newer           | live   | R7     | has the world: a gate changed on another device arrives here                                                  | the answer's own act |
| W3  | a tombstone of this `vault_tok`, newer          | live   | R6     | The vault locks, forgets its lease and vacates its boxes, the box listing that brought the answer among them. | `vault_gone`         |

W2 is how this device learns from a box answer alone that its vault's life is over. The Vault object of that life is vacated at once, so it never stays unlocked until the vault listing next asks for its own row. A world of another life that is older is R1, and one at the same revision is F5.

## Where this differs from the code today

1. **`fateOver` is S2, and `SlotFate` goes.** `lose` is R1 and `replace` is S2. `Listing.buildOrReceive` keeps selection alone.
2. **One table, read once.** Today a vault row is judged by `VaultListing.fateOver`, then by `Storable.reconcileCentral`, and the two do not agree: `reconcileCentral` checks `vault_tok` before age, so an older row of another life is dropped at the listing and throws at `Vault.receiveWorld`.
3. **A box row of another `vault_tok`** is refused `storage_issue` by its listing, as F3 says (`rowOfOtherVaultTok` in `Listing.buildOrReceive`). An instance handed one directly still throws `record_conflict` (`otherVaultTok` in `reconcileCentral`), and a vault reaches that from `Vault.receiveWorld`, where deliverWorld hands the row to the vault listing (W2).
4. **W2 does not arise today**, because the vaultDB sends no world with `vault_reborn`: the other life's row is in `dbhas`, and the box listing drops it as no row of its own. Run against the memory vaultDB, a `fetchBox` under a vault row of another life answers `vault_reborn`. The answer contract makes that row the world (C12). `Vault.receiveWorld` as it stands would then throw `record_conflict` on it inside `Listing.deliver`, and the caller would hear that in place of the answer's own refusal, which the classifier names `vault_gone` or `vault_reborn`.
5. **F4, F5 and F6** are three throwers and three sentences today (`oneRevisionTwoToks`, `oneRevisionTwoLives`, `oneRevisionTwoFates`).
6. **F7 is new as a refusal.** Today a vault is replaced there (`isRebirth` in `fateOver`), and a box adopts.
7. **`shapeUnreconciled` cannot be reached** and goes.
8. **`none` is a tag**, and what is received for it is the sentinel tombstone. Today `Storable.receive(null)` makes a tombstone at the revision in hand so that `reconcileCentral` has something to compare.
9. **deliverWorld is `Vault.receiveWorld` today**: the Vault that owns the box listing receives the world itself, with no selection.
10. **What an answer carries** waits on the classifier's acts. Today `recordOfAnswer` and `Listing#deliverGood` tell the cases apart by the old acts `void`, `declined` and `gone`.

## Not in this note

`lock`, `sweep` and `vacate`; the joining of fetches of one slot; `handleIfAbsent`; and the gate verbs, whose answers are delivered as a put's.
