# Sus paranoiacs

The methods whose purpose wouldn't honestly go in one line when thread 17 of sprint unrace stripped the long doc blocks, worst first. The methods were left unchanged. The Coach: "A method that can't easily be described thusly is a big smell." Line numbers are as of that thread; search by name. Their old doc blocks are in `unrace-docblocks.md`.

1. `models/storable.ts:339`, `reconcileCentral`: its job is a table of life by age by shape, some 15 rows, plus a note on
   lives. "Judges" hides all of it, and the rows are the behaviour.
2. `models/listing.ts:189`, `deliver`: takes the world, delivers the record, picks which of two refusals to throw, tells the
   other as bad news, and applies an absent rule true only of a fetch. Five jobs called a pipeline.
3. `models/models-shapes.ts:142`, `boxDna`, `boxPatch`, `boxPut`: three contracts whose required, stripped and refused
   fields read only against each other and the round trip of a record; 30 lines of rules and examples went.
4. `models/box.ts:133`, `send`: an edit, a rebirth over a tombstone, and under `ifPresent: 'get'` a call that discards its
   patch and answers what is stored. Three jobs under one verb.
5. `models/vault.ts:366`, `putBox`: `send` where a box is held, a fetch first where the whisper is left out, a birth where
   none is stored, with its own opts split for each.
6. `models/listing.ts:210`, `#buildOrReceive`: builds, or receives, or replaces and vacates the old one, snapshots after, and
   refuses a late answer. The name itself says "or".
7. `models/box.ts:91`, `whisper` get and set: the setter exposes, or forgets by null, or forgets by LOCKED, seals nothing,
   and demands unlocked only on one branch. A property that does not act like one.
8. `models/storable.ts:95`, `assign`: `registered_at` is judged against the central `adopt` has yet to replace, so the method
   is right only by its caller's order.
9. `models/lease.ts:45`, `peek`: named as a look, and it erases a lease of another epoch or stamp on the way, while a damaged
   row and a row of another `vault_tok` stand.
10. `models/vault-listing.ts:80`, `ensureVault`: one line calling `putDraft`, with four sentences of doc before; it shares a
    name with `bank.ensureVault`, which does far more, and succeeds with another's vault, told only by `vault_tok`.
11. `models/vault-listing.ts`, `buildVault`, now `Vault.launchBirth` with its `#runBirth` in `vault.ts`: asks, stores, holds and unlocks, or answers another's vault locked; a lease
    refused past the put leaves it stored and held, locked. Two results and a half-way state.
12. `models/listing.ts:169` and `models/vault-listing.ts:134`, `del`: the base goes over the revision held unless a damaged
    entry names its own, and the override goes over `ante`'s own always. The revision is the point, and the two disagree.
13. `models/listing.ts:235`, `#makeThingOf`: born of the record's sparse form over a central never stored, a move that makes
    sense only by way of what `receive` then does with it.
14. `storage/vault-db-new.ts`, `doDelVault` and `VaultDB.delVault`: abstract, so its line is a store author's whole contract, and a row off `prior`, an unnamed damaged row and a repeat all act differently. (Thread 17's review.)
15. `models/storable.ts`, `receive`: beside judging, adopting and settling, it stamps `#refreshedAt` under its own rule and reads a null as a tombstone at the revision held. (Thread 17's review.)
