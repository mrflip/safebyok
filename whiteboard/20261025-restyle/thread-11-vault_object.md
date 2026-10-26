# Thread 11: The Vault object (2026-10-26)

Branch `20261026-vault_object`, PR (draft, opening), stacked on
[#281](https://github.com/mrflip/safebyok/pull/281). Justify: green at the core milestone (core
3265 passed / 37 skipped, react 308, graphql 344, convex 350, postgres 322, indexeddb 165, fastkey
49, demo 227, e2e 107, root 265). Size: no line moved (`everything` 62.5 kB, budget 66; `Bank`
55.0, 58).

* **Built** (milestone 1, the preplan's core):
  * **Vault** (vault.ts): `class Vault implements VaultStamp`, its own fields `format`, `applabel`,
    `user_id`, `vaultlabel`, `vault_tok`, `registered_at` from the birth read, `Object.freeze(this)`
    closing the constructor. Gone: the per-field getters (`gate_epoch`, `passphrase`, `passkey`,
    `state`, `boxes`, `damagedBoxes`, `capacity`, `trouble`, `freshness`, `ask_passphrase_at`),
    `stamp`, `keyDeriver`, `leaseMillis`, `now()`. `snapshot` and `logger` stay. `getSnapshot` and
    `subscribe` are prototype getters returning private arrows, on `Bank` too.
  * **Collaborators**: the five `*Vault` slices are gone. `Wayin.make(vaultStamp, record, {
    keyDeriver })`; `Gate.make(vault: VaultStamp, ...)`, `Gate.of(vault, record, { keyDeriver })`;
    `Lease.make(vault: ConsistencyWith<VaultStamp & Pick<Vault, 'tryLock'>>, record)`;
    `sealLeaseRecord(standing, vaultKey, { leaseMillis, now })` (scope from `standing`);
    `Box.make(vault: ConsistencyWith<VaultStamp>, record, madeUnder)` (required),
    `Box.seal(vault, props, whisper, { madeUnder, now })`. Provings take `vault: VaultStamp` and
    reach `keyDeriver`, `logger`, `leaseMillis`, `now` and the record in hand (for the epochs they
    are made under) through `ProvingInside`, which the vault registers at its making. A gating's
    `GatingInside` gains `keyDeriver` and `leaseMillis`.
  * **Box** (box.ts): `class Box implements Boxscope, BoxSparse`, every field own, enumerable and
    frozen: scope, `vault_tok`, `vault_epoch`, `gate_epoch`, and the record's sparse fields.
    `toJSON` and `BoxView` gone (JSON is the own fields). `MadeUnder = Z.infer<typeof MadeUnderShape>`.
  * **Lease** (lease.ts): `class Lease implements LeaseSparse`, `format` an own field; `toJSON` gone.
  * **vault-record.ts**: `VaultStampPicked`, `VaultStampButFormat` (moved from wayin.ts and
    lease.ts), `VaultMadeUnder` (the demand's parameter), `GatedVaultRecord`, `VaultDraft`,
    `vaultSparseOf(record)` (the gate left out by destructuring).
  * **Tests**: readers of the removed getters read `vault.snapshot.<field>`; `TH.madeUnderOf(vault)`
    (through the test-only `vaultRecordHeldBy` in proving.ts, after `leaseRecordOf`'s precedent)
    stands in for `vault.stamp`; `TH.vaultSliceOf` is a `VaultStamp` and a kit, `TH.leasedSliceOf`
    carries `madeUnder` and `making()`.
  * **React**: dialogs read `gating.leaseMillis`; its `TH.gatingOf` takes `leaseMillis`.
  * #281's changeset says GraphQL persisted operations change with the schema.

* **Decisions taken**:
  * `vault.leaseMillis` became `gating.leaseMillis` (on every `Gating`): React's dialogs say how long
    an unlock lasts, and the gating is what they render. A public addition the preplan did not name.
  * `vault.stamp` dropped, not renamed: the Vault object is its stamp. Tests that need the epochs
    read the picture through `TH.madeUnderOf`.
  * Provings reach their kit through `ProvingInside` rather than new `seal` arguments: provings
    already depend on it, tests seal against real Vault objects, and the gating, their maker, holds
    no kit of its own. Boxes and Lease seals take theirs as arguments, as the vault makes them.
  * `VaultMadeUnder` is `Pick<VaultSparse, 'vault_tok'> & Partial<Pick<..., scope, epochs>>`, not
    `Partial<Omit<VaultSparse, 'format'>>`: a box's own `registered_at` is no vault's.
  * `Lease`'s `format` is public: it is of its sparse shape and stamp, harmless in a log, and
    `implements LeaseSparse` holds the class to it.
  * Box and Lease `toJSON` removed rather than kept as `{ ...this }`: own fields are what JSON shows.

* **Deviations**:
  * `LeaseSparse` stays `Z.infer<typeof LeaseStamp>`: `export type LeaseSparse = LeaseStamp` trips
    `sonarjs/redundant-type-aliases`, where NEWSTYLE §3 endorses it. Lint and guidance disagree.
  * `LeaseStampPicked` stays in lease.ts beside `LeaseStamp`: vault-record.ts holds the vault's shapes.
  * `{ ...vault }` trips `@typescript-eslint/no-misused-spread`; the class's example is
    `JSON.stringify(vault)` and tests use `TH.shownOf(vault)`.

* **For the Coach**: see the PR's *Open questions*.
