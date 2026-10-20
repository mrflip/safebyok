# Thread B2: lease (2026-10-19)

Branch `20261019-lease`, [PR #205](https://github.com/mrflip/safebyok/pull/205), stacked on [#203](https://github.com/mrflip/safebyok/pull/203) (`a_sec`). Justify: green at the rework's tip; core 2640 tests (35 skipped; 2583 before the thread), react 274, indexeddb 154, postgres 281, convex 280, graphql 276, fastkey 49, demo 215, e2e 185, root 265; budgets `Vault` 36 -> 37 kB and `idbDeviceDB` 14 -> 15 kB, set by `pnpm size:budget --write`.

* **Built**:
  * `src/lease.ts`, the class. The Zod schema is **`LeaseRecord`** (was `Lease`, in `types.ts`;
    `safebyok-lease-v1` unchanged), and **`Lease`** is the model:
    * `Lease.make(vault, record)`: validates through `LeaseRecord`, and refuses a record naming
      another scope than its vault's; both `corrupt_record`, quoting nothing. `props` frozen (the
      wrap too), the instance frozen, `vault` hidden by `decorate`, `toJSON()` is `props`.
    * `Lease.grant(vault, holder, vaultKeyPair, askPassphraseAt)`: `makeLeaseKey()`
      (non-extractable, wrapKey/unwrapKey), the transient wrapped under `leaseCtx`, nothing of the
      pair kept. Writes nothing.
    * `lease.tryOpen(holder)`: `vault_locked` when the holder's `vault_id` or `unlock_epoch`
      differ, or the clock is at `ask_passphrase_at`, before any unwrap; then the unwrap under a
      ctx built from the vault's scope and the holder (as the vault expects, not the record's own
      fields) into a non-extractable session handle; a failed unwrap is `corrupt_record`, no cause.
    * `lease.endsWithin(millis)`: `ask_passphrase_at - vault.clock.now() <= millis`.
    * `LeaseVault = Pick<Vault, 'applabel' | 'user_id' | 'vaultlabel' | 'clock'>`,
      `LeaseHolder = Pick<VaultProps, 'vault_id' | 'unlock_epoch'>`.
  * `vault.ts`: `#lease: Lease | null` replaces `#askPassphraseAt`, set and dropped with
    `#vaultKey`; `#unlockStands()` is the one "key held, lease not ended" test (`#vaultState`,
    `#checkUnlocked`, `#whyAsk`, `#deadlineFor`); `#whyAsk`'s renew threshold is
    `lease.endsWithin(renewMillis)`. `#grantLease` calls `Lease.grant` and writes `lease.props`;
    `#takeUpLease` calls `Lease.make`, the leaseHours fit (`lease.endsWithin(leaseMillis)`), then
    `lease.tryOpen(standing)`; `#discardLease(refusal)` erases, warning only for a lease that
    would not read or open. `#leaseCtx` and the `[Contexts]` section are gone. Every abort and
    outrun check from `a_sec` stands where it stood, in the vault.
  * **`DeviceDB`'s verbs resolve `Outcome`s**, all seven. `device-db.ts` gains
    `deviceOutcomeOf(verb, body)` (an adapter's failure as `storage_blocked` /
    `storage_unavailable`, the messages unchanged) and `deviceTroubleAsConditions`, moved from
    `del-damaged-vault.ts`, now the vault's guard: a throw, or a bad outcome whose `err` is no
    VaultError, said as a condition; an answer that is no Outcome refused `bad_option`. The vault
    unwraps each with `valOf`. `memoryDeviceDB` and `idbDeviceDB` answer through `deviceOutcomeOf`.
  * Tests: `tests/lease.test.ts` (new, 30), `tests/device-db.test.ts` (the guard and
    `deviceOutcomeOf`), the battery's new "every verb a good Outcome" case; elsewhere reads go
    through `TH.expectingGood(deviceDB)` / `TH.expectGood`, idb's failures are `expectBad` with the
    DOMException as `cause`. `index.ts` exports `Lease`, `LeaseRecord`, `LeaseHolder`, `LeaseVault`.
  * README: a DeviceDB of your own answers each verb through `deviceOutcomeOf`; the rolled-back
    recipe unwraps `delMark`.
  * **Review rework** (after the reviewer's four fixes, to 91764c56): `deviceOutcomeOf` exported
    beside `outcomeOf` (the Coach's ruling), its doc written for a host's own store, with tests for
    both examples and a table of what a store may throw; `describeDeviceDB(title, make,
    makeBlocked?)` checks, given an adapter over a withheld store, that every verb resolves
    `storage_blocked` and never rejects (idb runs it with no `indexedDB`; `test-helpers.test.ts`'s
    host-shaped DeviceDB, now written through `deviceOutcomeOf`, with a `SecurityError`);
    VOCABULARY's "lease, as kept" names `LeaseRecord`; the security note's restore recipe unwraps
    `delMark`; the misfiled `tryOpen` test now stands under `Lease.make`.
* **Decisions taken**:
  * **`holder` second, keys after**: `Lease.grant(vault, holder, vaultKeyPair, askPassphraseAt)`,
    as B1's `Wayin.sealPasskey(vault, proof, holder, ...)` and B3's `Box.seal(vault, ..., holder,
    vaultKey)`; `tryOpen(holder)` compares against the props handed in.
  * **The scope check is `make`'s**: `make` has the vault, and a lease of another scope is no lease
    of this vault. `tryOpen` binds the scope into its ctx all the same.
  * **`tryOpen` refuses `corrupt_record` for a lease that fits and will not open**, beside
    `vault_locked` for one that ended or no longer fits: the vault discards quietly on the one and
    warns on the other, as it did.
  * **The leaseHours fit stays the vault's** (a setting, not the lease's own state), as
    `endsWithin(leaseMillis)`, before `tryOpen`, so a discarded lease is never unwrapped.
  * **`endsWithin` in milliseconds**: every deadline, `leaseMillis` and the clock are; the vault
    turns `renewMinutes` into millis once, at its parse.
  * **The vault holds the `Lease`**, not a bare deadline: `askPassphraseAt` reads
    `#lease.ask_passphrase_at`.
* **Deviations**:
  * **Pulled forward: the mark verbs and `delAll` resolve Outcomes too.** The thread named the
    lease verbs; a DeviceDB half of each kind would ask every adapter author to know which. One
    helper serves all seven.
* **Discoveries**:
  * The idb entry grew past its budget: `device-db.ts`'s helpers bring `outcome.ts` and
    `refusals.ts` into `safebyok/idb`.
  * **For `a_sec2`**: `#grantLease(unlocked, standing, until, overtaken?)` already checks
    `overtaken` before the write and erases its own lease after it; the make path
    (`#unlockWith` -> `#grantLease`) can be handed a signal there, with no change to `Lease`.
  * **For C5**: `lock()` reaches the device store through `#shut` -> `deviceDB.delLease`; the
    `Lease` class has nothing to delete with, by design (the write is the vault's).
  * No new orchestration in `lease.ts`: it reads no store, retries nothing.
* **Contract drift** (the Contract's *Lease* and *Pantry* sections against the build):
  * `Lease.grant` takes `holder`; the section's heading also reads `Lease.grant(vaultKeyPair,
    vault, opts)`, its block `(vault, vaultKeyPair, askPassphraseAt)`.
  * `tryOpen(holder)`, not `tryOpen()` / `tryOpen(vault)`; it refuses `corrupt_record` too, and
    `storage_blocked` is `getLease`'s, not `tryOpen`'s.
  * The scope is checked at `make`.
  * *Pantry*: `getLease(scope)` resolves a `LeaseRecord`, not a `Lease` (the stores see only
    records, the phase B rule); verbs take a scope.
  * *Returns* says a failed lease write leaves the vault unlocked for the session: an `unlock()`
    whose `putLease` fails refuses and stays locked, as before this thread (a change to the ways in
    logs and carries on). Unchanged here: when to ask is the policy session's.
* **The Coach's rulings (2026-10-19)**, all as recommended but one: all seven device verbs on
  Outcomes; `tryOpen`'s `corrupt_record`; the scope check in `make`; vault first, then holder;
  the device store hands back records; a failed lease write refuses the unlock until the policy
  session; and `deviceOutcomeOf` **exported** (done in the rework).
* **Minors left as they are** (the orchestrator's word): `Lease.grant` validates neither
  `askPassphraseAt` nor `holder` (the reviewer's `endsWithin` fix covers the fail-open); every
  first-party device call passes through `outcomeOf` twice (the adapter's, then the vault's
  guard), and `Lease.make` re-parses a record the store already parsed; `#discardLease` decides
  warn-or-not by `refusalkind === 'vault_locked'`, so a new `tryOpen` refusal kind would change the
  logging quietly.
