# Deliver contract: what a storage answer does to the instance listed

Nov 12, 2026 · as built on `20261111-vaultdb_asks`

A listing keeps one instance, a Vault or a Box, for each scope. Every record the vaultDB hands back is **delivered**:
compared with the record the instance has, then adopted or not. The record may come in the answer to a get, put, del,
list or gate verb, or in a watch notice. This note is the contract for that step, in the form `notes/answer-contract.md`
uses: tests that produce tags, checks for the impossible, and a table for each decision.

Delivering is local. It asks storage nothing and writes nothing to the vaultDB.

## The chute

Many entries, one chute: once an answer or a record has entered, nothing downstream knows where it came from.

| entry                                                | enters at                                                   |
| ---------------------------------------------------- | ----------------------------------------------------------- |
| `tryGet` (a get), `tryPut`, `tryDel`, the gate verbs | `deliverAnswer(answer, sent)`                               |
| `tryList`                                            | `deliverListing(answer)`, then `deliverRecord` for each row |
| the vaultDB's watch                                  | `#onNotice`: its world, then `deliverRecord`                |
| `Vault.receiveWorld`, `BoxListing.#shellFor`         | `deliverRecord(record)`                                     |

`deliverAnswer` takes an answer in four steps, each with one job:

1. **The world.** A vault row beside a box's answer is delivered first, to the vault listing (*The world*, below).
2. **What the answer carries** (`answerDeliveringOf`, by `deliveryFieldingOf`): its `act` says where the record is,
   and what it is checked against.
3. **The receive table** (`recordDeliveringOf`): the record against the instance listed, read once. It says which
   instance receives (`making`) and what becomes of its record (`mod`), or refuses.
4. **Doing it** (`doDeliverRecord`): the instance adopts (`receiveRecord`) or is marked refreshed (`markRefreshed`),
   and judges nothing. A new instance is made at the void revision and handed its record the same way, so what
   receiving a record does happens to it too: a vault made from a tombstone forgets the lease cached on this device.

Steps 2 and 3 change nothing, so a refusal there leaves every instance as it was. A good answer throws what delivering
meets. A refused answer tells what delivering meets as bad news, and throws its own refusal.

## Tests

Each test compares the record received (`rcvd`) with the record of the instance listed at its scope (`held`).

| tag    | values                                | the test                                                                                                                                                                              |
| ------ | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `held` | `none` · `gone` · `sparse` · `full`   | The listed instance's record. `none`: no instance is listed. `gone`: a tombstone. `sparse`: live, without a box's sealed whisper or a vault's gate. `full`: live, with every field. |
| `rcvd` | `null` · `gone` · `sparse` · `full`   | The record the answer carries. `null`: storage is certain that nothing is stored at the scope.                                                                                       |
| `rev`  | `older` · `same` · `newer` · `forked` | `rcvd`'s `revision_seq` is below, at or above `held`'s. `forked`: the same seq under another `revision_tok`.                                                                          |
| `life` | `same` · `other`                      | `rcvd`'s life token against `held`'s: `vault_tok` for a vault, `vault_tok` and `box_tok` for a box.                                                                                   |

*live* below means `sparse` or `full`; *whole* means `full` or `gone`. `@` is any value.

## Invariants

| #   | Invariant                                                                                                                                   | Kept by                           |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| L1  | A listing has at most one instance for a scope. It makes one only where none is listed, or to remake a Vault.                               | `making`                          |
| L2  | An instance's scope and `vault_tok` never change. A vault under another `vault_tok` is another instance.                                    | F3; S2                            |
| L3  | An instance's record never moves to a lower `revision_seq`.                                                                                 | R1                                |
| L4  | An instance's record is a row storage answered, or the void stand-in. Nothing made on this device is merged into it.                        | every `adopt` adopts `rcvd` whole |
| L5  | At one `revision_seq` there is one row: one `revision_tok`, one life token, live or gone.                                                   | F4 to F6                          |
| L6  | An instance whose record is gone stays listed, without its secrets: a box without its exposed whisper, a vault without its lease and boxes. | `receiveRecord` of a tombstone    |
| L7  | Each change to the listing is followed by one new snapshot, and the listeners are told once.                                                | `doDeliverRecord`                 |
| L8  | A listing or an instance that is disabled receives nothing.                                                                                 | F1                                |
| L9  | An instance is marked refreshed only when storage answered a record not older than its own, and its record is then *whole*.                 | every `mod` but `older`           |

