# Receive contract: what a storage answer does to the instance listed

Nov 10, 2026 · a draft, for the Coach to mark up

A listing keeps one instance, a Vault or a Box, for each scope. Every row the vaultDB hands back is **received**: compared with the record the instance has, then adopted or not. The row may come in the answer to a get, put, del or list, or in a watch notice. This note is the contract for that step, in the form `notes/answer-contract.md` uses: tests that produce tags, a preflight for the generic and the impossible, and a small table for each decision.

It says what the code should do. *Where this differs from the code today* lists each place the code does not do it yet.

Receiving is local. It asks storage nothing and writes nothing to the vaultDB.

## The steps

An answer is delivered in five steps, each with one job.

1. **The world.** If the answer carries a vault row beside a box, that row is first delivered to the bank's vault listing (*deliverWorld*).
2. **What the answer carries.** Its `act` says which: a record, the news that nothing is stored, or nothing to receive.
3. **Preflight.** The generic and the impossible are refused before any table is read.
4. **Selecting the instance.** This step makes sure a receiver is listed: the instance at the record's scope, or a new one.
5. **The receive table.** The record is delivered to that receiver. The tags pick a verdict, and the verdict is all the receiver acts on.

A refused answer's refusal is thrown once its row has been through these steps.

## Tests

Each test compares the record received (`rcvd`) with the record of the instance listed at its scope (`held`). If no instance is listed, `held` is `void`. The tables read only the tags.

