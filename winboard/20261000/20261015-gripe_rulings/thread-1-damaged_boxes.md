# Thread 1: damaged_boxes (2026-10-15)

Branch `20261015-damaged_boxes`, PR [#93](https://github.com/mrflip/safebyok/pull/93), stacked on
[#95](https://github.com/mrflip/safebyok/pull/95) since the restack (first cut from #83 at
30502e3). Justify: green -- core 1006, react 52, convex 275, demo 131, root 123. Size:
`everything` 25.56 of 26 kB (budget raised from 25.5), `openVault` 17.48 of 17.5 kB.

* **Built**:
  - **The listing marks, never refuses** (`vault-db.ts`): `listBoxes` returns
    `(LockboxSummary | DamagedLockbox)[]`. A record that fails `ListedLockbox`, or names another
    boxlabel than the one it is stored under, lists as `{ boxlabel, damaged: true }`; a sound one
    carries `damaged: false` (`LockboxSummary` defaults it). An entry with no text boxlabel is
    left out (see *Restack*). `refresh()`, so `openVault`, no longer throws for a damaged
    lockbox; only a damaged bundle still stops an open.
  - **The adapter contract** (`vault-db.ts`, `idb.ts`, `safebyok-convex`): `doListBoxes` resolves
    to `StoredLockbox[]`, `{ boxlabel, lockbox }`, the boxlabel being where the row is stored. The
    string store and IndexedDB read it from the ckey (`Ckeys.boxlabelOf`, since the restack);
    the string store hands up a not-JSON row as its text (`jsonOrText`) instead of throwing;
    Convex maps its `boxlabel` column.
  - **`store()` over a damaged box** (`vault.ts`): `readBoxOrDamaged` reads a box as a lockbox,
    null, or `'damaged'` (a `corrupt_record` from `readBox`). Over a damaged one, store erases it
    (`eraseBox`, expecting the `vault_id`) and writes a fresh lockbox expecting no revision, with
    no note but a given one and a new `registered_at`. `ensureBoxStands` (erase's absent check)
    now uses the same reader.
  - **Types**: `DamagedLockbox` (`types.ts`, type only) and `StoredLockbox` (`vault-db.ts`),
    both exported from the main entry. `VaultSnapshot.boxes` takes the union.
  - **Demo**: the dashboard shows a damaged row with *replace* and *delete* only; the knock-knock
    key slot offers to replace a damaged key and will not knock with it; the outage wrapper reads
    each box whole and hands up a stand-in for one the inner adapter refuses as damaged.
  - **Tests**: `TH.summaryOf(box)` (in `safebyok/testing`) narrows a listed box to its summary,
    failing on a damaged one. New cases: listing tables for the abstract class, string store,
    IndexedDB, Convex and the outage wrapper; a `damaged lockboxes` describe in `vault.test.ts`
    (open, erase from a fresh handle, store over, read/use refuse, background refresh, erase
    beside a damaged box, a full vault, a record that lists sound but will not open, locked,
    no quoting). Two logger tests that used a damaged box to fail a refresh now use a damaged
    bundle.
  - Docs: both READMEs (a *Damaged lockboxes* section in the core's), `VOCABULARY.md` (a
    *damaged* row), `notes/security.md`, a changeset (`safebyok`, `safebyok-convex` minor).
* **Decisions taken**:
  - **The boxlabel comes from where the row is stored, not from the record.** The gloss allowed
    "whatever of its label is known"; taking it from the record would leave a not-JSON row (the
    case the TODO names) unnameable and so unremovable, and would list a moved record under the
    label it claims, which `erase()` cannot reach. Hence the `doListBoxes` contract change, which
    also makes every `DamagedLockbox` carry a boxlabel (no `boxlabel: null` variant).
  - **One list with a discriminant**, `damaged: false | true`, rather than a separate
    `damagedBoxes` field: a host that ignores damage gets a type error, not an invisible box, and
    the damaged box counts against `maxLockboxes` as the row it is.
  - **A damaged box carries only its boxlabel**: nothing from a record that failed its check is
    trusted into the snapshot.
  - **Store over a damaged box is erase-then-write**, not a write expecting the damaged row's
    revision: the record cannot be trusted to say its revision, and the expectation stays the
    adapters' unchanged one. A failure between the two leaves the box erased; documented. A damaged
    box does not count as "stood" for store's erase-wins rule, since this store erased it itself.
* **Deviations**: none from the plan. `fromStorage` (named in the plan) needed no change: the
  string store's listing stopped throwing instead.
* **Discoveries**:
  - Damage the listing cannot see (altered ciphertext, a missing whisper) still lists as sound
    and shows only at `read()`; `store()` and `erase()` remedy it the same way.
  - Before this, a record moved under another ckey listed twice under the label it claimed.
* **Review** (`fixed`): the demo's Enter key now shares the knock button's gate (f938aba); the
  security note names the two store-over-damaged races (1cbb502); and the docs now say `store()`
  starts afresh over any record `readBox` refuses, which includes a box listed as sound with a
  missing or malformed ciphered field. Left open in the PR: closing those races needs an erase
  guarded by revision in the adapter contract, and a JS adapter still on the old `doListBoxes`
  contract lists every box as damaged.
* **Restack** onto #95 (thread 4, on #92's tuple ckeys), tagged `20261015-damaged_boxes-prerestack`:
  - Thread 3: the listings filter with `Ckeys.isBoxIn` and name each row by the new public
    `Ckeys.boxlabelOf(ckey)` (the tuple's last element; null for a malformed one, left out).
    `boxlabelOfCkey` is gone.
  - Thread 4: `listedOrDamaged(rules, stored)` replaces `checkStoredBox` in `listBoxes`, checking
    the boxlabel and note through `Names.admits`. The vault passes `rules` to every verb. Thread 4's
    three tests that expected a narrowed-out box to make the listing throw now expect it damaged.
    `ensureRoomFor` weighs a damaged box by its boxlabel alone.
  - Folded in (orchestrator's call under "mark a bad lockbox as removeable"): a box stored under a
    boxlabel or note today's validators refuse lists as damaged. `erase()` reaches it by its stored
    name: `checkStandingBoxlabel` admits any text for a box that stands, and the erase gets
    `standingRules` (any-text boxlabel). `store()` refuses a refused name with `bad_label`, writing
    nothing, even over a box standing there (orchestrator's call: such a store would make a box
    that still lists as damaged); a box whose note alone is refused is stored over afresh.
    `isNameable` now asks only for a text boxlabel. Deviation from the restack brief: it said
    `NameableLockbox` should check through `Names.admits`, which would have left those boxes out of
    the listing instead of listing them damaged.
  - `read()` of a box under a refused name refuses `bad_label`, not `corrupt_record`.
  - Second review (`fixed`): `Ckeys.boxlabelOf` names a label only for the exact text `Ckeys.box`
    writes (a38ac3d), and the docs say a damaged box's boxlabel is its stored text, which the
    host's check may refuse (751b1a3). Left for the Coach: refused text now reaches
    `snapshot.boxes`, and closing that means capping or omitting such labels. Minor: erase reads
    twice; `checkStandingBoxlabel` calls `Names.check` only for its error; the host check runs up
    to four times per verb; `read()`'s doc doesn't mention `bad_label`.
* **For the Coach**:
  - Breaking for hosts (pre-1.0 minor): a host reading `snapshot.boxes[i].note` must check
    `damaged` first; a host's own `VaultDB` maps its listing to `{ boxlabel, lockbox }`.
  - Size: `everything` raised to 26 kB (25.56); `openVault` is at 17.48 of 17.5 kB.
