# Thread 5: The snapshot and the props (2026-10-30)

Branch `20261030-snapshot_props`, PR #PRNUM, stacked on #370 (restacked onto #374; the restack's push is pending). Justify: green (core 3860 tests pass, 37 skipped as before, 1 todo; 53 of them new here, in `tests/models/box.test.ts` and `storable.test.ts`).

* **Built**:
  * The Coach's fix, in `src/models/box.ts`: `LOCKED` is `Symbol.for('LOCKED')`. `box.sidecar` answers `lockedSidecar` while locked, one frozen `{ [LOCKED]: true }` (type `LockedSidecar`, exported), so `BoxSnapshot.sidecar` carries it too; unlocked, as before (null unless full). `box.whisper` still answers the symbol. `Box.sameSnapshot` also compares whether each snapshot carries the bag (by identity), because `stableJsonify` leaves a symbol key out: a box with an empty sidecar, or none, would otherwise read as unchanged by the lock, keeping a snapshot with the real sidecar.
  * `tests/models/storable.test.ts`: `getSnapshot` (one frozen object, one function identity, same until a settle changes it, old one untouched); `settle` (nobody notified when nothing changed, including a `receive` of the record in hand; every listener once when something did; a settle before the first `getSnapshot` tells nobody); `subscribe` and its unsubscribe (twice-called harmless, others stay); `toJSON` (sparse form of central, whatever is staged, a tombstone's too); `cacheable` (`{ ...sparse, central, staged }`, staged null when none, a staged tombstone mid-`del`, no sidecar on the sparse or any tombstone); `scope` (prototype getter over one frozen object; the four scope props tattooed non-writable, non-configurable); the following props `vault_tok`, `revision_tok`, `revision_seq`, `written_at` through `receive` (newer, tombstone, another `vault_tok`, older ignored), `edit` and `del` (staged tombstone mid-flight, then the stored one).
  * `tests/models/box.test.ts`: the snapshot's exact twelve keys (the scope's four, `revision_tok`, `revision_seq`, `registered_at`, `written_at`, `sidecar`, `full`, `present`, `exposed`) for a full, sparse, gone, damaged, dna-born and edited box and an exposed whisper; the locked sidecar (box, snapshot, JSON, sparse form, `cacheable.central`); the own enumerable keys.
  * An empty changeset: `src/models/` is not exported.
* **The nine own keys**: `applabel`, `user_id`, `vaultlabel`, `boxlabel` (the scope, tattooed), `registered_at` (tattooed, thread 4b moves it to the following props), `vault_tok`, `revision_tok`, `revision_seq`, `written_at` (set by `assign`). A box adds none: `world` and `listing` are adorned (not enumerable), `fmt` and the sealed parts are prototype getters, `#exposed` is private.
* **Decisions taken**:
  * `LockedSidecar` is a type of its own, not `Sidecar`, so a host that renders `snapshot.sidecar` must narrow; `Sidecar | LockedSidecar | null`.
  * The bag compares by identity (`sidecar === lockedSidecar`), not by `LOCKED in`: the lint rule forbids the computed existence check, and one frozen object makes identity exact.
  * Time in the held-`del` tests is not moved by `vi.waitFor` (it advances fake timers 50 ms per poll): `holdNextDel` awaits an `entered` promise instead.
  * The `exposed` flag is tested through the `whisper` setter alone; the brief puts the accessor and sealing out of scope, so no refusal or unseal case is written.
* **Deviations**:
  * **`registered_at` following the record is not tested here.** In this tree it is still tattooed non-writable (the Coach's #374 moved `vault_tok` only); 4b moves it and tests `receive` moving it. A restack that lands 4b first will want a case in `storable.test.ts`'s "props that follow" describe; the nine keys stay nine.
  * The brief's "`scope` and `vault_tok` never change" became "`scope` never changes and `vault_tok` follows the record in hand", per the handoff.
  * Fix as you go: rewords of comments in `box.ts` and `storable.ts` (a banner `[What a storable defines]` is `[Required by Storable]`; "first read", "the read makes it", "successful write" named for the call). Two error-message strings in `storable.ts` still say "read again"; they are strings, not comments, and left.
* **Discoveries**:
  * **Nothing settles a box when the lock comes down.** `getSnapshot` answers the unlocked snapshot, sidecar and all, until something else settles the box. The box tests settle by hand after `setLockState`. A snapshot made before the lock and read after it shows the sidecar the Coach says is not readable. Written as an `it.todo` in `box.test.ts`; see Open matters.
  * `cacheable.central` of a full box is the full record, sidecar included, locked or not: the listing hands it to the device cache. A test pins that as it is (see Open matters).
  * `box.sidecar` while locked is true of a gone or sparse box too (the bag, not null): the lock is checked first.
  * `Box.sameSnapshot` is the only place the snapshot's JSON comparison needed a patch for a symbol key; any later snapshot field keyed by a symbol will need the same.
  * README *A box's sidecar* ("shown while the vault is locked") is now false of the model; thread 6 lists it. Not touched here.
* **For the Coach**: the two open questions below.

## Open questions

1. **Who settles the boxes when the lock comes down?** The model has no lock event: `isLocked` reads the listing's world, and the snapshot is replaced only by `settle`. Until the vault wires a lock to `listing.settle` / each box's `settle`, a snapshot made before the lock carries the sidecar while locked. Recommendation: the vault's `lock()` settles the box listing's things (thread for the vault wiring), and the `it.todo` becomes a test there.
2. **`cacheable.central` carries the real sidecar while locked.** The device cache needs the full record to restore the box after a reload, and the sidecar is stored in the clear. But `cacheable` is a public getter on the box, so any holder of a locked box reads the sidecar through it. Recommendation: leave it, since `cacheable` is for the listing and the cache, not the host (host code gets snapshots), and say so in the doc of `cacheable`; or make `cacheable` private to the listing's friends. The test pins today's behaviour.
