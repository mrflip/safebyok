# Thread 14: rotation_shape (2026-10-16)

Branch `20261016-rotation_shape`, PR #120, stacked on #119 (main `cc32761` → #111 → #119). Justify green on #119: root 155, core 1609 (+33
skipped), IndexedDB 144 (+13, 1 todo), Postgres 225 (+19, 2 todo), React 111, argon2 44, Convex 278
(+11, 1 todo), GraphQL 212 (+19, 2 todo), e2e 85 (+11, 1 todo), demo 162 (+15). `pnpm size` green with
`everything` raised 30 to 34 kB (measured 30.63 kB; +3 kB, rounded up).

* **Built** (the design's section 3, 5 and 8, `whiteboard/20261016-rotation/rotation-design.md`):
  - `VaultBundle` is `safebyok-vault-v2`: `vault_key_epoch` (1 for now), `prior_vault_key`
    (`Z.exactOptional`; a check holds it absent at epoch 1 and at epoch n-1 from epoch 2 on).
    Envelopes gain `vault_key_epoch`, `device_id`, `registered_at`, all in the header, so bound.
    `Envelope.sealPassphrase`/`sealPasskey` take an `EnvelopeStamp` in place of `naming`;
    `changePassphrase` keeps the stamp. An envelope at another epoch than its bundle's is passed
    over as `damaged_unlock`, before any derivation.
  - `Lockbox` is `safebyok-lockbox-v2` with `vault_key_epoch` (bound; listed, so in
    `snapshot.boxes`). `read()`/`use()`/`store()`'s compare go through `unwrappingKeyFor`, the
    one choice of key by epoch that thread 19 extends to the prior key; any other epoch is
    `damaged_lockbox`.
  - `LockboxExpectation.vault_key_epoch`; the base class refuses a lockbox whose epoch is not the
    expected one (`bad_option`); `localVaultDB` compares it. `VAULTDB.md` line **3.8**, its
    battery group, and `describeVaultDB`'s option `comparesVaultKeyEpoch` (default true).
  - Device mark: `DeviceMark` (`safebyok-mark-v1`) in `types.ts`; `DeviceDB.readMark`,
    `writeMark`, `eraseMark` (`eraseAll` clears marks); `memoryDeviceDB`, `idbDeviceDB` (same
    shelf, `Ckeys.mark`/`isMark`; the stray sweep keeps marks). `describeDeviceDB` tests marks.
  - The rollback check in `vault.ts`: `heedMark` on every bundle read (`refresh`, create),
    `raiseMark` after the vault's own `updateBundle` (raise only: a newer mark seen meanwhile
    stands, never a false `rolled_back`). The mark holds both epochs (see *Review follow-up*). New kind `rolled_back` (condition). `destroy()` and
    `eraseDamagedVault` erase the mark; `lock()` keeps it.
  - TH: `rotatedBundleOf`, `markOf`; every fixture at the new formats.
  - VOCABULARY (vaultKeyEpoch, prior vaultKey, deviceId, device mark, rolled back, rotation),
    security.md (four entries), README's errors table, changeset.
* **Decisions taken** (YOLO, two-way):
  - `rolled_back` as the kind, as designed.
  - A mismatched envelope epoch is `damaged_unlock` (passed over), not a `damaged_bundle`.
  - `prior_vault_key` is enforced by the schema (present exactly from epoch 2, at n-1), so thread
    19 must always write it.
  - A background refresh meeting `rolled_back` leaves the vault as it stood (unlocked stays
    unlocked, with the newer bundle in hand) and logs; it does not lock.
  - The mark is read from the deviceDB on every refresh (no in-memory cache), so two tabs share it.
  - A mark that does not read (shape, or another scope) is none, with one `warn`; the next write
    replaces it under a new `device_id`.
  - `eraseDamagedVault` knows `safebyok-vault-v1` as an older format (`OlderBundleFormats` in
    `vault-db.ts`), so old vaults are cleared rather than refused as "maybe newer". Without it,
    every pre-existing vault would be unclearable.
  - Binding domain strings follow the formats (`safebyok-vault-v2`, `safebyok-lockbox-v2`).
  - `UnlockSummary` gains no `device_id`/`registered_at`: the snapshot surface is unchanged.
