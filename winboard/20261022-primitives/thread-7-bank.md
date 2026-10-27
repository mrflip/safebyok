# Thread 7: bank (2026-10-22)

Branch `20261022-bank`, PR [#258](https://github.com/mrflip/safebyok/pull/258), stacked on #256. Justify: green; safebyok 3021 passed (37 skipped), react 292, convex 316 (9), postgres 311 (15), graphql 323 (15), indexeddb 164 (11), fastkey 49, demo 222 (17), e2e 107 (116).

* **Built**: `packages/safebyok/src/bank.ts`, the `Bank`: `make` (sync, touches nothing), `hello`
  (loads the strength checker once; `refused` and retried on failure), `ensureVault(draft)` (the
  birth mutex: one Vault object per scope), `reopenVault`, `closeVault`, `closeVaults`,
  `clearCachedVault`, `entryOf`, and its snapshot (`{ status, err, vaults }`) with `subscribe`.
  A birth reads `deviceDB.getDeviceRecord`, then `vaultDB.ensureVault` beside `deviceDB.getLease`,
  judges `vault_behind`, raises the device record (`device_id` minted at first need), and
  `Vault[bear]` takes the read as its picture through `#takePicture`, takes up the lease when the
  one predicate holds (`#fitsTakeUp`: the gate's `vault_tok` and `gate_epoch`, not ended, ending no
  later than now + `leaseHours`), arms the expiry, and starts the watch. A lease that does not fit
  is never erased at birth.
  `vault.ts`: `Vault.make`, the first-hello memo (`#birth`/`#born`/`#beBorn`), `UnreadVaultProps`,
  `#currentVaultProps` (now `#gatedProps`, beside its callers), the device mark (`heedMark`,
  `raiseMarkAfter`, `#deviceIdFor`, `#drafted`), `close()`/`vault_closed`, `#takeDeletion`,
  `#forgetVaultProps`, `#gatedFrom`/`#gated` are gone. States `novel | locked | unlocked`;
  `freshness` (`timely | aged | refused`) for `syncing`. A Vault holds one `vault_tok`: a refresh
  (`#takeStorage` -> `#judgeRead`) finding `getVault` null or another `vault_tok` lets the Vault go
  (`vault_gone` / `vault_remade`, every later call the same), and the bank's entry goes `refused`;
  a read older than the picture is ignored before the `vault_behind` check. The device record is
  raised after each refresh's take, the first gate write, `putWayin`/`delWayin` and `del()`.
  `del()` is `vaultDB.delVault` then lock, the Vault gone. `#unlockCreating` writes the first gate
  over the novel vault's props with one `putVaultProps` expecting `gate_epoch` 0, demanding after
  each wait; losing is `gate_made_elsewhere`. `tryHello`/`tryRefresh` and `#ensureUnlocked` (after
  its hello and after its take-up) check for a let-go Vault (audit 10, and the ruling on a close()
  during a take-up).
  `device-db.ts`/`idb.ts`: `getDeviceRecord`, `raiseDeviceRecord` (one transaction, never lowers,
  keeps the first `device_id`; `raisedDeviceRecord` the rule), `delDeviceRecord`; `DeviceRecord`
  in `types.ts`; ckey `device^...`. Kinds: `vault_behind` for `rolled_back`, `gate_made_elsewhere`
  for `created_elsewhere`; `vault_closed` gone. `AskWhy` `absent` -> `novel`.
  `vault-opts.ts`: `MakeBankOpts`, `VaultDraft`, `parseMakeBankOpts`, `parseVaultDraft`.

  **Finished (second worker):** the six src bugs the move found (below); `VaultProvider`
  re-ensures a vault gone; `deviceRecordFor` (`device-db.ts`) checks every device record read;
  tests for risk 10's waits inside `putBox()`/`delBox()`; the README sweep; `.size-limit.json`'s
  `Vault` line is `Bank`. Tests moved, retitled and added, by file:
  [thread-7-bank-tests.md](thread-7-bank-tests.md); retirements are rows in `tests-retired.md`.

* **Decisions taken**:
  * **BUG 1** (expiry timer): `#dropLease(until)` reckons the snapshot at the timer's deadline;
    `#picture(now)` / `#replaceSnapshot(now)` take the time from a caller who knows it. No clock
    read on the timer path.
  * **BUG 2** (ruling: `vault_gone`): `#ensureUnlocked` checks standing after the prompt's answer,
    before reading it; `closeVault`'s and `ensureLease`'s docs say so. A `del()` landing while the
    prompt is up now also refuses its waiters `vault_gone` (the Vault object is gone): that lease
    case is retitled.
  * **BUG 3**: did not reproduce as reported: `#grantLease`'s demand already refused a gone
    Vault object before `putLease`. What was missing: `#takeOwnWrite` took the write into a gone
    object's picture. Guarded; two tests pin "no lease row written" (deleted elsewhere as
    `putVaultProps` answers; let go during the raise after it), the first proven to bite.
  * **BUG 4**: a box read storage refuses `vault_mismatch` lets the Vault object go
    (`vault_gone`, the bank's entry refused). One kind for the event: the next hello refuses
    `vault_gone`, not `vault_remade`.
  * **BUG 5** (ruling): `Bank.#bear` wraps the birth; a refusal `RefusalPolicy.decide` maps to
    `lock` (`identity_revoked`, `vault_behind`) erases this device's lease (`#revokeLease`; a
    failed erase warns, `untrustedStorage`). Distinct from audit 9's drop of an unfit lease.
  * **BUG 6** (ruling): `deviceRecordFor(scope, answer)`: schema and scope, else none; at birth
    (`getDeviceRecord`, and `raiseDeviceRecord`'s answer, which gives way to the record handed
    over) and at each refresh's `getDeviceRecord`. Tests: another scope at birth and at refresh,
    no `device_id`, a malformed raise answer; all four proven to bite.
  * **React Start over** (ruling): the provider re-ensures when its entry is refused
    `vault_gone` / `vault_remade`, once per refused entry, and shows no `openError` for them
    meanwhile.