| tag    | values                                | the test                                                                                                                                                                                                                   |
| ------ | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held` | `void` · `gone` · `sparse` · `full`   | The listed instance's record.     `void`: a stand-in instance at the void revision. `gone`: a tombstone. `sparse`: a live record without a box's sealed whisper or a vault's gate. `full`: a live record with every field. |
| `rcvd` | `none` · `gone` · `sparse` · `full`   | The stored record in the response (via `world`, `val` or `dbhas`). `none`: the shell tombstone, which is never stored: storage answered that nothing is at the scope.                                                   |
| `rev`  | `older` · `same` · `newer` · `forked` | `rcvd`'s `revision_seq` is below, at or above `held`'s. `forked`: the same seq under another `revision_tok`. A `void` stand-in is below every stored revision.                                                             |
| `life` | `same` · `other`                      | `rcvd`'s life token against `held`'s: `vault_tok` for a vault, `box_tok` for a box.                                                                                                                                        |

*live* below means `sparse` or `full`; *whole* means `full` or `gone`. `@` is any value, and `—` is a tag that does not apply.

## Invariants

| #   | Invariant                                                                                                                                   | Kept by                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| L1  | A listing has at most one instance for a scope, and makes one only where none is listed.                                                    | selecting the instance                    |
| L2  | An instance's scope and `vault_tok` never change. A vault under another `vault_tok` is another instance.                                    | preflight F3; selection S2                |
| L3  | An instance's record never moves to a lower `revision_seq`.                                                                                 | the verdict `older`                       |
| L4  | An instance's record is a row storage answered, or the `void` stand-in. Nothing made on this device is merged into it.                      | every adopting verdict adopts `rcvd` whole |
| L5  | At one `revision_seq` there is one row: one `revision_tok`, one life token, live or gone.                                                   | preflight F4 and F5                       |
| L6  | An instance whose record is gone stays listed, without its secrets: a box without its exposed whisper, a vault without its lease and boxes. | the verdict `gone`                        |
| L7  | Each change to an instance's record is followed by a new snapshot, and the listeners are notified once.                                     | adopt, then align                         |
| L8  | A listing or an instance that is disabled receives nothing.                                                                                 | preflight F1                              |
| L9  | An instance is marked refreshed only when storage answered a record not older than its own, and its record is then *whole*.                 | every verdict but `older`                 |

## Preflight

Each row is checked before any table. If two rows apply, which one decides the outcome is not promised.

| #    | Condition                                                                                                                           | Outcome                                                                                                                |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| F1   | The listing or the instance is disabled: swept or vacated.                                                                          | The delivery of an answer refuses `disabled`. A notice is dropped. An instance receives nothing.                       |
| F2   | `rcvd` is not of the scope asked.                                                                                                   | throws `storage_issue`                                                                                                 |
| F3   | `rcvd` is no row of this listing: a box under another `vault_tok` than the listing's vault, or a row of the other kind.             | In an answer: throws `storage_issue` (C4, C5). In a notice: dropped, because a watch reports every row under its scope. |
| F4 🌀 | `rev` is `forked`.                                                                                                                  | throws `record_conflict`                                                                                               |
| F5 🌀 | `rev` is `same`, and the life tokens differ, or one of the two is live and the other gone.                                          | throws `record_conflict`                                                                                               |
| F6 🌀 | `rcvd` is `none`, and `held` is live.                                                                                               | throws `record_conflict`                                                                                               |
| F7 🌀 | `rev` is `newer` and `life` is `same`, and `rcvd` is live where `held` is `gone`. A row made again gets a new life token (C7, C8).  | throws `record_conflict`                                                                                               |

F4 to F7 are one finding: storage and this device disagree about the history of one row. They can share one sentence.

## What an answer carries

The acts are the classifier's (`notes/answer-contract.md`). Each act says by itself what is received, so nothing here looks at the request again. The `result` column is the answer contract's.

| act                                        | carries                   | result | received as                                                             |
| ------------------------------------------ | ------------------------- | :----: | ----------------------------------------------------------------------- |
| `gotlive` · `passed`                       | the record stored         |  🫱 🟰   | `val`                                                                   |
| `gotgone`                                  | the tombstone             |   🪦    | `val`                                                                   |
| `born` · `reborn` · `replaced`             | the record stored         |   👍    | `val`; if unequal to the request's record, refuse `storage_issue`       |
| `deleted`                                  | the tombstone stored      |   ❎    | `val`; if unequal to the request's record, refuse `storage_issue`       |
| `gotvoid`                                  | null                      |   🔲    | the shell tombstone (not stored): `none`                             |
| a refusal with the stored row in `dbhas` § | the row stored            | 🧨 🔁 🌀  | `dbhas`, then the refusal is thrown. ‡                                  |
| `void`                                     | nothing                   |  🧨 🔁   | nothing is received                                                     |
| a `vault_*` refusal of a box op            | its world                 |  🔁 🌀   | nothing at the box listing, but the world was delivered                 |
| a damaged row, which is thrown             | the damaged row's address |   🌀    | nothing is received, and the instance listed at that address is vacated |

§: An answer carries `dbhas` when its `act` is `stale`, `camped`, `gone`, `dubdel`, `retcon`, `clash`, `forked` or `ahead`.
‡: When there are two refusals, a preflight throw met while receiving `dbhas` is reported to the host as bad news, and the answer's own refusal is the one thrown.

A list is received a row at a time. A row set aside as damaged is reported to the host as bad news.

## Selecting the instance

Selection makes sure a receiver is listed at the record's scope. It delivers nothing. First match wins.

| #   | listed at the scope                                                | the receiver                                                     |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------- |
| S1  | no instance                                                        | A stand-in is enlisted at the `void` revision, in `rcvd`'s life. |
| S2  | a Vault of another `vault_tok` than `rcvd`'s, and `rev` is `newer` | That Vault is vacated, which delists it. Then S1.                |
| S3  | any other instance                                                 | that instance                                                    |

S2 is the one judgment selection makes of the record, and only a vault listing makes it: a Vault object is one life of its vault (L2). An older row of another life goes to the Vault listed, and is R1 there (`older`: as it was). The seq at a scope goes on across a rebirth (`notes/answer-contract.md`, *Writing*), so a row of an earlier life that arrives late is `older`, and never replaces the life listed.

## The receive table

After preflight, the record is delivered to the receiver. First match wins. The same table serves a box and a vault. No row of it enlists or replaces an instance: that is selection's job.

| #   | `rev`   | `life`  | `rcvd` | `held`          | verdict  | the receiver afterwards                                                                          |
| --- | ------- | ------- | ------ | --------------- | -------- | ------------------------------------------------------------------------------------------------ |
| R1  | `older` | @       | @      | @               | `older`  | as it was, and not marked refreshed                                                              |
| R2  | `same`  | `same`  | `full` | `sparse`        | `fill`   | has `rcvd`                                                                                       |
| R3  | `same`  | `same`  | @      | @               | `same`   | as it was                                                                                        |
| R4  | —       | —       | `none` | `void` · `gone` | `same`   | as it was                                                                                        |
| R5  | `newer` | `other` | `gone` | @               | `gone`   | A box has the tombstone, under the tombstone's own `box_tok`, and has dropped its secrets (L6). A Vault never meets this row (S2). |
| R5  | `newer` | `other` | *live* | @               | `reborn` | A box has `rcvd`, with its new `box_tok` and `registered_at`. A Vault never meets this row (S2). |
| R6  | `newer` | `same`  | `gone` | `void`          | `gone`   | A stand-in has the tombstone. No other instance meets this row: a tombstone carries a life token of its own. |
| R7  | `newer` | `same`  | *live* | @               | `adopt`  | has `rcvd`                                                                                       |

Coverage: `rev` has four values. `forked` is F4. `older` is R1, whatever the other tags are. `same` leaves only pairs of one life that are both gone or both live (F5): R2 is the only one that changes anything, and R3 is the rest. `newer` splits on `life`, then on whether `rcvd` is gone, less the cases F7 refuses. `none` has no revision: F6 or R4. A stand-in is `void` in `rcvd`'s life, so it meets R6 or R7.

## deliverWorld: the vault row a box answer carries

A box answer or notice typically carries its vault's row as `world`. The world is delivered to the bank's vault listing before the box row is handled. deliverWorld only dispatches to that listing's `deliver`, so a world goes through selection, preflight and the receive table like any vault row. The table lists the outcome, by scenario. `held` is the record of the Vault object listed, whose box listing brought the answer.

| #   | the world                                       | `held` | by     | the vault afterwards                                                                                          | the caller gets      |
| --- | ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------------------------- | -------------------- |
| W1  | the shell: no vault row is stored            | live   | F6     | as it was, and the finding is reported to the host as bad news                                                | `vault_void`         |
| W1  | the shell: no vault row is stored            | `gone` | R4     | as it was                                                                                                     | `vault_void`         |
| W2  | a tombstone under another `vault_tok`, newer    | @      | S2, R6 | This Vault object is vacated, and a new one is enlisted with the tombstone.                                   | `vault_gone`         |
| W2  | a live row under another `vault_tok`, newer     | @      | S2, R7 | This Vault object is vacated, and a new one is enlisted with the world: a new vault, locked.                  | `vault_reborn`       |
| W3  | a row of this `vault_tok`, older                | @      | R1     | as it was                                                                                                     | the answer's own act |
| W3  | a row of this `vault_tok`, at the same revision | @      | R2, R3 | as it was, or filled where it was `sparse`                                                                    | the answer's own act |
| W3  | a live row of this `vault_tok`, newer           | live   | R7     | has the world: a gate changed on another device arrives here                                                  | the answer's own act |

W2 is how this device learns from a box answer alone that its vault's life is over. A vault's tombstone carries a `vault_tok` of its own, so a deletion always arrives as W2, never as a row of this `vault_tok`. The Vault object of that life is vacated at once, so it never stays unlocked until the vault listing next fetches its own row. A world of another life that is older is R1, and one at the same revision is F5.

## Where this differs from the code today

1. **Selection judges R1 and S2 in `slotStepOf`.** The vault listing's `slotStepOf` answers `keep` for R1 and `remake` for S2, so `Listing.#rowPlanOf` does more than select, and a `keep` never reaches the receive table.
2. **One table, read once.** Today a vault row is judged by `VaultListing.slotStepOf`, then by `Storable.reconcileCentral`, and the two do not agree: `reconcileCentral` checks `vault_tok` before age, so an older row of another life is kept past at the listing (`keep`), and would throw `record_conflict` at an instance handed it directly. The receive table still judges inside `reconcileCentral`.
3. **A row of another `vault_tok` at a box listing** is refused `storage_issue` by its listing, as F3 says (`rowOfOtherVaultTok` in `Listing.#recordDeliveringOf`), whether an answer carries it in `val` or a refusal in `dbhas`; a refusal's own err is still the one thrown, and the other told as bad news. A box listed has its world's `vault_tok`, so no box listed can be of another.
4. **W1 reports no bad news.** `Vault.receiveWorld` passes the world to the vault listing (`deliverRecord`), so W2 and W3 already apply. The shell is `older` there and is kept past as R1, where F6 would report it to the host.
5. **F4, F5 and F6** are three throwers and three sentences today (`oneRevisionTwoToks`, `oneRevisionTwoLives`, `oneRevisionTwoFates`).
6. **F7 is new as a refusal.** Today a vault is remade there (`isRebirth` in `slotStepOf`), and a box adopts.
7. **`shapeUnreconciled` cannot be reached**, and is removed.
8. **`none` is a tag**, and what is received for it is the shell tombstone. Today a `gotvoid` act is delivered as `Storable.receive(null)` where an instance is listed, which makes a tombstone at the instance's revision so that `reconcileCentral` has something to compare.
9. **A stored record is checked by its tokens.** The act says what an answer carries (`RowOfAct`), as the table above does. For an act that stored the request's record, `deliver` refuses `storage_issue` unless the row's scope, `revision_tok`, `revision_seq` and life token equal the request's. The contract says the record is equal.

## Not in this note

`lock`, `sweep` and `vacate`; the joining of fetches of one slot; `handleIfAbsent`; and the gate verbs, whose answers are delivered as a put's.