## What an answer carries

The acts are the classifier's and the gate verbs' (`notes/answer-contract.md`). Each act says by itself where the record
is (`deliveryFieldingOf`), so nothing here looks at the request again: a validated answer is trusted.

| fielding  | acts                                                                                                                 | the record       | checked against                                            |
| --------- | -------------------------------------------------------------------------------------------------------------------- | ---------------- | ---------------------------------------------------------- |
| `as_sent` | `born` · `reborn` · `replaced` · `deleted` · `added` · `revoked`                                                     | `val`            | the scope sent, and its revision and life tokens (`revisionPins`) |
| `as_got`  | `gotlive` · `gotgone` · `passed` · `gotvoid`                                                                         | `val`, or null   | the scope sent                                             |
| `as_db`   | `stale` · `camped` · `gone` · `dubdel` · `retcon` · `clash` · `forked` · `ahead` · `void`                            | `dbhas`, or null | the scope sent                                             |
| `none`    | `vault_void` · `vault_gone` · `vault_reborn` · `vault_full` · `unclassified_storing` · `got` · `tidied` · `timely` | nothing: delivering stops after the world |                                 |

A record that fails its check is refused `storage_issue` (F2). A null record is storage's word that nothing is stored
at the scope (N1 to N3).

A list is delivered by `deliverListing`: its world, then its damaged rows set aside (each takes down the instance listed
at its address and is told as bad news), then every row through `deliverRecord`. The first refusal met is thrown, the
rest told as bad news.

A notice carries the acts of a get, `gotlive` or `gotgone`, and its world. It has no ask and no scope sent, so it
enters at `deliverRecord`, and a refusal there is told as bad news. A notice of another listing's row is dropped, as a
watch tells every row under its scope, and so is any notice once the listing is disabled.

## The receive table

First match wins. F and N2 rows refuse; every other row is a plan of `making` and `mod`.

| #   | when                                                                                        | `making` | `mod`   | the instance afterwards                                                                |
| --- | ------------------------------------------------------------------------------------------- | -------- | ------- | -------------------------------------------------------------------------------------- |
| F1  | the listing is disabled, or the world disabled it                                           |          |         | throws `disabled`                                                                      |
| N1  | `rcvd` is `null`, `held` is `none`                                                          |          |         | nothing to deliver                                                                     |
| N2  | `rcvd` is `null`, `held` is *live*                                                          |          |         | throws `record_conflict` (`nothingStoredWhereLive`)                                    |
| N3  | `rcvd` is `null`, `held` is `gone`                                                          | `listed` | `same`  | as it was, marked refreshed                                                            |
| F2  | `rcvd` fails its check (*What an answer carries*)                                           |          |         | throws `storage_issue` (`deliveredNotAsSent`)                                          |
| F3  | at a box listing, `rcvd` is under another `vault_tok` than its vault's                      |          |         | throws `storage_issue` (`rowOfOtherVaultTok`)                                          |
| S1  | `held` is `none`                                                                            | `make`   | `adopt` | a new instance has `rcvd`, and is listed                                               |
| F4  | `rev` is `forked`                                                                           |          |         | throws `record_conflict` (`oneRevisionTwoToks`)                                        |
| S2  | at a vault listing, `rev` is `newer`, and `life` is `other` or `rcvd` is *live* over `gone` | `remake` | `adopt` | a new Vault has `rcvd` and is listed; the one listed is vacated, with its boxes        |
| F5  | `rev` is `same`, `life` is `other`                                                          |          |         | throws `record_conflict` (`oneRevisionTwoLives`)                                       |
| R1  | `rev` is `older`                                                                            | `listed` | `older` | as it was, and not marked refreshed                                                    |
| R2  | `rev` is `newer`                                                                            | `listed` | `adopt` | has `rcvd`: at a box listing, of whatever life, with its `box_tok` and `registered_at` |
| F6  | `rev` is `same`, and one of `rcvd` and `held` is `gone` and the other *live*                |          |         | throws `record_conflict` (`oneRevisionTwoFates`)                                       |
| R3  | `rev` is `same`, `rcvd` is `full`, `held` is `sparse`                                       | `listed` | `adopt` | has `rcvd`                                                                             |
| R4  | `rev` is `same`                                                                             | `listed` | `same`  | as it was, marked refreshed if *whole*                                                 |

