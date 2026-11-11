# 2026-11-11: The vaultDB asks -- every adapter and the models moved; two decisions open

Thread `20261111-vaultdb_classifier`, PR #639, stacked on #636. The vaultDB's get, put and del each
take one ask and answer an act per `notes/answer-contract.md`. Memory, IndexedDB, Postgres, Convex
and GraphQL are ported, and the models call the new verbs.

## What needs you

1. **W2 of the receive contract is not built, and two model tests are marked `it.fails` for it.**
   A box-side answer that carries a newer vault row of another life should vacate the Vault object
   and enlist a new one. Today `Vault.receiveWorld` refuses that row, so the caller hears
   `record_conflict` and the old Vault object stays present. Building it is new logic beside the
   fate functions, which I was told to halt on. May I build it in this PR?
   - `tests/models/vault-listing.test.ts`, "a box answer carrying the vault's tombstone as its
     world". I restaged this one: a vault's deletion no longer sends a box notice, so it now
     deletes the vault and fetches a box.
   - `tests/models/vault-boxes.test.ts`, "vault.hello refuses for a vault deleted elsewhere".

2. **The cap counts differently in Convex.** Convex counts a life's box rows, tombstones among
   them; memory, IndexedDB and Postgres count live boxes. The classifier treats a put over a box's
   own tombstone as adding a box, so in Convex that put is refused at the cap though it adds no
   row. You said tombstones have to count. The cheap way to agree everywhere is for only `born`
   to add to the count and for every adapter to count rows of any state; deleting a box then
   frees no room. I have not made that change.

## Settled this round, by your answers

- Which of two refusals answers is not promised, so `record_conflict` in place of `absent_vault`
  is no regression.
- The three model changes stand: a del of something absent refuses; a deleted vault's object is
  replaced; `stale_write` comes before a policy's refusal.
- `listBoxes` that refuses for its vault carries the vault row stored as its world.
- The contract says `bad_record` where it said `bad_op`.
- Postgres's table checks stay at the depth they reach. A row garbled deeper may be stored over
  (`notes/wontfix.md`).
- The battery plants a list of flawed rows. A store either does not hold a row or every verb
  refuses it. No battery case is skipped in any adapter.

## Caveats

- On Postgres a gate verb is two calls with no transaction: fetch and classify, then the revise
  function stores only over that same revision.
- The doc blocks of `capacity` (`shapes-storage.ts`) and `RefusalMeta.capacity` (`errors.ts`) name
  a `getCapacity` and a `vault.snapshot.capacity`. Neither exists. I left both.
- e2e was typechecked and linted, not run.
- The branch conflicts with `main` since #638 landed, and is to be restacked once #636 is in.
