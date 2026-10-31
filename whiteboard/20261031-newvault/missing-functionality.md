# What the models plus this sprint will still lack

*A sonnet subagent's gap review, 2026-10-31, for the Coach's item 3; saved as written. It treats the sprint's threads (gate in the record, unlocking, lease-sealed boxes, the three gate operations) as built.*

**Framing.** After the sprint the models hold a storable core (Listing, Vault, Box), a gate in the vault record, unlocking, lease-sealed boxes and the three gate operations. They have no Bank and no host entry point. They have no snapshot detail the React package reads, no limits or capacity, no vault deletion, no rollback guard, and no ways to let a vault go or ask the user for secrets. The old library's public surface in `src/index.ts` is `Bank` and `Vault`, with `Gating`/`requestCleartext`, `DeviceDB`, `VaultDB`, `onBadNews`, `deriver` and `strength`. `safebyok-react` is built wholly on that surface (`BankProvider`, `useVault`, `GatingModal`, `bank.ensureVault`, `vault.tryCheckStrength`, `vault.getSnapshot().gate`). Nothing a host writes today has a counterpart in the models yet.

## Vault and lease
- **Lease lifetime.** `leaseHours`/`leaseMillis`, `ensureUnlocked` renewing past a lease (`renewPastLease`), and a per-call lease length from the gating. Hosts tune how long a device stays unlocked.
- **Keep-on-device failure.** An unlock this device cannot keep a lease for still unlocks; the old code handled it. Hosts with a failing or absent DeviceDB would otherwise be unable to unlock at all. *(Orchestrator: `Lease.grant` already warns rather than throws on a refused put.)*
- **Gate epoch voiding.** A lease granted under an older `gate_epoch` is voided when the gate moves, locally or on another device. Without it, a revoked passkey or replaced passphrase leaves a live key on other devices.
- **Take-up at birth.** Taking up a kept lease at first load, when a page reloads. Without it, every reload asks for the passphrase. *(Orchestrator: thread 2.)*
- **Vault deletion.** `vault.del()` proved by passphrase (`del_vault` gating) and `bank.delDamagedVault`. The Vault's `demandReadyToDel` is a placeholder; a host cannot delete an account's vault.
- **Rollback and drift guard.** The device record (`highest_vault_epoch`, `vault_behind`, `clearCachedVault`). A malicious or buggy backend could serve an old gate. Probably the one "consistency" item that should return first.

## Gate and wayins
- **Passphrase strength.** `checkStrength` / `tryCheckStrength`, the `StrengthChecker` load (zxcvbn) and `weak_passphrase`. React's modal asks the vault for advice, and nothing refuses a weak passphrase.
- **Gating reason.** A reason handed to the host's cleartext closure (`unlock_vault`, `initialize_gate`, `change_passphrase`, `put_passkey`, `del_passkey`, `del_vault`). `GatingModal` picks its dialog by that kind; one anonymous closure cannot choose a dialog.
- **Passkey flow.** Passkey-first order refusal (`passkeyBeforePassphrase`), a passkey unlock granting a lease, and `createPasskey`/`askPasskey` reading the gate's public parts from the snapshot. The passkey button has nothing to read.
- **Passphrase pester.** The `ask_passphrase_at` prompt (passphrase pester trigger) and its `null`/Infinity behaviour. Hosts lose the periodic re-proof.
- **Damaged or unknown wayins.** Told as bad news; the old code warned on a damaged wayin and kept the rest of the vault usable.
- **Key-deriver loading.** Key-deriver spec checks (`Argon2idWebV1`, `checkSaltFits`, `parseKeyDeriverSpec`) and the `world.keyDeriver` seam are specified but not yet wired to `Bank.make`'s `keyDeriver` option. Argon2id as the default is a security promise, not a detail.

