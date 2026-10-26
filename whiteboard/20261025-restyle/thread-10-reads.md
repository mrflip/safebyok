# Thread 10: reads (2026-10-26)

Branch `20261026-reads`, PR [#281](https://github.com/mrflip/safebyok/pull/281), stacked on [#280](https://github.com/mrflip/safebyok/pull/280).
Justify: see the PR's **Tests:** line. Core and every adapter done; nothing left for a 10b.

* **Built**:
  * **Renames** (thread 8's list): `putVaultProps` → `putVaultRecord` (`doPutVaultRecord`),
    `meta.vault_props_stored` → `meta.vault_stored`, `Refusals.staleVaultProps` →
    `staleVaultRecord`, `Expectations.vaultPropsPutOf` / `vaultPropsRefusalOf` → `vaultRecordPutOf` /
    `vaultRecordRefusalOf`; Convex's component and host `putVaultProps` → `putVaultRecord`
    (argument `vaultRecord`, answer `PutVaultRecordAnswer`, host `mustBe(args.vaultRecord.user_id)`
    kept); GraphQL `safebyokPutVaultProps(vaultProps:)` → `safebyokPutVaultRecord(vaultRecord:)`.
    Test helpers likewise (`propsIn` → `storedVaultRecordIn`). "vault props" prose gone from
    VAULTDB.md (titles 2.4 and 3.1 moved, the conformance's line titles with them), READMEs, test
    titles. CHANGELOGs and older `notes/security.md` entries untouched; a new security entry says
    the names changed.
  * **Shapes** (box.ts): `BoxSparse` (`BoxRecord.omit` the two ciphered fields; `BoxStamp` is now
    `BoxSparse.extend({ vault_tok })`), `BoxDamaged` (`{ boxlabel, revision_tok | null, damage }`,
    strict), `BoxDamageVals`, `DamagedBoxRecord`, `boxSparseOf` (frozen). `DamagedVaultRecord` in
    vault-record.ts. Gone: `BoxSummary`, `ListedSummary`, `DamagedBox`, `BoxVisible` (lease.ts takes
    `BoxSparse`), `heldListing`, `StoredVault`, `ListedVault`, `VaultRecords`.
  * **VaultDB** (vault-db.ts): `VaultReadResponse` `{ vault, boxes, damagedBoxes }` for
    `doGetVault`/`doEnsureVault`; `splitStoredBoxes(rows)` exported; `StoredBox` is `{ boxlabel,
    box: BoxRecord | BoxSparse | DamagedBoxRecord }`. The base class checks the vault record as
    before, re-judges each sound box exactly as the split does (one that fails lists damaged under
    its own boxlabel), parses each damaged one strictly (`corrupt_record` for one that fails, or
    a listing that is no list), sorts and freezes. `getVault`/`ensureVault`/`getVaultRecords`/
    `ensureVaultRecords` resolve `VaultRecord & { boxes, damagedBoxes }`, frozen. `newer_format`
    damage: a `format` neither `BoxFormat` nor `safebyok-box-v1..v7`, as `mayBeNewer` judges a
    vault record (a shared `formatOf`).
  * **Vault**: `#boxes` / `#damagedBoxes` (frozen arrays, kept until a box changes, so thread 12's
    slices are half there); capacity, room, base and revision lookups count both; the snapshot and
    a `damagedBoxes` getter; `BirthRead.listing`; `damaged_box` news from `damagedBoxes`.
  * **Adapters**: local, IndexedDB, Postgres and Convex (client side) split with
    `splitStoredBoxes`; Convex's component answers `{ vault, boxes }`; GraphQL's schema
    `SafebyokVault { vault, boxes: [SafebyokBoxSparse!]!, damagedBoxes: [SafebyokBoxDamaged!]! }`,
    resolvers relay (`relayedVault`), the browser passes through with `recordOf` per record
    (drops `__typename`). Postgres route recipe (README and its test) relays with `relayed` and the
    browser passes through. Demo: dashboard and KnockKnock read `damagedBoxes`; outage wrapper
    relays. README *Damaged boxes*, *Your own storage adapter*, VAULTDB.md 2.3/2.4, adapter READMEs.
* **Decisions taken**:
  * **`putVaultRecord`, not `putVault`**: it replaces the vault record alone, as `putBox` replaces
    one box record; `getVault`/`ensureVault` read the whole vault, so `putVault` would promise boxes.
  * **Brands**: `VaultReadResponse.vault` is `VaultRecord | VaultTombstone | DamagedVaultRecord |
    null`, the damaged one `Z.input` (unbranded), so a host's raw row passes with no brand cast; the
    lint refused writing `Z.input<VaultRecord>` beside an alias of the same type.
  * **The VaultDB freezes what it reads** (records handed out frozen), so `getVaultRecords` resolves
    readonly arrays too, not the mutable ones the preplan's table shows.
  * **Convex's component does not split**: it imports nothing from `safebyok`, so it answers its
    rows (`{ vault, boxes }`) and the client splits. The wire there is the component's API, not a
    relay of `getVaultRecords`.
  * **A malformed damaged entry refuses the whole read** (`corrupt_record`), as an adapter's
    answer in the wrong shape does, rather than being dropped.
* **Deviations**: `BoxView` stays (thread 11 makes Box `implements BoxSparse`; it is now a `Pick`
  of `BoxSparse`). `getBox` still refuses a newer-format box as `damaged_box` (today's contract);
  `damaged_box` news carries `meta.box_listed.damage`.
* **Discoveries**: the demo typechecks against built `dist`, so a stale build hides breaks there.
  The old listing already listed a box with a malformed (present) ciphered field as damaged; the
  README said otherwise, now fixed.
* **For the Coach**: see the PR's *Open questions*.
