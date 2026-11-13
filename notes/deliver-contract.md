# Deliver contract: what a storage answer does to the instance listed

Nov 12, 2026 · as built on `20261112-one_enabled`

A listing keeps one instance for each scope: a Vault or a Box, and in the stub listings of a bank and a gate, the one
Bank and its `maingate`. Every record the bankDB hands back is **delivered**: compared with the record the instance has,
then adopted or not. The record may come in the answer to a get, put, del, list or gate verb, or in a watch notice.
This note is the contract for that step, in the form `notes/answer-contract.md` uses: tests that produce tags, checks
for the impossible, and a table for each decision.

Delivering is local. It asks storage nothing and writes nothing to the bankDB.

## The chute

Many entries, one chute: once an answer or a record has entered, nothing downstream knows where it came from.

| entry                                                | enters at                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `tryGet` (a get), `tryPut`, `tryDel`, the gate verbs | `deliverAnswer(answer, sent)`                               |
| `tryList` (a vault listing's is `ensureBank`)        | `deliverListing(answer)`, then `deliverRecord` for each row |
| the bankDB's watch                                   | `deliverNotice`: its parent, then `deliverRecord`           |
| `Bank.receiveParent`, `Vault.receiveParent`, `BoxListing.#shellFor` | `deliverRecord(record)`                      |

`deliverAnswer` takes an answer in four steps, each with one job:

1. **The parent.** The row above, beside the answer, is delivered first: a bank row to the bank, a vault row to the
   vault listing (*The parent*, below).
2. **What the answer carries** (`answerDeliveringOf`, by `deliveryFieldingOf`): its `act` says where the record is,
   and what it is checked against.
3. **The receive table** (`recordDeliveringOf`): the record against the instance listed, read once. It says which
   instance receives (`making`) and what becomes of its record (`mod`), or refuses.
4. **Doing it** (`doDeliverRecord`): the instance adopts (`receiveRecord`) or is marked refreshed (`markRefreshed`),
   and judges nothing. A new instance is made at the void revision and handed its record the same way, so what
   receiving a record does happens to it too.

Steps 2 and 3 change nothing, so a refusal there leaves every instance as it was. A good answer throws what delivering
meets. A refused answer tells what delivering meets as bad news, and throws its own refusal.

## Tests

Each test compares the record received (`rcvd`) with the record of the instance listed at its scope (`held`).

| tag    | values                                | the test                                                                                                                                                                              |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held` | `none` · `gone` · `sparse` · `full`   | The listed instance's record. `none`: no instance is listed. `gone`: a tombstone. `sparse`: live, without a box's sealed whisper or a gate's `wayins`. `full`: live, with every field. A bank or vault row has nothing encrypted, and is never `sparse`. |
| `rcvd` | `null` · `gone` · `sparse` · `full`   | The record the answer carries. `null`: storage is certain that nothing is stored at the scope.                                                                                       |
| `rev`  | `older` · `same` · `newer` · `forked` | `rcvd`'s `revision_seq` is below, at or above `held`'s. `forked`: the same seq under another `revision_tok`.                                                                          |
| `life` | `same` · `other`                      | `rcvd`'s life token against `held`'s: `bank_tok` for a bank, `bank_tok` and `gate_tok` for a gate, `bank_tok` and `vault_tok` for a vault, `vault_tok` and `box_tok` for a box. |

*live* below means `sparse` or `full`; *whole* means `full` or `gone`. `@` is any value.

## Invariants

| #   | Invariant                                                                                                                                   | Kept by                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| L1  | A listing has at most one instance for a scope. It makes one only where none is listed.                                                     | `making`                          |
| L2  | An instance's scope never changes, nor the life token of the row above it. A row under another is refused.                                  | F3                                |
| L3  | An instance's record never moves to a lower `revision_seq`.                                                                                 | R1                                |
| L4  | An instance's record is a row storage answered, or the void stand-in. Nothing made on this device is merged into it.                        | every `adopt` adopts `rcvd` whole |
| L5  | At one `revision_seq` there is one row: one `revision_tok`, one life token, live or gone.                                                   | F4 to F6                          |
| L6  | An instance whose record is gone leaves the listing's list (its snapshot), and is kept at its scope only to judge later rows against and to receive a new life. It drops what it holds: a box its exposed whisper; a vault its box listing, and it is disabled until a new life is received; a bank its lease, and it is disabled for good and no longer the device's. | `receiveRecord` of a tombstone    |
| L7  | A change to the listing's list is followed by one new snapshot, and its listeners are told once; a delivery that leaves the list as it was tells none. | `doDeliverRecord`                 |
| L8  | Nothing is received under a bank that is not enabled (the device is disabled, or the bank is no longer the device's), nor at a box listing whose vault has taken another life. | F1 |
| L9  | An instance is marked refreshed only when storage answered a record not older than its own, and its record is then *whole*.                 | every `mod` but `older`           |

## What an answer carries

The acts are the classifier's and the gate verbs' (`notes/answer-contract.md`). Each act says by itself where the record
is (`deliveryFieldingOf`), so nothing here looks at the request again: a validated answer is trusted.

| fielding  | acts                                                                                                                 | the record       | checked against                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `as_sent` | `born` · `reborn` · `replaced` · `deleted` · `added` · `revoked`                                                     | `val`            | the scope sent, and its revision and life tokens (`revisionPins`) |
| `as_got`  | `gotlive` · `gotgone` · `passed` · `gotvoid`                                                                         | `val`, or null   | the scope sent                                             |
| `as_db`   | `stale` · `camped` · `gone` · `dubdel` · `retcon` · `clash` · `forked` · `ahead` · `void`                            | `dbhas`, or null | the scope sent                                             |
| `none`    | `bank_void` · `bank_gone` · `bank_reborn` · `vault_void` · `vault_gone` · `vault_reborn` · `vault_full` · `unclassified_storing` · `got` · `tidied` · `timely` | nothing: delivering stops after the parent |               |

A record that fails its check is refused `storage_issue` (F2). A null record is storage's word that nothing is stored
at the scope (N1 to N3).

A list is delivered by `deliverListing`: its parent, then its damaged rows set aside (each takes down the instance listed
at its address and is told as bad news), then every row through `deliverRecord`. A vault listing's list is `ensureBank`:
its parent is the bank row, delivered to the bank, and of its rows the gate row goes to `bank.maingate` before the vault
rows go to the vault listing. The first refusal met is thrown, the rest told as bad news.

A notice carries the acts of a get, `gotlive` or `gotgone`, and its parent. It has no ask and no scope sent, so it
enters at `deliverRecord`, and a refusal there is told as bad news. A watch on a bank's scope tells bank, gate and vault
rows, and one on a vault's scope its box rows. The bank's watch hands each notice to the bank listing, the gate listing
and the vault listing in turn, and each keeps the rows of its own kind: a notice of another listing's row is dropped, as
a watch tells every row under its scope, and so is any notice once the listing is not enabled.

## The receive table

First match wins. F and N2 rows refuse; every other row is a plan of `making` and `mod`.

| #   | when                                                                                        | `making` | `mod`   | the instance afterwards                                                                |
| --- | ------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| F1  | the listing is not enabled: its bank is not, or the parent ended it; at a box listing, its vault has taken another life |  |  | throws `disabled`                                                    |
| N1  | `rcvd` is `null`, `held` is `none`                                                          |          |         | nothing to deliver                                                                     |
| N2  | `rcvd` is `null`, `held` is *live*                                                          |          |         | throws `record_conflict` (`nothingStoredWhereLive`)                                    |
| N3  | `rcvd` is `null`, `held` is `gone`                                                          | `listed` | `same`  | as it was, marked refreshed                                                            |
| F2  | `rcvd` fails its check (*What an answer carries*)                                           |          |         | throws `storage_issue` (`deliveredNotAsSent`)                                          |
| F3  | at a gate's or vault listing, `rcvd` is under another `bank_tok` than its bank's; at a box listing, under another `vault_tok` than its own |  |  | throws `storage_issue` (`rowOfOtherLife`, naming the tok)                     |
| S1  | `held` is `none`                                                                            | `make`   | `adopt` | a new instance has `rcvd`, and is listed                                               |
| F4  | `rev` is `forked`                                                                           |          |         | throws `record_conflict` (`oneRevisionTwoToks`)                                        |
| F5  | `rev` is `same`, `life` is `other`                                                          |          |         | throws `record_conflict` (`oneRevisionTwoLives`)                                       |
| R1  | `rev` is `older`                                                                            | `listed` | `older` | as it was, and not marked refreshed                                                    |
| R2  | `rev` is `newer`                                                                            | `listed` | `adopt` | has `rcvd`, of whatever life, with its life token and `registered_at`: a Vault of a new life lets its box listing go, and makes another under the new `vault_tok` when next asked; a Bank given a row of another life drops its lease, and `device.bank` is null |
| F6  | `rev` is `same`, and one of `rcvd` and `held` is `gone` and the other *live*                |          |         | throws `record_conflict` (`oneRevisionTwoFates`)                                       |
| R3  | `rev` is `same`, `rcvd` is `full`, `held` is `sparse`                                       | `listed` | `adopt` | has `rcvd`                                                                             |
| R4  | `rev` is `same`                                                                             | `listed` | `same`  | as it was, marked refreshed if *whole*                                                 |

F1 is checked on entry and again once the parent is delivered. N1 to F2 are read in `answerDeliveringOf`; F3 onward in
`recordDeliveringOf`, the one table every entry shares.

A Vault object stands for its scope through its lives, as a Box and a Gate do, so a vault listing adopts where a box
listing does (R2). A Bank object is one life of the bank: it takes the row of another life as any instance does, and
answers nothing more. A bank built again is a new Bank, in a new bank listing, which the device makes at its next
`ensureBank` once the Bank it has no longer answers. A row of an earlier life that arrives late is `older` (R1) at any listing, since the seq at a scope goes on
across a rebirth (`notes/answer-contract.md`, *Writing*).

The impossible are one kind, `record_conflict` (N2, F4 to F6): storage and this device disagree about the history of
one row. A record that is not the one asked for is another, `storage_issue` (F2, F3).

## The parent: the row above an answer

A gate or vault answer or notice typically carries the bank row as `parent`, and a box answer or notice its vault's row.
It is delivered first, through `Bank.receiveParent` or `Vault.receiveParent`, to that listing's `deliverRecord`, so it
meets the receive table like any bank or vault row. `held` is the record of the Bank whose gate or vault listing
brought the answer, or of the Vault whose box listing did.

The bank row beside a gate or vault answer:

| #   | the parent                                      | `held` | by     | the bank afterwards                                                                        | the caller gets      |
| --- | ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------ | -------------------- |
| B1  | the sentinel: no bank row is stored             | @      | R1     | as it was                                                                                  | `bank_void`          |
| B2  | a tombstone, newer                              | live   | R2     | The Bank has the tombstone: its lease is dropped and its row forgotten, and `device.bank` is null. | `bank_gone`  |
| B2  | a live row under another `bank_tok`, newer      | live   | R2     | The Bank ends as at a tombstone: the device's next `ensureBank` makes the Bank of the new life. | `bank_reborn`   |
| B3  | a row of this `bank_tok`, older                 | @      | R1     | as it was                                                                                  | the answer's own act |
| B3  | a row of this `bank_tok`, at the same revision  | @      | R4     | as it was                                                                                  | the answer's own act |

The vault row beside a box answer:

| #   | the parent                                      | `held` | by     | the vault afterwards                                                                       | the caller gets      |
| --- | ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------ | -------------------- |
| W1  | the sentinel: no vault row is stored            | @      | R1     | as it was                                                                                  | `vault_void`         |
| W2  | a tombstone under another `vault_tok`, newer    | @      | R2     | The Vault has the tombstone, is disabled, and discards its box listing, whose watch ends.  | `vault_gone`         |
| W2  | a live row under another `vault_tok`, newer     | @      | R2     | The Vault has the parent, and lets its box listing go: the box listing that brought the answer refuses `disabled` from then on. | `vault_reborn` |
| W3  | a row of this `vault_tok`, older                | @      | R1     | as it was                                                                                  | the answer's own act |
| W3  | a row of this `vault_tok`, at the same revision | @      | R4     | as it was                                                                                  | the answer's own act |
| W3  | a live row of this `vault_tok`, newer           | live   | R2     | has the parent                                                                             | the answer's own act |

B2 is how this device learns from a gate or vault answer alone that its bank's life is over, and W2 from a box answer
alone that its vault's is. A tombstone carries a life token of its own, so a deletion always arrives as B2 or W2. The
Bank of that life drops its lease at once, so it never stays unlocked until the next `ensureBank`; a Box kept from a
vault's ended life refuses `disabled` from then on, since its listing's `vault_tok` is no longer its vault's.

## Open

1. **B1 and W1 tell nothing.** The sentinel parent is older than any row held, so it is kept past as R1. Read as
   `null`, it would be N2 where a live bank or vault is listed: storage certain that none is stored while this device
   has one.
2. **A live record over a tombstone of the same life** (`newer`) is adopted at a vault or a box listing. A life made
   again gets a new life token, so this should not happen; it could refuse `record_conflict` instead.
3. **A stored record is checked by its tokens** (F2): scope, revision and life. The answer contract says it is the
   record sent, field for field.
4. **A gate row of another `gate_tok` under the bank's `bank_tok`** is damage by the design, as only `delBank` deletes
   the main gate. It is adopted (R2), the Gate standing for its scope through its lives as a Vault does; it could refuse
   `record_conflict` instead.
5. **`addPasskey` and `revokePasskey` answer `added` and `revoked`**, where `design.md`'s policy table has them put
   `replaced`. *What an answer carries* keeps both pairs in `as_sent`.

## Not in this note

`lock`, and the device's `sweep` and `vacate`; how the device makes a Bank and its `maingate` from `ensureBank`'s or `buildBank`'s rows;
the joining of gets of one scope and of lists; `handleIfAbsent`; a thing's own timeliness check in `hydrate`.