## Boxes and whispers
- **Whisper access.** `getWhisper`, `useWhisper` (zero the bytes after use) and `tryGetWhisper`. The models offer `unsealWhisper` and `expose`, but no zeroing contract and no one-call form for React.
- **Limits.** `MaxBoxes`, `MaxWhisperBytes`, box weight, `capacity` (from the VaultDB) and `checkWhisperFits`. Hosts rely on being refused before the backend does it for them, and the snapshot reports capacity.
- **Names.** The reserved `test_` namespace and label checks. Cheap, but the old tests pin them.
- **Damaged boxes.** `damagedBoxes` in the snapshot and `del` on a damaged box (the specs do cover edit-to-life).
- **Whisper-field helper.** `whisper-field.ts` and the React field depend on whisper codec and schema version being preserved.

## Sync, listings and the bank
- **Bank itself.** Lifecycle (`starting/ready/refused`), `hello`, `ensureVault` (birth, with the first-unlock race against another device making the same vault), `vaultOf`, `bankVaultOf`, and a bank snapshot with `subscribe`. React's `useListedVault` uses all of it.
- **Letting go.** `closeVault`, `closeVaults`, `reopenVault`, sign-out, a gone-vault eviction (`vault_gone` vs `vault_remade`), and the `onGone` callback. Evicting a vault must also stop it showing secrets.
- **Watch lifecycle.** The model has `hello` and `goodbye`; there is no bank to call them, and no storage-signed-out handling ("user no longer signed in").
- **Local refresh defaults.** `staleMinutes`, `maxMillisSinceRefresh` defaults, and the refresh-one-at-a-time rule are loosened by the spec, but the host-facing `staleMinutes` option disappears.
- **Two-device races.** Versioned writes (`stale_write` carrying the winner) are in the storable spec; the gate-change and first-unlock races are not.
- **Bad news.** `onBadNews` with the old taxonomy is mostly there; the host default and handler failure isolation are in the listing.

## Host surface and React
- **Snapshot content.** The new `VaultSnapshot` has no lock state, gate, `ask_passphrase_at`, boxes, capacity, freshness or trouble. React renders from `useSyncExternalStore(vault.subscribe, vault.getSnapshot)` and cannot show a Lock button state.
- **Bank options.** `Bank.make`'s options (`applabel`, `user_id`, `vaultDB`, `deviceDB`, `onBadNews`, `clock`, `leaseHours`, `staleMinutes`, `maxBoxes`, `maxWhisperBytes`, `logger`, `keyDeriver`) and the secure-context check.
- **Two forms.** `try*` for every call exists on the storable; the vault's own verbs need them too.
- **Index exports.** Most of `src/index.ts` (the validators, `Kit`, `Expectations`, `Refusals`, `VaultDB`, `DeviceDB`) names old modules; the models need an entry point and a decision about what the 0.x surface becomes.
- **Refusal kinds.** The host-facing taxonomy (`VaultError`, refusal families) is the contract React's messages map on.

## Device and cache
- **DeviceDB.** The class, `memoryDeviceDB`, idb implementation, and the leaseDBFriend plumbing. The Vault's friend is "not yet", so a lease cannot be kept across reloads.
- **Device record.** `device_id` per scope and the epoch it has seen (see above); `device_id` on the world is provisional.
- **Cache load of vaults.** The vault listing warms from the cache, but `clearCachedVault` and a way to drop a damaged cached vault are absent.
- **Local VaultDB.** `localVaultDB` and `VaultDB` hook adapters must be re-fronted as the model `Store` (`get/put/del/watch`); the backend contract (capacity, expectations, subscribe trouble) has no new equivalent.

## The five to build first
1. **Bank**: `ensureVault`, `hello`, lifecycle and snapshot, `closeVault(s)`/eviction. Nothing reaches a host or React without it.
2. **Vault snapshot content**: lock state, gate public parts, `autolock_at`, boxes, trouble. React cannot render the vault without it.
3. **Gating reason and `requestCleartext`**, with strength checking. This is how a user is asked for anything.
4. **Gate epoch voiding of leases, and the device record / `vault_behind` rollback guard.** The security promises a revoked passkey and a replaced passphrase depend on.
5. **The DeviceDB leaseDBFriend plus lease length options** (`leaseHours`, renewal, keep-failure tolerance), so a reload does not re-ask.

Close behind: vault deletion with passphrase proof, and box limits/capacity.