* **Deviations / pulled forward from thread 18** (declared): marking 3.8 `.todo` alone could not
  keep the adapters green -- Convex, Postgres and GraphQL store records field by field, and
  Postgres's and GraphQL's field lists are compiler-held to the core's records. So this thread
  carries the new fields through each: Convex validators (formats replaced, new fields required --
  its type test demands an exact match), Postgres columns and `vault-tables.sql`, GraphQL fields,
  SDL (`SafebyokPriorVaultKey` scalar) and the expectation's `vault_key_epoch` through client and
  resolvers. **Thread 18 keeps only the comparison** (IndexedDB `expectations.ts`, Convex
  `updateBox`, Postgres `WHERE` and the `FOR SHARE` bundle read in `InsertBoxSql`'s `vault` CTE,
  and GraphQL follows Postgres), then drops `comparesVaultKeyEpoch: false` from six
  `describeVaultDB` calls. The battery's wording is adapter-neutral. The pending test shows as one
  `todo` per adapter suite, beside the three refusals skipped.
* **Discoveries**:
  - Two tabs on one device read-modify-write the mark without a lock: the mark can step back to an
    older epoch (weaker check, never a wrong refusal). In security.md.
  - `exactOptional` broke GraphQL's "nullable exactly where optional" test, which asked
    `safeParse(undefined)`; it now asks Zod's `_zod.optin`.
  - Convex: a deployment with pre-existing documents will fail schema validation on deploy; the
    changeset tells hosts to clear the tables. Postgres: `CREATE TABLE IF NOT EXISTS` adds no
    columns; the changeset says to recreate. Thread 18 may want migration text.
* **For the Coach** (none blocking this thread):
  - Which ways in a rotation keeps is ruled for now (keep the proven ones, TODO later); gates 19.
  - No device label is stored, only the random `device_id`; labels stay your call.
  - New public surface: kind `rolled_back`; `DeviceDB` mark verbs (a host's own DeviceDB must add
    them); `DeviceMark`; `Ckeys.mark`/`isMark`; `LockboxExpectation.vault_key_epoch`;
    `LockboxSummary.vault_key_epoch`; `VaultBundle.vault_key_epoch`/`prior_vault_key`; envelope
    fields; `describeVaultDB`'s `comparesVaultKeyEpoch`; `TH.rotatedBundleOf`, `TH.markOf`.
  - Design open question 6 (list a lockbox at an unknown epoch as damaged?) is untouched.

## Review follow-up (first review: flagged)

The reviewer committed four fixes, kept: the first way in's `device_id` always matches the mark
(`64dddd7e`); a bundle is held to the mark read *before* it, so a change landing between the two
reads is no false `rolled_back` (`e7eb447b`); the epoch `damaged_lockbox` quotes no boxlabel
(`f9c7c850`); security.md's limits and the changeset's adapter claim (`3e7ca026`). Then, by the
orchestrator's calls:

* **S1, taken.** `DeviceMark` gains `vault_key_epoch` (still `safebyok-mark-v1`: no build has
  written one). A bundle below either epoch the mark holds is `rolled_back`; `raiseMark` keeps the
  higher of each. Since `vault_key_epoch` is bound into every envelope and held to the bundle's, a
  pre-rotation bundle under a forged higher `unlock_epoch` is now caught. Still accepted, and
  tested as such: an older bundle at the same `vault_key_epoch` under a forged `unlock_epoch`
  (it restores only a way in `removeUnlock` dropped). Design section 3 and 8, security.md updated.
* **S2, taken without new surface.** The refusal's message says what happened and what to do, no
  "try again later". The way out is `deviceDB.eraseMark(scope)`, then open again: the core
  README's *A vault rolled back*, tested as a recipe (accepting, and declining).
* **For the Coach:** should `eraseDamagedVault`, or a sibling, accept `rolled_back` (new surface)?

## Review follow-up (second review: fixed)

The reviewer added two commits: the create path holds what `createBundle` hands back to a mark
read before the write (`4b94ab1c`, another tab making and changing the vault meanwhile is no false
`rolled_back`); the recipe accepts an older copy only on the host's own knowledge of a restore,
rethrows every other refusal, and says what accepting costs (`ff6273d8`). Mine: the design's
section 8 says the same; the README's `eraseDamagedVault` snippet rethrows too. Left, minor: the
`rolled_back` message names `eraseMark`; two tabs may each mint a `device_id` after the recipe.
On #119, its round-trip test adapter now compares `vault_key_epoch` too (it runs line 3.8).
