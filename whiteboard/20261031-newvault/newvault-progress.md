# Sprint newvault: progress

*Orchestrator's summary; newer than the plan where they differ. Workers look things up here; the thread files hold the full accounts.*

## The models PR (the base)

Filed from the Coach's planning checkout, branch `20261031-newvault_models`: PR number and tip SHA to follow. It holds `models/lease.ts`, `wayin.ts`, `proving.ts`, `gate.ts`, `Vault.lock()`, and their shapes at the end of `models-shapes.ts` (banners *The vault's stamp*, *The wayin's forms*, *The gate's forms*, *What a proving is handed*, *The lease's forms*). Green: typecheck, eslint, 4519 tests.

## What the first round settled (2026-10-31)

* **Lease**: `Lease.get(vault, dbfriend)` throws, `Lease.tryGet` answers an Outcome; `grant(vault, dbfriend, vaultKey, opts)` warns rather than throws when the deviceDB refuses the put (the deviceDB is a cache); `forget()` drops the record, disposes the autolock and erases through the dbfriend, idempotent; `isInForce`; `sealWith(bytes, boxKeyCtx, whisperCtx)` / `unsealWith(sealed, boxKeyCtx, whisperCtx)` take complete ctx bytes; `wrapKey`/`unwrapKey` exist but hand handles out and go in thread 2. The record: `fmt` 7001, the vault stamp (`applabel`, `user_id`, `vaultlabel`, `vault_tok`, `registered_at`), `lease_key`, `vault_key_lease_wrapped`, `autolock_at`. No `gate_epoch`. The autolock is a `Trigger` (`helpers/trigger.ts`) scheduled at `autolock_at`, launching `vault.lock()` then `forget()`.
* **The dbfriend** `{ logger, tryGetLease(), tryPutLease(record), tryDelLease() }` is scope-bound: no verb takes a scope. The vault will make it with arrow functions.
* **Vault.lock()** is synchronous: `#isLocked`, `#lease` dropped, `lease.forget()` queued on `#leaseChores` (a promise chain, refusals told as bad news through the listing), `settle()`. `lockState()` reads `#isLocked`. `#unlock` must await `#leaseChores` before granting.
* **Proving**: `makeProvingPair(vault, proofClosure, world)` → `PassphraseProving.make(vault, world, passphrase)` and `PasskeyProving.make(vault, world, passkeyAnswer)`; `makeWayin(NOVEL | proving)`: NOVEL fabricates a vaultKey, a proving yields the one it unwraps from its own wayin (`#unwrapVaultKey`, extractable, `wrapKey` only, a local); `makeLease(dbfriend, opts)` on every proving. `ProvingWorld` = `{ clock, keyDeriver, device_id }`; `Cleartexts` = `{ passphrase, passkeyAnswer? }`; `ProofClosure` answers them. PRF bytes zeroed in `finally` even when validation fails (`spendAnswer`).
* **Wayin**: one class, `pickle()` the stored record, `toJSON()` the header. The passkey record's `prf_salt_b64` is checked for length by `FX.prfSalt`; the old vault record's field keeps its shape-only check (the old `damaged_wayin` contract has 10 tests behind it).
* **Gate**: props `passphrase_wayin`, `passkey_wayin | null` (pickles, typed by kind); adorned `ppWayin`, `pkWayin`, `vault`; `Gate.build` → `#novelWayins`: `passphraseProving.makeWayin(NOVEL)`, then `passkeyProving.makeWayin(passphraseProving)`. Not yet: `attemptProof`, the three gate ops, `gate_epoch`.
* **The vault stamp** binds no `format`; old wayins and leases do not open under the models (allowed pre-1.0).
* **Checkers** for all of the above are in `models-shapes.ts`; `stamps.ts` is gone.

## Discoveries worth carrying

* `Lease.get` of a kept lease past its `autolock_at` schedules an immediate autolock, which calls `vault.lock()` before the vault holds the lease: harmless, but `#unlock` must check `isInForce` before `#setLease`, and never set a lease the trigger is about to forget.
* The `Trigger` is born due and arms no timer until `scheduleLaunchAt`; `dispose()` disarms. A test that makes a lease must forget it or use fake timers, or the timer keeps the process alive.
