# 2026-11-11: The vaultDB asks -- every adapter and the models moved; five questions

Thread `20261111-vaultdb_classifier`, stacked on #636. The vaultDB's get, put and del each take one
ask and answer an act per `notes/answer-contract.md`. Memory, IndexedDB, Postgres, Convex and
GraphQL are ported, and the models call the new verbs.

## What needs you

1. **Two model tests fail, both about a vault deleted on another device.** Fixing either means new
   logic where a box-side answer's world reaches the vault listing (the receive contract's W2 and
   its *deliverWorld*), which I was told to leave to deletions and renames.
   - `tests/models/vault-listing.test.ts`, "a box notice carrying the vault's tombstone as its
     world": a vault's deletion now sends one vault notice and no box notice, and the box listing
     drops a vault row.
   - `tests/models/vault-boxes.test.ts`, "vault.hello refuses for a vault deleted elsewhere":
     `tryListBoxes` answers `vault_gone` with a null world, so the model has no tombstone to take.
   - Related, with no test of its own: `fetchBox` under a vault deleted or made anew elsewhere now
     hears `record_conflict` where it heard `absent_vault`, because the answer carries the other
     life's row as its world and `Vault.receiveWorld` refuses it. The receive contract's *Where
     this differs* item 4 says this would happen.
   Do you want this PR to land before the receive work, with those two tests failing or marked,
   or to wait for it?

2. **Three model behaviours changed with the contract.**
   - A del of something absent refuses `absent_box` / `absent_vault` where it answered null.
   - A deleted vault's object is replaced by a new one that reads as deleted; the old one is
     vacated (W2). A component holding the old object never sees "deleted".
   - A stale expectation outranks a policy's refusal: `stale_write` first, then `camped` or
     `absent_box` once the device has the row.

3. **`listBoxes` carries no world when it refuses for its vault.** C12 says every response carries
   it. Adding it today would turn hello's `absent_vault` into `record_conflict`, for the reason in
   question 1.

4. **Convex's cap counts box rows, tombstones among them**, as its tally always has. A box put
   again over its own tombstone is refused `vault_full` at the cap. Counting live boxes needs a
   live count in the tally table.

5. **Postgres still stores over one kind of damaged row.** The tables' checks refuse a row garbled
   to the depth of each `jsonb` field's outline, and the functions store nothing over another
   `fmt`. A row garbled deeper (inside a wayin) can be stored, and a put citing that row's exact
   revision would store over it. No model can cite such a row, since it never parses one.

## Caveats

- On Postgres a gate verb is two calls with no transaction: fetch and classify, then the revise
  function stores only over that same revision.
- The contract says `bad_op` for an unknown op or a malformed scope; the code refuses every
  failed ask `bad_record`. I left the code.
- e2e was typechecked and linted, not run.
- The branch is one commit over #636, since the contract change crosses every package at once.