* **Deviations**:
  * React adapted minimally: `BankProvider`, `useBank`, `useVault(vaultlabel)`, and dropping
    `openError` / `retryOpen` are left to thread 7b.
  * The demo's account deletion starts `vault.del()` and signs out in the same task: the
    provider re-ensuring after `del()` would otherwise store a novel vault for the deleted
    account before the sign-out lands (an App test proves it; it fails with the old order).

* **Discoveries**:
  * **A birth writes**, so a re-ensure after a deletion stores the next life at once. Hosts
    whose provider stays signed in after deleting an account get a novel vault row; the
    Postgres README now says a read-only role cannot open a vault at all.
  * A birth's failed device-record raise refuses the birth (`valOf`), unlike the warning after
    a read: the birth needs a `device_id`.
  * One unlock with a failing raise logs three warnings (refresh, unlock, refresh).
  * Ringing adapters (Postgres listen, GraphQL) cost two reads at birth: `ensureVault`, then the
    subscribe ring's `getVault`.
  * `vault_mismatch` on a box *write* is still `stale_write`, leaving the Vault object standing
    for the next hello to find gone: left as it was.

* **For the Coach**:
  1. **Re-ensure after a deletion writes.** The provider stores a novel vault as soon as its own
     is deleted. Rec: keep for Start over; thread 7b's `BankProvider` re-ensures only on demand
     (a `useVault` that renders), so a deletion followed by sign-out writes nothing.
  2. **A `del()` during a prompt refuses its waiters `vault_gone`**, extending ruling 2 from a
     let-go to a deletion. Rec: keep; the Vault object is gone either way.
  3. **`vault_mismatch` on a box read is `vault_gone`, never `vault_remade`.** Rec: keep; the
     store cannot say which, and both mean "ask the bank".
  4. **The React provider gives a host no way past `vault_behind`**: the bank isn't exposed and
     `retryOpen()` reads nothing. Rec: thread 7b, with `useBank`.
  5. **VOCABULARY.md:116 still defines "rolled back" by the device mark.** Rec: thread 11.
