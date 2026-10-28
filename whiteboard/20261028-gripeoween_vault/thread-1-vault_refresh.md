# Thread 1: vault_refresh (2026-10-28)

Branch `20261028-vault_refresh`, PR [#336](https://github.com/mrflip/safebyok/pull/336), stacked on
[#334](https://github.com/mrflip/safebyok/pull/334). Justify: green (core 3474 passed, 37 skipped;
every package green). Size budgets: none moves (`pnpm size:budget`).

Preplan steps 2 and 1 (`gripeoween-vault-preplan.md`), in that order, a commit each.

* **Built**:
  * **Step 2, the device-record seam** (`device-db.ts`). `DeviceDB.getDeviceRecord` resolves a
    checked `DeviceRecord | null`: parsed as before, then compared by device scopepath with the scope
    asked for, so a record misfiled under the scope reads as none (and stays stored, as before).
    `raiseDeviceRecord` resolves the record as stored, checked the same way, or null: only a record
    a host hands it that fails its check can give null. `deviceRecordFor(deviceScopepath, answer)`
    is module-private. `vault.ts` and `bank.ts`'s two sites read
    `await deviceDB.getDeviceRecord(scope)` and `await deviceDB.raiseDeviceRecord(raising) ?? raising`.
    Patch changeset, as the Coach asked.
  * **Step 1, the refresh ladder** (`vault.ts`, *Refreshing*). `hello`/`refresh` →
    `#refreshIfStale(staleMillis)` → `#refresh()` (a method over the `oneAtATime` run, held in
    `#oneRefreshAtATime`) → `#doRefresh()` → `#loadFromStorage()`, `#applyVault`, `#noteEpochSeen`.
    `#refreshOnce`, `#takeStorage`, `#judgeStored` and `#freshen` are gone. `#forceNextRefresh()`
    replaces the three `#refreshedAt = FarPast` writes. `#doRefresh`'s catch reads
    `catch (err) { throw this.#onRefreshRefused(err) }`, the shape thread 2 gives public catches.
  * **Pulled forward from step 7 (thread 4 should strike it):** `#letGo(told)` →
    `#becomeGone(refusal)`, `[letGo]` calling it with null. `#raiseRecordAfter` → `#noteEpochSeen`
    (only the vault's; `DeviceDB.raiseDeviceRecord` keeps "raise", per the standing call).
  * `notes/security.md` amended through two sonnet subagents (the `deviceRecordFor` entries; the
    renamed privates). `notes/guarantees.md`: `#takeStorage` → `#loadFromStorage` / `#applyVault`.

* **Decisions taken**:
  * **Where `#onStorageRefusal` is dispatched.** The preplan has the fat catch dispatch it "where
    the load's answer was a refusal". It stays at its two sites inside the try (`getVault`'s refused
    Outcome, the `behind` verdict), as #334 put it. The catch cannot tell `getVault`'s refusal from a
    device store's VaultError of the same kind (a host's DeviceDB may throw any kind), and the lock
    must land before the refused snapshot is published, as it did. The catch dispatches the one
    plan every refused refresh runs, `#onRefreshRefused`.
  * **The try holds the orchestration, not only the load**: the gone, remade and behind refusals
    must mark the refresh refused too, as `#refreshOnce`'s catch did for them.
  * **The recovery log sits in `#refresh()`**, after the run, not at the end of `#doRefresh`: the
    two "ignore" exits (let go meanwhile, older than in hand) return early from the try and logged
    the recovery before; at `#doRefresh`'s end they would not. It logs once per run, as before.
  * `#freshen` folds into the `freshen:` closure (five lines); the tool's outward shape is kept for
    thread 3.
  * `deviceRecordFor` compares scopepaths, not `consistent(record, scope)`: `consistent` compares
    every field both hold, so a raise under another `device_id` read as inconsistent, and a Vault
    object passed as the scope would compare its `format`.

* **Deviations**:
  * **The let-go check moved after the reads.** `#takeStorage` stopped after the device record read
    when the Vault object was let go meanwhile; `#loadFromStorage` is "three reads and nothing
    else", so a refresh let go during the device record read now also reads `getVault` and the
    lease, and dispatches a `getVault` refusal (a lock for `identity_revoked`, erasing the lease)
    before ignoring. Let go during `getVault`, it already did. Open matter below.
  * **One test changed for timing**, `vault-races.test.ts` "refuses as gate_moved, not
    gate_made_elsewhere, once its own first gate is stored...": the lease read no longer overlaps
    `getVault`, so a refresh takes one more device-store round trip, and the other device's watch had
    not read the first gate in when the test unlocked there (it raised `initialize_gate` and met
    `gate_made_elsewhere`, correctly). The test now waits for `here.snapshot.gate`.
  * Tests that spied on `tryGetDeviceRecord` / `tryRaiseDeviceRecord` at the bank's and vault's
    sites spy on the throwing forms; the misfiled and malformed cases plant their row through the
    store's `doGetDeviceRecord` hook (the check now sits inside the public verb). The
    `deviceRecordFor` cases go through `getDeviceRecord`. The malformed-raise case mocks
    `raiseDeviceRecord` resolving null, as a store can no longer answer a malformed record.

* **Discoveries**:
  * `deviceDBShape` (`shapes/bank-opts.ts`) still lists the `try` forms as "the verbs the bank and
    its vaults call"; the bank now calls the throwing forms. Harmless (a `DeviceDB` has both, and
    `instanceof` is checked too); left alone.

* **For the Coach**:
  * **Reads after a let-go**: see Deviations. Recommendation: accept; the answer is ignored, and a
    lock on `identity_revoked` is the safer side.
  * **Catch dispatch**: see Decisions. Recommendation: keep `#onStorageRefusal` at its sites.