F1 is checked on entry and again once the world is delivered. N1 to F2 are read in `answerDeliveringOf`; F3 onward in
`recordDeliveringOf`, the one table every entry shares.

A Vault object is one life of its vault (L2), so a vault listing remakes the Vault where a box listing adopts (S2
against R2). A row of an earlier life that arrives late is `older` (R1) at either, since the seq at a scope goes on
across a rebirth (`notes/answer-contract.md`, *Writing*).

The impossible are one kind, `record_conflict` (N2, F4 to F6): storage and this device disagree about the history of
one row. A record that is not the one asked for is another, `storage_issue` (F2, F3).

## The world: the vault row a box answer carries

A box answer or notice typically carries its vault's row as `world`. It is delivered first, through
`Vault.receiveWorld`, to the vault listing's `deliverRecord`, so it meets the receive table like any vault row. `held`
is the record of the Vault object whose box listing brought the answer.

| #   | the world                                       | `held` | by     | the vault afterwards                                                                       | the caller gets      |
| --- | ----------------------------------------------- | ------ | ------ | ------------------------------------------------------------------------------------------ | -------------------- |
| W1  | the sentinel: no vault row is stored            | @      | R1     | as it was                                                                                  | `vault_void`         |
| W2  | a tombstone under another `vault_tok`, newer    | @      | S2     | This Vault object is vacated, and a new one is listed with the tombstone.                  | `vault_gone`         |
| W2  | a live row under another `vault_tok`, newer     | @      | S2     | This Vault object is vacated, and a new one is listed with the world: a new vault, locked. | `vault_reborn`       |
| W3  | a row of this `vault_tok`, older                | @      | R1     | as it was                                                                                  | the answer's own act |
| W3  | a row of this `vault_tok`, at the same revision | @      | R3, R4 | as it was, or filled where it was `sparse`                                                 | the answer's own act |
| W3  | a live row of this `vault_tok`, newer           | live   | R2     | has the world: a gate changed on another device arrives here                               | the answer's own act |

W2 is how this device learns from a box answer alone that its vault's life is over. A vault's tombstone carries a
`vault_tok` of its own, so a deletion always arrives as W2. The Vault object of that life is vacated at once, so it
never stays unlocked until the vault listing next gets its own row.

## Open

1. **W1 tells nothing.** The sentinel world is older than any row held, so it is kept past as R1. Read as `null`, it
   would be N2 where a live vault is listed: storage certain that no vault is stored while this device has one.
2. **A live record over a tombstone of the same life** (`newer`) is adopted at a box listing and remakes a Vault. A
   life made again gets a new life token, so this should not happen; it could refuse `record_conflict` instead.
3. **A stored record is checked by its tokens** (F2): scope, revision and life. The answer contract says it is the
   record sent, field for field.

## Not in this note

`lock`, `sweep` and `vacate`; the joining of gets of one scope and of lists; `handleIfAbsent`; a thing's own
timeliness check in `hydrate`.
