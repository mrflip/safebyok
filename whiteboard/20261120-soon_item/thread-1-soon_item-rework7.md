# Thread 1: soon_item, rework 7 (2026-11-21)

Branch `20261120-soon_item`, PR #790, stacked on #794 (`20261121-gating_instance`, itself on main, where #767 and #793
have merged). On the Coach's request of 2026-11-21: squash, then rebase onto #794. No behaviour changes.

## Part 1: the squash

The 20 commits of `origin/20261119-vault_snapper..79bd70899` became five, the tree unchanged (pre-squash tip tagged
locally `20261120-soon_item-pre794`, the squash `20261120-soon_item-prerebase`): `minder:` (safebyok's src and tests but
the vault's, the refusal phrases and throwers included), `vault:` (models/vault.ts and its test), `client:`
(safebyok-react), `docs:` (VOCABULARY, STYLE, notes, TODO, the changeset), `plan:` (whiteboard, human).

## Part 2: the rebase

`git rebase --onto origin/20261121-gating_instance origin/20261119-vault_snapper`, onto daf2c9964, #794's tip at the
start. #794 took four more commits meanwhile (rework 1: the gating's getters dropped, the vacate tests counting both
vacates); the branch was rebased again onto that tip, 8558e7a4f, cleanly (tagged locally `-on-daf2c99` before it).

Each conflict, and how it composed:

* **The minder's src** (thing-minder.ts, shapes-minder.ts, throwers.ts): #790's item and soon, with #793's word fixes
  reapplied where #790 kept the line, and carried to the lines #790 rewrote in their place ("answer as the vaultDB did"
  is "return the vaultDB's answer", "keeps its last state" is "still has", "which `listen` takes" is "is given", the
  two doc blocks opening on "What" name the thing). #794's `gatingSpent` thrower sits beside #790's `boxSoonestBare`.
  thing-car.ts and its test stay deleted.
* **The minder's tests**: #790's item tests, with #793's rule applied to each #793 split or retitled: goodbye's test is
  three (empties the cache, stops watching, refuses later reads, over `fetchedWorldOf`); the bank-unborn test is two;
  the throwing listener's test is two (`throwingListenerWorldOf`); the watch's renotify test is two
  (`renotifiedWorldOf`); the refused-get staleness test is two (`refusedGetWorldOf`: counted stale, then fetched).
  Retitles: holds/keeps/takes as #793 has them, "as for a removed one" dropped. No car test came back.
* **vault.ts and its test**: #790's withWhisper and forceTimelyUnlocked, with #793's wording ("retained", "Use the
  whisper only inside `fn`", "unchanged" for "as it came", "the stored box"); the gate test takes #794's
  `passphraseCleartext` fields beside #790's `itemsOnAnswer`.
* **The giver** (minder-bank, shapes-giver, react-giver, react-bridge, fake-giver-world and the two giver tests):
  #794's gating makers (`birthGating` ... `revokePasskeyGating`, `Gating` imported) beside #790's record reads
  (`getBoxRecord`, `isBoxRecordBehind`, `listenBoxRecords`); `dbHasNewer`, `fullestOf` and the car types gone.
  #793 renamed the host's cache entry an *item*; #790's new prose said *entry*, which VOCABULARY lists among words to
  avoid, so the host's is "the host's item" and the minder's "the minder's item" where both are in one sentence.

## Discoveries

* #790's own new titles and doc blocks were not swept by #793's rule beyond the lines it touched: a few test titles
  still say keeps (`newer-thing.test.ts` "keeps prior itself on a tie", two in thing-minder-cache) and one #790 test
  has two outcomes ("answers null for a deleted box, and hands a select of its own the tombstone" in react-giver);
  "heard of" stays in #790's prose, where a minder does listen to the watch.
